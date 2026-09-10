import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
  Alert,
  Modal,
  ActivityIndicator,
  Dimensions,
  Platform,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { productService } from '../../../src/services/api/productService';
import { categoryService } from '../../../src/services/api/categoryService';
import { tableService } from '../../../src/services/api/tableService';
import { orderService } from '../../../src/services/api/orderService';
import { couponService } from '../../../src/services/api/couponService';
import { addressService } from '../../../src/services/api/addressService';
import { settingsService } from '../../../src/services/api/settingsService';
import { restaurantService } from '../../../src/services/api/restaurantService';
import { Product, Category, DiningTable, OrderItem, Order, Coupon, PaymentMethod, SavedAddress, RestaurantSettings } from '../../../src/types';
import { formatCurrency } from '../../../src/utils/currency';
import { calculateOrderTotals, getOrderSubtotal } from '../../../src/utils/gst';
import { formatOrderDateTime } from '../../../src/utils/dateUtils';
import { findMatchingTable } from '../../../src/utils/qr';
import { cleanCustomerOrderNotes } from '../../../src/utils/orderNotes';
import { RealtimeOrderStatus } from '../../../src/components/customer/RealtimeOrderStatus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../src/context/AuthContext';
import { useSettings } from '../../../src/context/SettingsContext';
import { supabase, isSupabaseConfigured } from '../../../src/services/supabase';

export default function CustomerDigitalMenuScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const { user, logout, setPendingTableId } = useAuth();
  const { settings } = useSettings();

  const [windowWidth, setWindowWidth] = useState<number>(Dimensions.get('window').width);
  const [table, setTable] = useState<DiningTable | null>(null);
  const [restaurantInfo, setRestaurantInfo] = useState<{ name: string; logo_url?: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');

  // Cart state
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [custName, setCustName] = useState<string>(user?.full_name || '');
  const [custPhone, setCustPhone] = useState<string>(user?.phone || '');
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryLandmark, setDeliveryLandmark] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [couponInput, setCouponInput] = useState<string>('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>('cash');

  // Saved Delivery Addresses
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('new');
  const [saveToProfileChecked, setSaveToProfileChecked] = useState<boolean>(true);
  const [newAddressLabel, setNewAddressLabel] = useState<string>('Home');
  const [customLabelInput, setCustomLabelInput] = useState<string>('');
  const [showAddressModal, setShowAddressModal] = useState<boolean>(false);

  // Address modal form state
  const [manageModalLabel, setManageModalLabel] = useState<string>('Home');
  const [manageModalCustomLabel, setManageModalCustomLabel] = useState<string>('');
  const [manageModalAddress, setManageModalAddress] = useState<string>('');
  const [manageModalLandmark, setManageModalLandmark] = useState<string>('');
  const [manageModalDefault, setManageModalDefault] = useState<boolean>(false);

  // Customer Active & History Orders from Supabase
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [restSettingsData, setRestSettingsData] = useState<any>(null);

  // Modals
  const [showCart, setShowCart] = useState<boolean>(false);
  const [showOrdersModal, setShowOrdersModal] = useState<boolean>(false);
  const [ordersModalTab, setOrdersModalTab] = useState<'active' | 'history'>('active');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);

  // Responsive dimension listener
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  // Load saved addresses on auth change
  const loadSavedAddresses = useCallback(async () => {
    if (!user?.id) {
      setSavedAddresses([]);
      setSelectedAddressId('new');
      return;
    }
    const list = await addressService.getSavedAddresses(user.id);
    setSavedAddresses(list);
    if (list.length > 0) {
      const defaultAddr = list.find((a) => a.is_default) || list[0];
      setSelectedAddressId(defaultAddr.id);
      setDeliveryAddress(defaultAddr.address);
      setDeliveryLandmark(defaultAddr.landmark || '');
    } else {
      setSelectedAddressId('new');
    }
  }, [user?.id]);

  useEffect(() => {
    loadSavedAddresses();
  }, [loadSavedAddresses]);

  // Load customer orders from Supabase on authentication without continuous spinner flickers
  const loadCustomerOrders = useCallback(
    async (showLoadingSpinner: boolean = false) => {
      if (!user) {
        setCustomerOrders([]);
        return;
      }
      if (showLoadingSpinner) {
        setLoadingOrders(true);
      }
      try {
        const orders = await orderService.getCustomerOrders(user.id);
        setCustomerOrders(orders);
      } catch (err) {
        console.warn('Failed to load customer orders:', err);
      } finally {
        if (showLoadingSpinner) {
          setLoadingOrders(false);
        }
      }
    },
    [user]
  );

  const loadMenuData = useCallback(async (isRefresh: boolean = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const resolvedTable = await tableService.resolveTable(tableId || 'general');
      if (!resolvedTable || !resolvedTable.restaurant_id) {
        console.warn('Unable to resolve table context for identifier:', tableId);
        return;
      }
      setTable(resolvedTable);
      const restId = resolvedTable.restaurant_id;
      const [prods, cats, restSettings] = await Promise.all([
        productService.getProducts(restId),
        categoryService.getCategories(restId),
        settingsService.getPublicRestaurantInfo(restId),
      ]);
      setProducts(prods);
      setCategories(cats);
      setRestSettingsData(restSettings as RestaurantSettings);
      setRestaurantInfo({
        name: (resolvedTable as any)?.restaurant_name || restSettings?.name || 'Restaurant',
        logo_url: restSettings?.logo_url,
      });
      if (user?.id) {
        await Promise.all([
          loadCustomerOrders(false),
          loadSavedAddresses(),
        ]);
      }
    } catch (e) {
      console.warn('Failed to load menu data:', e);
    } finally {
      setRefreshing(false);
    }
  }, [tableId, user?.id, loadCustomerOrders, loadSavedAddresses]);

  useEffect(() => {
    loadMenuData(false);
  }, [loadMenuData]);

  const onRefresh = useCallback(() => {
    loadMenuData(true);
  }, [loadMenuData]);

  // Stable Supabase Realtime Subscription without channel collisions or UI reload flickers
  useEffect(() => {
    if (!user?.id) {
      setCustomerOrders([]);
      return;
    }

    if (user.full_name) setCustName(user.full_name);
    if (user.phone) setCustPhone(user.phone);
    loadCustomerOrders(true);

    const pollInterval = setInterval(() => {
      loadCustomerOrders(false);
    }, 4000);

    let ordersChannel: any = null;
    let kotsChannel: any = null;

    if (isSupabaseConfigured && user?.id) {
      const ordersChName = `sub_table_orders_${user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      ordersChannel = supabase
        .channel(ordersChName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${user.id}` },
          () => {
            loadCustomerOrders(false);
          }
        )
        .subscribe();

      if (table?.restaurant_id) {
        const kotsChName = `sub_table_kots_${table.restaurant_id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        kotsChannel = supabase
          .channel(kotsChName)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'kots', filter: `restaurant_id=eq.${table.restaurant_id}` },
            () => {
              loadCustomerOrders(false);
            }
          )
          .subscribe();
      }
    }

    return () => {
      clearInterval(pollInterval);
      if (ordersChannel) {
        supabase.removeChannel(ordersChannel);
      }
      if (kotsChannel) {
        supabase.removeChannel(kotsChannel);
      }
    };
  }, [user?.id, table?.restaurant_id, loadCustomerOrders]);

  const activeOrders = customerOrders.filter(
    (o) => !['delivered', 'completed', 'cancelled', 'settled'].includes(o.status)
  );
  const historyOrders = customerOrders.filter(
    (o) => ['delivered', 'completed', 'cancelled', 'settled'].includes(o.status)
  );

  const addToCart = (product: Product) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.product_id === product.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx].quantity += 1;
        copy[idx].subtotal = copy[idx].quantity * copy[idx].unit_price;
        copy[idx].total = copy[idx].subtotal * (1 + copy[idx].tax_rate / 100);
        return copy;
      }
      const unitPrice = product.discounted_price || product.price;
      return [
        ...prev,
        {
          id: 'item-' + Date.now() + Math.random().toString(36).substr(2, 4),
          order_id: '',
          product_id: product.id,
          product_name: product.name,
          unit_price: unitPrice,
          quantity: 1,
          tax_rate: product.tax_rate,
          tax_amount: (unitPrice * product.tax_rate) / 100,
          subtotal: unitPrice,
          total: unitPrice * (1 + product.tax_rate / 100),
          image_url: product.image_url,
        },
      ];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCartItems((prev) => prev.filter((i) => i.product_id !== productId));
      return;
    }
    setCartItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, quantity, subtotal: quantity * i.unit_price } : i))
    );
  };

  const handleApplyCoupon = async () => {
    if (!couponInput) return;
    try {
      const subtotal = cartItems.reduce((sum, i) => sum + i.subtotal, 0);
      const res = await couponService.validateCouponCode(couponInput, subtotal);
      if (res.isValid && res.coupon) {
        setAppliedCoupon(res.coupon);
        Alert.alert('Coupon Applied', `Code "${res.coupon.code}" applied successfully!`);
      } else {
        Alert.alert('Invalid Coupon', res.message || 'This coupon is either invalid or expired.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSelectSavedAddress = (addrId: string) => {
    setSelectedAddressId(addrId);
    if (addrId === 'new') {
      setDeliveryAddress('');
      setDeliveryLandmark('');
    } else {
      const found = savedAddresses.find((a) => a.id === addrId);
      if (found) {
        setDeliveryAddress(found.address);
        setDeliveryLandmark(found.landmark || '');
      }
    }
  };

  const handleAddAddressFromProfile = async () => {
    if (!manageModalAddress.trim()) {
      Alert.alert('Address Required', 'Please enter a valid complete address.');
      return;
    }
    if (!user?.id) return;
    const label = manageModalLabel === 'Other' && manageModalCustomLabel.trim() ? manageModalCustomLabel.trim() : manageModalLabel;
    const updated = await addressService.addAddress(user.id, {
      label,
      address: manageModalAddress.trim(),
      landmark: manageModalLandmark.trim() || undefined,
      is_default: manageModalDefault,
    });
    setSavedAddresses(updated);
    setManageModalAddress('');
    setManageModalLandmark('');
    setManageModalCustomLabel('');
    setManageModalDefault(false);
    Alert.alert('Success', `Address "${label}" saved to your profile.`);
  };

  const handleDeleteAddress = async (addrId: string) => {
    if (!user?.id) return;
    const updated = await addressService.deleteAddress(user.id, addrId);
    setSavedAddresses(updated);
    if (selectedAddressId === addrId) {
      if (updated.length > 0) {
        setSelectedAddressId(updated[0].id);
        setDeliveryAddress(updated[0].address);
        setDeliveryLandmark(updated[0].landmark || '');
      } else {
        setSelectedAddressId('new');
        setDeliveryAddress('');
        setDeliveryLandmark('');
      }
    }
  };

  const handleSetDefaultAddress = async (addrId: string) => {
    if (!user?.id) return;
    const updated = await addressService.setDefaultAddress(user.id, addrId);
    setSavedAddresses(updated);
  };

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Please add items before placing order.');
      return;
    }

    const isTableQrOrder = Boolean(tableId && tableId !== 'general');

    if (!isTableQrOrder && !user) {
      Alert.alert(
        'Authentication Required',
        'Please login or sign up to place and track your delivery orders.',
        [
          {
            text: 'Login',
            onPress: () =>
              router.push({
                pathname: '/(auth)/login',
                params: { redirectTableId: 'general' },
              }),
          },
          {
            text: 'Sign Up',
            onPress: () =>
              router.push({
                pathname: '/(auth)/signup',
                params: { redirectTableId: 'general' },
              }),
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    if (!isTableQrOrder && !deliveryAddress.trim()) {
      Alert.alert('Delivery Address Required', 'Please enter or select a delivery address to place your online delivery order.');
      return;
    }

    setSubmittingOrder(true);
    try {
      // Save new address to profile if requested for online delivery
      if (!isTableQrOrder && selectedAddressId === 'new' && saveToProfileChecked && user?.id && deliveryAddress.trim()) {
        const label = newAddressLabel === 'Other' && customLabelInput.trim() ? customLabelInput.trim() : newAddressLabel;
        addressService.addAddress(user.id, {
          label,
          address: deliveryAddress.trim(),
          landmark: deliveryLandmark.trim() || undefined,
          is_default: savedAddresses.length === 0,
        }).then(setSavedAddresses);
      }

      let activeTable = table;
      if (!activeTable && isTableQrOrder && tableId) {
        activeTable = await tableService.resolveTable(tableId);
        if (activeTable) setTable(activeTable);
      }

      const targetRestaurantId =
        activeTable?.restaurant_id ||
        table?.restaurant_id;

      if (!targetRestaurantId) {
        throw new Error('Unable to identify restaurant for this table. Please scan the QR code again.');
      }

      const currentTableNum =
        activeTable?.table_number ||
        table?.table_number ||
        (isTableQrOrder ? (tableId.startsWith('tbl-') ? tableId.replace('tbl-', 'Table ') : `Table ${tableId}`) : undefined);
      const currentTableId = activeTable?.id || table?.id || (isTableQrOrder ? tableId : undefined);

      const orderPayload: Partial<Order> & { payment_method?: PaymentMethod } = {
        restaurant_id: targetRestaurantId,
        order_source: isTableQrOrder ? 'CUSTOMER_QR' : 'CUSTOMER_APP',
        order_type: isTableQrOrder ? 'dine_in' : 'delivery',
        table_id: isTableQrOrder ? currentTableId : undefined,
        table_number: isTableQrOrder ? currentTableNum : undefined,
        customer_name: user?.full_name || custName || (isTableQrOrder ? `${currentTableNum} Guest` : 'Customer'),
        customer_phone: user?.phone || custPhone || undefined,
        customer_id: user?.id || undefined,
        delivery_address: isTableQrOrder ? undefined : deliveryAddress.trim(),
        delivery_landmark: isTableQrOrder ? undefined : (deliveryLandmark.trim() || undefined),
        notes: isTableQrOrder ? `[QR_DINE_IN] ${deliveryNotes.trim()}`.trim() : (deliveryNotes.trim() || undefined),
        items: cartItems,
        subtotal: totals.subtotal,
        coupon_code: appliedCoupon?.code,
        coupon_discount: totals.couponDiscount,
        cgst_amount: totals.cgstAmount,
        sgst_amount: totals.sgstAmount,
        grand_total: totals.rawTotal,
        round_off: totals.roundOff,
        payable_amount: totals.payableAmount,
        payment_method: 'cash',
        payment_status: 'unpaid',
        status: 'confirmed',
      };

      const created = await orderService.createOrder(orderPayload);

      setCartItems([]);
      setAppliedCoupon(null);
      setDeliveryNotes('');
      setShowCart(false);

      if (user) {
        await loadCustomerOrders(false);
        setShowOrdersModal(true);
        setOrdersModalTab('active');
      }

      const successMsg = isTableQrOrder
        ? `Your Dine-In order #${created.order_number} for ${currentTableNum} has been sent to the kitchen!\n\nYour dishes will be served directly to your table.`
        : `Your online delivery order #${created.order_number} has been confirmed.\n\nYou can track live delivery progress under Live Orders.`;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`🎉 Order Placed Successfully!\n\n${successMsg}`);
      } else {
        Alert.alert('🎉 Order Placed Successfully!', successMsg);
      }
    } catch (err: any) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Order Failed: ${err.message || 'Failed to submit order. Please try again.'}`);
      } else {
        Alert.alert('Order Failed', err.message || 'Failed to submit order. Please try again.');
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  const isGstEnabled = restSettingsData
    ? (restSettingsData.is_gst_enabled ?? (restSettingsData.gst_registered ?? Boolean(restSettingsData.gstin?.trim())))
    : true;
  const taxRate = restSettingsData?.default_tax_rate !== undefined ? restSettingsData.default_tax_rate : 5.0;

  const totals = calculateOrderTotals({
    items: cartItems,
    coupon: appliedCoupon,
    isGstEnabled,
    taxRate,
  });

  // Filter products by category and search text (name, SKU, category)
  const filteredProducts = products.filter((p) => {
    if (!p.is_active) return false;
    if (selectedCatId && p.category_id !== selectedCatId) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchName = p.name.toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchedCat = categories.find((c) => c.id === p.category_id);
      const matchCat = matchedCat ? matchedCat.name.toLowerCase().includes(q) : false;
      return matchName || matchSku || matchCat;
    }
    return true;
  });

  const isLiquorCategory = (catName: string) => {
    const name = catName.toLowerCase();
    return (
      name.includes('liquor') ||
      name.includes('wine') ||
      name.includes('beer') ||
      name.includes('beverage') ||
      name.includes('drink') ||
      name.includes('cocktail')
    );
  };

  const foodCategories = categories.filter((c) => !isLiquorCategory(c.name));
  const liquorCategories = categories.filter((c) => isLiquorCategory(c.name));

  const totalCartCount = cartItems.reduce((acc, i) => acc + i.quantity, 0);

  const isWeb = Platform.OS === 'web';
  const isTablet = windowWidth >= 768;
  const isDesktop = windowWidth >= 1024;

  const getResponsiveCardWidth = () => {
    if (isDesktop) return '23.5%';
    if (isTablet) return '31.5%';
    return '48%';
  };

  const getAddressIcon = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('home')) return '🏠';
    if (l.includes('office') || l.includes('work')) return '🏢';
    return '📍';
  };

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 8 : insets.top, paddingBottom: isWeb ? 0 : insets.bottom }]}>
      {/* ============================================================ */}
      {/* CLEAN CUSTOMER HEADER                                        */}
      {/* ============================================================ */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {restaurantInfo?.logo_url || settings.logo_url ? (
              <Image source={{ uri: restaurantInfo?.logo_url || settings.logo_url }} style={{ width: 28, height: 28, borderRadius: 6 }} resizeMode="contain" />
            ) : null}
            <Text style={styles.brandTitle}>{restaurantInfo?.name || (table as any)?.restaurant_name || settings.name || 'Restaurant'}</Text>
          </View>
          {table ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.tableBadge}>🪑 {table.table_number} • {table.section}</Text>
              <View
                style={{
                  backgroundColor: table.status === 'occupied' ? '#fee2e2' : '#dcfce7',
                  borderColor: table.status === 'occupied' ? '#f87171' : '#86efac',
                  borderWidth: 1,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: table.status === 'occupied' ? '#dc2626' : '#16a34a',
                  }}
                >
                  {table.status === 'occupied' ? '🔴 OCCUPIED / SEATED' : '🟢 AVAILABLE'}
                </Text>
              </View>
            </View>
          ) : user ? (
            <Text style={styles.userBadge} numberOfLines={1}>
              👤 Logged in as: <Text style={styles.userNameBold}>{user.full_name || user.email}</Text>
            </Text>
          ) : (
            <Text style={styles.tableBadge}>📍 Digital Menu & Online Ordering</Text>
          )}
        </View>

        <View style={styles.headerRight}>
          {/* Saved Addresses Button */}
          {user && (
            <TouchableOpacity
              style={styles.addrHeaderBtn}
              onPress={() => setShowAddressModal(true)}
            >
              <Text style={styles.addrHeaderBtnText}>
                📍 Saved Addresses ({savedAddresses.length})
              </Text>
            </TouchableOpacity>
          )}

          {/* My Orders Button */}
          {user && (
            <TouchableOpacity
              style={styles.ordersHeaderBtn}
              onPress={() => {
                setShowOrdersModal(true);
                setOrdersModalTab('active');
              }}
            >
              <Text style={styles.ordersHeaderBtnText}>
                📜 My Orders {activeOrders.length > 0 ? `(${activeOrders.length})` : ''}
              </Text>
            </TouchableOpacity>
          )}

          {/* Cart Header Button */}
          <TouchableOpacity style={styles.cartHeaderBtn} onPress={() => setShowCart(true)}>
            <Text style={styles.cartHeaderBtnText}>🛒 Cart ({totalCartCount})</Text>
          </TouchableOpacity>

          {/* Auth Action */}
          {user ? (
            <TouchableOpacity
              style={styles.signOutBtn}
              onPress={async () => {
                await logout();
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.location.href = '/login';
                } else {
                  router.replace('/(auth)/login' as any);
                }
              }}
            >
              <Text style={styles.signOutBtnText}>Sign Out</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.guestAuthRow}>
              <TouchableOpacity
                style={styles.loginBtn}
                onPress={() =>
                  router.push({
                    pathname: '/(auth)/login',
                    params: { redirectTableId: tableId || 'general' },
                  })
                }
              >
                <Text style={styles.loginBtnText}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.signupBtn}
                onPress={() =>
                  router.push({
                    pathname: '/(auth)/signup',
                    params: { redirectTableId: tableId || 'general' },
                  })
                }
              >
                <Text style={styles.signupBtnText}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu dishes or SKU..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Grouped Category Navigation */}
        <View style={styles.categoryScrollContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            <TouchableOpacity
              style={[styles.catPill, selectedCatId === null && styles.catPillActive]}
              onPress={() => setSelectedCatId(null)}
            >
              <Text style={[styles.catPillText, selectedCatId === null && styles.catPillTextActive]}>All</Text>
            </TouchableOpacity>

            {foodCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catPill, selectedCatId === cat.id && styles.catPillActive]}
                onPress={() => setSelectedCatId(cat.id)}
              >
                <Text style={[styles.catPillText, selectedCatId === cat.id && styles.catPillTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}

            {liquorCategories.length > 0 && (
              <>
                <View style={styles.liquorHeaderBadge}>
                  <Text style={styles.liquorHeaderBadgeText}>🍷 LIQUOR</Text>
                </View>

                {liquorCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catPill, selectedCatId === cat.id && styles.catPillActive]}
                    onPress={() => setSelectedCatId(cat.id)}
                  >
                    <Text style={[styles.catPillText, selectedCatId === cat.id && styles.catPillTextActive]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </ScrollView>
        </View>

        {/* Product Cards Grid */}
        <View style={styles.productGrid}>
          {filteredProducts.map((prod) => {
            const inCart = cartItems.find((i) => i.product_id === prod.id);
            const qty = inCart ? inCart.quantity : 0;
            const cardWidth = getResponsiveCardWidth();

            return (
              <View key={prod.id} style={[styles.productCard, { width: cardWidth }]}>
                {/* Image Container with Badges */}
                <View style={styles.imgContainer}>
                  {prod.image_url ? (
                    <Image source={{ uri: prod.image_url }} style={styles.productImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.productImg, { backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 24 }}>🍽️</Text>
                    </View>
                  )}

                  {/* Veg / Non-Veg / Liquor Icon Badge */}
                  <View style={styles.badgeContainer}>
                    <View
                      style={[
                        styles.vegSquareBadge,
                        {
                          borderColor:
                            prod.food_type === 'veg'
                              ? '#16a34a'
                              : prod.food_type === 'egg'
                              ? '#d97706'
                              : '#dc2626',
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.vegCircleDot,
                          {
                            backgroundColor:
                              prod.food_type === 'veg'
                                ? '#16a34a'
                                : prod.food_type === 'egg'
                                ? '#d97706'
                                : '#dc2626',
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* In-Cart Quantity Count Badge */}
                  {qty > 0 && (
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyBadgeText}>{qty}</Text>
                    </View>
                  )}
                </View>

                {/* Card Content */}
                <View style={styles.cardBody}>
                  <Text style={styles.prodSku} numberOfLines={1}>
                    {prod.sku || 'DISH'}
                  </Text>
                  <Text style={styles.prodName} numberOfLines={2}>
                    {prod.name}
                  </Text>

                  <View style={styles.cardBottomRow}>
                    <Text style={styles.prodPrice}>
                      {formatCurrency(prod.discounted_price || prod.price)}
                    </Text>

                    {qty === 0 ? (
                      <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(prod)}>
                        <Text style={styles.addBtnText}>+ ADD</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.stepper}>
                        <TouchableOpacity
                          style={styles.stepBtn}
                          onPress={() => updateQuantity(prod.id, qty - 1)}
                        >
                          <Text style={styles.stepBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepQty}>{qty}</Text>
                        <TouchableOpacity
                          style={[styles.stepBtn, styles.stepBtnAdd]}
                          onPress={() => updateQuantity(prod.id, qty + 1)}
                        >
                          <Text style={[styles.stepBtnText, { color: '#ffffff' }]}>+</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Floating Bottom Cart Bar */}
      {totalCartCount > 0 && (
        <TouchableOpacity
          style={[styles.bottomBar, { bottom: insets.bottom + 19 }]}
          onPress={() => setShowCart(true)}
          activeOpacity={0.9}
        >
          <View>
            <Text style={styles.bottomBarQty}>{totalCartCount} ITEMS SELECTED</Text>
            <Text style={styles.bottomBarTotal}>{formatCurrency(totals.payableAmount)}</Text>
          </View>
          <View style={styles.viewCartActionBox}>
            <Text style={styles.viewCartText}>PROCEED TO CHECKOUT →</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ============================================================ */}
      {/* CART & CHECKOUT MODAL (ALWAYS ONLINE DELIVERY WITH SAVED ADDRESSES) */}
      {/* ============================================================ */}
      <Modal visible={showCart} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%', paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.row}>
              <Text style={styles.modalTitle}>
                {tableId && tableId !== 'general'
                  ? `🍽️ Table ${table?.table_number || tableId} — Dine-In Order`
                  : '🛵 Checkout & Online Delivery'}
              </Text>
              <TouchableOpacity onPress={() => setShowCart(false)}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={true} style={{ marginVertical: 8 }}>
              {/* Cart Items List */}
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#64748b', marginBottom: 4 }}>
                ORDER ITEMS ({totalCartCount})
              </Text>
              {cartItems.map((item) => (
                <View key={item.product_id} style={styles.cartModalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0f172a' }}>
                      {item.product_name}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748b' }}>
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#0f172a' }}>
                    {formatCurrency(item.subtotal)}
                  </Text>
                </View>
              ))}

              {/* Coupon Applicator */}
              <View style={styles.custDetailsBox}>
                <View style={styles.couponRow}>
                  <TextInput
                    style={[styles.custInput, { flex: 1, textTransform: 'uppercase' } as any]}
                    placeholder="Coupon Code"
                    placeholderTextColor="#94a3b8"
                    value={couponInput}
                    onChangeText={setCouponInput}
                  />
                  <TouchableOpacity style={styles.applyCouponBtn} onPress={handleApplyCoupon}>
                    <Text style={styles.applyCouponText}>Apply</Text>
                  </TouchableOpacity>
                </View>

                {appliedCoupon && (
                  <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '800', marginTop: 4 }}>
                    ✓ Coupon applied: -{formatCurrency(totals.couponDiscount)}
                  </Text>
                )}
              </View>

              {/* Table QR Dine-In vs Online Delivery Address Section */}
              {tableId && tableId !== 'general' ? (
                /* ================= TABLE QR DINE-IN ================= */
                <View style={{ marginVertical: 8, padding: 14, backgroundColor: '#f0fdf4', borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0' }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#166534', marginBottom: 2 }}>
                    🍽️ Dining In at Table {table?.table_number || tableId} ({table?.section || 'Dining Floor'})
                  </Text>
                  <Text style={{ fontSize: 11, color: '#15803d', marginBottom: 10 }}>
                    Your dishes will be freshly cooked and served directly to your table.
                  </Text>

                  <View style={{ gap: 8 }}>
                    <TextInput
                      style={styles.custInput}
                      placeholder="Guest / Customer Name (Optional)"
                      placeholderTextColor="#94a3b8"
                      value={custName}
                      onChangeText={setCustName}
                    />
                    <TextInput
                      style={styles.custInput}
                      placeholder="Phone Number (Optional)"
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                      value={custPhone}
                      onChangeText={setCustPhone}
                    />
                    <TextInput
                      style={styles.custInput}
                      placeholder="Special Cooking / Table Instructions (Optional)"
                      placeholderTextColor="#94a3b8"
                      value={deliveryNotes}
                      onChangeText={setDeliveryNotes}
                    />
                  </View>
                </View>
              ) : (
                /* ================= ONLINE DELIVERY ADDRESS ================= */
                <View style={styles.deliverySectionBox}>
                  <View style={styles.deliverySectionHeader}>
                    <Text style={styles.deliverySectionTitle}>📍 DELIVER TO ADDRESS *</Text>
                    {user && (
                      <TouchableOpacity onPress={() => setShowAddressModal(true)}>
                        <Text style={styles.manageAddrLink}>Manage Addresses</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Saved Address Selection Pills */}
                  {user && savedAddresses.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {savedAddresses.map((addr) => {
                          const isSelected = selectedAddressId === addr.id;
                          return (
                            <TouchableOpacity
                              key={addr.id}
                              style={[styles.addressPill, isSelected && styles.addressPillActive]}
                              onPress={() => handleSelectSavedAddress(addr.id)}
                            >
                              <Text style={[styles.addressPillText, isSelected && styles.addressPillTextActive]}>
                                {getAddressIcon(addr.label)} {addr.label} {addr.is_default ? '★' : ''}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          style={[styles.addressPill, selectedAddressId === 'new' && styles.addressPillActive]}
                          onPress={() => handleSelectSavedAddress('new')}
                        >
                          <Text style={[styles.addressPillText, selectedAddressId === 'new' && styles.addressPillTextActive]}>
                            ➕ New Address
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </ScrollView>
                  )}

                  {/* Customer Contact & Address Form */}
                  <View style={{ gap: 8 }}>
                    <TextInput
                      style={styles.custInput}
                      placeholder="Full Name *"
                      placeholderTextColor="#94a3b8"
                      value={custName}
                      onChangeText={setCustName}
                    />
                    <TextInput
                      style={styles.custInput}
                      placeholder="Phone Number *"
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                      value={custPhone}
                      onChangeText={setCustPhone}
                    />

                    {/* Selected Address Display Card or New Address Inputs */}
                    {selectedAddressId !== 'new' && (
                      <View style={styles.selectedAddressCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.selectedAddressLabel}>
                            {getAddressIcon(savedAddresses.find((a) => a.id === selectedAddressId)?.label || '')}{' '}
                            {savedAddresses.find((a) => a.id === selectedAddressId)?.label}
                          </Text>
                          <TouchableOpacity onPress={() => handleSelectSavedAddress('new')}>
                            <Text style={styles.changeAddressLink}>✏️ Change</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.selectedAddressText}>{deliveryAddress}</Text>
                        {deliveryLandmark ? (
                          <Text style={styles.selectedAddressLandmark}>Near: {deliveryLandmark}</Text>
                        ) : null}
                      </View>
                    )}

                    {selectedAddressId === 'new' && (
                      <>
                        {/* Label Chooser for New Address */}
                        {user && (
                          <View style={{ marginTop: 2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 4 }}>
                              Save As:
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                              {['Home', 'Office', 'Other'].map((lbl) => (
                                <TouchableOpacity
                                  key={lbl}
                                  style={[styles.labelTagBtn, newAddressLabel === lbl && styles.labelTagBtnActive]}
                                  onPress={() => setNewAddressLabel(lbl)}
                                >
                                  <Text style={[styles.labelTagBtnText, newAddressLabel === lbl && styles.labelTagBtnTextActive]}>
                                    {getAddressIcon(lbl)} {lbl}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            {newAddressLabel === 'Other' && (
                              <TextInput
                                style={[styles.custInput, { marginBottom: 6 }]}
                                placeholder="Custom Label (e.g. Vacation Home, Friend's)"
                                placeholderTextColor="#94a3b8"
                                value={customLabelInput}
                                onChangeText={setCustomLabelInput}
                              />
                            )}
                          </View>
                        )}

                        <TextInput
                          style={[styles.custInput, { height: 60, textAlignVertical: 'top' }]}
                          placeholder="Complete Delivery Address (House/Flat, Street, Area) *"
                          placeholderTextColor="#94a3b8"
                          multiline
                          value={deliveryAddress}
                          onChangeText={setDeliveryAddress}
                        />
                        <TextInput
                          style={styles.custInput}
                          placeholder="Landmark (Optional, e.g. Near City Park)"
                          placeholderTextColor="#94a3b8"
                          value={deliveryLandmark}
                          onChangeText={setDeliveryLandmark}
                        />

                        {/* Save to Profile Checkbox */}
                        {user && (
                          <TouchableOpacity
                            style={styles.checkboxRow}
                            onPress={() => setSaveToProfileChecked(!saveToProfileChecked)}
                          >
                            <View style={[styles.checkboxBox, saveToProfileChecked && styles.checkboxBoxChecked]}>
                              {saveToProfileChecked && <Text style={styles.checkboxCheck}>✓</Text>}
                            </View>
                            <Text style={styles.checkboxLabel}>Save this address to my profile for future orders</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}

                    <TextInput
                      style={styles.custInput}
                      placeholder="Delivery Instructions / Food Notes (Optional)"
                      placeholderTextColor="#94a3b8"
                      value={deliveryNotes}
                      onChangeText={setDeliveryNotes}
                    />
                  </View>
                </View>
              )}

              {/* Payment Methods */}
              <View style={styles.paymentSection}>
                <Text style={styles.paymentSectionTitle}>PAYMENT METHOD</Text>
                {tableId && tableId !== 'general' ? (
                  <View style={[styles.paymentOptionCard, styles.paymentOptionCardSelected]}>
                    <View style={styles.radioDot}><View style={styles.radioDotInner} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentOptionTitle}>💵 Pay at Counter / Table</Text>
                      <Text style={styles.paymentOptionDesc}>Pay cash or UPI after dining when you finish your meal.</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.paymentOptionCard, selectedPaymentMethod === 'cash' && styles.paymentOptionCardSelected]}
                      onPress={() => setSelectedPaymentMethod('cash')}
                    >
                      <View style={styles.radioDot}>{selectedPaymentMethod === 'cash' && <View style={styles.radioDotInner} />}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.paymentOptionTitle}>💵 Cash on Delivery (COD)</Text>
                        <Text style={styles.paymentOptionDesc}>Pay in cash upon delivery at your doorstep.</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.paymentOptionCard, { opacity: 0.6, backgroundColor: '#f1f5f9' }]}
                      disabled={true}
                    >
                      <View style={[styles.radioDot, { borderColor: '#cbd5e1' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.paymentOptionTitle, { color: '#64748b' }]}>📱 Online Payment (UPI / Card)</Text>
                        <Text style={styles.paymentOptionDesc}>Coming soon / Gateway not configured. Please select COD for instant ordering.</Text>
                      </View>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Bill Totals Breakdown */}
              <View style={{ paddingVertical: 6 }}>
                <View style={styles.receiptSummaryRow}>
                  <Text style={{ fontSize: 11, color: '#64748b' }}>Item Subtotal</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700' }}>{formatCurrency(totals.subtotal)}</Text>
                </View>

                {totals.couponDiscount > 0 && (
                  <View style={styles.receiptSummaryRow}>
                    <Text style={{ fontSize: 11, color: '#16a34a' }}>Coupon Discount</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>
                      -{formatCurrency(totals.couponDiscount)}
                    </Text>
                  </View>
                )}

                {totals.totalTax > 0 && (
                  <View style={styles.receiptSummaryRow}>
                    <Text style={{ fontSize: 11, color: '#64748b' }}>GST ({(taxRate).toFixed(1)}%)</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700' }}>
                      {formatCurrency(totals.cgstAmount + totals.sgstAmount)}
                    </Text>
                  </View>
                )}

                <View style={[styles.receiptSummaryRow, { borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 6, marginTop: 4 }]}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a' }}>Grand Total</Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: '#16a34a' }}>
                    {formatCurrency(totals.payableAmount)}
                  </Text>
                </View>
              </View>

              {/* Confirm & Place Order Action */}
              <TouchableOpacity
                style={[styles.checkoutBtn, submittingOrder && { opacity: 0.7 }]}
                onPress={handlePlaceOrder}
                disabled={submittingOrder}
              >
                {submittingOrder ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.checkoutBtnText}>
                    {tableId && tableId !== 'general'
                      ? 'CONFIRM & SEND TO KITCHEN →'
                      : 'CONFIRM & PLACE ORDER (COD) →'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* SAVED ADDRESSES MANAGEMENT MODAL                             */}
      {/* ============================================================ */}
      <Modal visible={showAddressModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '88%', paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.row}>
              <Text style={styles.modalTitle}>📍 Saved Delivery Addresses</Text>
              <TouchableOpacity onPress={() => setShowAddressModal(false)}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={true} style={{ marginVertical: 8 }}>
              {/* Existing Saved Addresses List */}
              <Text style={{ fontSize: 11, fontWeight: '900', color: '#64748b', marginBottom: 6 }}>
                YOUR SAVED ADDRESSES ({savedAddresses.length})
              </Text>

              {savedAddresses.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 20, backgroundColor: '#f8fafc', borderRadius: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 28 }}>📍</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginTop: 4 }}>
                    No saved addresses yet. Add your first address below!
                  </Text>
                </View>
              ) : (
                savedAddresses.map((addr) => (
                  <View key={addr.id} style={styles.savedAddressItem}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.savedAddressItemLabel}>
                          {getAddressIcon(addr.label)} {addr.label}
                        </Text>
                        {addr.is_default && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteAddress(addr.id)}>
                        <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: 'bold' }}>🗑️ Delete</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.savedAddressItemText}>{addr.address}</Text>
                    {addr.landmark && (
                      <Text style={styles.savedAddressItemLandmark}>Near: {addr.landmark}</Text>
                    )}

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      {!addr.is_default && (
                        <TouchableOpacity
                          style={styles.setDefaultBtn}
                          onPress={() => handleSetDefaultAddress(addr.id)}
                        >
                          <Text style={styles.setDefaultBtnText}>Set as Default</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.useThisAddrBtn}
                        onPress={() => {
                          handleSelectSavedAddress(addr.id);
                          setShowAddressModal(false);
                        }}
                      >
                        <Text style={styles.useThisAddrBtnText}>✓ Use for Order</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}

              {/* Add New Address Form */}
              <View style={styles.addNewAddressBox}>
                <Text style={{ fontSize: 12, fontWeight: '900', color: '#0f172a', marginBottom: 8 }}>
                  ➕ ADD NEW ADDRESS TO PROFILE
                </Text>

                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {['Home', 'Office', 'Other'].map((lbl) => (
                    <TouchableOpacity
                      key={lbl}
                      style={[styles.labelTagBtn, manageModalLabel === lbl && styles.labelTagBtnActive]}
                      onPress={() => setManageModalLabel(lbl)}
                    >
                      <Text style={[styles.labelTagBtnText, manageModalLabel === lbl && styles.labelTagBtnTextActive]}>
                        {getAddressIcon(lbl)} {lbl}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {manageModalLabel === 'Other' && (
                  <TextInput
                    style={[styles.custInput, { marginBottom: 8 }]}
                    placeholder="Custom Label (e.g. Gym, Parents)"
                    placeholderTextColor="#94a3b8"
                    value={manageModalCustomLabel}
                    onChangeText={setManageModalCustomLabel}
                  />
                )}

                <TextInput
                  style={[styles.custInput, { height: 60, textAlignVertical: 'top', marginBottom: 8 }]}
                  placeholder="Complete Address (House/Flat, Street, Area) *"
                  placeholderTextColor="#94a3b8"
                  multiline
                  value={manageModalAddress}
                  onChangeText={setManageModalAddress}
                />

                <TextInput
                  style={[styles.custInput, { marginBottom: 8 }]}
                  placeholder="Landmark (Optional)"
                  placeholderTextColor="#94a3b8"
                  value={manageModalLandmark}
                  onChangeText={setManageModalLandmark}
                />

                <TouchableOpacity
                  style={[styles.checkboxRow, { marginBottom: 10 }]}
                  onPress={() => setManageModalDefault(!manageModalDefault)}
                >
                  <View style={[styles.checkboxBox, manageModalDefault && styles.checkboxBoxChecked]}>
                    {manageModalDefault && <Text style={styles.checkboxCheck}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>Set as my default delivery address</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveNewAddrBtn} onPress={handleAddAddressFromProfile}>
                  <Text style={styles.saveNewAddrBtnText}>💾 Save Address to Profile</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* CUSTOMER "MY ORDERS & HISTORY" MODAL                         */}
      {/* ============================================================ */}
      <Modal visible={showOrdersModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '88%', paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.row}>
              <Text style={styles.modalTitle}>My Orders</Text>
              <TouchableOpacity onPress={() => setShowOrdersModal(false)}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 2 Tabs Only: LIVE ORDERS and ORDER HISTORY */}
            <View style={styles.modalTabRow}>
              <TouchableOpacity
                style={[styles.modalTabBtn, ordersModalTab === 'active' && styles.modalTabBtnActive]}
                onPress={() => setOrdersModalTab('active')}
              >
                <Text style={[styles.modalTabBtnText, ordersModalTab === 'active' && styles.modalTabBtnTextActive]}>
                  LIVE ORDERS ({activeOrders.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalTabBtn, ordersModalTab === 'history' && styles.modalTabBtnActive]}
                onPress={() => setOrdersModalTab('history')}
              >
                <Text style={[styles.modalTabBtnText, ordersModalTab === 'history' && styles.modalTabBtnTextActive]}>
                  ORDER HISTORY ({historyOrders.length})
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 8 }}>
              {loadingOrders ? (
                <ActivityIndicator size="large" color="#2563eb" style={{ marginVertical: 20 }} />
              ) : (ordersModalTab === 'active' ? activeOrders : historyOrders).length === 0 ? (
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <Text style={{ fontSize: 32 }}>{ordersModalTab === 'active' ? '🛵' : '📜'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748b', marginTop: 8 }}>
                    {ordersModalTab === 'active' ? 'No active live orders in progress.' : 'No past order history found.'}
                  </Text>
                </View>
              ) : (
                (ordersModalTab === 'active' ? activeOrders : historyOrders).map((ord) => {
                  const itemCount = ord.items?.reduce((acc, i) => acc + i.quantity, 0) || ord.items?.length || 0;

                  return (
                    <View key={ord.id} style={styles.orderListItem}>
                      <View style={styles.row}>
                        <View>
                          <Text style={{ fontSize: 13, fontWeight: '900', color: '#0f172a' }}>
                            Order #{ord.order_number}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            🕒 Placed: {formatOrderDateTime(ord.created_at)}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontWeight: '900', color: '#16a34a', fontSize: 14 }}>
                            {formatCurrency(ord.payable_amount)}
                          </Text>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: ord.payment_status === 'paid' ? '#15803d' : '#b45309' }}>
                            COD • {ord.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                          </Text>
                        </View>
                      </View>

                      {/* Items Summary */}
                      <Text style={{ fontSize: 11, color: '#475569', marginVertical: 4 }}>
                        {itemCount} Items: {ord.items?.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}
                      </Text>

                      {/* Delivery Address */}
                      {ord.delivery_address && (
                        <Text style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }} numberOfLines={2}>
                          📍 Deliver To: {ord.delivery_address} {ord.delivery_landmark ? `(Near: ${ord.delivery_landmark})` : ''}
                        </Text>
                      )}

                      {/* 3-State Delivery Progress Bar */}
                      <RealtimeOrderStatus status={ord.status} />

                      <TouchableOpacity
                        style={[styles.viewOrderDetailsBtn, { marginTop: 8 }]}
                        onPress={() => setSelectedOrderDetail(ord)}
                      >
                        <Text style={styles.viewOrderDetailsBtnText}>VIEW DETAILS</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Order Detail Modal */}
      {selectedOrderDetail && (
        <Modal visible={Boolean(selectedOrderDetail)} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxHeight: '90%', paddingBottom: insets.bottom + 24 }]}>
              <View style={styles.row}>
                <Text style={styles.modalTitle}>Order #{selectedOrderDetail.order_number}</Text>
                <TouchableOpacity onPress={() => setSelectedOrderDetail(null)}>
                  <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#64748b' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ marginTop: 8 }}>
                <View style={styles.detailMetaBox}>
                  <Text style={styles.detailMetaRow}>
                    <Text style={{ fontWeight: 'bold' }}>Order Date & Time:</Text> {formatOrderDateTime(selectedOrderDetail.created_at)}
                  </Text>
                  <Text style={styles.detailMetaRow}>
                    Status: <Text style={{ fontWeight: 'bold', color: '#2563eb' }}>{selectedOrderDetail.status.toUpperCase()}</Text>
                  </Text>
                  <Text style={styles.detailMetaRow}>
                    Payment: <Text style={{ fontWeight: 'bold' }}>{selectedOrderDetail.payment_status.toUpperCase()} (COD)</Text>
                  </Text>
                  {selectedOrderDetail.delivery_address && (
                    <Text style={styles.detailMetaRow}>
                      Deliver To: {selectedOrderDetail.delivery_address} {selectedOrderDetail.delivery_landmark ? `(Near: ${selectedOrderDetail.delivery_landmark})` : ''}
                    </Text>
                  )}
                  {Boolean(cleanCustomerOrderNotes(selectedOrderDetail.notes)) && (
                    <Text style={styles.detailMetaRow}>Notes: {cleanCustomerOrderNotes(selectedOrderDetail.notes)}</Text>
                  )}
                </View>

                {/* Items Table */}
                <View style={styles.itemsTable}>
                  <Text style={styles.itemsTableTitle}>ITEMS</Text>
                  {(selectedOrderDetail.items || []).map((itm, idx) => (
                    <View key={itm.id || idx} style={styles.itemRow}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#0f172a', flex: 1 }}>
                        {itm.product_name}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748b', width: 40, textAlign: 'center' }}>
                        {itm.quantity}x
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#0f172a', width: 70, textAlign: 'right' }}>
                        {formatCurrency(itm.total)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Financial Summary */}
                <View style={styles.receiptSummaryBox}>
                  <View style={styles.receiptRow}>
                    <Text style={{ fontSize: 11, color: '#64748b' }}>Subtotal</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700' }}>
                      {formatCurrency(getOrderSubtotal(selectedOrderDetail))}
                    </Text>
                  </View>
                  {selectedOrderDetail.coupon_discount ? (
                    <View style={styles.receiptRow}>
                      <Text style={{ fontSize: 11, color: '#16a34a' }}>Coupon Discount</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>
                        -{formatCurrency(selectedOrderDetail.coupon_discount)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.receiptRow}>
                    <Text style={{ fontSize: 11, color: '#64748b' }}>GST</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700' }}>
                      {formatCurrency(
                        (selectedOrderDetail.cgst_amount || 0) + (selectedOrderDetail.sgst_amount || 0)
                      )}
                    </Text>
                  </View>
                  <View style={[styles.receiptRow, { borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 6, marginTop: 4 }]}>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: '#0f172a' }}>Grand Total</Text>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: '#16a34a' }}>
                      {formatCurrency(selectedOrderDetail.payable_amount)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.closeDetailBtn}
                  onPress={() => setSelectedOrderDetail(null)}
                >
                  <Text style={styles.closeDetailBtnText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    minWidth: 160,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  userBadge: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  userNameBold: {
    fontWeight: '800',
    color: '#0f172a',
  },
  tableBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  addrHeaderBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  addrHeaderBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  ordersHeaderBtn: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  ordersHeaderBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  cartHeaderBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  cartHeaderBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  signOutBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  signOutBtnText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '800',
  },
  guestAuthRow: {
    flexDirection: 'row',
    gap: 6,
  },
  loginBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  loginBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  signupBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  signupBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  searchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0f172a',
  },

  // Categories
  categoryScrollContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 8,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  catPillActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  catPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  catPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  liquorHeaderBadge: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 6,
  },
  liquorHeaderBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },

  // Product Grid
  productGrid: {
    padding: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  imgContainer: {
    height: 100,
    backgroundColor: '#f8fafc',
    position: 'relative',
  },
  productImg: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#ffffff',
    padding: 2,
    borderRadius: 4,
  },
  vegSquareBadge: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegCircleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  qtyBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: '#0f172a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qtyBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  cardBody: {
    padding: 10,
  },
  prodSku: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
  },
  prodName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
    height: 32,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  prodPrice: {
    fontSize: 13,
    fontWeight: '900',
    color: '#16a34a',
  },
  addBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  addBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1d4ed8',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnAdd: {
    backgroundColor: '#0f172a',
  },
  stepBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  stepQty: {
    fontSize: 11,
    fontWeight: '800',
    minWidth: 16,
    textAlign: 'center',
  },

  // Floating Bottom Cart Bar
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 6,
  },
  bottomBarQty: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  bottomBarTotal: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  viewCartActionBox: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewCartText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  cartModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  custDetailsBox: {
    marginVertical: 6,
  },
  couponRow: {
    flexDirection: 'row',
    gap: 6,
  },
  applyCouponBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 8,
  },
  applyCouponText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  custInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 11,
    color: '#0f172a',
  },

  // Delivery Section & Saved Addresses
  deliverySectionBox: {
    marginVertical: 8,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  deliverySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deliverySectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
  },
  manageAddrLink: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563eb',
  },
  addressPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  addressPillActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  addressPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  addressPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  selectedAddressCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#93c5fd',
  },
  selectedAddressLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1d4ed8',
  },
  changeAddressLink: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563eb',
  },
  selectedAddressText: {
    fontSize: 11,
    color: '#334155',
    marginTop: 4,
  },
  selectedAddressLandmark: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  labelTagBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  labelTagBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  labelTagBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  labelTagBtnTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxBoxChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkboxCheck: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },

  // Saved Addresses Modal Item Styles
  savedAddressItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  savedAddressItemLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
  },
  defaultBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#15803d',
  },
  savedAddressItemText: {
    fontSize: 11,
    color: '#334155',
    marginTop: 3,
  },
  savedAddressItemLandmark: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  setDefaultBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  setDefaultBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  useThisAddrBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  useThisAddrBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#ffffff',
  },
  addNewAddressBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 6,
  },
  saveNewAddrBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveNewAddrBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },

  // Payment Section
  paymentSection: {
    marginVertical: 8,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  paymentSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 8,
  },
  paymentOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    marginBottom: 6,
  },
  paymentOptionCardSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#16a34a',
  },
  paymentOptionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  paymentOptionDesc: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },

  // Buttons
  checkoutBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  checkoutBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  viewOrderDetailsBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  viewOrderDetailsBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },
  modalTabRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    marginVertical: 6,
  },
  modalTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  modalTabBtnActive: {
    backgroundColor: '#ffffff',
    elevation: 2,
  },
  modalTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  modalTabBtnTextActive: {
    color: '#2563eb',
    fontWeight: '900',
  },
  orderListItem: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },

  // Detail Modal
  detailMetaBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailMetaRow: {
    fontSize: 11,
    color: '#334155',
    marginVertical: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemsTable: {
    marginTop: 10,
  },
  itemsTableTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  receiptSummaryBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  receiptSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  closeDetailBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closeDetailBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
});
