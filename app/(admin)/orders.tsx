import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { orderService, resolveOrderSource, clearOrdersCache } from '../../src/services/api/orderService';
import { productService } from '../../src/services/api/productService';
import { tableService } from '../../src/services/api/tableService';
import { kotService, clearKotsCache } from '../../src/services/api/kotService';
import { printService, formatLogoDataUri } from '../../src/services/printService';
import { Order, OrderItem, OrderStatus, PaymentStatus, OrderSource, Product, DiningTable, RestaurantSettings, PaymentMethod } from '../../src/types';
import { formatCurrency, numberToWords } from '../../src/utils/currency';
import { getOrderSubtotal, calculateOrderTotals } from '../../src/utils/gst';
import { formatOrderDateTime } from '../../src/utils/dateUtils';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { printedKotTracker } from '../../src/utils/printedKotTracker';
import { cleanCustomerOrderNotes } from '../../src/utils/orderNotes';
import { isValidPhoneNumber } from '../../src/utils/phone';
import { validateGSTIN } from '../../src/utils/validators';
import { supabase, isSupabaseConfigured } from '../../src/services/supabase';
import { useNotification } from '../../src/context/NotificationContext';
import { useNewOrderTracker } from '../../src/hooks/useNewOrderTracker';

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openOrderId } = useLocalSearchParams<{ openOrderId?: string }>();
  const { user, activeRestaurantId, activeRestaurant } = useAuth();
  const { settings } = useSettings();
  const { showToast, playOrderBell } = useNotification();
  const [orders, setOrders] = useState<Order[]>([]);
  const [allTenantOrders, setAllTenantOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);

  // Track new/unread incoming orders for Online Marketplace and QR Digital Menu
  const { seenOrderIds, newCounts, isOrderNew, markAsSeen, markMultipleAsSeen } = useNewOrderTracker(
    activeRestaurantId,
    allTenantOrders.length > 0 ? allTenantOrders : orders
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [categoryTab, setCategoryTab] = useState<'pos' | 'online' | 'qr'>('pos');
  const [tabFilter, setTabFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('active');

  // Modals state
  const [viewOrderModal, setViewOrderModal] = useState<Order | null>(null);
  const [editOrderModal, setEditOrderModal] = useState<Order | null>(null);
  const [cancelOrderModal, setCancelOrderModal] = useState<Order | null>(null);
  const [payOrderModal, setPayOrderModal] = useState<Order | null>(null);

  // Edit Order Form state
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [editCustomerName, setEditCustomerName] = useState<string>('');
  const [editCustomerPhone, setEditCustomerPhone] = useState<string>('');
  const [editDeliveryAddress, setEditDeliveryAddress] = useState<string>('');
  const [editTableId, setEditTableId] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editDiscountType, setEditDiscountType] = useState<'none' | 'fixed' | 'percentage'>('none');
  const [editDiscountValue, setEditDiscountValue] = useState<string>('0');
  const [editReason, setEditReason] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [prodSearch, setProdSearch] = useState<string>('');

  // Cancel Form state
  const [cancelReasonPreset, setCancelReasonPreset] = useState<string>('Customer changed mind');
  const [cancelCustomReason, setCancelCustomReason] = useState<string>('');
  const [cancellingOrder, setCancellingOrder] = useState<boolean>(false);

  // Pay / Close Form state
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payReceived, setPayReceived] = useState<boolean>(true);
  const [payTxnRef, setPayTxnRef] = useState<string>('');
  const [payCustomerGstin, setPayCustomerGstin] = useState<string>('');
  const [payDiscountType, setPayDiscountType] = useState<'none' | 'fixed' | 'percentage'>('none');
  const [payDiscountValue, setPayDiscountValue] = useState<string>('');
  const [closingOrder, setClosingOrder] = useState<boolean>(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTwoColumn = (Platform.OS === 'web' && windowWidth >= 600) || windowWidth >= 768;

  const cardWidth = useMemo(() => {
    if (!isTwoColumn) return '100%';
    if (Platform.OS === 'web') return 'calc(50% - 7px)' as any;
    return Math.floor((windowWidth - 28 - 14) / 2);
  }, [isTwoColumn, windowWidth]);

  const [ordersPage, setOrdersPage] = useState<number>(1);
  const [hasMoreOrders, setHasMoreOrders] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Debounce search query so server-side search runs smoothly
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  const loadData = useCallback(
    async (isRefresh: boolean = false) => {
      if (!activeRestaurantId) return;
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        clearOrdersCache(activeRestaurantId);

        const [ordersRes, prodList, tableList, fullTenantOrders] = await Promise.all([
          orderService.getOrdersPaginated({
            restaurantId: activeRestaurantId,
            page: 1,
            pageSize: 15,
            orderCategory: categoryTab,
            statusGroup: tabFilter,
            search: debouncedSearch.trim() || undefined,
          }),
          productService.getProducts(activeRestaurantId),
          tableService.getTables(activeRestaurantId),
          orderService.getOrders(activeRestaurantId, isRefresh),
        ]);

        setOrders(ordersRes.orders);
        setAllTenantOrders(fullTenantOrders || []);
        setOrdersPage(1);
        setHasMoreOrders(ordersRes.hasMore);
        setProducts(prodList);
        setTables(tableList);
      } catch (err: any) {
        console.warn('Failed to load orders data:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeRestaurantId, categoryTab, tabFilter, debouncedSearch]
  );

  const loadMoreOrders = async () => {
    if (!activeRestaurantId || loadingMore || !hasMoreOrders) return;
    try {
      setLoadingMore(true);
      const nextPage = ordersPage + 1;
      const res = await orderService.getOrdersPaginated({
        restaurantId: activeRestaurantId,
        page: nextPage,
        pageSize: 15,
        orderCategory: categoryTab,
        statusGroup: tabFilter,
        search: debouncedSearch.trim() || undefined,
      });

      setOrders((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        const newOnes = res.orders.filter((o) => !existingIds.has(o.id));
        return [...prev, ...newOnes];
      });
      setOrdersPage(nextPage);
      setHasMoreOrders(res.hasMore);
    } catch (e) {
      console.warn('Failed to load more orders:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData(true);
    }, [loadData])
  );

  // Realtime subscription for incoming orders and status updates
  useEffect(() => {
    if (!isSupabaseConfigured || !activeRestaurantId) return;

    const chName = `admin_orders_realtime_${activeRestaurantId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const channel = supabase
      .channel(chName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${activeRestaurantId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOrd = payload.new as Order;
            const src = resolveOrderSource(newOrd);
            if (src === 'CUSTOMER_APP') {
              showToast('info', '🌐 New Online Order!', `Order #${newOrd.order_number || ''} received from marketplace.`);
              playOrderBell();
            } else if (src === 'CUSTOMER_QR') {
              showToast('info', '📱 New QR Order!', `Order #${newOrd.order_number || ''} received from table QR.`);
              playOrderBell();
            }
          }
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRestaurantId, loadData, showToast, playOrderBell]);

  // Auto-navigate to the correct tab/filter when redirected from KOT dispatch
  const handledOpenOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (openOrderId && orders.length > 0 && handledOpenOrderIdRef.current !== openOrderId) {
      handledOpenOrderIdRef.current = openOrderId;
      const targetOrder = orders.find((o) => o.id === openOrderId);
      if (targetOrder) {
        if (isPosOrder(targetOrder)) {
          setCategoryTab('pos');
        } else if (isOnlineDeliveryOrder(targetOrder)) {
          setCategoryTab('online');
        } else if (isQrDigitalMenuOrder(targetOrder)) {
          setCategoryTab('qr');
        }
        setTabFilter('active');
      }
    }
  }, [openOrderId, orders]);

  // Categorized order partitions helper for display badges
  const isOnlineDeliveryOrder = (o: Order): boolean => {
    return resolveOrderSource(o) === 'CUSTOMER_APP';
  };

  const isQrDigitalMenuOrder = (o: Order): boolean => {
    return resolveOrderSource(o) === 'CUSTOMER_QR';
  };

  const isPosOrder = (o: Order): boolean => {
    return resolveOrderSource(o) === 'POS';
  };

  const isDispatchedDeliveryOrder = (ord: Order | null | undefined): boolean => {
    if (!ord) return false;
    const isDeliveryOrOnline =
      resolveOrderSource(ord) === 'CUSTOMER_APP' ||
      ord.order_type === 'delivery' ||
      Boolean(ord.delivery_address && ord.delivery_address.trim());
    const isDispatched =
      ord.status === 'out_for_delivery' ||
      ord.status === 'delivered' ||
      ord.status === 'completed';
    return isDeliveryOrOnline && isDispatched;
  };

  const isKotButtonDisabled = (ord: Order): boolean => {
    const kots = ord.kots || [];
    const hasKotRecords = kots.length > 0;
    const hasKotStatus = ['kot_generated', 'preparing', 'ready', 'out_for_delivery', 'served', 'completed', 'delivered'].includes(ord.status);

    const totalOrderedQty = (ord.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const totalKotQty = kots.reduce((sum, kot) => {
      return sum + (kot.items || []).reduce((kSum, ki) => kSum + (Number(ki.quantity) || 0), 0);
    }, 0);

    // 1. If we have actual KOT records:
    if (hasKotRecords) {
      // If new items were added (total ordered items > total KOT covered items) -> KOT button must be ENABLED
      if (totalOrderedQty > totalKotQty) {
        return false;
      }
      // If all items are covered by KOTs -> KOT button is DISABLED
      return true;
    }

    // 2. If no KOT records in array, but status is already kot_generated or higher -> DISABLED
    if (hasKotStatus) {
      return true;
    }

    // 3. Otherwise (new order with unprinted items, pending, confirmed) -> ENABLED
    return false;
  };

  const isFinalStatus = useCallback(
    (st?: string) => ['completed', 'delivered', 'cancelled', 'settled'].includes(st || ''),
    []
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Status group filtering
      if (tabFilter === 'active') {
        if (isFinalStatus(o.status)) return false;
      } else if (tabFilter === 'completed') {
        if (!['completed', 'delivered', 'settled'].includes(o.status || '')) return false;
      } else if (tabFilter === 'cancelled') {
        if (o.status !== 'cancelled') return false;
      }

      // 2. Category filtering
      if (categoryTab === 'online') {
        if (!isOnlineDeliveryOrder(o)) return false;
      } else if (categoryTab === 'qr') {
        if (!isQrDigitalMenuOrder(o)) return false;
      } else if (categoryTab === 'pos') {
        if (!isPosOrder(o)) return false;
      }

      return true;
    });
  }, [orders, tabFilter, categoryTab, isFinalStatus]);

  // Open Edit Modal
  const openEditModal = (ord: Order) => {
    markAsSeen(ord.id);
    if (isDispatchedDeliveryOrder(ord)) {
      Alert.alert(
        'Modification Locked',
        'This delivery/online order has already been dispatched. Adding or modifying items is not allowed from the admin panel.'
      );
      return;
    }
    setEditOrderModal(ord);
    setEditItems(
      (ord.items || []).map((i) => {
        const qty = Number(i.quantity) || 1;
        const unitPrice = Number(i.unit_price) || (Number(i.total) && qty ? Number(i.total) / qty : 0);
        const subtotal = qty * unitPrice;
        return {
          ...i,
          quantity: qty,
          unit_price: unitPrice,
          subtotal,
          total: subtotal,
        };
      })
    );
    setEditCustomerName(ord.customer_name || '');
    setEditCustomerPhone(ord.customer_phone || '');
    setEditDeliveryAddress(ord.delivery_address || '');
    setEditTableId(ord.table_id || '');
    setEditNotes(cleanCustomerOrderNotes(ord.notes));
    const resolvedDiscType = ord.discount_type || (ord.discount_amount > 0 ? 'fixed' : 'none');
    setEditDiscountType(resolvedDiscType);
    setEditDiscountValue(
      ord.discount_value !== undefined
        ? String(ord.discount_value)
        : ord.discount_amount > 0
        ? String(ord.discount_amount)
        : '0'
    );
    setEditReason('Item adjustment / guest request');
    setProdSearch('');
  };

  // Add Product to Edit list
  const handleAddProductToEdit = (prod: Product) => {
    if (isDispatchedDeliveryOrder(editOrderModal)) {
      Alert.alert(
        'Adding Items Locked',
        'Items cannot be added to a dispatched delivery or online order.'
      );
      return;
    }
    const existingIdx = editItems.findIndex((i) => i.product_id === prod.id);
    const prodPrice = Number(prod.price) || 0;
    if (existingIdx !== -1) {
      const updated = [...editItems];
      const newQty = (Number(updated[existingIdx].quantity) || 0) + 1;
      const unitPrice = Number(updated[existingIdx].unit_price) || prodPrice;
      const subtotal = newQty * unitPrice;
      updated[existingIdx] = {
        ...updated[existingIdx],
        quantity: newQty,
        unit_price: unitPrice,
        subtotal,
        total: subtotal,
      };
      setEditItems(updated);
    } else {
      const newItem: OrderItem = {
        id: 'item-' + Date.now() + Math.random().toString(36).substr(2, 4),
        order_id: editOrderModal?.id || '',
        product_id: prod.id,
        product_name: prod.name,
        unit_price: prodPrice,
        quantity: 1,
        tax_rate: Number(prod.tax_rate) || 5,
        tax_amount: (prodPrice * (Number(prod.tax_rate) || 5)) / 100,
        subtotal: prodPrice,
        total: prodPrice,
      };
      setEditItems([...editItems, newItem]);
    }
  };

  // Adjust item quantity in Edit modal
  const handleAdjustEditQty = (productId: string, newQty: number) => {
    if (isDispatchedDeliveryOrder(editOrderModal)) {
      const origItem = editOrderModal?.items?.find((i) => i.product_id === productId);
      const origQty = origItem ? Number(origItem.quantity) || 0 : 0;
      if (newQty > origQty) {
        Alert.alert(
          'Action Not Allowed',
          'Cannot increase item quantities on a dispatched delivery or online order.'
        );
        return;
      }
    }
    if (newQty <= 0) {
      setEditItems(editItems.filter((i) => i.product_id !== productId));
    } else {
      setEditItems(
        editItems.map((i) => {
          if (i.product_id === productId) {
            const unitPrice = Number(i.unit_price) || 0;
            const subtotal = newQty * unitPrice;
            return {
              ...i,
              quantity: newQty,
              unit_price: unitPrice,
              subtotal,
              total: subtotal,
            };
          }
          return i;
        })
      );
    }
  };

  // Live recalculated totals for Edit Modal
  const editTotals = useMemo(() => {
    if (!editOrderModal) return null;
    const numDisc = parseFloat(editDiscountValue) || 0;
    const currentSubtotal = editItems.reduce(
      (sum, item) => sum + (Number(item.unit_price) * Number(item.quantity)),
      0
    );

    const validatedEditDiscount =
      editDiscountType === 'percentage'
        ? Math.min(Math.max(0, numDisc), 100)
        : editDiscountType === 'fixed'
        ? Math.min(Math.max(0, numDisc), currentSubtotal)
        : 0;

    let recalculatedCouponDiscount = editOrderModal.coupon_discount || 0;
    if (editOrderModal.coupon_code && editOrderModal.coupon_discount) {
      recalculatedCouponDiscount = Math.min(editOrderModal.coupon_discount, currentSubtotal);
    }

    const isGstEnabled = settings?.is_gst_enabled ?? (settings?.gst_registered ?? Boolean(settings?.gstin?.trim()));
    const taxRate = settings?.default_tax_rate !== undefined ? settings.default_tax_rate : 5.0;

    return calculateOrderTotals({
      items: editItems,
      discountType: editDiscountType === 'none' ? undefined : editDiscountType,
      discountValue: validatedEditDiscount,
      couponDiscount: recalculatedCouponDiscount,
      deliveryCharge: editOrderModal.delivery_charge || 0,
      isGstEnabled,
      taxRate,
    });
  }, [editOrderModal, editItems, editDiscountType, editDiscountValue, settings]);

  // Save Edit Order
  const handleSaveEditOrder = async () => {
    if (!editOrderModal) return;
    if (editItems.length === 0) {
      Alert.alert('Empty Order', 'An order must contain at least one item.');
      return;
    }

    if (isDispatchedDeliveryOrder(editOrderModal)) {
      const oldItemsMap = new Map<string, number>();
      (editOrderModal.items || []).forEach((i) => oldItemsMap.set(i.product_id, Number(i.quantity) || 0));
      const hasAddedItems = editItems.some((i) => {
        const prev = oldItemsMap.get(i.product_id);
        return prev === undefined || (Number(i.quantity) || 0) > prev;
      });
      if (hasAddedItems) {
        Alert.alert(
          'Adding Items Locked',
          'Adding new items or increasing quantities is not permitted for dispatched delivery and online orders.'
        );
        return;
      }
    }

    if (editCustomerPhone.trim()) {
      if (!isValidPhoneNumber(editCustomerPhone)) {
        Alert.alert('Invalid Phone Number', 'Please enter a valid 10-digit mobile number for the customer.');
        return;
      }
    } else if (editOrderModal.order_type === 'delivery') {
      Alert.alert('Phone Required', 'Customer contact phone number is required for delivery orders.');
      return;
    }

    setSavingEdit(true);
    try {
      const selectedTbl = tables.find((t) => t.id === editTableId);
      const numDisc = parseFloat(editDiscountValue) || 0;
      const validatedEditDiscount =
        editDiscountType === 'percentage'
          ? Math.min(Math.max(0, numDisc), 100)
          : editDiscountType === 'fixed'
          ? Math.min(Math.max(0, numDisc), editTotals?.subtotal || 0)
          : 0;

      const updated = await orderService.editActiveOrder({
        orderId: editOrderModal.id,
        updatedItems: editItems,
        customerName: editCustomerName.trim(),
        customerPhone: editCustomerPhone.trim(),
        deliveryAddress: editDeliveryAddress.trim(),
        tableId: editTableId || undefined,
        tableNumber: selectedTbl?.table_number || editOrderModal.table_number,
        notes: editNotes.trim()
          ? (editOrderModal.notes?.includes('[POS]') ? `[POS] ${editNotes.trim()}` : editNotes.trim())
          : (editOrderModal.notes?.includes('[POS]') ? '[POS]' : ''),
        discountType: editDiscountType,
        discountValue: validatedEditDiscount,
        discountAmount: editTotals?.discountAmount ?? 0,
        couponCode: editOrderModal.coupon_code || undefined,
        couponDiscount: editTotals?.couponDiscount ?? editOrderModal.coupon_discount ?? 0,
        reason: editReason.trim() || 'Active order modified from POS',
      });

      if ((updated as any).latest_kot) {
        printService.printKotThermal(updated, settings, (updated as any).latest_kot);
      }

      clearOrdersCache(updated.restaurant_id || activeRestaurantId);
      clearKotsCache(updated.restaurant_id || activeRestaurantId);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));

      Alert.alert(
        'Order Updated',
        `Order #${updated.order_number} has been updated.\nOrder items and bill recalculated successfully.${
          (updated as any).latest_kot ? '\n\n📄 Kitchen KOT ticket for new items generated & printed.' : ''
        }`
      );
      setEditOrderModal(null);
      await loadData(true);
    } catch (err: any) {
      Alert.alert('Update Failed', err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Hold Order
  const handleHoldOrder = async (order: Order) => {
    try {
      await orderService.holdOrder(order.id);
      Alert.alert('Order Placed on Hold', `Order #${order.order_number} is now on hold.\nDining table remains occupied.`);
      await loadData();
    } catch (err: any) {
      Alert.alert('Hold Failed', err.message);
    }
  };

  // Resume Order
  const handleResumeOrder = async (order: Order) => {
    try {
      await orderService.resumeOrder(order.id);
      Alert.alert('Order Resumed', `Order #${order.order_number} is now active.`);
      await loadData();
    } catch (err: any) {
      Alert.alert('Resume Failed', err.message);
    }
  };

  // Toggle Hold inside Edit Modal
  const handleToggleModalHold = async () => {
    if (!editOrderModal) return;
    try {
      if (editOrderModal.status === 'held') {
        const res = await orderService.resumeOrder(editOrderModal.id);
        setEditOrderModal({ ...editOrderModal, status: 'confirmed' });
        Alert.alert('Order Resumed', `Order #${res.order_number} is now active.`);
      } else {
        const res = await orderService.holdOrder(editOrderModal.id);
        setEditOrderModal({ ...editOrderModal, status: 'held' });
        Alert.alert('Order Put on Hold', `Order #${res.order_number} placed on hold.\nTable remains occupied.`);
      }
      await loadData();
    } catch (err: any) {
      Alert.alert('Action Failed', err.message);
    }
  };

  // Cancel Order confirmation
  const handleConfirmCancelOrder = async () => {
    if (!cancelOrderModal) return;
    const finalReason = cancelCustomReason.trim() || cancelReasonPreset;
    if (!finalReason) {
      Alert.alert('Reason Required', 'Please select or enter a cancellation reason.');
      return;
    }

    setCancellingOrder(true);
    try {
      const res = await orderService.cancelActiveOrder(cancelOrderModal.id, finalReason);
      setOrders((prev) => {
        if (tabFilter === 'active') {
          return prev.filter((o) => o.id !== cancelOrderModal.id);
        } else if (tabFilter === 'cancelled') {
          const exists = prev.some((o) => o.id === cancelOrderModal.id);
          return exists ? prev.map((o) => (o.id === cancelOrderModal.id ? res : o)) : [res, ...prev];
        } else if (tabFilter === 'all') {
          return prev.map((o) => (o.id === cancelOrderModal.id ? res : o));
        }
        return prev;
      });
      Alert.alert(
        'Order Cancelled',
        `Order #${cancelOrderModal.order_number} has been cancelled.\nInventory stock restored and table released safely.`
      );
      setCancelOrderModal(null);
      setCancelCustomReason('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Cancellation Failed', err.message);
    } finally {
      setCancellingOrder(false);
    }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(`Are you sure you want to permanently delete Order #${order.order_number} from the database? This cannot be undone.`) : true;
      if (!confirmed) return;
      try {
        setLoading(true);
        setOrders((prev) => prev.filter((o) => o.id !== order.id));
        await orderService.deleteOrder(order.id);
        await loadData();
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to delete order');
      } finally {
        setLoading(false);
      }
      return;
    }

    Alert.alert(
      'Delete Order Permanently',
      `Are you sure you want to completely delete Order #${order.order_number} from the database? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            setOrders((prev) => prev.filter((o) => o.id !== order.id));
            await orderService.deleteOrder(order.id);
            await loadData();
            setLoading(false);
          },
        },
      ]
    );
  };

  const handleClearAllCancelled = async () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to permanently remove all cancelled bookings and orders from the database?') : true;
      if (!confirmed) return;
      try {
        setLoading(true);
        setOrders((prev) => prev.filter((o) => o.status !== 'cancelled'));
        const count = await orderService.deleteCancelledOrders();
        await loadData();
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to clear cancelled orders');
      } finally {
        setLoading(false);
      }
      return;
    }

    Alert.alert(
      'Clear All Cancelled Orders',
      'Are you sure you want to permanently remove all cancelled bookings and orders from the database?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All Cancelled',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            setOrders((prev) => prev.filter((o) => o.status !== 'cancelled'));
            const count = await orderService.deleteCancelledOrders();
            await loadData();
            setLoading(false);
          },
        },
      ]
    );
  };

  const handlePrintOrGenerateKot = async (order: Order) => {
    try {
      const isOnlineDelivery = isOnlineDeliveryOrder(order);
      const isQr = isQrDigitalMenuOrder(order);
      const kots = order.kots || [];
      const hasExistingKot = kots.length > 0;

      // Calculate total item quantity ordered vs total item quantity covered in KOTs
      const totalOrderedQty = (order.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
      const totalKotQty = kots.reduce((sum, kot) => {
        return sum + (kot.items || []).reduce((kSum, ki) => kSum + (Number(ki.quantity) || 0), 0);
      }, 0);

      const hasUnkotdItems = totalOrderedQty > totalKotQty;

      if (!hasExistingKot || hasUnkotdItems) {
        // Calculate unprinted supplementary items if this is an addition to an existing order
        let itemsToGenerate: OrderItem[] | undefined = undefined;
        if (hasExistingKot && hasUnkotdItems) {
          const existingKotItemQuantities = new Map<string, number>();
          for (const kot of kots) {
            for (const ki of kot.items || []) {
              const current = existingKotItemQuantities.get(ki.product_name) || 0;
              existingKotItemQuantities.set(ki.product_name, current + Number(ki.quantity || 0));
            }
          }

          const supplementaryItems: OrderItem[] = [];
          for (const item of order.items || []) {
            const kotCoveredQty = existingKotItemQuantities.get(item.product_name) || 0;
            const unprintedQty = (Number(item.quantity) || 0) - kotCoveredQty;
            if (unprintedQty > 0) {
              supplementaryItems.push({
                ...item,
                quantity: unprintedQty,
              });
            }
          }
          if (supplementaryItems.length > 0) {
            itemsToGenerate = supplementaryItems;
          }
        }

        const kotReason = isOnlineDelivery
          ? 'Online Delivery Kitchen Slip'
          : isQr
          ? (hasExistingKot ? 'QR Digital Menu Supplementary Slip' : 'QR Digital Menu Kitchen Slip')
          : (hasExistingKot ? 'Supplementary Kitchen Slip' : 'Kitchen Slip');

        const newKot = await kotService.generateKot(order, kotReason, itemsToGenerate);
        await printService.printKotThermal(order, settings, newKot, false);
        await printedKotTracker.markKotAsAutoPrinted(newKot.id, newKot.kitchen_notes);
        await orderService.updateOrderStatus(order.id, 'kot_generated');

        // Optimistically update order state immediately so KOT button disables instantly
        setOrders((prev) =>
          prev.map((o) => {
            if (o.id === order.id) {
              const currentKots = o.kots || [];
              return {
                ...o,
                status: 'kot_generated',
                kots: [...currentKots, newKot],
              };
            }
            return o;
          })
        );

        clearOrdersCache(order.restaurant_id || activeRestaurantId);
        clearKotsCache(order.restaurant_id || activeRestaurantId);
        await loadData(true);
        Alert.alert(
          '🖨️ KOT Generated & Printed',
          hasExistingKot
            ? `Supplementary KOT #${newKot.kot_number} generated for new items.`
            : `KOT #${newKot.kot_number} generated for kitchen.`
        );
      } else {
        // Manual reprint of existing KOT - same KOT is printed
        const activeKot = order.kots && order.kots.length > 0 ? order.kots[order.kots.length - 1] : undefined;
        await printService.printKotThermal(order, settings, activeKot, true);
        Alert.alert('🖨️ KOT Reprinted', `Kitchen slip reprinted for Order #${order.order_number}.`);
      }
    } catch (err: any) {
      Alert.alert('KOT Error', err.message || 'Failed to generate KOT.');
    }
  };

  const handleMarkOutForDelivery = async (order: Order) => {
    try {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: 'out_for_delivery' } : o))
      );
      await orderService.updateOrderStatus(order.id, 'out_for_delivery');
      await loadData();
      Alert.alert('🛵 Dispatched', `Order #${order.order_number} is now marked Out for Delivery.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
      await loadData();
    }
  };

  const handleMarkDelivered = async (order: Order) => {
    Alert.alert(
      'Mark Order Delivered',
      `Did you receive payment of ₹${order.payable_amount || order.grand_total} for Order #${order.order_number}?`,
      [
        {
          text: 'Payment Received (Paid & Delivered)',
          onPress: async () => {
            try {
              // Optimistically update local orders
              setOrders((prev) => {
                if (tabFilter === 'active') {
                  return prev.filter((o) => o.id !== order.id);
                } else if (tabFilter === 'completed') {
                  const updated = { ...order, status: 'completed' as OrderStatus, payment_status: 'paid' as PaymentStatus };
                  const exists = prev.some((o) => o.id === order.id);
                  return exists ? prev.map((o) => (o.id === order.id ? updated : o)) : [updated, ...prev];
                } else if (tabFilter === 'all') {
                  return prev.map((o) => (o.id === order.id ? { ...o, status: 'completed' as OrderStatus, payment_status: 'paid' as PaymentStatus } : o));
                }
                return prev;
              });
              await orderService.updateOrderStatus(order.id, 'completed');
              await orderService.updatePaymentStatus(order.id, 'paid');
              await loadData();
              Alert.alert('✅ Completed', `Order #${order.order_number} marked Delivered & Paid.`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
              await loadData();
            }
          },
        },
        {
          text: 'Delivered (Keep Payment UNPAID)',
          onPress: async () => {
            try {
              // Optimistically update local orders
              setOrders((prev) => {
                if (tabFilter === 'active') {
                  return prev.filter((o) => o.id !== order.id);
                } else if (tabFilter === 'completed') {
                  const updated = { ...order, status: 'completed' as OrderStatus };
                  const exists = prev.some((o) => o.id === order.id);
                  return exists ? prev.map((o) => (o.id === order.id ? updated : o)) : [updated, ...prev];
                } else if (tabFilter === 'all') {
                  return prev.map((o) => (o.id === order.id ? { ...o, status: 'completed' as OrderStatus } : o));
                }
                return prev;
              });
              await orderService.updateOrderStatus(order.id, 'completed');
              await loadData();
              Alert.alert('✅ Delivered', `Order #${order.order_number} marked Delivered (Payment Unpaid).`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
              await loadData();
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openPayModal = (order: Order) => {
    markAsSeen(order.id);
    setPayOrderModal(order);
    setPayMethod('cash');
    setPayReceived(true);
    setPayTxnRef('');
    setPayCustomerGstin(order.customer_gstin || '');
    setPayDiscountType(order.discount_type || (order.discount_amount > 0 ? 'fixed' : 'none'));
    setPayDiscountValue(
      order.discount_value !== undefined
        ? String(order.discount_value)
        : order.discount_amount > 0
        ? String(order.discount_amount)
        : ''
    );
  };

  const paySubtotal = payOrderModal ? getOrderSubtotal(payOrderModal) : 0;
  const numPayDiscount = parseFloat(payDiscountValue) || 0;
  const validatedPayDiscount =
    payDiscountType === 'percentage'
      ? Math.min(Math.max(0, numPayDiscount), 100)
      : payDiscountType === 'fixed'
      ? Math.min(Math.max(0, numPayDiscount), paySubtotal)
      : 0;

  const payGstinValidation = useMemo(() => {
    if (!payCustomerGstin.trim()) return { isValid: true, error: null };
    return validateGSTIN(payCustomerGstin);
  }, [payCustomerGstin]);

  const payTotals = useMemo(() => {
    if (!payOrderModal) return null;

    const hasManualDiscount = payDiscountType !== 'none' && validatedPayDiscount > 0;

    // If no manual discount is added, and the order already has persisted payable_amount > 0,
    // read directly from the persisted order fields to ensure 100% fidelity with server order!
    if (!hasManualDiscount && (payOrderModal.payable_amount || 0) > 0) {
      const ordSub = payOrderModal.subtotal || paySubtotal;
      const cpnDisc = payOrderModal.coupon_discount || 0;
      const discAmt = payOrderModal.discount_amount || 0;
      const taxable = Math.max(0, ordSub - cpnDisc - discAmt);
      return {
        subtotal: ordSub,
        discountAmount: discAmt,
        couponDiscount: cpnDisc,
        taxableSubtotal: taxable,
        cgstAmount: payOrderModal.cgst_amount || 0,
        sgstAmount: payOrderModal.sgst_amount || 0,
        igstAmount: payOrderModal.igst_amount || 0,
        totalTax: (payOrderModal.cgst_amount || 0) + (payOrderModal.sgst_amount || 0) + (payOrderModal.igst_amount || 0),
        serviceCharge: payOrderModal.service_charge || 0,
        deliveryCharge: payOrderModal.delivery_charge || 0,
        rawTotal: payOrderModal.grand_total || payOrderModal.payable_amount,
        roundOff: payOrderModal.round_off || 0,
        payableAmount: payOrderModal.payable_amount,
      };
    }

    const isGstEnabled = settings?.is_gst_enabled ?? (settings?.gst_registered ?? Boolean(settings?.gstin?.trim()));
    const taxRate = settings?.default_tax_rate !== undefined ? settings.default_tax_rate : 5.0;

    return calculateOrderTotals({
      items: payOrderModal.items || [],
      subtotal: paySubtotal,
      discountType: payDiscountType === 'none' ? undefined : payDiscountType,
      discountValue: validatedPayDiscount,
      couponDiscount: payOrderModal.coupon_discount || 0,
      deliveryCharge: payOrderModal.delivery_charge || 0,
      isGstEnabled,
      taxRate,
    });
  }, [payOrderModal, payDiscountType, validatedPayDiscount, paySubtotal, settings]);

  // Close & Pay Order confirmation
  const handleConfirmCloseAndPay = async () => {
    if (!payOrderModal) return;

    if (!payGstinValidation.isValid) {
      Alert.alert('Invalid GSTIN', payGstinValidation.error || 'Please enter a valid 15-digit GSTIN.');
      return;
    }

    setClosingOrder(true);
    try {
      const completed = await orderService.closeAndPayOrder({
        orderId: payOrderModal.id,
        paymentMethod: payMethod,
        paymentReceived: payReceived,
        transactionReference: payTxnRef.trim() || undefined,
        discountType: payDiscountType,
        discountValue: validatedPayDiscount,
        discountAmount: payTotals?.discountAmount,
        taxableAmount: payTotals?.taxableSubtotal,
        cgstAmount: payTotals?.cgstAmount,
        sgstAmount: payTotals?.sgstAmount,
        grandTotal: payTotals?.rawTotal,
        roundOff: payTotals?.roundOff,
        payableAmount: payTotals?.payableAmount,
        customer_gstin: payCustomerGstin.trim().toUpperCase() || undefined,
      });

      // Instantly synchronize local orders state without waiting for slow network roundtrip
      setOrders((prev) => {
        if (tabFilter === 'active') {
          return prev.filter((o) => o.id !== completed.id);
        } else if (tabFilter === 'completed') {
          const exists = prev.some((o) => o.id === completed.id);
          return exists ? prev.map((o) => (o.id === completed.id ? completed : o)) : [completed, ...prev];
        } else if (tabFilter === 'all') {
          return prev.map((o) => (o.id === completed.id ? completed : o));
        }
        return prev;
      });

      Alert.alert(
        'Order Settled & Closed',
        `Order #${completed.order_number} marked as ${payReceived ? 'PAID & COMPLETED' : 'UNPAID (DELIVERY COD)'}.\nTable released.`
      );
      setPayOrderModal(null);
      setViewOrderModal(completed);
      await loadData();
    } catch (err: any) {
      Alert.alert('Settlement Failed', err.message);
    } finally {
      setClosingOrder(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.title}>Orders Feed & Operations ({filteredOrders.length})</Text>
            <Text style={styles.subTitle}>Live dining, takeaway, online delivery & customer QR orders</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshHeaderBtn}
            onPress={() => onRefresh()}
            disabled={refreshing || loading}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text style={styles.refreshHeaderBtnText}>🔄 Refresh</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 3 Main Order Source Tabs */}
        <View style={styles.categoryTabRow}>
          <TouchableOpacity
            style={[styles.categoryTabBtn, categoryTab === 'pos' && styles.categoryTabBtnActive]}
            onPress={() => setCategoryTab('pos')}
          >
            <Text style={[styles.categoryTabText, categoryTab === 'pos' && styles.categoryTabTextActive]}>
              🍽️ Dine In & Takeaway
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="orders-tab-online"
            style={[styles.categoryTabBtn, categoryTab === 'online' && styles.categoryTabBtnActive]}
            onPress={() => setCategoryTab('online')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 5 }}>
              <Text style={[styles.categoryTabText, categoryTab === 'online' && styles.categoryTabTextActive]}>
                🌐 Online Orders
              </Text>
              {newCounts.onlineNewCount > 0 && (
                <View style={styles.newBadgePillOnline}>
                  <Text style={styles.newBadgePillText}>
                    {newCounts.onlineNewCount} New
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            testID="orders-tab-qr"
            style={[styles.categoryTabBtn, categoryTab === 'qr' && styles.categoryTabBtnActive]}
            onPress={() => setCategoryTab('qr')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 5 }}>
              <Text style={[styles.categoryTabText, categoryTab === 'qr' && styles.categoryTabTextActive]}>
                📱 QR Orders
              </Text>
              {newCounts.qrNewCount > 0 && (
                <View style={styles.newBadgePillQr}>
                  <Text style={styles.newBadgePillText}>
                    {newCounts.qrNewCount} New
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TextInput
          style={styles.search}
          placeholder="Search all orders by Order #, Customer, Phone, Table..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />

        {/* Status Sub-filter Pills */}
        <View style={styles.tabRow}>
          {[
            { id: 'active', label: '🔥 Active' },
            { id: 'completed', label: '✓ Completed' },
            { id: 'cancelled', label: '✕ Cancelled' },
            { id: 'all', label: 'All Orders' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabBtn, tabFilter === tab.id && styles.tabBtnActive]}
              onPress={() => setTabFilter(tab.id as any)}
            >
              <Text style={[styles.tabText, tabFilter === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Orders List */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Fetching live orders from Supabase...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.centerLoading, { flexGrow: 1 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2563eb']}
              tintColor="#2563eb"
            />
          }
          alwaysBounceVertical={true}
          showsVerticalScrollIndicator={false}
        >
          <Text style={{ fontSize: 36 }}>📋</Text>
          <Text style={styles.emptyTitle}>No Orders Found</Text>
          <Text style={styles.emptySub}>
            {tabFilter === 'active'
              ? 'No active orders right now. Create an order in the POS terminal!'
              : 'No orders match your current filter.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <TouchableOpacity
              style={styles.refreshEmptyBtn}
              onPress={() => onRefresh()}
              disabled={refreshing || loading}
            >
              <Text style={styles.refreshEmptyBtnText}>🔄 Refresh Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/(admin)/pos')}
            >
              <Text style={styles.emptyBtnText}>Go to POS Terminal</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.list,
            isTwoColumn && styles.listGrid,
            { paddingBottom: 36, flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={true}
          alwaysBounceVertical={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2563eb']}
              tintColor="#2563eb"
            />
          }
        >
          {tabFilter === 'cancelled' && filteredOrders.length > 0 && (
            <View style={{ marginBottom: 12, flexDirection: 'row', justifyContent: 'flex-end', width: '100%' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#fef2f2',
                  borderColor: '#fca5a5',
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
                onPress={handleClearAllCancelled}
              >
                <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 13 }}>
                  🗑️ Clear All Cancelled Orders from Database
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {filteredOrders.map((order) => {
            const isActive = order.status !== 'completed' && order.status !== 'cancelled';
            const isCompleted = order.status === 'completed';
            const isCancelled = order.status === 'cancelled';
            const isPaid = order.payment_status === 'paid';
            const source: OrderSource = resolveOrderSource(order);
            const isCustomerQr = source === 'CUSTOMER_QR';
            const isCustomerApp = source === 'CUSTOMER_APP';
            const isNew = isOrderNew(order);
            const createdTime = formatOrderDateTime(order.created_at);

            // Real table resolution with section
            const linkedTable = tables.find((t) => t.id === order.table_id || t.table_number === order.table_number);
            const tableDisplayName = linkedTable
              ? (linkedTable.section ? `${linkedTable.table_number} (${linkedTable.section})` : linkedTable.table_number)
              : order.table_number || '';
              
            const formatTableLabel = (rawName?: string): string => {
              if (!rawName) return '';
              const trimmed = rawName.trim();
              if (/^table\b/i.test(trimmed)) return trimmed;
              return `Table ${trimmed}`;
            };

            // Unified Single Type badge label & style
            let typeBadgeLabel = '🍽️ DINE IN';
            let typeBadgeStyle: any = styles.posSource;
            let typeBadgeTextStyle: any = { color: '#334155' };

            if (isCustomerQr) {
              typeBadgeLabel = `📱 QR • ${formatTableLabel(tableDisplayName || order.table_number || '1')}`;
              typeBadgeStyle = styles.qrSource;
              typeBadgeTextStyle = { color: '#6d28d9' };
            } else if (isCustomerApp || order.order_type === 'delivery') {
              typeBadgeLabel = '🛵 ONLINE DELIVERY';
              typeBadgeStyle = styles.onlineSource;
              typeBadgeTextStyle = { color: '#1d4ed8' };
            } else if (order.order_type === 'takeaway') {
              typeBadgeLabel = '🥡 TAKEAWAY';
              typeBadgeStyle = styles.takeawaySource;
              typeBadgeTextStyle = { color: '#b45309' };
            } else {
              typeBadgeLabel = `🍽️ DINE IN • ${formatTableLabel(tableDisplayName || order.table_number || '1')}`;
              typeBadgeStyle = styles.posSource;
              typeBadgeTextStyle = { color: '#334155' };
            }

            return (
              <View
                key={order.id}
                style={[
                  styles.card,
                  isTwoColumn && { width: cardWidth },
                  isCancelled && styles.cardCancelled,
                  isCompleted && styles.cardCompleted,
                  isNew && (isCustomerApp ? styles.cardNewOnline : styles.cardNewQr),
                ]}
              >
                {/* Card Header: Order #, Unified Type Badge, NEW badge, Status Badge */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.orderNum}>#{order.order_number}</Text>
                    <View style={[styles.typeBadge, typeBadgeStyle]}>
                      <Text style={[styles.typeBadgeText, typeBadgeTextStyle]}>{typeBadgeLabel}</Text>
                    </View>
                    {isNew && (
                      <View style={styles.newOrderBadge}>
                        <Text style={styles.newOrderBadgeText}>
                          {isCustomerApp ? '🔔 ONLINE' : '🔔 QR'}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isNew && (
                      <TouchableOpacity
                        style={styles.markSeenBtn}
                        onPress={() => markAsSeen(order.id)}
                        testID={`mark-seen-${order.id}`}
                      >
                        <Text style={styles.markSeenBtnText}>✓ Mark Seen</Text>
                      </TouchableOpacity>
                    )}
                    <View
                      style={[
                        styles.statusBadge,
                        order.status === 'held'
                          ? { backgroundColor: '#fef3c7', borderColor: '#fde047' }
                          : order.status === 'out_for_delivery'
                          ? styles.statusOutForDelivery
                          : isCompleted
                          ? styles.statusCompleted
                          : isCancelled
                          ? styles.statusCancelled
                          : styles.statusConfirmed,
                      ]}
                    >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        order.status === 'held'
                          ? { color: '#b45309', fontWeight: '800' }
                          : order.status === 'out_for_delivery'
                          ? { color: '#c2410c' }
                          : isCompleted
                          ? { color: '#475569' }
                          : isCancelled
                          ? { color: '#dc2626' }
                          : { color: '#1d4ed8' },
                      ]}
                    >
                      {order.status === 'held'
                        ? '⏸️ ON HOLD'
                        : order.status === 'out_for_delivery'
                        ? 'OUT FOR DELIVERY'
                        : isCompleted
                        ? 'COMPLETED'
                        : isCancelled
                        ? 'CANCELLED'
                        : 'ACTIVE'}
                    </Text>
                  </View>
                </View>
              </View>

                {/* Customer & Floor Information */}
                <View style={styles.metaRow}>
                  <Text style={styles.custText}>
                    👤 <Text style={{ fontWeight: '800', color: '#0f172a' }}>{order.customer_name || 'Walk-in Guest'}</Text> {order.customer_phone ? `(${order.customer_phone})` : ''}
                  </Text>
                  <Text style={styles.timeText}>🕒 {createdTime}</Text>
                </View>

                {/* Dining table or QR scanned table or Takeaway or Delivery address */}
                {isCustomerQr && tableDisplayName ? (
                  <Text style={styles.tableText}>
                    📱 Scanned Table QR: <Text style={{ fontWeight: '800', color: '#7c3aed' }}>{formatTableLabel(tableDisplayName)}</Text>
                  </Text>
                ) : order.order_type === 'dine_in' && tableDisplayName ? (
                  <Text style={styles.tableText}>
                    🪑 Dining Table: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{formatTableLabel(tableDisplayName)}</Text>
                  </Text>
                ) : order.order_type === 'takeaway' ? (
                  <Text style={styles.tableText}>
                    🥡 Order Type: <Text style={{ fontWeight: '800', color: '#d97706' }}>Counter Takeaway</Text>
                  </Text>
                ) : null}

                {order.delivery_address && (
                  <Text style={styles.addressText} numberOfLines={2}>
                    📍 Delivery Address: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{order.delivery_address}</Text> {order.delivery_landmark ? `(Near: ${order.delivery_landmark})` : ''}
                  </Text>
                )}

                  {/* Items List */}
                  <View style={styles.itemsBox}>
                    <Text style={styles.itemsTitle}>Items ({order.items?.length || 0}):</Text>
                    {(order.items || []).map((i) => (
                      <View key={i.id} style={styles.itemRow}>
                        <Text style={styles.itemQty}>{i.quantity}x</Text>
                        <Text style={styles.itemName} numberOfLines={1}>{i.product_name}</Text>
                        <Text style={styles.itemPrice}>{formatCurrency(i.total)}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Order Notes / Instructions / Source info */}
                  {(() => {
                    const displayNotes = cleanCustomerOrderNotes(order.notes);
                    if (displayNotes) {
                      return (
                        <View style={styles.notesBox}>
                          <Text style={styles.notesText}>📝 {displayNotes}</Text>
                        </View>
                      );
                    }
                    if (isCustomerQr) {
                      return (
                        <View style={[styles.notesBox, { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' }]}>
                          <Text style={[styles.notesText, { color: '#6d28d9' }]}>📱 Placed via Table QR Digital Menu</Text>
                        </View>
                      );
                    }
                    return null;
                  })()}

                  {/* Applied Coupon Banner if any */}
                  {Boolean(order.coupon_code && order.coupon_discount) && (
                    <View style={{ backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#065F46' }}>
                        🏷️ Coupon: {order.coupon_code}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: '900', color: '#059669' }}>
                        -{formatCurrency(order.coupon_discount || 0)}
                      </Text>
                    </View>
                  )}

                  {/* Bill Summary Row */}
                  <View style={styles.summaryRow}>
                    <View>
                      <Text style={styles.payableLabel}>Payable Total:</Text>
                      <Text style={styles.payableVal}>
                        {formatCurrency(
                          order.payable_amount > 0
                            ? order.payable_amount
                            : (order.grand_total > 0
                                ? order.grand_total
                                : (order.items && order.items.length > 0
                                    ? order.items.reduce((sum, item) => sum + (Number(item.total) || (Number(item.unit_price) * Number(item.quantity)) || 0), 0)
                                    : 0))
                        )}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.payStatusBadge,
                        isPaid ? styles.payStatusPaid : styles.payStatusUnpaid,
                      ]}
                    >
                      <Text
                        style={[
                          styles.payStatusText,
                          isPaid ? styles.payStatusTextPaid : styles.payStatusTextUnpaid,
                        ]}
                      >
                        {isPaid ? '✓ PAID' : '⚠️ UNPAID / COD'}
                      </Text>
                    </View>
                  </View>

                  {/* Action Buttons based on order status: 3 up, 3 below */}
                  {/* Action Buttons based on order status: 3 up, 3 below */}
                  <View style={styles.cardActionsGrid}>
                    {isActive && (() => {
                      const isOnlineDelivery = isCustomerApp || order.order_type === 'delivery' || isOnlineDeliveryOrder(order);
                      const isKotDisabled = isKotButtonDisabled(order);
                      const hasKot = isKotDisabled;
                      const isDispatched = order.status === 'out_for_delivery' || ['delivered', 'completed'].includes(order.status);

                      return (
                        <>
                          {/* ROW 1: 3 Buttons (KOT, Dispatch/Delivered/View, Hold/Resume) */}
                          <View style={styles.cardActionRow}>
                            {/* BUTTON 1: KOT Action */}
                            {isKotDisabled ? (
                              <TouchableOpacity
                                testID={`order-reprint-kot-btn-${order.id}`}
                                style={[styles.gridActionBtn, styles.actionKotBg, { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }]}
                                onPress={() => handlePrintOrGenerateKot(order)}
                              >
                                <Text style={[styles.actionBtnTextKot, { color: '#334155' }]}>🖨️ Reprint KOT</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                testID={`order-kot-btn-${order.id}`}
                                style={[styles.gridActionBtn, styles.actionKotBg]}
                                onPress={() => handlePrintOrGenerateKot(order)}
                              >
                                <Text style={styles.actionBtnTextKot}>🖨️ KOT</Text>
                              </TouchableOpacity>
                            )}

                            {/* BUTTON 2: Dispatch / Delivered / View */}
                            {isOnlineDelivery ? (
                              !hasKot ? (
                                <TouchableOpacity
                                  style={[styles.gridActionBtn, styles.actionDisabledBg]}
                                  disabled={true}
                                  onPress={() => Alert.alert('KOT Required', 'Please generate KOT first before dispatching.')}
                                >
                                  <Text style={styles.actionBtnTextMuted}>🛵 Dispatch</Text>
                                </TouchableOpacity>
                              ) : isDispatched ? (
                                <TouchableOpacity
                                  style={[styles.gridActionBtn, styles.actionDisabledBg]}
                                  disabled={true}
                                >
                                  <Text style={styles.actionBtnTextMuted}>✓ Dispatched</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity
                                  testID={`order-dispatch-btn-${order.id}`}
                                  style={[styles.gridActionBtn, styles.actionDispatchBg]}
                                  onPress={() => handleMarkOutForDelivery(order)}
                                >
                                  <Text style={styles.actionBtnTextDispatch}>🛵 Dispatch</Text>
                                </TouchableOpacity>
                              )
                            ) : order.status === 'out_for_delivery' ? (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionDeliveredBg]}
                                onPress={() => handleMarkDelivered(order)}
                              >
                                <Text style={styles.actionBtnTextDelivered}>✅ Delivered</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionViewBg]}
                                onPress={() => {
                                  markAsSeen(order.id);
                                  setViewOrderModal(order);
                                }}
                              >
                                <Text style={styles.actionBtnTextDark}>👁️ View</Text>
                              </TouchableOpacity>
                            )}

                            {/* BUTTON 3: Hold / Resume */}
                            {order.status === 'held' ? (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionResumeBg]}
                                onPress={() => handleResumeOrder(order)}
                              >
                                <Text style={styles.actionBtnTextResume}>▶️ Resume</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionHoldBg]}
                                onPress={() => handleHoldOrder(order)}
                              >
                                <Text style={styles.actionBtnTextHold}>⏸️ Hold</Text>
                              </TouchableOpacity>
                            )}
                          </View>

                          {/* ROW 2: 3 Buttons (Edit, Cancel, Settle) */}
                          <View style={[styles.cardActionRow, { marginTop: 6 }]}>
                            {isDispatchedDeliveryOrder(order) ? (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionDisabledBg]}
                                disabled={true}
                                onPress={() =>
                                  Alert.alert(
                                    'Adding Items Locked',
                                    'This delivery/online order is already dispatched. Adding items is not permitted.'
                                  )
                                }
                              >
                                <Text style={styles.actionBtnTextMuted}>🔒 Edit Locked</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionEditBg]}
                                onPress={() => openEditModal(order)}
                              >
                                <Text style={styles.actionBtnTextBlue}>✏️ Edit</Text>
                              </TouchableOpacity>
                            )}

                            <TouchableOpacity
                              style={[styles.gridActionBtn, styles.actionCancelBg]}
                              onPress={() => setCancelOrderModal(order)}
                            >
                              <Text style={styles.actionBtnTextRed}>❌ Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.gridActionBtn, styles.actionSettleBg]}
                              onPress={() => openPayModal(order)}
                            >
                              <Text style={styles.actionBtnTextGreen}>💳 Settle</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      );
                    })()}

                    {isCompleted && (
                      <View style={styles.cardActionRow}>
                        <TouchableOpacity
                          style={[styles.gridActionBtn, styles.actionViewBg]}
                          onPress={() => {
                            markAsSeen(order.id);
                            setViewOrderModal(order);
                          }}
                        >
                          <Text style={styles.actionBtnTextDark}>👁️ Bill</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.gridActionBtn, styles.actionPrintThermalBg]}
                          onPress={() => printService.printFinalReceiptThermal(order, settings, user?.full_name)}
                        >
                          <Text style={styles.actionBtnTextWhite}>🖨️ Thermal</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.gridActionBtn, styles.actionShareBg]}
                          onPress={() => printService.printTaxInvoiceA4(order, settings)}
                        >
                          <Text style={styles.actionBtnTextWhite}>📄 A4</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isCancelled && (
                      <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                        <TouchableOpacity
                          style={[styles.actionBtnViewFull, { flex: 1 }]}
                          onPress={() => {
                            Alert.alert(
                              `Order #${order.order_number} Cancelled`,
                              `Details:\n${cleanCustomerOrderNotes(order.notes) || 'No cancellation reason specified.'}`
                            );
                          }}
                        >
                          <Text style={styles.actionBtnTextDark}>👁️ Reason</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.actionBtnCancel,
                            { flex: 1, backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
                          ]}
                          onPress={() => handleDeleteOrder(order)}
                        >
                          <Text style={[styles.actionBtnTextRed, { fontWeight: '800' }]}>🗑️ Delete</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

          {/* Load More Orders Button (15 items per batch) */}
          {hasMoreOrders ? (
            <View style={{ width: '100%', paddingVertical: 18, alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: '#0F172A',
                  paddingVertical: 12,
                  paddingHorizontal: 28,
                  borderRadius: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 4,
                  elevation: 2,
                }}
                onPress={loadMoreOrders}
                disabled={loadingMore}
                activeOpacity={0.7}
              >
                {loadingMore ? (
                  <>
                    <ActivityIndicator size="small" color="#0F172A" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                      Loading next 15 orders...
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                    ⬇️ Load More Orders
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : orders.length > 0 ? (
            <View style={{ width: '100%', paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '600' }}>
                ✓ All {orders.length} orders loaded
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* ============================================================ */}
      {/* 1. EDIT ACTIVE ORDER MODAL                                   */}
      {/* ============================================================ */}
      <Modal visible={Boolean(editOrderModal)} transparent animationType="slide">
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
              paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 12,
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              width: '100%',
              maxWidth: 580,
              maxHeight: Platform.OS === 'web' ? windowHeight * 0.9 : Math.min(windowHeight * 0.86, windowHeight - insets.top - insets.bottom - 24),
              flexShrink: 1,
            }}
          >
            <View style={[styles.modalContent, { maxHeight: '100%', display: 'flex' }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Edit Order #{editOrderModal?.order_number}
                  </Text>
                  <Text style={styles.modalSubTitle}>
                    Add/remove items & recalculate bill • 🕒 {formatOrderDateTime(editOrderModal?.created_at)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setEditOrderModal(null)}
                  style={styles.modalCloseBtn}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                {/* Current Items Stepper List */}
                <Text style={styles.fieldSectionHeader}>Ordered Items:</Text>
                {editItems.map((itm) => (
                  <View key={itm.product_id} style={styles.editItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editItemName}>{itm.product_name}</Text>
                      <Text style={styles.editItemRate}>{formatCurrency(itm.unit_price)} each</Text>
                    </View>

                    <View style={styles.stepperBox}>
                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => handleAdjustEditQty(itm.product_id, itm.quantity - 1)}
                      >
                        <Text style={styles.stepperBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperQty}>{itm.quantity}</Text>
                      <TouchableOpacity
                        style={[
                          styles.stepperBtn,
                          isDispatchedDeliveryOrder(editOrderModal) && { opacity: 0.3 }
                        ]}
                        disabled={isDispatchedDeliveryOrder(editOrderModal)}
                        onPress={() => handleAdjustEditQty(itm.product_id, itm.quantity + 1)}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.editItemTotal}>{formatCurrency(itm.total)}</Text>
                  </View>
                ))}

                {/* Search & Add New Products */}
                {isDispatchedDeliveryOrder(editOrderModal) ? (
                  <View style={{ backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 8, padding: 10, marginVertical: 8 }}>
                    <Text style={{ fontSize: 12, color: '#dc2626', fontWeight: '700' }}>
                      🔒 Adding items is disabled because this delivery order is already dispatched.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.fieldSectionHeader}>Add Items to Order:</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Search catalog dishes to add..."
                      placeholderTextColor="#64748b"
                      value={prodSearch}
                      onChangeText={setProdSearch}
                    />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                      {products
                        .filter((p) => !prodSearch || p.name.toLowerCase().includes(prodSearch.toLowerCase()))
                        .slice(0, 8)
                        .map((p) => (
                          <TouchableOpacity
                            key={p.id}
                            style={styles.addProdChip}
                            onPress={() => handleAddProductToEdit(p)}
                          >
                            <Text style={styles.addProdChipText}>+ {p.name} ({formatCurrency(p.price)})</Text>
                          </TouchableOpacity>
                        ))}
                    </ScrollView>
                  </>
                )}

                {/* Table Selector (If Dine In) */}
                {editOrderModal?.order_type === 'dine_in' && (
                  <>
                    <Text style={styles.fieldLabel}>Change Dining Table:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      {tables.map((t) => (
                        <TouchableOpacity
                          key={t.id}
                          style={[
                            styles.tblChip,
                            editTableId === t.id && styles.tblChipActive,
                          ]}
                          onPress={() => setEditTableId(t.id)}
                        >
                          <Text
                            style={[
                              styles.tblChipText,
                              editTableId === t.id && styles.tblChipTextActive,
                            ]}
                          >
                            {t.table_number} ({t.section})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {/* Customer Details */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Customer Name:</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={editCustomerName}
                      onChangeText={setEditCustomerName}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Phone Number:</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={editCustomerPhone}
                      placeholder="e.g. 9876543210"
                      placeholderTextColor="#64748b"
                      keyboardType="phone-pad"
                      maxLength={13}
                      onChangeText={(v) => setEditCustomerPhone(v.replace(/[^\d+]/g, ''))}
                    />
                    {Boolean(editCustomerPhone && !isValidPhoneNumber(editCustomerPhone)) && (
                      <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '700', marginTop: 2 }}>
                        ⚠️ Enter a valid 10-digit mobile number
                      </Text>
                    )}
                  </View>
                </View>

                {/* Delivery Address (If Delivery) */}
                {editOrderModal?.order_type === 'delivery' && (
                  <>
                    <Text style={styles.fieldLabel}>Delivery Address:</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={editDeliveryAddress}
                      onChangeText={setEditDeliveryAddress}
                    />
                  </>
                )}

                {/* Discount */}
                <Text style={styles.fieldLabel}>Discount:</Text>
                <View style={styles.discountTypeRow}>
                  <TouchableOpacity
                    style={[styles.discTypeBtn, editDiscountType === 'none' && styles.discTypeBtnActive]}
                    onPress={() => {
                      setEditDiscountType('none');
                      setEditDiscountValue('0');
                    }}
                  >
                    <Text style={[styles.discTypeText, editDiscountType === 'none' && styles.discTypeTextActive]}>
                      No Discount
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.discTypeBtn, editDiscountType === 'fixed' && styles.discTypeBtnActive]}
                    onPress={() => setEditDiscountType('fixed')}
                  >
                    <Text style={[styles.discTypeText, editDiscountType === 'fixed' && styles.discTypeTextActive]}>
                      ₹ Rupees
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.discTypeBtn, editDiscountType === 'percentage' && styles.discTypeBtnActive]}
                    onPress={() => setEditDiscountType('percentage')}
                  >
                    <Text style={[styles.discTypeText, editDiscountType === 'percentage' && styles.discTypeTextActive]}>
                      % Percentage
                    </Text>
                  </TouchableOpacity>
                </View>

                {editDiscountType !== 'none' && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.fieldLabel, { fontSize: 12, color: '#64748b' }]}>
                      {editDiscountType === 'fixed'
                        ? `Discount Amount in ₹ (Max: ₹${(editTotals?.subtotal || 0).toFixed(2)})`
                        : 'Discount Percentage (0 – 100%)'}
                    </Text>
                    <TextInput
                      style={styles.fieldInput}
                      keyboardType="numeric"
                      placeholder={editDiscountType === 'fixed' ? 'e.g. 50' : 'e.g. 10'}
                      value={editDiscountValue === '0' ? '' : editDiscountValue}
                      onChangeText={(val) => {
                        const clean = val.replace(/[^0-9.]/g, '');
                        if (editDiscountType === 'percentage') {
                          const parsed = parseFloat(clean);
                          if (!isNaN(parsed) && parsed > 100) return;
                        }
                        setEditDiscountValue(clean);
                      }}
                    />
                  </View>
                )}

                {/* Reason for Modification */}
                <Text style={styles.fieldLabel}>Reason for Edit (Audit Log):</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Added 1x Naan, reduced 1x Biryani per guest request"
                  placeholderTextColor="#64748b"
                  value={editReason}
                  onChangeText={setEditReason}
                />

                {/* Order Hold / Resume Control */}
                <View style={{ marginTop: 12, marginBottom: 6 }}>
                  <Text style={styles.fieldLabel}>Hold / Resume Status:</Text>
                  {editOrderModal?.status === 'held' ? (
                    <TouchableOpacity
                      style={[
                        styles.holdActionBtn,
                        { backgroundColor: '#ecfdf5', borderColor: '#10b981', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
                      ]}
                      onPress={handleToggleModalHold}
                    >
                      <Text style={{ color: '#059669', fontWeight: '800', fontSize: 14 }}>
                        ▶️ Resume Order (Order is Currently On Hold)
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.holdActionBtn,
                        { backgroundColor: '#fffbeb', borderColor: '#f59e0b', paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
                      ]}
                      onPress={handleToggleModalHold}
                    >
                      <Text style={{ color: '#d97706', fontWeight: '800', fontSize: 14 }}>
                        ⏸️ Put Order on Hold (Keep Table Occupied)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Live Recalculated Bill Summary */}
                {editTotals && (
                  <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginTop: 12, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>Items Subtotal ({editItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0)} items):</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{formatCurrency(editTotals.subtotal)}</Text>
                    </View>
                    {editTotals.discountAmount > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '600' }}>
                          Discount {editDiscountType === 'percentage' && editDiscountValue ? `(${editDiscountValue}%)` : ''}:
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>-{formatCurrency(editTotals.discountAmount)}</Text>
                      </View>
                    )}
                    {editTotals.couponDiscount > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '600' }}>
                          Coupon Discount {editOrderModal?.coupon_code ? `(${editOrderModal.coupon_code})` : ''}:
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>-{formatCurrency(editTotals.couponDiscount)}</Text>
                      </View>
                    )}
                    {(editTotals.discountAmount > 0 || editTotals.couponDiscount > 0) && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>Taxable Amount:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{formatCurrency(editTotals.taxableSubtotal)}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>CGST (2.5%) + SGST (2.5%):</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{formatCurrency(editTotals.cgstAmount + editTotals.sgstAmount)}</Text>
                    </View>
                    {Boolean(editTotals.deliveryCharge) && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>Delivery Charge:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{formatCurrency(editTotals.deliveryCharge)}</Text>
                      </View>
                    )}
                    <View style={{ borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 6, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a' }}>New Total Payable:</Text>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: '#2563eb' }}>{formatCurrency(editTotals.payableAmount)}</Text>
                    </View>
                  </View>
                )}

                {/* Submit Save Edit Button */}
                <TouchableOpacity
                  style={[styles.saveModalBtn, savingEdit && styles.btnDisabled]}
                  onPress={handleSaveEditOrder}
                  disabled={savingEdit}
                >
                  {savingEdit ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.saveModalBtnText}>
                      SAVE CHANGES & UPDATE ORDER
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 2. CANCEL ORDER MODAL                                        */}
      {/* ============================================================ */}
      <Modal visible={Boolean(cancelOrderModal)} transparent animationType="fade">
        <View style={[styles.modalOverlay, { paddingHorizontal: 20 }]}>
          <View style={styles.cancelModalContent}>
            <Text style={styles.cancelModalTitle}>Cancel Order #{cancelOrderModal?.order_number}</Text>
            <Text style={{ fontSize: 11.5, color: '#64748B', fontWeight: '600', marginBottom: 4 }}>
              🕒 Placed on: {formatOrderDateTime(cancelOrderModal?.created_at)}
            </Text>
            <Text style={styles.cancelModalSub}>
              ⚠️ Order will be marked as cancelled, inventory stock will be restored, and dining table will be released.
            </Text>

            <Text style={styles.fieldLabel}>Select Reason *</Text>
            {[
              'Customer changed mind',
              'Duplicate order',
              'Wrong order / wrong table',
              'Item unavailable',
              'Delivery cancelled by customer',
              'Other reason',
            ].map((preset) => (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.presetBtn,
                  cancelReasonPreset === preset && styles.presetBtnActive,
                ]}
                onPress={() => setCancelReasonPreset(preset)}
              >
                <Text
                  style={[
                    styles.presetBtnText,
                    cancelReasonPreset === preset && styles.presetBtnTextActive,
                  ]}
                >
                  {preset}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.fieldLabel}>Additional Notes (Optional):</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Enter specific cancellation notes..."
              placeholderTextColor="#64748b"
              value={cancelCustomReason}
              onChangeText={setCancelCustomReason}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.modalCloseSmallBtn}
                onPress={() => setCancelOrderModal(null)}
              >
                <Text style={styles.modalCloseSmallText}>Go Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmCancelBtn, cancellingOrder && styles.btnDisabled]}
                onPress={handleConfirmCancelOrder}
                disabled={cancellingOrder}
              >
                {cancellingOrder ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.confirmCancelBtnText}>CONFIRM CANCELLATION</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 3. CLOSE ORDER & PAYMENT SETTLEMENT MODAL                    */}
      {/* ============================================================ */}
      <Modal visible={Boolean(payOrderModal)} transparent animationType="slide">
        <View
          style={[
            styles.modalOverlay,
            {
              paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
              paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 12,
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              width: '100%',
              maxWidth: 580,
              maxHeight: Platform.OS === 'web' ? windowHeight * 0.9 : Math.min(windowHeight * 0.86, windowHeight - insets.top - insets.bottom - 24),
              flexShrink: 1,
            }}
          >
            <View style={[styles.modalContent, { maxHeight: '100%', display: 'flex' }]}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    Close Order & Settle Bill #{payOrderModal?.order_number}
                  </Text>
                  <Text style={styles.modalSubTitle}>
                    {payOrderModal?.order_type.toUpperCase()} • {payOrderModal?.table_number ? `Table ${payOrderModal.table_number}` : payOrderModal?.customer_name} • 🕒 {formatOrderDateTime(payOrderModal?.created_at)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPayOrderModal(null)}
                  style={styles.modalCloseBtn}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                {/* 1. DISCOUNT SELECTION */}
                <View style={styles.sectionBox}>
                  <Text style={styles.sectionLabel}>Apply Bill Discount</Text>
                  <View style={styles.discountTypeRow}>
                    <TouchableOpacity
                      style={[styles.discTypeBtn, payDiscountType === 'none' && styles.discTypeBtnActive]}
                      onPress={() => {
                        setPayDiscountType('none');
                        setPayDiscountValue('');
                      }}
                    >
                      <Text style={[styles.discTypeText, payDiscountType === 'none' && styles.discTypeTextActive]}>
                        No Discount
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.discTypeBtn, payDiscountType === 'fixed' && styles.discTypeBtnActive]}
                      onPress={() => setPayDiscountType('fixed')}
                    >
                      <Text style={[styles.discTypeText, payDiscountType === 'fixed' && styles.discTypeTextActive]}>
                        ₹ Rupees
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.discTypeBtn, payDiscountType === 'percentage' && styles.discTypeBtnActive]}
                      onPress={() => setPayDiscountType('percentage')}
                    >
                      <Text style={[styles.discTypeText, payDiscountType === 'percentage' && styles.discTypeTextActive]}>
                        % Percentage
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {payDiscountType !== 'none' && (
                    <View style={styles.discInputWrapper}>
                      <Text style={styles.discInputLabel}>
                        {payDiscountType === 'fixed'
                          ? `Discount Amount in ₹ (Max: ₹${paySubtotal.toFixed(2)})`
                          : 'Discount Percentage (0 – 100%)'}
                      </Text>
                      <TextInput
                        style={styles.discInput}
                        placeholder={payDiscountType === 'fixed' ? 'e.g. 100' : 'e.g. 10'}
                        placeholderTextColor="#64748b"
                        value={payDiscountValue}
                        onChangeText={(val) => {
                          const clean = val.replace(/[^0-9.]/g, '');
                          if (payDiscountType === 'percentage') {
                            const parsed = parseFloat(clean);
                            if (!isNaN(parsed) && parsed > 100) return;
                          }
                          setPayDiscountValue(clean);
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                  )}
                </View>

                {/* 2. REAL-TIME ITEMIZED BREAKDOWN BOX */}
                <View style={styles.billBreakdownBox}>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Item Subtotal:</Text>
                    <Text style={styles.billVal}>{formatCurrency(payTotals?.subtotal || paySubtotal)}</Text>
                  </View>

                  {(payTotals?.discountAmount || 0) > 0 && (
                    <View style={styles.billRow}>
                      <Text style={[styles.billLabel, { color: '#16a34a', fontWeight: '800' }]}>
                        Discount {payDiscountType === 'percentage' ? `(${validatedPayDiscount}%)` : `(₹${validatedPayDiscount})`}:
                      </Text>
                      <Text style={[styles.billVal, { color: '#16a34a', fontWeight: '900' }]}>
                        -{formatCurrency(payTotals?.discountAmount || 0)}
                      </Text>
                    </View>
                  )}

                  {Boolean(payOrderModal?.coupon_discount) && (
                    <View style={styles.billRow}>
                      <Text style={[styles.billLabel, { color: '#16a34a' }]}>Coupon ({payOrderModal?.coupon_code}):</Text>
                      <Text style={[styles.billVal, { color: '#16a34a' }]}>-{formatCurrency(payOrderModal?.coupon_discount || 0)}</Text>
                    </View>
                  )}

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Taxable Amount:</Text>
                    <Text style={styles.billVal}>{formatCurrency(payTotals?.taxableSubtotal || paySubtotal)}</Text>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>CGST (2.5%):</Text>
                    <Text style={styles.billVal}>{formatCurrency(payTotals?.cgstAmount || 0)}</Text>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>SGST (2.5%):</Text>
                    <Text style={styles.billVal}>{formatCurrency(payTotals?.sgstAmount || 0)}</Text>
                  </View>

                  {Boolean(payTotals?.deliveryCharge) && (
                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>Delivery Charge:</Text>
                      <Text style={styles.billVal}>{formatCurrency(payTotals?.deliveryCharge || 0)}</Text>
                    </View>
                  )}

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Round Off:</Text>
                    <Text style={styles.billVal}>
                      {(payTotals?.roundOff || 0) > 0 ? '+' : ''}{formatCurrency(payTotals?.roundOff || 0)}
                    </Text>
                  </View>

                  <View style={[styles.billRow, styles.billTotalRow]}>
                    <Text style={styles.billTotalLabel}>Payable Grand Total:</Text>
                    <Text style={styles.billTotalVal}>{formatCurrency(payTotals?.payableAmount || 0)}</Text>
                  </View>
                  <Text style={styles.wordsText}>
                    ({numberToWords(payTotals?.payableAmount || 0)})
                  </Text>
                </View>

                {/* Payment Method Selector */}
                <Text style={styles.fieldLabel}>Payment Mode *</Text>
                <View style={styles.payMethodsGrid}>
                  {[
                    { id: 'cash', label: '💵 CASH' },
                    { id: 'upi', label: '📱 UPI / QR' },
                    { id: 'card', label: '💳 CARD' },
                    { id: 'split', label: '✂️ SPLIT' },
                  ].map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.payMethodBtn,
                        payMethod === m.id && styles.payMethodBtnActive,
                      ]}
                      onPress={() => setPayMethod(m.id as any)}
                    >
                      <Text
                        style={[
                          styles.payMethodText,
                          payMethod === m.id && styles.payMethodTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Payment Received Toggle (Yes/No) */}
                <Text style={styles.fieldLabel}>Payment Received? *</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  <TouchableOpacity
                    style={[styles.recBtn, payReceived && styles.recBtnActive]}
                    onPress={() => setPayReceived(true)}
                  >
                    <Text style={[styles.recBtnText, payReceived && styles.recBtnTextActive]}>
                      ✓ YES (Paid in Full)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.recBtn, !payReceived && styles.recBtnUnpaidActive]}
                    onPress={() => setPayReceived(false)}
                  >
                    <Text style={[styles.recBtnText, !payReceived && styles.recBtnTextActive]}>
                      ⚠️ NO (Delivery COD / Unpaid)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Transaction Reference */}
                <Text style={styles.fieldLabel}>Transaction Reference # (Optional):</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. UPI-998811 or Card Auth #4411"
                  placeholderTextColor="#64748b"
                  value={payTxnRef}
                  onChangeText={setPayTxnRef}
                />

                {/* Customer GSTIN for B2B Billing (Optional) */}
                {settings?.is_gst_enabled !== false && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.fieldLabel}>Customer GSTIN (Optional for B2B Invoice):</Text>
                    <TextInput
                      style={[
                        styles.fieldInput,
                        !payGstinValidation.isValid && { borderColor: '#ef4444', borderWidth: 1.5 },
                      ]}
                      placeholder="15-digit GSTIN (e.g. 19AAAAA0000A1Z5)"
                      placeholderTextColor="#64748b"
                      value={payCustomerGstin}
                      onChangeText={(v) => setPayCustomerGstin(v.toUpperCase().trim())}
                      maxLength={15}
                      autoCapitalize="characters"
                    />
                    {!payGstinValidation.isValid && payGstinValidation.error && (
                      <Text style={{ color: '#ef4444', fontSize: 10, marginTop: 3, fontWeight: '700' }}>
                        ⚠️ {payGstinValidation.error}
                      </Text>
                    )}
                  </View>
                )}

                {/* Confirm Close Button */}
                <TouchableOpacity
                  style={[styles.saveModalBtn, (closingOrder || !payGstinValidation.isValid) && styles.btnDisabled]}
                  onPress={handleConfirmCloseAndPay}
                  disabled={closingOrder || !payGstinValidation.isValid}
                >
                  {closingOrder ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.saveModalBtnText}>
                      CONFIRM PAYMENT & GENERATE FINAL BILL
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 4. VIEW FINAL BILL MODAL                                     */}
      {/* ============================================================ */}
      {viewOrderModal && (() => {
        const isTaxInvoice =
          (viewOrderModal.cgst_amount || 0) > 0 ||
          (viewOrderModal.sgst_amount || 0) > 0 ||
          (settings?.is_gst_enabled !== false && settings?.tax_invoice_enabled !== false && Boolean(settings?.gstin?.trim()));
        const invNo = viewOrderModal.invoice_number || viewOrderModal.order_number;
        const dynamicTaxRate = Number(settings?.default_tax_rate) > 0 ? Number(settings.default_tax_rate) : 5.0;
        const halfRate = (dynamicTaxRate / 2).toFixed(1);

        return (
          <Modal visible={Boolean(viewOrderModal)} transparent animationType="slide">
            <View
              style={[
                styles.modalOverlay,
                {
                  paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
                  paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 12,
                },
              ]}
            >
              <View
                style={[
                  styles.modalContent,
                  {
                    maxHeight: Platform.OS === 'web' ? windowHeight * 0.9 : Math.min(windowHeight * 0.86, windowHeight - insets.top - insets.bottom - 24),
                    maxWidth: 580,
                    display: 'flex',
                  },
                ]}
              >
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    {formatLogoDataUri(activeRestaurant?.logo_url || settings.logo_url) ? (
                      <Image
                        source={{ uri: formatLogoDataUri(activeRestaurant?.logo_url || settings.logo_url) }}
                        style={{ width: 44, height: 44, borderRadius: 6 }}
                        resizeMode="contain"
                      />
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalTitle}>
                        {isTaxInvoice ? 'Tax Invoice' : 'Retail Bill'} #{invNo}
                      </Text>
                      <Text style={styles.modalSubTitle}>
                        {activeRestaurant?.name || settings.name}
                        {isTaxInvoice && settings.gstin ? ` • GSTIN: ${settings.gstin}` : ''}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setViewOrderModal(null)}
                    style={styles.modalCloseBtn}
                  >
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={true}
                  style={{ flexShrink: 1 }}
                  contentContainerStyle={{ paddingBottom: 24 }}
                >
                  <View style={styles.billBreakdownBox}>
                    <View style={styles.billRow}>
                      <Text><Text style={{ fontWeight: '700' }}>Order Date & Time:</Text> {formatOrderDateTime(viewOrderModal.created_at)}</Text>
                    </View>
                    <View style={styles.billRow}>
                      <Text><Text style={{ fontWeight: '700' }}>Order ID:</Text> {viewOrderModal.order_number}</Text>
                      <Text><Text style={{ fontWeight: '700' }}>Type:</Text> {viewOrderModal.order_type.toUpperCase()}</Text>
                    </View>
                    {viewOrderModal.table_number ? (
                      <View style={styles.billRow}>
                        <Text><Text style={{ fontWeight: '700' }}>Table:</Text> {viewOrderModal.table_number}</Text>
                      </View>
                    ) : null}
                    <View style={styles.billRow}>
                      <Text><Text style={{ fontWeight: '700' }}>Customer:</Text> {viewOrderModal.customer_name || 'Walk-in Guest'}</Text>
                      <Text><Text style={{ fontWeight: '700' }}>Phone:</Text> {viewOrderModal.customer_phone || 'N/A'}</Text>
                    </View>
                    {isTaxInvoice && viewOrderModal.customer_gstin ? (
                      <View style={styles.billRow}>
                        <Text><Text style={{ fontWeight: '700' }}>Customer GSTIN (B2B):</Text> <Text style={{ fontWeight: 'bold', color: '#1e40af' }}>{viewOrderModal.customer_gstin}</Text></Text>
                      </View>
                    ) : null}
                    {isTaxInvoice ? (
                      <View style={styles.billRow}>
                        <Text><Text style={{ fontWeight: '700' }}>Place of Supply:</Text> {settings?.state || 'West Bengal'} ({settings?.state_code || '19'})</Text>
                        <Text><Text style={{ fontWeight: '700' }}>Reverse Charge:</Text> No</Text>
                      </View>
                    ) : null}
                    <View style={styles.billRow}>
                      <Text><Text style={{ fontWeight: '700' }}>Status:</Text> {viewOrderModal.status.toUpperCase()}</Text>
                      <Text>
                        <Text style={{ fontWeight: '700' }}>Payment:</Text>{' '}
                        <Text style={{ color: viewOrderModal.payment_status === 'paid' ? '#16a34a' : '#e11d48', fontWeight: 'bold' }}>
                          {viewOrderModal.payment_status.toUpperCase()}
                        </Text>
                      </Text>
                    </View>

                    <View style={{ borderTopWidth: 1, borderColor: '#cbd5e1', marginVertical: 8 }} />

                    {(viewOrderModal.items || []).map((itm, i) => (
                      <View key={itm.id || i} style={styles.billRow}>
                        <Text>
                          {itm.quantity}x {itm.product_name}
                          {isTaxInvoice ? ` (${itm.hsn_code || '996331'})` : ''}
                        </Text>
                        <Text style={{ fontWeight: 'bold' }}>{formatCurrency(itm.total)}</Text>
                      </View>
                    ))}

                    <View style={{ borderTopWidth: 1, borderColor: '#cbd5e1', marginVertical: 8 }} />

                    <View style={styles.billRow}>
                      <Text>Subtotal:</Text>
                      <Text>{formatCurrency(getOrderSubtotal(viewOrderModal))}</Text>
                    </View>

                    {Boolean(viewOrderModal.discount_amount) && (
                      <View style={styles.billRow}>
                        <Text style={{ color: '#16a34a', fontWeight: '700' }}>
                          Discount {viewOrderModal.discount_type === 'percentage' ? `(${viewOrderModal.discount_value || ''}%)` : (viewOrderModal.discount_value ? `(₹${viewOrderModal.discount_value})` : '')}:
                        </Text>
                        <Text style={{ color: '#16a34a', fontWeight: '800' }}>
                          -{formatCurrency(viewOrderModal.discount_amount)}
                        </Text>
                      </View>
                    )}

                    {Boolean(viewOrderModal.coupon_discount) && (
                      <View style={styles.billRow}>
                        <Text style={{ color: '#16a34a', fontWeight: '700' }}>
                          Coupon ({viewOrderModal.coupon_code || ''}):
                        </Text>
                        <Text style={{ color: '#16a34a', fontWeight: '800' }}>
                          -{formatCurrency(viewOrderModal.coupon_discount)}
                        </Text>
                      </View>
                    )}

                    {isTaxInvoice && (viewOrderModal.cgst_amount || 0) + (viewOrderModal.sgst_amount || 0) > 0 ? (
                      <>
                        <View style={styles.billRow}>
                          <Text>Taxable Amount:</Text>
                          <Text>{formatCurrency(viewOrderModal.taxable_amount !== undefined && viewOrderModal.taxable_amount > 0 ? viewOrderModal.taxable_amount : Math.max(0, getOrderSubtotal(viewOrderModal) - (viewOrderModal.discount_amount || 0) - (viewOrderModal.coupon_discount || 0)))}</Text>
                        </View>

                        <View style={styles.billRow}>
                          <Text>CGST ({halfRate}%):</Text>
                          <Text>{formatCurrency(viewOrderModal.cgst_amount)}</Text>
                        </View>
                        <View style={styles.billRow}>
                          <Text>SGST ({halfRate}%):</Text>
                          <Text>{formatCurrency(viewOrderModal.sgst_amount)}</Text>
                        </View>
                        {viewOrderModal.igst_amount && viewOrderModal.igst_amount > 0 ? (
                          <View style={styles.billRow}>
                            <Text>IGST:</Text>
                            <Text>{formatCurrency(viewOrderModal.igst_amount)}</Text>
                          </View>
                        ) : null}
                      </>
                    ) : null}

                    {Boolean(viewOrderModal.delivery_charge) && (
                      <View style={styles.billRow}>
                        <Text>Delivery Charge:</Text>
                        <Text>{formatCurrency(viewOrderModal.delivery_charge)}</Text>
                      </View>
                    )}

                    {Boolean(viewOrderModal.round_off) && (
                      <View style={styles.billRow}>
                        <Text>Round Off:</Text>
                        <Text>{viewOrderModal.round_off > 0 ? '+' : ''}{formatCurrency(viewOrderModal.round_off)}</Text>
                      </View>
                    )}

                    <View style={[styles.billRow, styles.billTotalRow]}>
                      <Text style={styles.billTotalLabel}>Grand Total:</Text>
                      <Text style={styles.billTotalVal}>{formatCurrency(viewOrderModal.payable_amount)}</Text>
                    </View>
                    <Text style={styles.wordsText}>({numberToWords(viewOrderModal.payable_amount)})</Text>
                  </View>

                  {/* Print and Share buttons */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
                    <TouchableOpacity
                      style={styles.printBtnSmall}
                      onPress={() => printService.printFinalReceiptThermal(viewOrderModal, settings, user?.full_name)}
                    >
                      <Text style={styles.printBtnSmallText}>🖨️ Thermal Bill</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.printKotBtnSmall}
                      onPress={() => printService.printKotThermal(viewOrderModal, settings)}
                    >
                      <Text style={styles.printKotBtnSmallText}>🖨️ KOT Slip</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.shareBtnSmall}
                      onPress={() => printService.printTaxInvoiceA4(viewOrderModal, settings)}
                    >
                      <Text style={styles.shareBtnSmallText}>📄 Tax Invoice A4</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        );
      })()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  refreshHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
  },
  refreshHeaderBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
  },
  refreshEmptyBtn: {
    marginTop: 14,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  refreshEmptyBtnText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  subTitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  search: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  categoryTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  categoryTabBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTabBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
    elevation: 2,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  categoryTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  categoryTabTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tabBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabBtnActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  emptyBtn: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  list: {
    padding: 14,
    gap: 12,
  },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 14,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardCompleted: {
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  cardCancelled: {
    opacity: 0.7,
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  orderNum: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'center',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  qrSource: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  posSource: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
  },
  onlineSource: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  takeawaySource: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'center',
  },
  statusConfirmed: { backgroundColor: '#eff6ff' },
  statusPreparing: { backgroundColor: '#fef3c7' },
  statusReady: { backgroundColor: '#e0e7ff' },
  statusServed: { backgroundColor: '#dcfce7' },
  statusCompleted: { backgroundColor: '#f1f5f9' },
  statusCancelled: { backgroundColor: '#fee2e2' },
  statusOutForDelivery: { backgroundColor: '#ffedd5' },
  statusBadgeText: { fontSize: 10, fontWeight: '900' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
    flexWrap: 'wrap',
    gap: 4,
  },
  custText: { fontSize: 12, color: '#334155' },
  timeText: { fontSize: 11, color: '#64748b' },
  tableText: { fontSize: 12, fontWeight: '700', color: '#0f172a', marginVertical: 2 },
  addressText: { fontSize: 11, color: '#64748b', marginVertical: 2 },
  itemsBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginVertical: 8,
  },
  itemsTitle: { fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 4, textTransform: 'uppercase' },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
  itemQty: { width: 25, fontSize: 12, fontWeight: '900', color: '#2563eb' },
  itemName: { flex: 1, fontSize: 12, fontWeight: '700', color: '#0f172a' },
  itemPrice: { fontSize: 12, fontWeight: '800', color: '#334155' },
  notesBox: {
    backgroundColor: '#fffbeb',
    padding: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  notesText: { fontSize: 11, color: '#b45309', fontWeight: '600' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    paddingTop: 8,
    marginBottom: 10,
  },
  payableLabel: { fontSize: 10, color: '#64748b', fontWeight: '700' },
  payableVal: { fontSize: 16, fontWeight: '900', color: '#16a34a' },
  payStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  payStatusPaid: { backgroundColor: '#dcfce7' },
  payStatusUnpaid: { backgroundColor: '#fee2e2' },
  payStatusText: { fontSize: 10, fontWeight: '900' },
  payStatusTextPaid: { color: '#15803d' },
  payStatusTextUnpaid: { color: '#b91c1c' },
  cardActionsGrid: {
    marginTop: 4,
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  gridActionBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionKotBg: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  actionDispatchBg: {
    backgroundColor: '#ffedd5',
    borderColor: '#fdba74',
  },
  actionDeliveredBg: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  actionViewBg: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  actionHoldBg: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  actionResumeBg: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  actionEditBg: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  actionCancelBg: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  actionSettleBg: {
    backgroundColor: '#16a34a',
    borderColor: '#15803d',
  },
  actionPrintThermalBg: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  actionShareBg: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  actionDisabledBg: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    opacity: 0.7,
  },
  actionBtnTextKot: { color: '#c2410c', fontSize: 11, fontWeight: '800' },
  actionBtnTextDispatch: { color: '#c2410c', fontSize: 11, fontWeight: '800' },
  actionBtnTextDelivered: { color: '#15803d', fontSize: 11, fontWeight: '800' },
  actionBtnTextHold: { color: '#d97706', fontSize: 11, fontWeight: '800' },
  actionBtnTextResume: { color: '#059669', fontSize: 11, fontWeight: '800' },
  actionBtnTextBlue: { color: '#1d4ed8', fontSize: 11, fontWeight: '800' },
  actionBtnTextRed: { color: '#e11d48', fontSize: 11, fontWeight: '800' },
  actionBtnTextGreen: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  actionBtnTextWhite: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  actionBtnTextDark: { color: '#334155', fontSize: 11, fontWeight: '800' },
  actionBtnTextMuted: { color: '#94a3b8', fontSize: 10, fontWeight: '800' },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnEdit: {
    flex: 1,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  actionBtnCancel: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  actionBtnClose: {
    flex: 1.2,
    backgroundColor: '#16a34a',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnView: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnPrint: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnShare: {
    flex: 1.2,
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnViewFull: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnPrintKot: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  printKotBtnSmall: {
    flex: 1,
    backgroundColor: '#ea580c',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  printKotBtnSmallText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },

  // Modals
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
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 10,
    width: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    paddingBottom: 8,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  modalSubTitle: { fontSize: 11, color: '#64748b', marginTop: 2 },
  modalCloseBtn: { padding: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  modalCloseText: { fontSize: 16, fontWeight: 'bold', color: '#64748b' },
  fieldSectionHeader: { fontSize: 12, fontWeight: '900', color: '#0f172a', marginTop: 8, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#334155', marginTop: 6, marginBottom: 3 },
  fieldInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 12,
    color: '#0f172a',
  },
  editItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  editItemName: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  editItemRate: { fontSize: 10, color: '#64748b' },
  editItemTotal: { fontSize: 12, fontWeight: '900', color: '#16a34a', width: 60, textAlign: 'right' },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
  },
  stepperBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  stepperBtnText: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  stepperQty: { fontSize: 12, fontWeight: '900', paddingHorizontal: 6 },
  addProdChip: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  addProdChipText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' },
  tblChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  tblChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tblChipText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  tblChipTextActive: { color: '#ffffff', fontWeight: '900' },
  saveModalBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  saveModalBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  btnDisabled: { backgroundColor: '#94a3b8' },

  // Cancel Modal
  cancelModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 380,
  },
  cancelModalTitle: { fontSize: 16, fontWeight: '900', color: '#b91c1c' },
  cancelModalSub: { fontSize: 11, color: '#64748b', marginVertical: 6, lineHeight: 16 },
  presetBtn: {
    backgroundColor: '#f8fafc',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 2,
  },
  presetBtnActive: { backgroundColor: '#fee2e2', borderColor: '#fca5a5' },
  presetBtnText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  presetBtnTextActive: { color: '#b91c1c', fontWeight: '900' },
  modalCloseSmallBtn: { flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modalCloseSmallText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  confirmCancelBtn: { flex: 1.5, backgroundColor: '#dc2626', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  confirmCancelBtnText: { fontSize: 11, fontWeight: '900', color: '#ffffff' },

  // Bill / Pay Modal
  sectionBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  discountTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  discTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  discTypeBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  discTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  discTypeTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  discInputWrapper: {
    marginTop: 8,
  },
  discInputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  discInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#93c5fd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  billBreakdownBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 8,
  },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  billLabel: { fontSize: 11, color: '#64748b' },
  billVal: { fontSize: 11, fontWeight: '700', color: '#0f172a' },
  billTotalRow: { borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 6, marginTop: 4 },
  billTotalLabel: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  billTotalVal: { fontSize: 16, fontWeight: '900', color: '#16a34a' },
  wordsText: { fontSize: 9, fontStyle: 'italic', color: '#64748b', marginTop: 2 },
  payMethodsGrid: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  payMethodBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  payMethodBtnActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  payMethodText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  payMethodTextActive: { color: '#ffffff' },
  recBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  recBtnActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  recBtnUnpaidActive: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  recBtnText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  recBtnTextActive: { color: '#ffffff' },
  printBtnSmall: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  printBtnSmallText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  shareBtnSmall: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  shareBtnSmallText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 4,
  },
  holdActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBadgePillOnline: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newBadgePillQr: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  newBadgePillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  newOrderBadge: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  newOrderBadgeText: {
    color: '#dc2626',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  cardNewOnline: {
    borderColor: '#3b82f6',
    borderWidth: 1.5,
    backgroundColor: '#f8fafc',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  cardNewQr: {
    borderColor: '#8b5cf6',
    borderWidth: 1.5,
    backgroundColor: '#faf5ff',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  markSeenBtn: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  markSeenBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
});
