import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Image,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { productService } from '../../src/services/api/productService';
import { categoryService } from '../../src/services/api/categoryService';
import { tableService } from '../../src/services/api/tableService';
import { Product, Category, DiningTable, TableSection, Order } from '../../src/types';
import { usePos } from '../../src/context/PosContext';
import { useSettings } from '../../src/context/SettingsContext';
import { useNotification } from '../../src/context/NotificationContext';
import { useAuth } from '../../src/context/AuthContext';
import { RegisterClosedError } from '../../src/context/PosContext';
import { formatCurrency, numberToWords } from '../../src/utils/currency';
import { getOrderSubtotal } from '../../src/utils/gst';
import { formatOrderDateTime } from '../../src/utils/dateUtils';
import { printService } from '../../src/services/printService';
import { dayRegisterService } from '../../src/services/api/dayRegisterService';
import { TableSelectorModal } from '../../src/components/pos/TableSelectorModal';
import { SplitBillModal } from '../../src/components/pos/SplitBillModal';
import { HoldOrdersModal } from '../../src/components/pos/HoldOrdersModal';
import { PaymentModal } from '../../src/components/pos/PaymentModal';
import { isValidPhoneNumber } from '../../src/utils/phone';
import { naturalTableCompare } from '../../src/utils/sortUtils';

export default function PosScreen() {
  const router = useRouter();
  const { settings, isOnlineOrdersEnabled, toggleOnlineOrders } = useSettings();
  const { user, role, isSuperAdmin, activeRestaurantId, activeRestaurant, hasPermission } = useAuth();
  const { showToast } = useNotification();
  const [togglingOnline, setTogglingOnline] = useState<boolean>(false);
  const {
    cartItems,
    orderType,
    setOrderType,
    selectedTable,
    setSelectedTable,
    customerInfo,
    setCustomerInfo,
    addToCart,
    removeItem,
    updateQuantity,
    clearCart,
    discountType,
    discountValue,
    setDiscount,
    appliedCoupon,
    applyCouponCode,
    removeCoupon,
    totals,
    heldOrders,
    holdOrder,
    resumeHeldOrder,
    holdCurrentOrder,
    confirmOrder,
    updateActiveOrder,
    updateOrderPricesOnly,
    processPayment,
    loadOrderIntoCart,
    activeOrders,
    refreshOrders,
  } = usePos();

  // POS Workflow Step:
  // 'choose_type'   -> Step 1: Landing screen choosing [Dine In] [Takeaway] [Delivery]
  // 'select_table'  -> Step 2: Dine-In floor plan table selector screen
  // 'catalog'       -> Step 3: Product catalog, categories, search, and cart actions
  const [posStep, setPosStep] = useState<'choose_type' | 'select_table' | 'catalog'>('choose_type');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Table screen filters
  const [tableSectionFilter, setTableSectionFilter] = useState<TableSection | 'All'>('All');
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');

  // Mobile layout tab: 'menu' or 'cart'
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');

  // Modals
  const [showTableModal, setShowTableModal] = useState<boolean>(false);
  const [showHoldModal, setShowHoldModal] = useState<boolean>(false);
  const [showSplitModal, setShowSplitModal] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [showRegisterClosedModal, setShowRegisterClosedModal] = useState<boolean>(false);
  const [openingFloatInput, setOpeningFloatInput] = useState<string>('0');
  const [isOpeningRegisterFromPos, setIsOpeningRegisterFromPos] = useState<boolean>(false);

  // Table "View Current Order" modal
  const [viewTableModalData, setViewTableModalData] = useState<{ table: DiningTable; order: Order | null } | null>(null);

  // Cart / KOT / Discount state tracking
  const [couponCodeInput, setCouponCodeInput] = useState<string>('');
  const [discountInputValue, setDiscountInputValue] = useState<string>('');
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [isKotDispatched, setIsKotDispatched] = useState<boolean>(false);
  const [hasUnsentItems, setHasUnsentItems] = useState<boolean>(false);
  const [isSendingKot, setIsSendingKot] = useState<boolean>(false);

  const [windowWidth, setWindowWidth] = useState<number>(Dimensions.get('window').width);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  const isWideDesktop = windowWidth >= 1200;
  const isTablet = windowWidth >= 768;

  // Load products, categories, and dining tables
  const loadInitialData = async (isRefresh: boolean = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setTablesLoading(true);
      }
      const [prods, cats, tbls] = await Promise.all([
        productService.getProducts(activeRestaurantId),
        categoryService.getCategories(activeRestaurantId),
        tableService.getTables(activeRestaurantId),
      ]);
      setProducts(prods);
      setCategories(cats);
      setTables(tbls);
      if (refreshOrders) {
        await refreshOrders();
      }
    } catch (e) {
      console.warn('POS initial load failed:', e);
    } finally {
      setTablesLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadInitialData(true);
  };

  useEffect(() => {
    loadInitialData();
  }, [activeRestaurantId]);

  useFocusEffect(
    React.useCallback(() => {
      loadInitialData(true);
      if (refreshOrders) {
        refreshOrders();
      }
    }, [activeRestaurantId, refreshOrders])
  );

  // When cart is cleared, reset KOT state
  useEffect(() => {
    if (cartItems.length === 0) {
      setIsKotDispatched(false);
      setHasUnsentItems(false);
      setCreatedOrder(null);
    }
  }, [cartItems.length]);

  // Active Orders mapped by table_id or table_number
  const tableOrderMap = useMemo(() => {
    const map = new Map<string, Order>();
    (activeOrders || []).forEach((ord) => {
      if (ord.status !== 'completed' && ord.status !== 'cancelled') {
        if (ord.table_id) {
          map.set(ord.table_id, ord);
        }
        if (ord.table_number) {
          map.set(ord.table_number.toLowerCase().trim(), ord);
        }
      }
    });
    return map;
  }, [activeOrders]);

  // Table section list
  const tableSections: (TableSection | 'All')[] = [
    'All',
    'Ground Floor',
    'First Floor',
    'Outdoor',
    'AC Section',
    'VIP Section',
  ];

  // Filtered dining tables
  const filteredTables = useMemo(() => {
    return tables
      .filter((t) => {
        if (!t.is_active) return false;
        if (tableSectionFilter !== 'All') {
          if (tableSectionFilter === 'VIP Section' || tableSectionFilter === 'VIP') {
            if (t.section !== 'VIP' && t.section !== 'VIP Section') return false;
          } else if (t.section !== tableSectionFilter) {
            return false;
          }
        }
        if (tableSearchQuery.trim()) {
          const q = tableSearchQuery.toLowerCase().trim();
          return (
            t.table_number.toLowerCase().includes(q) ||
            t.section.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort(naturalTableCompare);
  }, [tables, tableSectionFilter, tableSearchQuery]);

  // Available / Occupied table stats
  const tableStats = useMemo(() => {
    let available = 0;
    let occupied = 0;
    tables.forEach((t) => {
      if (!t.is_active) return;
      const activeOrd = tableOrderMap.get(t.id) || tableOrderMap.get(t.table_number.toLowerCase().trim());
      if (activeOrd) {
        occupied++;
      } else {
        available++;
      }
    });
    return { available, occupied, total: tables.length };
  }, [tables, tableOrderMap]);

  // Product search filter
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.is_active) return false;
      if (selectedCatId && p.category_id !== selectedCatId) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, selectedCatId, searchQuery]);

  // ----------------------------------------------------
  // ORDER TYPE & TABLE ACTIONS
  // ----------------------------------------------------
  const handleOpenRegisterFromPos = async () => {
    const targetRestId = activeRestaurantId || settings.restaurant_id;
    if (!targetRestId) {
      if (Platform.OS === 'web') window.alert('No restaurant selected.');
      else Alert.alert('Error', 'No restaurant selected.');
      return;
    }
    const floatVal = parseFloat(openingFloatInput) || 0;
    if (isNaN(floatVal) || floatVal < 0) {
      if (Platform.OS === 'web') window.alert('Please enter a valid opening cash float.');
      else Alert.alert('Invalid Float', 'Please enter a valid opening cash float.');
      return;
    }

    try {
      setIsOpeningRegisterFromPos(true);
      await dayRegisterService.openRegister({
        opening_cash_float: floatVal,
        opened_by: user?.full_name || 'Staff',
        restaurant_id: targetRestId,
      });
      setShowRegisterClosedModal(false);
      showToast('success', 'Register Opened', `Register opened with ₹${floatVal.toFixed(2)} opening float.`);
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message || 'Failed to open register.');
      else Alert.alert('Open Register Error', err.message || 'Failed to open register.');
    } finally {
      setIsOpeningRegisterFromPos(false);
    }
  };

  const handleSelectOrderType = async (type: 'dine_in' | 'takeaway' | 'delivery') => {
    const targetRestId = activeRestaurantId || settings.restaurant_id;
    if (targetRestId) {
      const isOpen = await dayRegisterService.isRegisterOpen(targetRestId);
      if (!isOpen) {
        setShowRegisterClosedModal(true);
        return;
      }
    }
    setOrderType(type);
    if (type === 'dine_in') {
      setSelectedTable(null);
      setPosStep('select_table');
    } else {
      setSelectedTable(null);
      setPosStep('catalog');
    }
  };

  const handleSelectTableAction = (table: DiningTable) => {
    setSelectedTable(table);
    const existingActiveOrder =
      tableOrderMap.get(table.id) ||
      tableOrderMap.get(table.table_number.toLowerCase().trim());

    if (existingActiveOrder) {
      loadOrderIntoCart(existingActiveOrder);
      setCreatedOrder(existingActiveOrder);
      setIsKotDispatched(true);
      setHasUnsentItems(false);
    } else {
      clearCart();
      setSelectedTable(table);
      setCreatedOrder(null);
      setIsKotDispatched(false);
      setHasUnsentItems(false);
    }
    setPosStep('catalog');
  };

  const handleViewCurrentOrderAction = (table: DiningTable) => {
    const existingActiveOrder =
      tableOrderMap.get(table.id) ||
      tableOrderMap.get(table.table_number.toLowerCase().trim()) ||
      null;

    setViewTableModalData({ table, order: existingActiveOrder });
  };

  const handleChangeOrderTypePrompt = () => {
    if (cartItems.length > 0) {
      if (Platform.OS === 'web') {
        if (window.confirm('Your current cart items will be preserved, but table selection will be reset. Change order type?')) {
          setSelectedTable(null);
          setPosStep('choose_type');
        }
      } else {
        Alert.alert(
          '🔄 Change Order Type',
          'Your current cart items will be preserved, but table selection will be reset. Proceed?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Change Order Type',
              onPress: () => {
                setSelectedTable(null);
                setPosStep('choose_type');
              },
            },
          ]
        );
      }
    } else {
      setSelectedTable(null);
      setPosStep('choose_type');
    }
  };

  const handleChangeTablePrompt = () => {
    setPosStep('select_table');
  };

  // ----------------------------------------------------
  // CART / PRODUCT ACTIONS
  // ----------------------------------------------------
  const handleProductCardPress = async (item: Product) => {
    const targetRestId = activeRestaurantId || settings.restaurant_id;
    if (targetRestId) {
      const isOpen = await dayRegisterService.isRegisterOpen(targetRestId);
      if (!isOpen) {
        setShowRegisterClosedModal(true);
        return;
      }
    }

    if (orderType === 'dine_in' && !selectedTable) {
      if (Platform.OS === 'web') {
        setPosStep('select_table');
      } else {
        Alert.alert(
          '🪑 Table Selection Required',
          'Please select a dining floor table first before adding items to a Dine-In order.',
          [
            { text: 'Select Floor Table', onPress: () => setPosStep('select_table') },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
      return;
    }

    addToCart(item);
    setHasUnsentItems(true);
  };

  const handleQuantityChange = (productId: string, newQty: number) => {
    updateQuantity(productId, newQty);
    setHasUnsentItems(true);
  };

  const handleClearCartAction = () => {
    clearCart();
    setCreatedOrder(null);
    setIsKotDispatched(false);
    setHasUnsentItems(false);
  };

  const handleSendKotAction = async () => {
    console.log('>>> [POS] handleSendKotAction called! createdOrder:', createdOrder?.id, 'cartItems:', cartItems.length, 'orderType:', orderType, 'table:', selectedTable?.table_number);
    try {
      setIsSendingKot(true);
      let ord: Order;

      if (createdOrder && createdOrder.id) {
        // Updating existing active order with diff calculation & supplementary KOT
        ord = await updateActiveOrder(createdOrder.id);
        setCreatedOrder(null);
        setSelectedTable(null);
        setIsKotDispatched(false);
        setHasUnsentItems(false);
        clearCart();
        setPosStep('choose_type');
        setMobileTab('menu');
        showToast('success', 'Order & KOT Dispatched!', `Order #${ord.order_number} updated in kitchen.`);
        router.push({ pathname: '/(admin)/orders', params: { openOrderId: ord.id } } as any);
      } else {
        // Brand new order creation
        ord = await confirmOrder();
        setCreatedOrder(null);
        setSelectedTable(null);
        setIsKotDispatched(false);
        setHasUnsentItems(false);
        clearCart();
        setPosStep('choose_type');
        setMobileTab('menu');
        showToast('success', 'Order & KOT Dispatched!', `Order #${ord.order_number} sent to kitchen.`);
        // Automatically redirect to Orders Feed and open the exact order
        router.push({ pathname: '/(admin)/orders', params: { openOrderId: ord.id } } as any);
      }
      // Refresh table list
      tableService.getTables().then(setTables);
    } catch (e: any) {
      // Distinguish expected register closed validation from unexpected errors
      if (e instanceof RegisterClosedError || e?.code === 'REGISTER_CLOSED' || e?.message?.includes('CLOSED')) {
        setShowRegisterClosedModal(true);
        if (Platform.OS !== 'web') {
          Alert.alert('Register Closed', e.message);
        }
      } else {
        if (Platform.OS === 'web') window.alert(e.message || 'Unable to place order.');
        else Alert.alert('Required Information', e.message || 'Unable to place order.');
      }
    } finally {
      setIsSendingKot(false);
    }
  };

  const handleHoldCurrentOrder = async () => {
    try {
      if (createdOrder && createdOrder.id) {
        await holdOrder(createdOrder.id);
      } else {
        await holdCurrentOrder();
      }
      setCreatedOrder(null);
      setSelectedTable(null);
      setIsKotDispatched(false);
      setHasUnsentItems(false);
      clearCart();
      setPosStep('choose_type');
      setMobileTab('menu');
      router.push('/(admin)/orders' as any);
    } catch (e: any) {
      if (e instanceof RegisterClosedError || e?.code === 'REGISTER_CLOSED' || e?.message?.includes('CLOSED')) {
        setShowRegisterClosedModal(true);
      } else {
        if (Platform.OS === 'web') window.alert(e.message || 'Hold failed.');
        else Alert.alert('Hold Failed', e.message);
      }
    }
  };

  const handlePrintBillAction = async () => {
    if (!createdOrder) {
      if (Platform.OS === 'web') window.alert('Please generate KOT before printing the bill.');
      else Alert.alert('Order Required', 'Please generate KOT before printing the bill.');
      return;
    }
    await printService.printBillThermal(createdOrder, settings);
    showToast('success', 'Print Bill', `Bill printed for #${createdOrder.order_number}`);
  };

  const handleUpdateOrderAction = async () => {
    if (createdOrder && createdOrder.id) {
      try {
        setIsSendingKot(true);
        const updated = await updateOrderPricesOnly(createdOrder.id, 'Price & details updated from POS');
        setCreatedOrder(updated);
        setHasUnsentItems(false);
        if (refreshOrders) {
          await refreshOrders();
        }
        await loadInitialData(true);
      } catch (e: any) {
        if (Platform.OS === 'web') window.alert(e.message || 'Update failed.');
        else Alert.alert('Update Failed', e.message);
      } finally {
        setIsSendingKot(false);
      }
    } else {
      if (!isTablet) setMobileTab('menu');
      showToast('info', 'Update Order', 'Please select an active order to update prices.');
    }
  };

  const handleCloseBillAction = async () => {
    if (!isKotDispatched) {
      const msg = 'Please click "KOT Print" before closing the order and settling payment.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('KOT Required First', msg);
      return;
    }

    try {
      let ord = createdOrder;
      if (!ord && cartItems.length > 0) {
        ord = await confirmOrder();
        setCreatedOrder(ord);
      }
      if (ord) {
        setShowPaymentModal(true);
      }
    } catch (e: any) {
      if (e instanceof RegisterClosedError || e?.code === 'REGISTER_CLOSED' || e?.message?.includes('CLOSED')) {
        setShowRegisterClosedModal(true);
      } else {
        if (Platform.OS === 'web') window.alert(e.message || 'Validation error');
        else Alert.alert('Validation Error', e.message);
      }
    }
  };

  // Group categories into Food and Liquor / Beverages
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

  const numColumns = isWideDesktop ? 5 : isTablet ? 4 : 2;

  // Uniform card width calculation to ensure last row items match previous rows exactly on web
  const cardWidthStyle = useMemo(() => {
    if (Platform.OS === 'web') {
      const gap = 8;
      const calcWidth = `calc(${100 / numColumns}% - ${(gap * (numColumns - 1)) / numColumns}px)`;
      return {
        width: calcWidth as any,
        maxWidth: calcWidth as any,
        minWidth: calcWidth as any,
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: calcWidth as any,
      };
    }
    return {
      maxWidth: `${100 / numColumns}%` as any,
    };
  }, [numColumns]);

  // ============================================================
  // STEP 1: ORDER TYPE FIRST CHOOSER SCREEN
  // ============================================================
  // ============================================================
  // STEP 1: ORDER TYPE FIRST CHOOSER SCREEN
  // ============================================================
  const renderOrderTypeChooser = () => {
    const isDesktop = windowWidth >= 768;

    if (isDesktop) {
      return (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.chooserDesktopScrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.chooserCardBoxDesktop}>
            <View style={styles.chooserHeaderCompactDesktop}>
              <Text style={styles.chooserTitleDesktop}>
                Select Order Type to Begin
              </Text>
              <Text style={styles.chooserInstructionDesktop}>
                Choose whether this order is for Table Dine-In, Counter Takeaway, or Doorstep Delivery.
              </Text>
            </View>

            <View style={styles.orderTypeCardsGridDesktop}>
              {/* 1. DINE IN CARD */}
              <TouchableOpacity
                testID="pos-type-dine-in"
                style={[styles.typeCard, styles.typeCardDineIn, styles.typeCardDesktop]}
                onPress={() => handleSelectOrderType('dine_in')}
                activeOpacity={0.88}
              >
                <View>
                  <View style={styles.typeCardIconCircle}>
                    <Text style={styles.typeCardIcon}>🍽️</Text>
                  </View>
                  <Text style={styles.typeCardTitle}>DINE IN</Text>
                  <Text style={styles.typeCardDesc}>Serve dining guests at restaurant floor tables</Text>
                  <View style={styles.typeCardBadgeRow}>
                    <View style={styles.typeCardBadgeGreen}>
                      <Text style={styles.typeCardBadgeGreenText}>
                        🟢 {tableStats.available} Available
                      </Text>
                    </View>
                    {tableStats.occupied > 0 && (
                      <View style={styles.typeCardBadgeRed}>
                        <Text style={styles.typeCardBadgeRedText}>
                          🔴 {tableStats.occupied} Occupied
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.typeCardActionBtn}>
                  <Text style={styles.typeCardActionBtnText}>Select Table →</Text>
                </View>
              </TouchableOpacity>

              {/* 2. TAKEAWAY CARD */}
              <TouchableOpacity
                testID="pos-type-takeaway"
                style={[styles.typeCard, styles.typeCardTakeaway, styles.typeCardDesktop]}
                onPress={() => handleSelectOrderType('takeaway')}
                activeOpacity={0.88}
              >
                <View>
                  <View style={[styles.typeCardIconCircle, { backgroundColor: '#fef3c7' }]}>
                    <Text style={styles.typeCardIcon}>🥡</Text>
                  </View>
                  <Text style={styles.typeCardTitle}>TAKEAWAY</Text>
                  <Text style={styles.typeCardDesc}>Fast counter pickup and takeaway parcel orders</Text>
                  <View style={styles.typeCardBadgeRow}>
                    <View style={styles.typeCardBadgeAmber}>
                      <Text style={styles.typeCardBadgeAmberText}>⚡ Instant Menu & Cart</Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.typeCardActionBtn, { backgroundColor: '#d97706' }]}>
                  <Text style={styles.typeCardActionBtnText}>Open Menu →</Text>
                </View>
              </TouchableOpacity>

              {/* 3. DELIVERY CARD */}
              <TouchableOpacity
                testID="pos-type-delivery"
                style={[styles.typeCard, styles.typeCardDelivery, styles.typeCardDesktop]}
                onPress={() => handleSelectOrderType('delivery')}
                activeOpacity={0.88}
              >
                <View>
                  <View style={[styles.typeCardIconCircle, { backgroundColor: '#e0e7ff' }]}>
                    <Text style={styles.typeCardIcon}>🛵</Text>
                  </View>
                  <Text style={styles.typeCardTitle}>DELIVERY</Text>
                  <Text style={styles.typeCardDesc}>Doorstep delivery with customer address details</Text>
                  <View style={styles.typeCardBadgeRow}>
                    <View style={styles.typeCardBadgeIndigo}>
                      <Text style={styles.typeCardBadgeIndigoText}>📍 Doorstep Delivery</Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.typeCardActionBtn, { backgroundColor: '#4f46e5' }]}>
                  <Text style={styles.typeCardActionBtnText}>Start Delivery →</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Held Orders Quick Resume Bar on Desktop */}
          {heldOrders.length > 0 && (
            <View style={styles.heldOrdersBarDesktop}>
              <View>
                <Text style={styles.heldBarTitle}>⏸️ {heldOrders.length} Order(s) on Hold</Text>
                <Text style={styles.heldBarSub}>Resume a held order to continue billing</Text>
              </View>
              <TouchableOpacity
                style={styles.heldBarBtn}
                onPress={() => setShowHoldModal(true)}
              >
                <Text style={styles.heldBarBtnText}>View Held ({heldOrders.length})</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      );
    }

    // Mobile screen layout: covers full height, no scrolling
    return (
      <View style={[styles.chooserMobileContainer, { paddingBottom: 10 }]}>
        <View style={styles.chooserCardBoxMobile}>
          <View style={styles.chooserHeaderCompactMobile}>
            <Text style={styles.chooserTitleMobile}>
              Select Order Type to Begin
            </Text>
            <Text style={styles.chooserInstructionMobile}>
              Choose whether this order is for Table Dine-In, Counter Takeaway, or Doorstep Delivery.
            </Text>
          </View>

          <View style={styles.orderTypeCardsGridMobile}>
            {/* 1. DINE IN CARD */}
            <TouchableOpacity
              testID="pos-type-dine-in"
              style={[styles.typeCard, styles.typeCardDineIn, styles.typeCardMobile]}
              onPress={() => handleSelectOrderType('dine_in')}
              activeOpacity={0.88}
            >
              <View style={styles.typeCardMobileTop}>
                <View style={styles.typeCardMobileLeft}>
                  <View style={styles.typeCardIconCircleMobile}>
                    <Text style={{ fontSize: 24 }}>🍽️</Text>
                  </View>
                  <View style={styles.typeCardMobileInfo}>
                    <Text style={styles.typeCardTitleMobile}>DINE IN</Text>
                    <Text style={styles.typeCardDescMobile}>Table dining service</Text>
                  </View>
                </View>
                <View style={styles.typeCardBadgeGreen}>
                  <Text style={styles.typeCardBadgeGreenText}>
                    🟢 {tableStats.available} Free
                  </Text>
                </View>
              </View>
              <View style={styles.typeCardActionBtnMobile}>
                <Text style={styles.typeCardActionBtnTextMobile}>Select Table →</Text>
              </View>
            </TouchableOpacity>

            {/* 2. TAKEAWAY CARD */}
            <TouchableOpacity
              testID="pos-type-takeaway"
              style={[styles.typeCard, styles.typeCardTakeaway, styles.typeCardMobile]}
              onPress={() => handleSelectOrderType('takeaway')}
              activeOpacity={0.88}
            >
              <View style={styles.typeCardMobileTop}>
                <View style={styles.typeCardMobileLeft}>
                  <View style={[styles.typeCardIconCircleMobile, { backgroundColor: '#fef3c7' }]}>
                    <Text style={{ fontSize: 24 }}>🥡</Text>
                  </View>
                  <View style={styles.typeCardMobileInfo}>
                    <Text style={styles.typeCardTitleMobile}>TAKEAWAY</Text>
                    <Text style={styles.typeCardDescMobile}>Counter pickup & parcel</Text>
                  </View>
                </View>
                <View style={styles.typeCardBadgeAmber}>
                  <Text style={styles.typeCardBadgeAmberText}>⚡ Instant Cart</Text>
                </View>
              </View>
              <View style={[styles.typeCardActionBtnMobile, { backgroundColor: '#d97706' }]}>
                <Text style={styles.typeCardActionBtnTextMobile}>Open Menu →</Text>
              </View>
            </TouchableOpacity>

            {/* 3. DELIVERY CARD */}
            <TouchableOpacity
              testID="pos-type-delivery"
              style={[styles.typeCard, styles.typeCardDelivery, styles.typeCardMobile]}
              onPress={() => handleSelectOrderType('delivery')}
              activeOpacity={0.88}
            >
              <View style={styles.typeCardMobileTop}>
                <View style={styles.typeCardMobileLeft}>
                  <View style={[styles.typeCardIconCircleMobile, { backgroundColor: '#e0e7ff' }]}>
                    <Text style={{ fontSize: 24 }}>🛵</Text>
                  </View>
                  <View style={styles.typeCardMobileInfo}>
                    <Text style={styles.typeCardTitleMobile}>DELIVERY</Text>
                    <Text style={styles.typeCardDescMobile}>Home delivery orders</Text>
                  </View>
                </View>
                <View style={styles.typeCardBadgeIndigo}>
                  <Text style={styles.typeCardBadgeIndigoText}>📍 Doorstep</Text>
                </View>
              </View>
              <View style={[styles.typeCardActionBtnMobile, { backgroundColor: '#4f46e5' }]}>
                <Text style={styles.typeCardActionBtnTextMobile}>Start Delivery →</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Held Orders Quick Resume Bar on Mobile */}
          {heldOrders.length > 0 && (
            <View style={styles.heldOrdersBarMobile}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heldBarTitleMobile}>⏸️ {heldOrders.length} Order(s) on Hold</Text>
              </View>
              <TouchableOpacity
                style={styles.heldBarBtnMobile}
                onPress={() => setShowHoldModal(true)}
              >
                <Text style={styles.heldBarBtnTextMobile}>Resume ({heldOrders.length})</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ============================================================
  // STEP 2: DINE-IN TABLE SELECTION FLOOR SCREEN
  // ============================================================
  const renderTableSelectionScreen = () => (
    <View style={styles.stepContainer}>
      {/* Top Floor Header - Clean Stacked Mobile & Tablet Layout */}
      <View style={styles.tableScreenHeader}>
        {/* Row 1: Heading */}
        <Text style={styles.tableScreenTitle}>🍽️ Select Dining Table</Text>

        {/* Row 2: Subtitle / Description */}
        <Text style={styles.tableScreenSubtitle}>
          Select a table to start a new order, or view/add items to an occupied table.
        </Text>

        {/* Row 3: Available & Occupied Status Badges */}
        <View style={styles.tableStatsPillRow}>
          <View style={styles.pillAvailable}>
            <Text style={styles.pillAvailableText}>🟢 {tableStats.available} Available</Text>
          </View>
          <View style={styles.pillOccupied}>
            <Text style={styles.pillOccupiedText}>🔴 {tableStats.occupied} Occupied</Text>
          </View>
        </View>

        {/* Row 4: Change Order Type Button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setPosStep('choose_type')}
          activeOpacity={0.8}
        >
          <Text style={styles.backBtnText}>← Change Order Type</Text>
        </TouchableOpacity>
      </View>

      {/* Search and Section Filters with Proper Spacing */}
      <View style={styles.tableFilterBar}>
        {/* Table Search Input */}
        <View style={styles.tableSearchInputWrapper}>
          <TextInput
            style={styles.tableSearchInput}
            placeholder="🔍 Search table number or floor..."
            placeholderTextColor="#64748b"
            value={tableSearchQuery}
            onChangeText={setTableSearchQuery}
          />
        </View>

        {/* Section Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sectionPillsScroll}
        >
          {tableSections.map((sec) => (
            <TouchableOpacity
              key={sec}
              style={[
                styles.sectionPill,
                tableSectionFilter === sec && styles.sectionPillActive,
              ]}
              onPress={() => setTableSectionFilter(sec)}
            >
              <Text
                style={[
                  styles.sectionPillText,
                  tableSectionFilter === sec && styles.sectionPillTextActive,
                ]}
              >
                {sec}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Tables Floor Grid */}
      {tablesLoading ? (
        <View style={styles.tablesLoadingBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.tablesLoadingText}>Loading restaurant tables...</Text>
        </View>
      ) : filteredTables.length === 0 ? (
        <View style={styles.noTablesBox}>
          <Text style={{ fontSize: 32 }}>🪑</Text>
          <Text style={styles.noTablesTitle}>No Tables Found</Text>
          <Text style={styles.noTablesSub}>
            No tables match the current filter "{tableSectionFilter}".
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.tablesGridContent, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.tablesGrid}>
            {filteredTables.map((t) => {
              const activeOrd =
                tableOrderMap.get(t.id) ||
                tableOrderMap.get(t.table_number.toLowerCase().trim());
              const isOccupied = Boolean(activeOrd);

              const responsiveCardStyle =
                Platform.OS === 'web'
                  ? windowWidth >= 960
                    ? styles.tableCardWeb4Col
                    : windowWidth >= 640
                    ? styles.tableCardWeb3Col
                    : styles.tableCardWeb2Col
                  : windowWidth >= 960
                  ? styles.tableCardNative4Col
                  : styles.tableCardNative2Col;

              return (
                <View
                  key={t.id}
                  style={[
                    styles.tableCard,
                    responsiveCardStyle,
                    isOccupied ? styles.tableCardOccupied : styles.tableCardAvailable,
                  ]}
                >
                  {/* Table Card Top */}
                  <View style={styles.tableCardTopRow}>
                    <View style={{ flex: 1, marginRight: 6 }}>
                      <Text style={styles.tableCardNumber} numberOfLines={1}>{t.table_number}</Text>
                      <Text style={styles.tableCardSection} numberOfLines={1}>{t.section}</Text>
                    </View>
                    <View
                      style={[
                        styles.tableStatusBadge,
                        isOccupied ? styles.statusBadgeOccupied : styles.statusBadgeAvailable,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tableStatusBadgeText,
                          isOccupied ? styles.statusTextOccupied : styles.statusTextAvailable,
                        ]}
                        numberOfLines={1}
                      >
                        {isOccupied ? '🔴 OCCUPIED' : '🟢 AVAILABLE'}
                      </Text>
                    </View>
                  </View>

                  {/* Seating Capacity */}
                  <Text style={styles.tableCardCapacity}>🪑 {t.seating_capacity} Seats</Text>

                  {/* Active Order Summary (if occupied) */}
                  {isOccupied && activeOrd ? (
                    <View style={styles.tableActiveOrderBox}>
                      <Text style={styles.tableActiveOrderTitle} numberOfLines={1}>
                        #{activeOrd.order_number}
                      </Text>
                      <Text style={styles.tableActiveOrderVal} numberOfLines={1}>
                        {formatCurrency(activeOrd.payable_amount)} • {activeOrd.items?.length || 0} items • 🕒 {formatOrderDateTime(activeOrd.created_at)}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.tableEmptyBox}>
                      <Text style={styles.tableEmptyBoxText} numberOfLines={1}>Ready for new guests</Text>
                    </View>
                  )}

                  {/* Table Card Action Buttons */}
                  <View style={styles.tableCardActions}>
                    <TouchableOpacity
                      testID={`pos-table-select-${t.table_number.toLowerCase().replace(/\s+/g, '')}`}
                      style={[
                        styles.tableSelectBtn,
                        isOccupied && styles.tableSelectBtnOccupied,
                      ]}
                      onPress={() => handleSelectTableAction(t)}
                    >
                      <Text style={styles.tableSelectBtnText} numberOfLines={1}>
                        {isOccupied ? '➕ Add Items' : '🪑 Select Table'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.tableViewOrderBtn}
                      onPress={() => handleViewCurrentOrderAction(t)}
                    >
                      <Text style={styles.tableViewOrderBtnText} numberOfLines={1}>👁️ View Order</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );

  // ============================================================
  // STEP 3: FOOD MENU CATALOG & CART INTERFACE
  // ============================================================
  const renderCartContent = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.cartItemsScroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.cartHeader}>
          <Text style={styles.cartTitle}>Cart Order ({cartItems.length})</Text>
          {heldOrders.length > 0 && (
            <TouchableOpacity style={styles.heldBtn} onPress={() => setShowHoldModal(true)}>
              <Text style={styles.heldBtnText}>Held ({heldOrders.length})</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Order Type & Table Header */}
        <View style={styles.cartActiveOrderBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cartActiveOrderType}>
              {orderType === 'dine_in'
                ? `🍽️ DINE IN — ${selectedTable ? `${selectedTable.table_number} (${selectedTable.section})` : 'No Table'}`
                : orderType === 'takeaway'
                ? '🥡 TAKEAWAY ORDER'
                : '🛵 HOME DELIVERY ORDER'}
            </Text>
            {createdOrder && (
              <Text style={styles.cartActiveOrderNum}>
                Order #{createdOrder.order_number} ({createdOrder.status.toUpperCase()}) • 🕒 {formatOrderDateTime(createdOrder.created_at)}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.changeTypeBtn}
            onPress={handleChangeOrderTypePrompt}
          >
            <Text style={styles.changeTypeBtnText}>🔄 Change</Text>
          </TouchableOpacity>
        </View>

        {/* Customer Details Input (for Takeaway & Delivery) */}
        {orderType !== 'dine_in' && (
          <View style={styles.customerBox}>
            <TextInput
              style={styles.custInput}
              placeholder="Customer Name *"
              placeholderTextColor="#64748b"
              value={customerInfo.name}
              onChangeText={(v) => setCustomerInfo({ name: v })}
            />
            <TextInput
              style={styles.custInput}
              placeholder={orderType === 'delivery' ? 'Phone Number *' : 'Phone Number (Optional)'}
              placeholderTextColor="#64748b"
              value={customerInfo.phone}
              keyboardType="phone-pad"
              maxLength={13}
              onChangeText={(v) => {
                const cleaned = v.replace(/[^\d+]/g, '');
                setCustomerInfo({ phone: cleaned });
              }}
            />
            {Boolean(customerInfo.phone && !isValidPhoneNumber(customerInfo.phone)) && (
              <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700', marginTop: -2, marginBottom: 2 }}>
                ⚠️ Enter a valid 10-digit mobile number
              </Text>
            )}
            {orderType === 'delivery' && (
              <TextInput
                style={[styles.custInput, { minHeight: 44 }]}
                placeholder="Delivery Address *"
                placeholderTextColor="#64748b"
                value={customerInfo.address || ''}
                onChangeText={(v) => setCustomerInfo({ address: v })}
              />
            )}
          </View>
        )}

        {/* Cart Item Rows */}
        {cartItems.length === 0 ? (
          <View style={styles.emptyCartBox}>
            <Text style={{ fontSize: 28 }}>🛒</Text>
            <Text style={styles.emptyCartText}>Cart is currently empty</Text>
            <Text style={styles.emptyCartSub}>Select items from the dishes menu to add</Text>
          </View>
        ) : (
          cartItems.map((item) => (
            <View key={item.product_id} style={styles.cartRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cartItemName} numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text style={styles.cartItemSub}>
                  {formatCurrency(item.unit_price)} × {item.quantity}
                </Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepBtn}
                  onPress={() => handleQuantityChange(item.product_id, item.quantity - 1)}
                >
                  <Text style={styles.stepBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.stepQty}>{item.quantity}</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, styles.stepBtnAdd]}
                  onPress={() => handleQuantityChange(item.product_id, item.quantity + 1)}
                >
                  <Text style={[styles.stepBtnText, { color: '#ffffff' }]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {/* Discount Section: Amount (₹) & Percentage (%) */}
        {cartItems.length > 0 && (
          <View style={styles.posDiscountCard}>
            <View style={styles.posDiscountHeader}>
              <Text style={styles.posDiscountTitle}>🏷️ Discount</Text>
              {discountValue > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setDiscount('percentage', 0);
                    setDiscountInputValue('');
                  }}
                >
                  <Text style={styles.posDiscountResetText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Type Selector: Percentage (%) vs Amount (₹) */}
            <View style={styles.posDiscountTypeRow}>
              <TouchableOpacity
                style={[
                  styles.posDiscountTypeBtn,
                  discountType === 'percentage' && styles.posDiscountTypeBtnActive,
                ]}
                onPress={() => {
                  setDiscount('percentage', Number(discountInputValue) || 0);
                }}
              >
                <Text
                  style={[
                    styles.posDiscountTypeBtnText,
                    discountType === 'percentage' && styles.posDiscountTypeBtnTextActive,
                  ]}
                >
                  % Percentage
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.posDiscountTypeBtn,
                  discountType === 'fixed' && styles.posDiscountTypeBtnActive,
                ]}
                onPress={() => {
                  setDiscount('fixed', Number(discountInputValue) || 0);
                }}
              >
                <Text
                  style={[
                    styles.posDiscountTypeBtnText,
                    discountType === 'fixed' && styles.posDiscountTypeBtnTextActive,
                  ]}
                >
                  ₹ Amount
                </Text>
              </TouchableOpacity>
            </View>

            {/* Preset Quick Chips */}
            <View style={styles.posDiscountChipsRow}>
              {(discountType === 'percentage'
                ? [5, 10, 15, 20, 25]
                : [20, 50, 100, 200, 500]
              ).map((preset) => {
                const isSelected = discountValue === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.posDiscountChip, isSelected && styles.posDiscountChipActive]}
                    onPress={() => {
                      setDiscountInputValue(String(preset));
                      setDiscount(discountType, preset);
                    }}
                  >
                    <Text
                      style={[
                        styles.posDiscountChipText,
                        isSelected && styles.posDiscountChipTextActive,
                      ]}
                    >
                      {discountType === 'percentage' ? `${preset}%` : `₹${preset}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Input */}
            <View style={styles.posDiscountInputRow}>
              <TextInput
                style={styles.posDiscountInput}
                placeholder={discountType === 'percentage' ? 'Custom % (e.g. 10)' : 'Custom ₹ (e.g. 75)'}
                placeholderTextColor="#64748b"
                keyboardType="numeric"
                value={discountInputValue}
                onChangeText={(text) => {
                  setDiscountInputValue(text);
                  const parsed = parseFloat(text);
                  setDiscount(discountType, isNaN(parsed) || parsed < 0 ? 0 : parsed);
                }}
              />
              {totals.discountAmount > 0 && (
                <View style={styles.posDiscountAppliedBadge}>
                  <Text style={styles.posDiscountAppliedText}>
                    -{formatCurrency(totals.discountAmount)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Coupon Section */}
        {cartItems.length > 0 && (
          <View style={styles.couponSection}>
            <View style={styles.couponInputRow}>
              <TextInput
                style={[styles.custInput, { flex: 1, textTransform: 'uppercase' } as any]}
                placeholder="Coupon Code"
                placeholderTextColor="#64748b"
                value={couponCodeInput}
                onChangeText={setCouponCodeInput}
              />
              <TouchableOpacity
                style={styles.applyCouponBtn}
                onPress={async () => {
                  if (couponCodeInput) {
                    await applyCouponCode(couponCodeInput);
                  }
                }}
              >
                <Text style={styles.applyCouponText}>Apply</Text>
              </TouchableOpacity>
            </View>
            {appliedCoupon && (
              <View style={styles.appliedCouponRow}>
                <Text style={styles.appliedCouponText}>
                  ✓ Applied: {appliedCoupon.code} (-{formatCurrency(totals.couponDiscount)})
                </Text>
                <TouchableOpacity onPress={removeCoupon}>
                  <Text style={{ color: '#e11d48', fontWeight: 'bold', fontSize: 11 }}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Totals & Action Buttons */}
        {cartItems.length > 0 && (
          <View style={styles.cartFooter}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryVal}>{formatCurrency(totals.subtotal)}</Text>
            </View>

            {totals.discountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: '#dc2626', fontWeight: '700' }]}>
                  Discount ({discountType === 'percentage' ? `${discountValue}%` : `₹${discountValue}`})
                </Text>
                <Text style={[styles.summaryVal, { color: '#dc2626', fontWeight: '700' }]}>
                  -{formatCurrency(totals.discountAmount)}
                </Text>
              </View>
            )}

            {totals.couponDiscount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: '#16a34a' }]}>Coupon ({appliedCoupon?.code})</Text>
                <Text style={[styles.summaryVal, { color: '#16a34a' }]}>
                  -{formatCurrency(totals.couponDiscount)}
                </Text>
              </View>
            )}

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxable Amount</Text>
              <Text style={styles.summaryVal}>{formatCurrency(totals.taxableSubtotal)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>CGST (2.5%)</Text>
              <Text style={styles.summaryVal}>{formatCurrency(totals.cgstAmount)}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>SGST (2.5%)</Text>
              <Text style={styles.summaryVal}>{formatCurrency(totals.sgstAmount)}</Text>
            </View>

            {totals.roundOff !== 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Round Off</Text>
                <Text style={styles.summaryVal}>
                  {totals.roundOff > 0 ? `+${formatCurrency(totals.roundOff)}` : formatCurrency(totals.roundOff)}
                </Text>
              </View>
            )}

            <View style={[styles.totalRow, { borderTopWidth: 1, borderColor: '#e2e8f0', paddingTop: 6, marginTop: 4 }]}>
              <Text style={styles.totalLabel}>Grand Total</Text>
              <Text style={styles.totalVal}>{formatCurrency(totals.payableAmount)}</Text>
            </View>

            {/* Primary Action 1: KOT Print Button */}
            <TouchableOpacity
              testID="pos-send-kot-btn"
              style={[
                styles.sendKotMainBtn,
                isKotDispatched && !hasUnsentItems && styles.sendKotBtnDisabled,
                isSendingKot && styles.btnDisabled,
              ]}
              onPress={handleSendKotAction}
              disabled={(isKotDispatched && !hasUnsentItems) || isSendingKot}
            >
              {isSendingKot ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text
                  style={[
                    styles.sendKotMainBtnText,
                    isKotDispatched && !hasUnsentItems && styles.sendKotBtnTextDisabled,
                  ]}
                >
                  {isKotDispatched && !hasUnsentItems
                    ? '✓ KOT Printed'
                    : hasUnsentItems && isKotDispatched
                    ? `🖨️ KOT Print (Updated • ${formatCurrency(totals.payableAmount)})`
                    : `🖨️ KOT Print (${formatCurrency(totals.payableAmount)})`}
                </Text>
              )}
            </TouchableOpacity>

            {/* Operational Action Buttons: Print Bill | Update Order | Hold | Close Order */}
            <View style={styles.opActionGrid}>
              <TouchableOpacity
                testID="pos-print-bill-btn"
                style={[styles.opBtn, styles.opBtnPrintBill, !isKotDispatched && styles.opBtnDisabled]}
                onPress={handlePrintBillAction}
                disabled={!isKotDispatched}
              >
                <Text style={[styles.opBtnText, !isKotDispatched && styles.opBtnTextDisabled]}>
                  📄 Print Bill
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="pos-update-order-btn"
                style={[styles.opBtn, styles.opBtnUpdate, !isKotDispatched && styles.opBtnDisabled]}
                onPress={handleUpdateOrderAction}
                disabled={!isKotDispatched}
              >
                <Text style={[styles.opBtnText, !isKotDispatched && styles.opBtnTextDisabled]}>
                  ✏️ Update Order
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="pos-hold-order-btn"
                style={[styles.opBtn, styles.opBtnHold, !isKotDispatched && styles.opBtnDisabled]}
                onPress={handleHoldCurrentOrder}
                disabled={!isKotDispatched}
              >
                <Text style={[styles.opBtnText, !isKotDispatched && styles.opBtnTextDisabled]}>
                  ⏸️ Hold
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="pos-close-bill-btn"
                style={[styles.opBtn, styles.opBtnClose, !isKotDispatched && styles.opBtnDisabled]}
                onPress={handleCloseBillAction}
                disabled={!isKotDispatched}
              >
                <Text style={[styles.opBtnText, styles.opBtnTextClose, !isKotDispatched && styles.opBtnTextDisabled]}>
                  💳 Close Order
                </Text>
              </TouchableOpacity>
            </View>

            {/* Clear Cart Action */}
            <TouchableOpacity style={styles.clearBtnInline} onPress={handleClearCartAction}>
              <Text style={styles.clearBtnText}>🗑️ Clear Cart</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderCatalogAndCart = () => (
    <View style={styles.catalogMainWrapper}>
      {/* Top Banner indicating Active Order Type & Table */}
      <View style={styles.activeOrderBanner}>
        <View style={styles.activeOrderBannerLeft}>
          <Text style={styles.activeOrderBannerTitle}>
            {orderType === 'dine_in'
              ? `🍽️ DINE IN — ${selectedTable ? `${selectedTable.table_number} (${selectedTable.section})` : 'Select Table'}`
              : orderType === 'takeaway'
              ? '🥡 TAKEAWAY ORDER'
              : '🛵 HOME DELIVERY ORDER'}
          </Text>
          <Text style={styles.activeOrderBannerSub}>
            {orderType === 'dine_in'
              ? 'Dine-In guests order • Table assigned'
              : orderType === 'takeaway'
              ? 'Counter pickup takeaway order'
              : 'Home delivery order'}
          </Text>
        </View>

        <View style={styles.activeOrderBannerActions}>
          {orderType === 'dine_in' && (
            <TouchableOpacity
              style={styles.bannerTableChangeBtn}
              onPress={handleChangeTablePrompt}
            >
              <Text style={styles.bannerTableChangeBtnText}>🪑 Change Table</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.bannerTypeChangeBtn}
            onPress={handleChangeOrderTypePrompt}
          >
            <Text style={styles.bannerTypeChangeBtnText}>🔄 Change Type</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mobile Mode Segmented Switcher (Visible only on mobile) */}
      {!isTablet && (
        <View style={styles.mobileSegmentContainer}>
          <TouchableOpacity
            style={[styles.mobileSegmentBtn, mobileTab === 'menu' && styles.mobileSegmentBtnActive]}
            onPress={() => setMobileTab('menu')}
          >
            <Text
              style={[
                styles.mobileSegmentText,
                mobileTab === 'menu' && styles.mobileSegmentTextActive,
              ]}
            >
              🍽️ Dishes Menu ({filteredProducts.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mobileSegmentBtn, mobileTab === 'cart' && styles.mobileSegmentBtnActive]}
            onPress={() => setMobileTab('cart')}
          >
            <Text
              style={[
                styles.mobileSegmentText,
                mobileTab === 'cart' && styles.mobileSegmentTextActive,
              ]}
            >
              🛒 Cart Order ({cartItems.length}) {cartItems.length > 0 ? `• ${formatCurrency(totals.payableAmount)}` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainLayout}>
        {/* LEFT / MAIN CATALOG SCREEN (Always visible on Tablet, or when mobileTab === 'menu' on Mobile) */}
        {(isTablet || mobileTab === 'menu') && (
          <View style={styles.catalogArea}>
            {/* Search Input */}
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search food item or SKU..."
                placeholderTextColor="#64748b"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* Grouped Categories Horizontal Scroll (FOOD / LIQUOR) */}
            <View style={styles.catScrollWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catScrollContent}
              >
                {/* FOOD Group Header */}
                <View style={styles.groupHeaderFood}>
                  <Text style={styles.groupHeaderFoodText}>🍴 FOOD</Text>
                </View>

                {/* All Dishes Pill */}
                <TouchableOpacity
                  style={[styles.catPill, selectedCatId === null && styles.catPillActive]}
                  onPress={() => setSelectedCatId(null)}
                >
                  <Text style={[styles.catPillText, selectedCatId === null && styles.catPillTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>

                {/* Food Category Pills */}
                {foodCategories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catPill, selectedCatId === c.id && styles.catPillActive]}
                    onPress={() => setSelectedCatId(c.id)}
                  >
                    <Text style={[styles.catPillText, selectedCatId === c.id && styles.catPillTextActive]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}

                {/* LIQUOR / BEVERAGES Group Header */}
                {liquorCategories.length > 0 && (
                  <>
                    <View style={styles.groupHeaderLiquor}>
                      <Text style={styles.groupHeaderLiquorText}>🍷 LIQUOR</Text>
                    </View>

                    {liquorCategories.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.catPill, selectedCatId === c.id && styles.catPillActive]}
                        onPress={() => setSelectedCatId(c.id)}
                      >
                        <Text style={[styles.catPillText, selectedCatId === c.id && styles.catPillTextActive]}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </ScrollView>
            </View>

            {/* Product Cards Grid */}
            <FlatList
              key={`grid-${numColumns}`}
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              numColumns={numColumns}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={{ paddingBottom: 85 }}
              refreshing={refreshing}
              onRefresh={onRefresh}
              renderItem={({ item }) => {
                const inCart = cartItems.find((ci) => ci.product_id === item.id);
                const isVeg = item.food_type === 'veg';
                const isBeverage =
                  item.sku.startsWith('BEV') ||
                  item.sku.startsWith('CSR') ||
                  item.sku.startsWith('KPL') ||
                  item.sku.startsWith('BMS') ||
                  item.name.toLowerCase().includes('wine') ||
                  item.name.toLowerCase().includes('beer') ||
                  item.name.toLowerCase().includes('vodka') ||
                  item.name.toLowerCase().includes('rum') ||
                  item.name.toLowerCase().includes('whisky');

                return (
                  <TouchableOpacity
                    testID={`pos-product-${item.id}`}
                    style={[styles.productCard, cardWidthStyle, inCart && styles.productCardInCart]}
                    onPress={() => handleProductCardPress(item)}
                    activeOpacity={0.8}
                  >
                    {/* Item Image with Fallbacks */}
                    <View style={styles.productImageContainer}>
                      {item.image_url ? (
                        <Image
                          source={{ uri: item.image_url }}
                          style={styles.productImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.productImageFallback, isBeverage && { backgroundColor: '#fef2f2' }]}>
                          <Text style={styles.productImageFallbackEmoji}>
                            {isBeverage ? '🍷' : isVeg ? '🥗' : '🍗'}
                          </Text>
                        </View>
                      )}

                      {/* Food Type Indicator Icon */}
                      <View style={styles.vegBadgeAbsolute}>
                        <View
                          style={[
                            styles.vegDotBorder,
                            { borderColor: isVeg ? '#16a34a' : '#dc2626' },
                          ]}
                        >
                          <View
                            style={[
                              styles.vegDotFill,
                              { backgroundColor: isVeg ? '#16a34a' : '#dc2626' },
                            ]}
                          />
                        </View>
                      </View>

                      {/* In Cart Badge */}
                      {Boolean(inCart) && (
                        <View style={styles.inCartBadge}>
                          <Text style={styles.inCartBadgeText}>{inCart?.quantity} in cart</Text>
                        </View>
                      )}
                    </View>

                    {/* Content Section */}
                    <View style={styles.productInfo}>
                      <Text style={styles.productName} numberOfLines={2}>
                        {item.name}
                      </Text>
                      <Text style={styles.productSku} numberOfLines={1}>
                        SKU: {item.sku}
                      </Text>

                      <View style={styles.productBottomRow}>
                        <Text style={styles.productPrice}>
                          {formatCurrency(item.discounted_price || item.price)}
                        </Text>
                        {inCart && inCart.quantity > 0 ? (
                          <View style={styles.cardStepper}>
                            <TouchableOpacity
                              style={styles.cardStepBtnMinus}
                              onPress={() => handleQuantityChange(item.id, inCart.quantity - 1)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.cardStepBtnMinusText}>−</Text>
                            </TouchableOpacity>

                            <Text style={styles.cardStepQtyText}>{inCart.quantity}</Text>

                            <TouchableOpacity
                              style={styles.cardStepBtnPlus}
                              onPress={() => handleQuantityChange(item.id, inCart.quantity + 1)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.cardStepBtnPlusText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.quickAddBtn}
                            onPress={() => handleProductCardPress(item)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.quickAddBtnText}>+ ADD</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {/* RIGHT CART PANEL (Visible on Tablet/Desktop, or when mobileTab === 'cart' on Mobile) */}
        {(isTablet || mobileTab === 'cart') && (
          <View style={[styles.cartArea, !isTablet && { width: '100%', flex: 1 }]}>
            {renderCartContent()}
          </View>
        )}
      </View>

      {/* Floating Bottom Cart Bar for Mobile */}
      {!isTablet && mobileTab === 'menu' && cartItems.length > 0 && (
        <TouchableOpacity
          style={[styles.floatingCartBar, { bottom: 12 }]}
          onPress={() => setMobileTab('cart')}
          activeOpacity={0.9}
        >
          <View>
            <Text style={styles.floatingCartQty}>
              {cartItems.reduce((sum, i) => sum + i.quantity, 0)} ITEMS IN CART
            </Text>
            <Text style={styles.floatingCartTotal}>{formatCurrency(totals.payableAmount)}</Text>
          </View>
          <View style={styles.floatingCartAction}>
            <Text style={styles.floatingCartActionText}>
              {!isKotDispatched ? 'SEND KOT →' : 'SETTLE PAYMENT →'}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Route through Step 1, 2, or 3 */}
      {posStep === 'choose_type' && renderOrderTypeChooser()}
      {posStep === 'select_table' && renderTableSelectionScreen()}
      {posStep === 'catalog' && renderCatalogAndCart()}

      {/* Modals */}
      <TableSelectorModal
        isOpen={showTableModal}
        onClose={() => setShowTableModal(false)}
        onSelectTable={handleSelectTableAction}
        selectedTableId={selectedTable?.id}
        restaurantId={activeRestaurantId}
      />

      <SplitBillModal
        isOpen={showSplitModal}
        onClose={() => setShowSplitModal(false)}
        grandTotal={totals.payableAmount}
        items={cartItems}
      />

      <HoldOrdersModal
        isOpen={showHoldModal}
        onClose={() => setShowHoldModal(false)}
        heldOrders={heldOrders}
        onResumeOrder={(orderId) => {
          resumeHeldOrder(orderId);
          setPosStep('catalog');
        }}
      />

      {/* View Table Current Order Modal */}
      {viewTableModalData && (
        <Modal visible={Boolean(viewTableModalData)} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.viewOrderModalContent, { maxHeight: Dimensions.get('window').height * 0.85 }]}>
              {/* Header */}
              <View style={styles.viewOrderModalHeader}>
                <View>
                  <Text style={styles.viewOrderModalTitle}>
                    {viewTableModalData.table.table_number} ({viewTableModalData.table.section})
                  </Text>
                  <Text style={styles.viewOrderModalSub}>
                    {viewTableModalData.order
                      ? `Active Order #${viewTableModalData.order.order_number} • 🕒 ${formatOrderDateTime(viewTableModalData.order.created_at)}`
                      : 'No Active Order'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setViewTableModalData(null)}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Body */}
              <ScrollView showsVerticalScrollIndicator={true}>
                {viewTableModalData.order ? (
                  <View>
                    {/* Status badges */}
                    <View style={styles.modalOrderBadgesRow}>
                      <View style={styles.modalStatusPill}>
                        <Text style={styles.modalStatusPillText}>
                          STATUS: {viewTableModalData.order.status.toUpperCase()}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.modalPayPill,
                          viewTableModalData.order.payment_status === 'paid'
                            ? { backgroundColor: '#dcfce7' }
                            : { backgroundColor: '#fee2e2' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalPayPillText,
                            viewTableModalData.order.payment_status === 'paid'
                              ? { color: '#15803d' }
                              : { color: '#b91c1c' },
                          ]}
                        >
                          PAYMENT: {viewTableModalData.order.payment_status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Customer Info */}
                    <View style={styles.modalMetaBox}>
                      <Text style={styles.modalMetaText}>
                        <Text style={{ fontWeight: '800' }}>Customer:</Text>{' '}
                        {viewTableModalData.order.customer_name || 'Dine-In Guest'}
                      </Text>
                      <Text style={styles.modalMetaText}>
                        <Text style={{ fontWeight: '800' }}>Order Date & Time:</Text>{' '}
                        {formatOrderDateTime(viewTableModalData.order.created_at)}
                      </Text>
                    </View>

                    {/* Items List */}
                    <Text style={styles.modalItemsSectionTitle}>Ordered Items</Text>
                    <View style={styles.modalItemsListBox}>
                      {(viewTableModalData.order.items || []).map((itm, idx) => (
                        <View key={itm.id || idx} style={styles.modalItemRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.modalItemName}>{itm.product_name}</Text>
                            {itm.item_notes ? (
                              <Text style={styles.modalItemNotes}>Note: {itm.item_notes}</Text>
                            ) : null}
                          </View>
                          <Text style={styles.modalItemQty}>{itm.quantity}x</Text>
                          <Text style={styles.modalItemTotal}>
                            {formatCurrency(Number(itm.total) || Number((itm as any).total_price) || Number(itm.subtotal) || ((Number(itm.unit_price) || 0) * (Number(itm.quantity) || 1)))}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Order Financials */}
                    <View style={styles.modalTotalsBox}>
                      <View style={styles.modalTotalRow}>
                        <Text style={styles.modalTotalLabel}>Subtotal:</Text>
                        <Text style={styles.modalTotalVal}>
                          {formatCurrency(getOrderSubtotal(viewTableModalData.order))}
                        </Text>
                      </View>
                      {Boolean(viewTableModalData.order.discount_amount) && (
                        <View style={styles.modalTotalRow}>
                          <Text style={[styles.modalTotalLabel, { color: '#16a34a' }]}>Discount:</Text>
                          <Text style={[styles.modalTotalVal, { color: '#16a34a' }]}>
                            -{formatCurrency(viewTableModalData.order.discount_amount)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.modalTotalRow}>
                        <Text style={styles.modalTotalLabel}>CGST + SGST:</Text>
                        <Text style={styles.modalTotalVal}>
                          {formatCurrency(
                            (viewTableModalData.order.cgst_amount || 0) +
                              (viewTableModalData.order.sgst_amount || 0)
                          )}
                        </Text>
                      </View>
                      <View style={[styles.modalTotalRow, styles.modalGrandTotalRow]}>
                        <Text style={styles.modalGrandTotalLabel}>Grand Total:</Text>
                        <Text style={styles.modalGrandTotalVal}>
                          {formatCurrency(viewTableModalData.order.payable_amount)}
                        </Text>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.modalActionsGrid}>
                      <TouchableOpacity
                        style={styles.modalActionAddBtn}
                        onPress={() => {
                          const tbl = viewTableModalData.table;
                          const ord = viewTableModalData.order;
                          setViewTableModalData(null);
                          if (ord && tbl) {
                            handleSelectTableAction(tbl);
                          }
                        }}
                      >
                        <Text style={styles.modalActionAddBtnText}>➕ Add Items to Order</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.modalActionKotBtn}
                        onPress={() => {
                          if (viewTableModalData.order) {
                            printService.printKotThermal(viewTableModalData.order, settings, undefined, true);
                            showToast('success', 'KOT Slip', 'KOT reprint sent to printer.');
                          }
                        }}
                      >
                        <Text style={styles.modalActionKotBtnText}>🖨️ Reprint KOT</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.modalActionBillBtn}
                        onPress={() => {
                          if (viewTableModalData.order) {
                            printService.printBillThermal(viewTableModalData.order, settings);
                            showToast('success', 'Thermal Bill', 'Bill printed.');
                          }
                        }}
                      >
                        <Text style={styles.modalActionBillBtnText}>📄 Print Bill</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.modalActionCloseBtn}
                        onPress={() => {
                          const ord = viewTableModalData.order;
                          setViewTableModalData(null);
                          if (ord) {
                            setCreatedOrder(ord);
                            setShowPaymentModal(true);
                          }
                        }}
                      >
                        <Text style={styles.modalActionCloseBtnText}>💳 Settle Bill & Close</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.modalNoOrderBox}>
                    <Text style={{ fontSize: 36 }}>🪑</Text>
                    <Text style={styles.modalNoOrderTitle}>No Active Order</Text>
                    <Text style={styles.modalNoOrderSub}>
                      Table {viewTableModalData.table.table_number} is currently available for new dining guests.
                    </Text>

                    <TouchableOpacity
                      style={styles.modalStartNewOrderBtn}
                      onPress={() => {
                        const tbl = viewTableModalData.table;
                        setViewTableModalData(null);
                        handleSelectTableAction(tbl);
                      }}
                    >
                      <Text style={styles.modalStartNewOrderBtnText}>
                        🪑 Start New Dine-In Order on {viewTableModalData.table.table_number}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Register Closed Warning & Quick Open Modal */}
      <Modal visible={showRegisterClosedModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.viewOrderModalContent, { maxWidth: 440 }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: '#fee2e2',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 10,
                }}
              >
                <Text style={{ fontSize: 26 }}>🔒</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a', textAlign: 'center' }}>
                Daily Register is Closed
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                The cash drawer register is currently closed. You must open today's register shift before taking Dine-In, Takeaway, or Online Delivery orders.
              </Text>
            </View>

            <View
              style={{
                backgroundColor: '#f8fafc',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: '#334155',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                Opening Cash Float (₹)
              </Text>
              <TextInput
                style={{
                  backgroundColor: '#ffffff',
                  borderWidth: 1.5,
                  borderColor: '#2563eb',
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontSize: 15,
                  fontWeight: '800',
                  color: '#0f172a',
                }}
                value={openingFloatInput}
                onChangeText={setOpeningFloatInput}
                keyboardType="numeric"
                placeholder="e.g. 1000"
                placeholderTextColor="#94a3b8"
              />
              <Text style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                Enter starting physical cash amount in the cash drawer.
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#16a34a',
                  paddingVertical: 12,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                }}
                onPress={handleOpenRegisterFromPos}
                disabled={isOpeningRegisterFromPos}
              >
                {isOpeningRegisterFromPos ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '900' }}>
                    💵 Open Register & Continue
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  backgroundColor: '#f1f5f9',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
                onPress={() => {
                  setShowRegisterClosedModal(false);
                  router.push('/(admin)/dashboard' as any);
                }}
              >
                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '800' }}>
                  📊 Go to Analytics & Day Register
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ paddingVertical: 8, alignItems: 'center' }}
                onPress={() => setShowRegisterClosedModal(false)}
              >
                <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment / Close Bill Settlement Modal */}
      {createdOrder && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          order={createdOrder}
          onProcessPayment={async (method, amt, ref, discountData) => {
            await processPayment(createdOrder.id, method, amt, ref, discountData);
            clearCart();
            setCreatedOrder(null);
            setSelectedTable(null);
            setPosStep('choose_type');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  stepContainer: {
    flex: 1,
  },

  // ============================================================
  // STEP 1: ORDER TYPE CHOOSER STYLES
  // ============================================================
  // Desktop styles
  chooserDesktopScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  chooserCardBoxDesktop: {
    width: '100%',
    maxWidth: 1140,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 4,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    marginVertical: 'auto' as any,
  },
  chooserHeaderCompactDesktop: {
    marginBottom: 20,
    alignItems: 'center',
  },
  chooserTitleDesktop: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
  chooserInstructionDesktop: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  orderTypeCardsGridDesktop: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'stretch',
  },
  typeCardDesktop: {
    flex: 1,
    minHeight: 250,
    maxHeight: 360,
    borderRadius: 18,
    padding: 20,
    justifyContent: 'space-between',
  },
  heldOrdersBarDesktop: {
    width: '100%',
    maxWidth: 1140,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Mobile styles (covers full screen height, evenly distributed, 0 scroll)
  chooserMobileContainer: {
    flex: 1,
    padding: 10,
  },
  chooserCardBoxMobile: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 3,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    justifyContent: 'space-between',
  },
  chooserHeaderCompactMobile: {
    marginBottom: 6,
    alignItems: 'center',
  },
  chooserTitleMobile: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
  chooserInstructionMobile: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2,
  },
  orderTypeCardsGridMobile: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 10,
    marginVertical: 4,
  },
  typeCardMobile: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  typeCardMobileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  typeCardMobileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  typeCardIconCircleMobile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeCardMobileInfo: {
    flex: 1,
  },
  typeCardTitleMobile: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  typeCardDescMobile: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  typeCardActionBtnMobile: {
    backgroundColor: '#16a34a',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  typeCardActionBtnTextMobile: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  heldOrdersBarMobile: {
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heldBarTitleMobile: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400e',
  },
  heldBarBtnMobile: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  heldBarBtnTextMobile: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },

  // Shared type card styles
  typeCard: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  typeCardDineIn: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  typeCardTakeaway: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  typeCardDelivery: {
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  typeCardIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  typeCardIcon: {
    fontSize: 28,
  },
  typeCardTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0f172a',
  },
  typeCardDesc: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
    lineHeight: 18,
  },
  typeCardBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  typeCardBadgeGreen: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeCardBadgeGreenText: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800',
  },
  typeCardBadgeRed: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeCardBadgeRedText: {
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '800',
  },
  typeCardBadgeAmber: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeCardBadgeAmberText: {
    color: '#b45309',
    fontSize: 10,
    fontWeight: '800',
  },
  typeCardBadgeIndigo: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeCardBadgeIndigoText: {
    color: '#4338ca',
    fontSize: 10,
    fontWeight: '800',
  },
  typeCardActionBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  typeCardActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  heldOrdersBar: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heldBarTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  heldBarSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  heldBarBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  heldBarBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },

  // ============================================================
  // STEP 2: DINE-IN TABLE SELECTION STYLES (CLEAN 4-ROW STACKED LAYOUT)
  // ============================================================
  tableScreenHeader: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  tableScreenTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  tableScreenSubtitle: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  tableStatsPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
    marginBottom: 2,
  },
  pillAvailable: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  pillAvailableText: {
    color: '#15803d',
    fontSize: 11,
    fontWeight: '800',
  },
  pillOccupied: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  pillOccupiedText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '800',
  },
  backBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  backBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  tableFilterBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    gap: 10,
  },
  tableSearchInputWrapper: {
    width: '100%',
  },
  tableSearchInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  sectionPillsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  sectionPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionPillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  sectionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  sectionPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  tablesLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  tablesLoadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  noTablesBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  noTablesTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 6,
  },
  noTablesSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  tablesGridContent: {
    padding: 12,
  },
  tablesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 2,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  tableCardWeb4Col: {
    width: 'calc(25% - 9px)' as any,
    flexBasis: 'calc(25% - 9px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  tableCardWeb3Col: {
    width: 'calc(33.333% - 8px)' as any,
    flexBasis: 'calc(33.333% - 8px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  tableCardWeb2Col: {
    width: 'calc(50% - 6px)' as any,
    flexBasis: 'calc(50% - 6px)' as any,
    flexGrow: 0,
    flexShrink: 0,
  },
  tableCardNative4Col: {
    flexBasis: '23.5%',
    maxWidth: '24%',
    flexGrow: 1,
  },
  tableCardNative2Col: {
    flexBasis: '48%',
    maxWidth: '49%',
    flexGrow: 1,
  },
  tableCardAvailable: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  tableCardOccupied: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
  },
  tableCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tableCardNumber: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  tableCardSection: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 1,
  },
  tableStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeAvailable: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeOccupied: {
    backgroundColor: '#fee2e2',
  },
  tableStatusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },
  statusTextAvailable: {
    color: '#15803d',
  },
  statusTextOccupied: {
    color: '#b91c1c',
  },
  tableCardCapacity: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    marginTop: 6,
  },
  tableActiveOrderBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  tableActiveOrderTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#b91c1c',
  },
  tableActiveOrderVal: {
    fontSize: 10,
    color: '#0f172a',
    fontWeight: '700',
    marginTop: 2,
  },
  tableEmptyBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 8,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  tableEmptyBoxText: {
    fontSize: 10,
    color: '#15803d',
    fontWeight: '700',
  },
  tableCardActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  tableSelectBtn: {
    flex: 1.2,
    backgroundColor: '#16a34a',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tableSelectBtnOccupied: {
    backgroundColor: '#2563eb',
  },
  tableSelectBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  tableViewOrderBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tableViewOrderBtnText: {
    color: '#334155',
    fontSize: 10,
    fontWeight: '800',
  },

  // ============================================================
  // STEP 3: CATALOG & CART STYLES
  // ============================================================
  catalogMainWrapper: {
    flex: 1,
  },
  activeOrderBanner: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  activeOrderBannerLeft: {
    flex: 1,
  },
  activeOrderBannerTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  activeOrderBannerSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  activeOrderBannerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  bannerTableChangeBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  bannerTableChangeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  bannerTypeChangeBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  bannerTypeChangeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  mobileSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  mobileSegmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  mobileSegmentBtnActive: {
    backgroundColor: '#2563eb',
  },
  mobileSegmentText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  mobileSegmentTextActive: {
    color: '#ffffff',
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  catalogArea: {
    flex: 1,
    padding: 10,
  },
  searchBar: {
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  catScrollWrapper: {
    marginBottom: 8,
  },
  catScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupHeaderFood: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 2,
  },
  groupHeaderFoodText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  groupHeaderLiquor: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 6,
    marginRight: 2,
  },
  groupHeaderLiquorText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  catPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  catPillActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  catPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  catPillTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  gridRow: {
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  productCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    elevation: 2,
  },
  productCardInCart: {
    borderColor: '#2563eb',
    borderWidth: 1.5,
  },
  productImageContainer: {
    height: 80,
    backgroundColor: '#f1f5f9',
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productImageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  productImageFallbackEmoji: {
    fontSize: 28,
  },
  vegBadgeAbsolute: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#ffffff',
    padding: 2,
    borderRadius: 4,
  },
  vegDotBorder: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vegDotFill: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  inCartBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#2563eb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inCartBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  productInfo: {
    padding: 8,
  },
  productName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
    height: 30,
  },
  productSku: {
    fontSize: 9,
    color: '#64748b',
    marginTop: 1,
  },
  productBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  productPrice: {
    fontSize: 12,
    fontWeight: '900',
    color: '#16a34a',
  },
  quickAddBtn: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  quickAddBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#1d4ed8',
  },
  cardStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    overflow: 'hidden',
  },
  cardStepBtnMinus: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardStepBtnMinusText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1e40af',
  },
  cardStepQtyText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1e40af',
    paddingHorizontal: 6,
    minWidth: 18,
    textAlign: 'center',
  },
  cardStepBtnPlus: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardStepBtnPlusText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  cartArea: {
    width: 340,
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  cartItemsScroll: {
    flex: 1,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cartTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  heldBtn: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heldBtnText: {
    color: '#92400e',
    fontSize: 10,
    fontWeight: '800',
  },
  cartActiveOrderBanner: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartActiveOrderType: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
  },
  cartActiveOrderNum: {
    fontSize: 10,
    color: '#15803d',
    fontWeight: '700',
    marginTop: 1,
  },
  changeTypeBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  changeTypeBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },
  customerBox: {
    gap: 8,
    marginBottom: 10,
  },
  custInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  emptyCartBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyCartText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginTop: 6,
  },
  emptyCartSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  cartItemName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  cartItemSub: {
    fontSize: 10,
    color: '#64748b',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  posDiscountCard: {
    marginVertical: 6,
    padding: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  posDiscountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  posDiscountTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
  },
  posDiscountResetText: {
    fontSize: 10,
    color: '#dc2626',
    fontWeight: '700',
  },
  posDiscountTypeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  posDiscountTypeBtn: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  posDiscountTypeBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  posDiscountTypeBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  posDiscountTypeBtnTextActive: {
    color: '#ffffff',
  },
  posDiscountChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  posDiscountChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  posDiscountChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  posDiscountChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  posDiscountChipTextActive: {
    color: '#2563eb',
  },
  posDiscountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  posDiscountInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  posDiscountAppliedBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  posDiscountAppliedText: {
    color: '#dc2626',
    fontSize: 10,
    fontWeight: '800',
  },
  couponSection: {
    marginVertical: 6,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    paddingTop: 6,
  },
  couponInputRow: {
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
  appliedCouponRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  appliedCouponText: {
    fontSize: 10,
    color: '#16a34a',
    fontWeight: '700',
  },
  cartFooter: {
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    paddingTop: 8,
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  summaryVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  totalVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#16a34a',
  },
  sendKotMainBtn: {
    backgroundColor: '#ea580c',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    elevation: 3,
  },
  sendKotBtnDisabled: {
    backgroundColor: '#e2e8f0',
    elevation: 0,
  },
  sendKotMainBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sendKotBtnTextDisabled: {
    color: '#64748b',
    fontWeight: '700',
  },
  opActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 6,
  },
  opBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  opBtnPrintBill: {
    backgroundColor: '#0284c7',
  },
  opBtnUpdate: {
    backgroundColor: '#f59e0b',
  },
  opBtnHold: {
    backgroundColor: '#64748b',
  },
  opBtnClose: {
    backgroundColor: '#16a34a',
  },
  opBtnDisabled: {
    backgroundColor: '#e2e8f0',
    elevation: 0,
    opacity: 0.6,
  },
  opBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  opBtnTextClose: {
    fontSize: 11,
    fontWeight: '900',
  },
  opBtnTextDisabled: {
    color: '#94a3b8',
    fontWeight: '700',
  },
  clearBtnInline: {
    backgroundColor: '#fff1f2',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecdd3',
    marginTop: 4,
  },
  clearBtnText: {
    color: '#e11d48',
    fontSize: 11,
    fontWeight: '800',
  },
  floatingCartBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 6,
  },
  floatingCartQty: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  floatingCartTotal: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  floatingCartAction: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  floatingCartActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // ============================================================
  // VIEW TABLE CURRENT ORDER MODAL STYLES
  // ============================================================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  viewOrderModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    width: '100%',
    maxWidth: 520,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    elevation: 8,
  },
  viewOrderModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingBottom: 10,
    marginBottom: 10,
  },
  viewOrderModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  viewOrderModalSub: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748b',
  },
  modalOrderBadgesRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  modalStatusPill: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modalStatusPillText: {
    color: '#1d4ed8',
    fontSize: 10,
    fontWeight: '800',
  },
  modalPayPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modalPayPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  modalMetaBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalMetaText: {
    fontSize: 11,
    color: '#334155',
  },
  modalItemsSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 4,
  },
  modalItemsListBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  modalItemName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalItemNotes: {
    fontSize: 9,
    color: '#64748b',
    fontStyle: 'italic',
  },
  modalItemQty: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    width: 35,
    textAlign: 'center',
  },
  modalItemTotal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
    width: 60,
    textAlign: 'right',
  },
  modalTotalsBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  modalTotalLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  modalTotalVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalGrandTotalRow: {
    borderTopWidth: 1,
    borderColor: '#cbd5e1',
    paddingTop: 4,
    marginTop: 4,
  },
  modalGrandTotalLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  modalGrandTotalVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16a34a',
  },
  modalActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  modalActionAddBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalActionAddBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  modalActionKotBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#ea580c',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalActionKotBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  modalActionBillBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalActionBillBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  modalActionCloseBtn: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalActionCloseBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  modalNoOrderBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  modalNoOrderTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 6,
  },
  modalNoOrderSub: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
    maxWidth: 260,
  },
  modalStartNewOrderBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalStartNewOrderBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
});
