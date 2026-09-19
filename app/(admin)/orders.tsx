import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
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
import { isValidPhoneNumber, normalizePhoneNumber } from '../../src/utils/phone';
import { isValidIndianPhone, normalizeIndianPhone, getIndianPhoneValidationError } from '../../src/utils/validation';
import { validateGSTIN } from '../../src/utils/validators';
import { supabase, isSupabaseConfigured } from '../../src/services/supabase';
import { useNotification } from '../../src/context/NotificationContext';
import { useNewOrderTracker } from '../../src/hooks/useNewOrderTracker';

export default function OrdersScreen() {
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
  const [viewReasonModal, setViewReasonModal] = useState<Order | null>(null);

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
  const [verifyingPaymentOrderId, setVerifyingPaymentOrderId] = useState<string | null>(null);

  // Partial Payment Modal state
  const [partialPayModal, setPartialPayModal] = useState<Order | null>(null);
  const [partialPayMethod, setPartialPayMethod] = useState<PaymentMethod>('cash');
  const [partialPayAmount, setPartialPayAmount] = useState<string>('');
  const [partialPayRef, setPartialPayRef] = useState<string>('');
  const [partialPayNotes, setPartialPayNotes] = useState<string>('');
  const [partialPaySplits, setPartialPaySplits] = useState<Array<{ id: string; method: PaymentMethod; amount: string; ref: string }>>([
    { id: '1', method: 'cash', amount: '', ref: '' },
    { id: '2', method: 'upi', amount: '', ref: '' },
  ]);
  const [recordingPartialPayment, setRecordingPartialPayment] = useState<boolean>(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isMobile = windowWidth < 768;
  const isDesktopWide = (Platform.OS === 'web' && windowWidth >= 1200) || windowWidth >= 1200;
  const isTwoColumn = (Platform.OS === 'web' && windowWidth >= 680) || windowWidth >= 768;

  const formatTableLabel = (rawName?: string | null): string => {
    if (!rawName) return '';
    const trimmed = rawName.trim();
    if (/^table\b/i.test(trimmed)) return trimmed;
    return `Table ${trimmed}`;
  };

  const cardWidth = useMemo(() => {
    if (isDesktopWide) {
      if (Platform.OS === 'web') return 'calc(33.333% - 7px)' as any;
      return Math.floor((windowWidth - 28 - 20) / 3);
    }
    if (isTwoColumn) {
      if (Platform.OS === 'web') return 'calc(50% - 5px)' as any;
      return Math.floor((windowWidth - 28 - 10) / 2);
    }
    return '100%';
  }, [isDesktopWide, isTwoColumn, windowWidth]);

  const showAlert = (title: string, message?: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(message ? `${title}\n\n${message}` : title);
    } else {
      Alert.alert(title, message);
    }
  };

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
    if (ord.payment_status === 'paid' || ord.status === 'completed') {
      showAlert(
        'Editing Locked',
        'Cannot edit an order that is already completed or paid.'
      );
      return;
    }
    if (isDispatchedDeliveryOrder(ord)) {
      showAlert(
        'Modification Locked',
        'This delivery/online order has already been dispatched. Adding or modifying items is not allowed from the admin panel.'
      );
      return;
    }
    setEditOrderModal(ord);
    setEditItems(
      (ord.items || []).map((i) => {
        const qty = Number(i.quantity) || 1;
        const unitPrice = Number(i.unit_price) || (Number(i.subtotal) && qty ? Number(i.subtotal) / qty : (Number(i.total) && qty ? Number(i.total) / qty : 0));
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
      showAlert(
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
        total_price: prodPrice,
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
        showAlert(
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

    const isGstEnabled = settings?.is_gst_enabled !== undefined && settings?.is_gst_enabled !== null
      ? Boolean(settings.is_gst_enabled)
      : false;
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
    if (editOrderModal.payment_status === 'paid' || editOrderModal.status === 'completed') {
      showAlert('Editing Locked', 'Cannot edit an order that is already completed or paid.');
      setEditOrderModal(null);
      return;
    }
    if (editItems.length === 0) {
      showAlert('Empty Order', 'An order must contain at least one item.');
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
        showAlert(
          'Adding Items Locked',
          'Adding new items or increasing quantities is not permitted for dispatched delivery and online orders.'
        );
        return;
      }
    }

    if (editCustomerPhone.trim()) {
      if (!isValidIndianPhone(editCustomerPhone)) {
        showAlert('Invalid Phone Number', 'Enter a valid 10-digit Indian mobile number.');
        return;
      }
    } else if (editOrderModal.order_type === 'delivery') {
      showAlert('Phone Required', 'Customer contact phone number is required for delivery orders.');
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
        customerPhone: editCustomerPhone.trim() ? normalizeIndianPhone(editCustomerPhone.trim()) : "",
        deliveryAddress: editDeliveryAddress.trim(),
        deliveryLandmark: editOrderModal.delivery_landmark || undefined,
        deliveryCharge: editOrderModal.delivery_charge || 0,
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
        printService.printKotThermal(updated, settings, (updated as any).latest_kot).catch((e) => console.warn('KOT Print warning:', e));
      }

      clearOrdersCache(updated.restaurant_id || activeRestaurantId);
      clearKotsCache(updated.restaurant_id || activeRestaurantId);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));

      showAlert(
        'Order Updated',
        `Order #${updated.order_number} has been updated.\nOrder items and bill recalculated successfully.${
          (updated as any).latest_kot ? '\n\n📄 Kitchen KOT ticket for new items generated & printed.' : ''
        }`
      );
      setEditOrderModal(null);
      await loadData(true);
    } catch (err: any) {
      showAlert('Update Failed', err?.message || 'Failed to update order.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Partial Payment Modal
  const openPartialPaymentModal = (order: Order) => {
    markAsSeen(order.id);
    setPartialPayModal(order);
    const payable = Number(order.payable_amount ?? order.grand_total ?? 0);
    const paid = Number(order.paid_amount ?? 0);
    const balance = Math.max(0, payable - paid);
    setPartialPayAmount(balance > 0 ? String(balance) : '');
    setPartialPayMethod('cash');
    setPartialPayRef('');
    setPartialPayNotes('');
    setPartialPaySplits([
      { id: '1', method: 'cash', amount: balance > 0 ? String(balance) : '', ref: '' },
      { id: '2', method: 'upi', amount: '', ref: '' },
    ]);
  };

  // Confirm Partial Payment
  const handleConfirmPartialPayment = async () => {
    if (!partialPayModal) return;
    const payable = Number(partialPayModal.payable_amount ?? partialPayModal.grand_total ?? 0);
    const paid = Number(partialPayModal.paid_amount ?? 0);
    const balance = Math.max(0, payable - paid);

    if (balance <= 0) {
      showAlert('Fully Paid', 'This order is already fully paid. Click Settle to complete the order.');
      return;
    }

    let effectiveAmount = 0;
    let splitArray: Array<{ payment_method: PaymentMethod; amount: number; reference_number?: string }> | undefined = undefined;

    if (partialPayMethod === 'split') {
      const validSplits = partialPaySplits.filter((s) => parseFloat(s.amount) > 0);
      if (validSplits.length === 0) {
        showAlert('Invalid Amount', 'Please enter at least one split payment amount.');
        return;
      }
      effectiveAmount = validSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
      splitArray = validSplits.map((s) => ({
        payment_method: s.method,
        amount: parseFloat(s.amount),
        reference_number: s.ref.trim() || undefined,
      }));
    } else {
      effectiveAmount = parseFloat(partialPayAmount);
      if (isNaN(effectiveAmount) || effectiveAmount <= 0) {
        showAlert('Invalid Amount', 'Please enter a valid payment amount greater than zero.');
        return;
      }
    }

    if (effectiveAmount > balance) {
      showAlert(
        'Overpayment Blocked',
        `Payment amount (${formatCurrency(effectiveAmount)}) cannot exceed remaining balance (${formatCurrency(balance)}).`
      );
      return;
    }

    setRecordingPartialPayment(true);
    try {
      const res = await orderService.recordPartialPayment({
        orderId: partialPayModal.id,
        paymentMethod: partialPayMethod,
        amount: effectiveAmount,
        referenceNumber: partialPayRef.trim() || undefined,
        notes: partialPayNotes.trim() || undefined,
        splitPayments: splitArray,
        restaurantId: partialPayModal.restaurant_id || activeRestaurantId,
      });

      setOrders((prev) => prev.map((o) => (o.id === res.order.id ? res.order : o)));
      setAllTenantOrders((prev) => prev.map((o) => (o.id === res.order.id ? res.order : o)));
      showAlert(
        '✓ Payment Recorded',
        `Payment of ${formatCurrency(effectiveAmount)} recorded successfully for Order #${res.order.order_number}.\nRemaining balance: ${formatCurrency(
          Math.max(0, Number(res.order.payable_amount ?? res.order.grand_total ?? 0) - Number(res.order.paid_amount ?? 0))
        )}.`
      );
      setPartialPayModal(null);
      await loadData(true);
    } catch (err: any) {
      showAlert('Payment Failed', err.message || 'Failed to record payment.');
    } finally {
      setRecordingPartialPayment(false);
    }
  };

  // Cancel Order confirmation
  const handleConfirmCancelOrder = async () => {
    if (!cancelOrderModal) return;
    const finalReason = cancelCustomReason.trim() || cancelReasonPreset;
    if (!finalReason) {
      showAlert('Reason Required', 'Please select or enter a cancellation reason.');
      return;
    }

    if (cancelOrderModal.paid_amount && Number(cancelOrderModal.paid_amount) > 0) {
      showAlert(
        'Cannot Cancel Order',
        `₹${cancelOrderModal.paid_amount} has already been received. Refund/Void payment before cancelling.`
      );
      setCancelOrderModal(null);
      return;
    }

    if (cancelOrderModal.payment_status === 'paid' || cancelOrderModal.status === 'completed') {
      showAlert(
        'Cannot Cancel Order',
        'Cannot cancel an order that is already completed or paid. Please use Refund / Void workflow.'
      );
      setCancelOrderModal(null);
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
      showAlert(
        'Order Cancelled',
        `Order #${cancelOrderModal.order_number} has been cancelled.\nInventory stock restored and table released safely.`
      );
      setCancelOrderModal(null);
      setCancelCustomReason('');
      await loadData();
    } catch (err: any) {
      showAlert('Cancellation Failed', err?.message || 'Failed to cancel order.');
    } finally {
      setCancellingOrder(false);
    }
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

        if (!settings.auto_print_kot) {
          Alert.alert(
            '🖨️ KOT Generated & Printed',
            hasExistingKot
              ? `Supplementary KOT #${newKot.kot_number} generated for new items.`
              : `KOT #${newKot.kot_number} generated for kitchen.`
          );
        }
      } else {
        // Manual reprint of existing KOT - same KOT is printed
        const activeKot = order.kots && order.kots.length > 0 ? order.kots[order.kots.length - 1] : undefined;
        await printService.printKotThermal(order, settings, activeKot, true);
        if (!settings.auto_print_kot) {
          Alert.alert('🖨️ KOT Reprinted', `Kitchen slip reprinted for Order #${order.order_number}.`);
        }
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
      `Did you receive payment of ₹${order.payable_amount !== undefined && order.payable_amount !== null ? order.payable_amount : (order.grand_total ?? 0)} for Order #${order.order_number}?`,
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

  const handleMarkPaymentVerified = async (order: Order) => {
    if (!order || !order.id) return;
    if (order.status === 'cancelled') {
      Alert.alert('Action Not Allowed', 'Cannot verify payment for a cancelled order.');
      return;
    }
    if (user?.role !== 'SUPER_ADMIN' && user?.role !== 'ADMIN') {
      Alert.alert('Permission Denied', 'Only Restaurant Admins and Super Admins can verify online payments.');
      return;
    }

    const payableVal =
      order.payable_amount !== undefined && order.payable_amount !== null
        ? Number(order.payable_amount)
        : Number(order.grand_total || 0);

    const confirmMsg = `Are you sure you want to verify and confirm payment for Order #${order.order_number} (${formatCurrency(payableVal)})?`;

    const executeVerify = async () => {
      try {
        setVerifyingPaymentOrderId(order.id);
        const res = await orderService.markPaymentVerified(order.id, order.restaurant_id || activeRestaurantId);

        // Optimistically update order state in current list, modal, and tenant cache
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  payment_verified_at: res.payment_verified_at || new Date().toISOString(),
                  payment_verified_by: res.payment_verified_by || user?.id,
                }
              : o
          )
        );

        setAllTenantOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  payment_verified_at: res.payment_verified_at || new Date().toISOString(),
                  payment_verified_by: res.payment_verified_by || user?.id,
                }
              : o
          )
        );

        setViewOrderModal((prev) =>
          prev && prev.id === order.id
            ? {
                ...prev,
                payment_verified_at: res.payment_verified_at || new Date().toISOString(),
                payment_verified_by: res.payment_verified_by || user?.id,
              }
            : prev
        );

        Alert.alert('✓ Payment Verified', `Payment proof for Order #${order.order_number} has been verified.\nThe order remains active and is ready to settle.`);
        await loadData(true);
      } catch (err: any) {
        Alert.alert('Verification Failed', err.message || 'Could not verify payment.');
      } finally {
        setVerifyingPaymentOrderId(null);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Mark Payment Verified\n\n${confirmMsg}`)) {
        executeVerify();
      }
    } else {
      Alert.alert('Verify Payment', confirmMsg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Verify Payment', style: 'default', onPress: executeVerify },
      ]);
    }
  };

  const openPayModal = (order: Order) => {
    markAsSeen(order.id);
    setPayOrderModal(order);
    const defaultMethod: PaymentMethod =
      order.payment_method === 'online' || order.payment_method === 'upi'
        ? 'upi'
        : order.payment_method === 'card'
        ? 'card'
        : 'cash';
    setPayMethod(defaultMethod);
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

    // If no manual discount is added, and the order already has persisted payable_amount,
    // read directly from the persisted order fields to ensure 100% fidelity with server order!
    if (!hasManualDiscount && payOrderModal.payable_amount !== undefined && payOrderModal.payable_amount !== null) {
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
        rawTotal: payOrderModal.grand_total ?? payOrderModal.payable_amount ?? 0,
        roundOff: payOrderModal.round_off || 0,
        payableAmount: payOrderModal.payable_amount ?? 0,
      };
    }

    const isGstEnabled = settings?.is_gst_enabled !== undefined && settings?.is_gst_enabled !== null
      ? Boolean(settings.is_gst_enabled)
      : false;
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
      const finalPayable = payTotals?.payableAmount ?? payOrderModal.payable_amount ?? 0;
      const alreadyPaid = Number(payOrderModal.paid_amount || 0);
      const remainingBalance = Math.max(0, finalPayable - alreadyPaid);

      const completed = await orderService.closeAndPayOrder({
        orderId: payOrderModal.id,
        paymentMethod: payMethod,
        paymentReceived: payReceived,
        amountPaid: remainingBalance > 0 ? remainingBalance : 0,
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
    <View style={styles.container}>
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
            onPress={() => {
              setCategoryTab('pos');
              setTabFilter('active');
            }}
          >
            <Text style={[styles.categoryTabText, categoryTab === 'pos' && styles.categoryTabTextActive]}>
              🍽️ Dine In & Takeaway
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="orders-tab-online"
            style={[styles.categoryTabBtn, categoryTab === 'online' && styles.categoryTabBtnActive]}
            onPress={() => {
              setCategoryTab('online');
              setTabFilter('active');
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
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
            onPress={() => {
              setCategoryTab('qr');
              setTabFilter('active');
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
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

        {/* Search & Status Filters in compact toolbar */}
        <View style={[styles.toolbarRow, isMobile && styles.toolbarRowMobile]}>
          <TextInput
            style={[styles.search, !isMobile && { flex: 1, marginBottom: 0 }]}
            placeholder="Search by Order #, Customer, Phone, Table..."
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
                    {Boolean(order.is_supplementary) && (
                      <View style={{ backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#94a3b8', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '900', color: '#334155' }}>🏷️ SUP</Text>
                      </View>
                    )}
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

                {/* Customer & Floor Information - Compact Single Row */}
                <View style={styles.metaRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, flex: 1 }}>
                    <Text style={styles.custText}>
                      👤 <Text style={{ fontWeight: '800', color: '#0f172a' }}>{order.customer_name || 'Walk-in Guest'}</Text>
                      {order.customer_phone ? ` (${order.customer_phone})` : ''}
                    </Text>
                    {Boolean(isCustomerQr && tableDisplayName) ? (
                      <Text style={styles.tableTextInline}>
                        • 📱 <Text style={{ fontWeight: '800', color: '#7c3aed' }}>{formatTableLabel(tableDisplayName)}</Text>
                      </Text>
                    ) : Boolean(order.order_type === 'dine_in' && tableDisplayName) ? (
                      <Text style={styles.tableTextInline}>
                        • 🪑 <Text style={{ fontWeight: '800', color: '#0f172a' }}>{formatTableLabel(tableDisplayName)}</Text>
                      </Text>
                    ) : order.order_type === 'takeaway' ? (
                      <Text style={styles.tableTextInline}>
                        • 🥡 <Text style={{ fontWeight: '800', color: '#d97706' }}>Takeaway</Text>
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.timeText}>🕒 {createdTime}</Text>
                </View>

                {Boolean(order.delivery_address) && (
                  <Text style={styles.addressText} numberOfLines={1}>
                    📍 <Text style={{ fontWeight: '800', color: '#0f172a' }}>{order.delivery_address}</Text> {order.delivery_landmark ? `(Near: ${order.delivery_landmark})` : ''}
                  </Text>
                )}

                {/* Items List - Compact Container */}
                <View style={styles.itemsBox}>
                  <Text style={styles.itemsTitle}>Items ({order.items?.length || 0}):</Text>
                  {(order.items || []).map((i) => (
                    <View key={i.id} style={styles.itemRow}>
                      <Text style={styles.itemQty}>{i.quantity}x</Text>
                      <Text style={styles.itemName} numberOfLines={1}>{i.product_name}</Text>
                      <Text style={styles.itemPrice}>
                        {formatCurrency((Number(i.unit_price) && Number(i.quantity)) ? (Number(i.unit_price) * Number(i.quantity)) : (Number(i.subtotal) || Number(i.total) || 0))}
                      </Text>
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
                        <Text style={[styles.notesText, { color: '#6d28d9' }]}>📱 Table QR Order</Text>
                      </View>
                    );
                  }
                  return null;
                })()}

                {/* Applied Coupon Banner if any */}
                {Boolean(order.coupon_code && order.coupon_discount) && (
                  <View style={{ backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2.5, marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#065F46' }}>
                      🏷️ Coupon: {order.coupon_code}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#059669' }}>
                      -{formatCurrency(order.coupon_discount || 0)}
                    </Text>
                  </View>
                )}

                {/* Applied Discount Banner if any */}
                {Boolean(order.discount_amount && order.discount_amount > 0) && (
                  <View style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2.5, marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400E' }}>
                      🏷️ Discount ({order.discount_type === 'percentage' ? `${order.discount_value}%` : 'Flat ₹'}):
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#B45309' }}>
                      -{formatCurrency(order.discount_amount || 0)}
                    </Text>
                  </View>
                )}

                {/* Payment Screenshot Proof Banner - Compact Inline Strip */}
                {Boolean(order.payment_proof_url) && (
                  <View
                    style={{
                      backgroundColor: (order.payment_status === 'paid' || Boolean(order.payment_verified_at)) ? '#f0fdf4' : '#eff6ff',
                      borderWidth: 1,
                      borderColor: (order.payment_status === 'paid' || Boolean(order.payment_verified_at)) ? '#86efac' : '#bfdbfe',
                      borderRadius: 7,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      marginBottom: 4,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13 }}>{(order.payment_status === 'paid' || Boolean(order.payment_verified_at)) ? '✅' : '📷'}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '800',
                            color: (order.payment_status === 'paid' || Boolean(order.payment_verified_at)) ? '#166534' : '#1e40af',
                          }}
                          numberOfLines={1}
                        >
                          {order.payment_status === 'paid'
                            ? 'Proof Verified & Settled'
                            : Boolean(order.payment_verified_at)
                            ? 'Proof Verified • Ready'
                            : 'Proof Attached'}
                        </Text>
                        <Text
                          style={{
                            fontSize: 9.5,
                            color: (order.payment_status === 'paid' || Boolean(order.payment_verified_at)) ? '#15803d' : '#3b82f6',
                          }}
                          numberOfLines={1}
                        >
                          {order.payment_verified_at
                            ? `Verified ${formatOrderDateTime(order.payment_verified_at)}`
                            : 'Online Payment Screenshot'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          markAsSeen(order.id);
                          setViewOrderModal(order);
                        }}
                        style={{
                          backgroundColor: '#ffffff',
                          borderWidth: 1,
                          borderColor: '#93c5fd',
                          paddingHorizontal: 7,
                          paddingVertical: 3.5,
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#2563eb' }}>🔍 Proof</Text>
                      </TouchableOpacity>

                      {order.status !== 'cancelled' && order.payment_status !== 'paid' && !order.payment_verified_at && (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#16a34a',
                            paddingHorizontal: 8,
                            paddingVertical: 3.5,
                            borderRadius: 6,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 3,
                          }}
                          onPress={() => handleMarkPaymentVerified(order)}
                          disabled={verifyingPaymentOrderId === order.id}
                        >
                          {verifyingPaymentOrderId === order.id ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={{ color: '#ffffff', fontSize: 10.5, fontWeight: '900' }}>
                              ✓ Verify
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {/* Financial Breakdown: Total, Paid, Balance */}
                {(() => {
                  const payableVal =
                    order.payable_amount !== undefined && order.payable_amount !== null
                      ? Number(order.payable_amount)
                      : (order.grand_total !== undefined && order.grand_total !== null
                          ? Number(order.grand_total)
                          : (order.items && order.items.length > 0
                              ? order.items.reduce((sum, item) => sum + ((Number(item.unit_price) * Number(item.quantity)) || Number(item.subtotal) || Number(item.total) || 0), 0)
                              : 0));
                  const paidVal = Number(order.paid_amount || 0);
                  const balanceVal = Math.max(0, payableVal - paidVal);

                  const isCodPay = order.payment_method === 'cod';
                  const isCardPay = order.payment_method === 'card';
                  const isCashPay = order.payment_method === 'cash';
                  const isRoomPay = order.payment_method === 'room';
                  const isSplitPay = order.payment_method === 'split';
                  const isUpiPay = order.payment_method === 'upi' || order.payment_method === 'online';
                  const isOnlinePay = isUpiPay || Boolean(order.payment_proof_url);
                  const isProofVerified = Boolean(order.payment_verified_at);

                  let badgeContainerStyle = styles.payStatusUnpaid;
                  let badgeTextStyle = styles.payStatusTextUnpaid;
                  let badgeLabel = '⚠️ UNPAID';

                  if (isPaid) {
                    badgeContainerStyle = styles.payStatusPaid;
                    badgeTextStyle = styles.payStatusTextPaid;
                    if (isCardPay) badgeLabel = '✓ PAID (CARD)';
                    else if (isUpiPay) badgeLabel = '✓ PAID (UPI)';
                    else if (isOnlinePay) badgeLabel = '✓ PAID (ONLINE)';
                    else if (isCashPay || isCodPay) badgeLabel = '✓ PAID (CASH)';
                    else if (isRoomPay) badgeLabel = '✓ PAID (ROOM)';
                    else if (isSplitPay) badgeLabel = '✓ PAID (SPLIT)';
                    else badgeLabel = `✓ PAID (${(order.payment_method || 'PAID').toUpperCase()})`;
                  } else {
                    if (order.status === 'cancelled') {
                      badgeContainerStyle = { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' } as any;
                      badgeTextStyle = { color: '#991b1b' } as any;
                      badgeLabel = '🚫 CANCELLED (UNPAID)';
                    } else if (isProofVerified) {
                      badgeContainerStyle = { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' } as any;
                      badgeTextStyle = { color: '#15803d' } as any;
                      badgeLabel = '📱 ONLINE • PAYMENT VERIFIED • READY TO SETTLE';
                    } else if (paidVal > 0) {
                      badgeContainerStyle = { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' } as any;
                      badgeTextStyle = { color: '#1d4ed8' } as any;
                      badgeLabel = `💳 PARTIALLY PAID (BAL: ${formatCurrency(balanceVal)})`;
                    } else if (isOnlinePay) {
                      badgeContainerStyle = { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' } as any;
                      badgeTextStyle = { color: '#1d4ed8' } as any;
                      badgeLabel = Boolean(order.payment_proof_url)
                        ? '📱 ONLINE • PROOF ATTACHED'
                        : '📱 ONLINE (PENDING VERIFICATION)';
                    } else if (isCodPay) {
                      badgeContainerStyle = { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' } as any;
                      badgeTextStyle = { color: '#c2410c' } as any;
                      badgeLabel = '💵 COD (PAY ON DELIVERY)';
                    } else if (isCardPay) {
                      badgeContainerStyle = styles.payStatusUnpaid;
                      badgeTextStyle = styles.payStatusTextUnpaid;
                      badgeLabel = '💳 CARD (UNPAID)';
                    } else {
                      badgeContainerStyle = styles.payStatusUnpaid;
                      badgeTextStyle = styles.payStatusTextUnpaid;
                      badgeLabel = '⚠️ UNPAID';
                    }
                  }

                  return (
                    <>
                      {/* Total, Paid, Balance summary */}
                      <View style={styles.orderFinanceBox}>
                        <View style={styles.orderFinanceCol}>
                          <Text style={styles.orderFinanceLabel}>Total</Text>
                          <Text style={styles.orderFinanceVal}>{formatCurrency(payableVal)}</Text>
                        </View>
                        <View style={styles.orderFinanceDivider} />
                        <View style={styles.orderFinanceCol}>
                          <Text style={styles.orderFinanceLabel}>Paid</Text>
                          <Text style={[styles.orderFinanceVal, { color: paidVal > 0 ? '#15803d' : '#64748b' }]}>
                            {formatCurrency(paidVal)}
                          </Text>
                        </View>
                        <View style={styles.orderFinanceDivider} />
                        <View style={styles.orderFinanceCol}>
                          <Text style={styles.orderFinanceLabel}>Balance</Text>
                          <Text style={[styles.orderFinanceVal, { color: balanceVal > 0 ? '#b45309' : '#15803d', fontWeight: '900' }]}>
                            {formatCurrency(balanceVal)}
                          </Text>
                        </View>
                      </View>

                      {/* Payment Status Badge */}
                      <View style={[styles.payStatusBadge, badgeContainerStyle, { marginBottom: 4 }]}>
                        <Text style={[styles.payStatusText, badgeTextStyle]}>
                          {badgeLabel}
                        </Text>
                      </View>
                    </>
                  );
                })()}

                  {/* Action Buttons based on order status: 3 up, 3 below */}
                  <View style={styles.cardActionsGrid}>
                    {isActive && (() => {
                      const isOnlineDelivery = isCustomerApp || order.order_type === 'delivery' || isOnlineDeliveryOrder(order);
                      const isKotDisabled = isKotButtonDisabled(order);
                      const hasKot = isKotDisabled;
                      const isDispatched = order.status === 'out_for_delivery' || ['delivered', 'completed'].includes(order.status);
                      const payableVal = Number(order.payable_amount ?? order.grand_total ?? 0);
                      const paidVal = Number(order.paid_amount || 0);
                      const isFullyPaid = paidVal >= payableVal && payableVal > 0;

                      return (
                        <>
                          {/* ROW 1: 3 Buttons (KOT, Dispatch/Delivered/View, Payment) */}
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

                            {/* BUTTON 3: Payment (Record Partial/Full Payment) */}
                            <TouchableOpacity
                              testID={`order-payment-btn-${order.id}`}
                              style={[
                                styles.gridActionBtn,
                                isFullyPaid ? { backgroundColor: '#f0fdf4', borderColor: '#86efac' } : styles.actionPaymentBg,
                              ]}
                              onPress={() => openPartialPaymentModal(order)}
                            >
                              <Text style={[styles.actionBtnTextPayment, isFullyPaid && { color: '#15803d' }]}>
                                {isFullyPaid ? '✓ Paid' : '💳 Payment'}
                              </Text>
                            </TouchableOpacity>
                          </View>

                          {/* ROW 2: 3 Buttons (Edit, Cancel, Settle) */}
                          <View style={[styles.cardActionRow, { marginTop: 6 }]}>
                            {/* BUTTON: Edit (Disabled if completed or paid) */}
                            {order.payment_status === 'paid' || order.status === 'completed' ? (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionDisabledBg]}
                                disabled={true}
                                onPress={() =>
                                  showAlert(
                                    'Editing Locked',
                                    'Cannot edit an order that is already completed or paid.'
                                  )
                                }
                              >
                                <Text style={styles.actionBtnTextMuted}>🔒 Edit</Text>
                              </TouchableOpacity>
                            ) : isDispatchedDeliveryOrder(order) ? (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionDisabledBg]}
                                disabled={true}
                                onPress={() =>
                                  showAlert(
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

                            {/* BUTTON: Cancel (Disabled once payment is received or completed) */}
                            {order.payment_status === 'paid' || order.status === 'completed' ? (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionDisabledBg]}
                                disabled={true}
                                onPress={() =>
                                  showAlert(
                                    'Cancellation Locked',
                                    'Cannot cancel an order that is already completed or paid. Please use Refund / Void workflow.'
                                  )
                                }
                              >
                                <Text style={styles.actionBtnTextMuted}>🔒 Cancel</Text>
                              </TouchableOpacity>
                            ) : Number(order.paid_amount || 0) > 0 ? (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionDisabledBg]}
                                onPress={() =>
                                  showAlert(
                                    'Cannot Cancel Order',
                                    `₹${order.paid_amount} has already been received. Refund/Void payment before cancelling.`
                                  )
                                }
                              >
                                <Text style={styles.actionBtnTextMuted}>🔒 Cancel</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={[styles.gridActionBtn, styles.actionCancelBg]}
                                onPress={() => setCancelOrderModal(order)}
                              >
                                <Text style={styles.actionBtnTextRed}>❌ Cancel</Text>
                              </TouchableOpacity>
                            )}

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
                      <TouchableOpacity
                        style={[styles.actionBtnViewFull, { width: '100%' }]}
                        onPress={() => setViewReasonModal(order)}
                      >
                        <Text style={styles.actionBtnTextDark}>👁️ Reason</Text>
                      </TouchableOpacity>
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
            isMobile && { paddingHorizontal: 10, paddingVertical: 10 },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              width: '100%',
              maxWidth: 580,
              maxHeight: windowHeight * (isMobile ? 0.95 : 0.9),
              flexShrink: 1,
            }}
          >
            <View style={[styles.modalContent, isMobile && { padding: 12, borderRadius: 16 }, { maxHeight: '100%', display: 'flex' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    Edit Order #{editOrderModal?.order_number}
                  </Text>
                  <Text style={styles.modalSubTitle} numberOfLines={1}>
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

                    <Text style={styles.editItemTotal}>
                      {formatCurrency((Number(itm.unit_price) && Number(itm.quantity)) ? (Number(itm.unit_price) * Number(itm.quantity)) : (Number(itm.subtotal) || Number(itm.total) || 0))}
                    </Text>
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
                    {Boolean(editCustomerPhone && !isValidIndianPhone(editCustomerPhone)) && (
                      <Text style={{ fontSize: 10, color: '#dc2626', fontWeight: '700', marginTop: 2 }}>
                        ⚠️ Enter a valid 10-digit Indian mobile number
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
                    {Boolean(settings?.is_gst_enabled !== false && (editTotals.cgstAmount + editTotals.sgstAmount > 0)) && (() => {
                      const editTaxRate = settings?.default_tax_rate !== undefined && settings?.default_tax_rate !== null ? Number(settings.default_tax_rate) : 5.0;
                      const editHalfRate = editTaxRate / 2;
                      const editHalfRateStr = editHalfRate % 1 === 0 ? `${editHalfRate}` : `${editHalfRate.toFixed(1)}`;
                      return (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, color: '#64748b' }}>CGST ({editHalfRateStr}%) + SGST ({editHalfRateStr}%):</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{formatCurrency(editTotals.cgstAmount + editTotals.sgstAmount)}</Text>
                        </View>
                      );
                    })()}
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
        <View style={[styles.modalOverlay, isMobile && { paddingHorizontal: 10 }]}>
          <View style={[styles.cancelModalContent, isMobile && { padding: 14, borderRadius: 16 }]}>
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
      {/* 2.5. VIEW CANCELLATION REASON MODAL                         */}
      {/* ============================================================ */}
      <Modal visible={Boolean(viewReasonModal)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 500, width: '100%', padding: 20 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  Order #{viewReasonModal?.order_number} Cancelled
                </Text>
                <Text style={styles.modalSubTitle}>
                  {viewReasonModal?.order_type ? viewReasonModal.order_type.toUpperCase() : ''}
                  {viewReasonModal?.table_number ? ` • Table ${viewReasonModal.table_number}` : ''}
                  {viewReasonModal?.customer_name ? ` • ${viewReasonModal.customer_name}` : ''}
                  {viewReasonModal?.created_at ? ` • 🕒 ${formatOrderDateTime(viewReasonModal.created_at)}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setViewReasonModal(null)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', borderRadius: 10, padding: 14, marginVertical: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#991b1b', marginBottom: 6 }}>
                📋 CANCELLATION REASON / AUDIT DETAILS:
              </Text>
              <Text style={{ fontSize: 14, color: '#7f1d1d', lineHeight: 22, fontWeight: '600' }}>
                {cleanCustomerOrderNotes(viewReasonModal?.notes) || viewReasonModal?.notes || 'No cancellation reason specified.'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.modalCloseSmallBtn, { paddingHorizontal: 24, paddingVertical: 10 }]}
                onPress={() => setViewReasonModal(null)}
              >
                <Text style={[styles.modalCloseSmallText, { fontSize: 14, fontWeight: '700' }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 2.8. PARTIAL PAYMENT MODAL                                   */}
      {/* ============================================================ */}
      <Modal visible={Boolean(partialPayModal)} transparent animationType="slide">
        <View
          style={[
            styles.modalOverlay,
            isMobile && { paddingHorizontal: 10, paddingVertical: 10 },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              width: '100%',
              maxWidth: 540,
              maxHeight: windowHeight * (isMobile ? 0.95 : 0.9),
              flexShrink: 1,
            }}
          >
            <View style={[styles.modalContent, isMobile && { padding: 12, borderRadius: 16 }, { maxHeight: '100%', display: 'flex' }]}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    💳 Record Payment #{partialPayModal?.order_number}
                  </Text>
                  <Text style={styles.modalSubTitle} numberOfLines={1}>
                    {partialPayModal?.order_type.toUpperCase()} • {partialPayModal?.table_number ? formatTableLabel(partialPayModal.table_number) : partialPayModal?.customer_name || 'Walk-in'} • 🕒 {formatOrderDateTime(partialPayModal?.created_at)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPartialPayModal(null)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                {/* 1. FINANCIAL SUMMARY CARD */}
                {(() => {
                  const payable = Number(partialPayModal?.payable_amount ?? partialPayModal?.grand_total ?? 0);
                  const paid = Number(partialPayModal?.paid_amount ?? 0);
                  const balance = Math.max(0, payable - paid);
                  return (
                    <View style={styles.orderFinanceBox}>
                      <View style={styles.orderFinanceCol}>
                        <Text style={styles.orderFinanceLabel}>Total Bill</Text>
                        <Text style={styles.orderFinanceVal}>{formatCurrency(payable)}</Text>
                      </View>
                      <View style={styles.orderFinanceDivider} />
                      <View style={styles.orderFinanceCol}>
                        <Text style={styles.orderFinanceLabel}>Already Paid</Text>
                        <Text style={[styles.orderFinanceVal, { color: paid > 0 ? '#15803d' : '#64748b' }]}>
                          {formatCurrency(paid)}
                        </Text>
                      </View>
                      <View style={styles.orderFinanceDivider} />
                      <View style={styles.orderFinanceCol}>
                        <Text style={styles.orderFinanceLabel}>Remaining Due</Text>
                        <Text style={[styles.orderFinanceVal, { color: balance > 0 ? '#b45309' : '#15803d', fontWeight: '900' }]}>
                          {formatCurrency(balance)}
                        </Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Info Note */}
                <View style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: '#bfdbfe' }}>
                  <Text style={{ fontSize: 11, color: '#1e40af', fontWeight: '600', lineHeight: 15 }}>
                    💡 Money received is recorded immediately into Day Register sales. Order stays ACTIVE until final settlement.
                  </Text>
                </View>

                {/* 2. PAYMENT METHOD SELECTION */}
                <Text style={styles.fieldLabel}>Select Payment Mode *</Text>
                <View style={[styles.payMethodsGrid, isMobile && { flexWrap: 'wrap', gap: 6 }]}>
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
                        isMobile && { width: '48%', flex: 0, flexGrow: 1, minWidth: 110 },
                        partialPayMethod === m.id && styles.payMethodBtnActive,
                      ]}
                      onPress={() => setPartialPayMethod(m.id as any)}
                    >
                      <Text
                        style={[
                          styles.payMethodText,
                          partialPayMethod === m.id && styles.payMethodTextActive,
                        ]}
                      >
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 3. PAYMENT AMOUNT / SPLIT ENTRY */}
                {partialPayMethod === 'split' ? (
                  <View style={{ marginVertical: 6 }}>
                    <Text style={styles.fieldLabel}>Split Breakdown:</Text>
                    {partialPaySplits.map((sp, idx) => (
                      <View key={sp.id} style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 8, marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155' }}>Split #{idx + 1}</Text>
                          {partialPaySplits.length > 1 && (
                            <TouchableOpacity
                              onPress={() => setPartialPaySplits(partialPaySplits.filter((item) => item.id !== sp.id))}
                              style={{ paddingHorizontal: 6, paddingVertical: 2 }}
                            >
                              <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700' }}>✕ Remove</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
                          {(['cash', 'upi', 'card'] as PaymentMethod[]).map((sm) => (
                            <TouchableOpacity
                              key={sm}
                              style={[
                                { flex: 1, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', backgroundColor: '#ffffff' },
                                sp.method === sm && { backgroundColor: '#0f172a', borderColor: '#0f172a' },
                              ]}
                              onPress={() => {
                                setPartialPaySplits(partialPaySplits.map((item) => (item.id === sp.id ? { ...item, method: sm } : item)));
                              }}
                            >
                              <Text style={[{ fontSize: 10, fontWeight: '700', color: '#334155' }, sp.method === sm && { color: '#ffffff' }]}>
                                {sm.toUpperCase()}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TextInput
                            style={[styles.fieldInput, { flex: 1 }]}
                            placeholder="Amount (₹)"
                            placeholderTextColor="#64748b"
                            keyboardType="numeric"
                            value={sp.amount}
                            onChangeText={(val) => {
                              const clean = val.replace(/[^0-9.]/g, '');
                              setPartialPaySplits(partialPaySplits.map((item) => (item.id === sp.id ? { ...item, amount: clean } : item)));
                            }}
                          />
                          <TextInput
                            style={[styles.fieldInput, { flex: 1.2 }]}
                            placeholder="Ref # (optional)"
                            placeholderTextColor="#64748b"
                            value={sp.ref}
                            onChangeText={(val) => {
                              setPartialPaySplits(partialPaySplits.map((item) => (item.id === sp.id ? { ...item, ref: val } : item)));
                            }}
                          />
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={{ paddingVertical: 6, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' }}
                      onPress={() => {
                        setPartialPaySplits([...partialPaySplits, { id: String(Date.now()), method: 'upi', amount: '', ref: '' }]);
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563eb' }}>+ Add Another Split Method</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ marginVertical: 4 }}>
                    <Text style={styles.fieldLabel}>Amount to Pay (₹) *</Text>
                    <TextInput
                      style={[styles.fieldInput, { fontSize: 15, fontWeight: '800' }]}
                      placeholder="Enter amount"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                      value={partialPayAmount}
                      onChangeText={(val) => setPartialPayAmount(val.replace(/[^0-9.]/g, ''))}
                    />

                    {/* Quick Pill Buttons */}
                    {(() => {
                      const payable = Number(partialPayModal?.payable_amount ?? partialPayModal?.grand_total ?? 0);
                      const paid = Number(partialPayModal?.paid_amount ?? 0);
                      const balance = Math.max(0, payable - paid);
                      const quickAmounts = [balance, 100, 200, 500, 1000, 2000].filter(
                        (amt, idx, arr) => amt > 0 && amt <= balance && arr.indexOf(amt) === idx
                      );
                      return (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                          {quickAmounts.map((amt) => (
                            <TouchableOpacity
                              key={amt}
                              style={{
                                backgroundColor: partialPayAmount === String(amt) ? '#2563eb' : '#f1f5f9',
                                borderWidth: 1,
                                borderColor: partialPayAmount === String(amt) ? '#1d4ed8' : '#cbd5e1',
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 6,
                                marginRight: 6,
                              }}
                              onPress={() => setPartialPayAmount(String(amt))}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '800',
                                  color: partialPayAmount === String(amt) ? '#ffffff' : '#334155',
                                }}
                              >
                                {amt === balance ? `Full Due (${formatCurrency(amt)})` : formatCurrency(amt)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      );
                    })()}

                    {/* Reference # */}
                    <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Transaction Reference # (Optional):</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. UPI Ref / Card Last 4 Digits"
                      placeholderTextColor="#64748b"
                      value={partialPayRef}
                      onChangeText={setPartialPayRef}
                    />
                  </View>
                )}

                {/* Notes */}
                <Text style={styles.fieldLabel}>Payment Notes / Remarks (Optional):</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Guest paid cash part upfront"
                  placeholderTextColor="#64748b"
                  value={partialPayNotes}
                  onChangeText={setPartialPayNotes}
                />

                {/* Submit Partial Payment Button */}
                {(() => {
                  const effectiveAmount =
                    partialPayMethod === 'split'
                      ? partialPaySplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
                      : parseFloat(partialPayAmount) || 0;
                  const payable = Number(partialPayModal?.payable_amount ?? partialPayModal?.grand_total ?? 0);
                  const paid = Number(partialPayModal?.paid_amount ?? 0);
                  const balance = Math.max(0, payable - paid);
                  const isOver = effectiveAmount > balance;
                  const isInvalid = effectiveAmount <= 0 || isOver;

                  return (
                    <TouchableOpacity
                      style={[styles.saveModalBtn, (recordingPartialPayment || isInvalid) && styles.btnDisabled]}
                      onPress={handleConfirmPartialPayment}
                      disabled={recordingPartialPayment || isInvalid}
                    >
                      {recordingPartialPayment ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.saveModalBtnText}>
                          {isOver
                            ? `OVERPAYMENT (MAX ${formatCurrency(balance)})`
                            : `RECORD PAYMENT OF ${formatCurrency(effectiveAmount)}`}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })()}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 3. CLOSE ORDER & PAYMENT SETTLEMENT MODAL                    */}
      {/* ============================================================ */}
      <Modal visible={Boolean(payOrderModal)} transparent animationType="slide">
        <View
          style={[
            styles.modalOverlay,
            isMobile && { paddingHorizontal: 10, paddingVertical: 10 },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              width: '100%',
              maxWidth: 580,
              maxHeight: windowHeight * (isMobile ? 0.95 : 0.9),
              flexShrink: 1,
            }}
          >
            <View style={[styles.modalContent, isMobile && { padding: 12, borderRadius: 16 }, { maxHeight: '100%', display: 'flex' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    Close Order & Settle Bill #{payOrderModal?.order_number}
                  </Text>
                  <Text style={styles.modalSubTitle} numberOfLines={1}>
                    {payOrderModal?.order_type.toUpperCase()} • {payOrderModal?.table_number ? formatTableLabel(payOrderModal.table_number) : (payOrderModal?.customer_name || 'Walk-in')} • 🕒 {formatOrderDateTime(payOrderModal?.created_at)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setPayOrderModal(null)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                  <View style={[styles.discountTypeRow, isMobile && { flexWrap: 'wrap' }]}>
                    <TouchableOpacity
                      style={[styles.discTypeBtn, isMobile && { minWidth: 90 }, payDiscountType === 'none' && styles.discTypeBtnActive]}
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
                      style={[styles.discTypeBtn, isMobile && { minWidth: 90 }, payDiscountType === 'fixed' && styles.discTypeBtnActive]}
                      onPress={() => setPayDiscountType('fixed')}
                    >
                      <Text style={[styles.discTypeText, payDiscountType === 'fixed' && styles.discTypeTextActive]}>
                        ₹ Rupees
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.discTypeBtn, isMobile && { minWidth: 90 }, payDiscountType === 'percentage' && styles.discTypeBtnActive]}
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

                  {Boolean(settings?.is_gst_enabled !== false && ((payTotals?.cgstAmount || 0) > 0 || (payTotals?.sgstAmount || 0) > 0)) && (() => {
                    const payTaxRate = (payOrderModal as any)?.tax_rate !== undefined && (payOrderModal as any)?.tax_rate !== null
                      ? Number((payOrderModal as any).tax_rate)
                      : (settings?.default_tax_rate !== undefined && settings?.default_tax_rate !== null ? Number(settings.default_tax_rate) : 5.0);
                    const payHalfRate = payTaxRate / 2;
                    const payHalfRateStr = payHalfRate % 1 === 0 ? `${payHalfRate}` : `${payHalfRate.toFixed(1)}`;
                    return (
                      <>
                        <View style={styles.billRow}>
                          <Text style={styles.billLabel}>CGST ({payHalfRateStr}%):</Text>
                          <Text style={styles.billVal}>{formatCurrency(payTotals?.cgstAmount || 0)}</Text>
                        </View>

                        <View style={styles.billRow}>
                          <Text style={styles.billLabel}>SGST ({payHalfRateStr}%):</Text>
                          <Text style={styles.billVal}>{formatCurrency(payTotals?.sgstAmount || 0)}</Text>
                        </View>
                      </>
                    );
                  })()}

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
                    <Text style={styles.billTotalLabel}>Total Order Amount:</Text>
                    <Text style={styles.billTotalVal}>{formatCurrency(payTotals?.payableAmount || 0)}</Text>
                  </View>
                  <Text style={styles.wordsText}>
                    ({numberToWords(payTotals?.payableAmount || 0)})
                  </Text>

                  {/* Partial Payments Accounting in Settlement Modal */}
                  {(() => {
                    const finalPayable = payTotals?.payableAmount ?? payOrderModal?.payable_amount ?? 0;
                    const alreadyPaid = Number(payOrderModal?.paid_amount || 0);
                    const remainingBalance = Math.max(0, finalPayable - alreadyPaid);

                    if (alreadyPaid > 0) {
                      return (
                        <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f0fdf4', padding: 8, borderRadius: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534' }}>Already Collected (Paid):</Text>
                            <Text style={{ fontSize: 11, fontWeight: '900', color: '#15803d' }}>{formatCurrency(alreadyPaid)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 12, fontWeight: '900', color: remainingBalance > 0 ? '#b45309' : '#15803d' }}>
                              Remaining Balance to Settle:
                            </Text>
                            <Text style={{ fontSize: 13, fontWeight: '900', color: remainingBalance > 0 ? '#b45309' : '#15803d' }}>
                              {formatCurrency(remainingBalance)}
                            </Text>
                          </View>
                          {remainingBalance <= 0 && (
                            <Text style={{ fontSize: 10, color: '#15803d', fontWeight: '700', marginTop: 4 }}>
                              ✓ Order fully paid beforehand. Settle will complete the order and release table.
                            </Text>
                          )}
                        </View>
                      );
                    }
                    return null;
                  })()}
                </View>

                {/* Payment Method Selector (For any remaining balance) */}
                {(() => {
                  const finalPayable = payTotals?.payableAmount ?? payOrderModal?.payable_amount ?? 0;
                  const alreadyPaid = Number(payOrderModal?.paid_amount || 0);
                  const remainingBalance = Math.max(0, finalPayable - alreadyPaid);

                  if (remainingBalance <= 0) return null;

                  return (
                    <>
                      <Text style={styles.fieldLabel}>Payment Mode for Remaining Balance ({formatCurrency(remainingBalance)}) *</Text>
                      <View style={[styles.payMethodsGrid, isMobile && { flexWrap: 'wrap', gap: 6 }]}>
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
                              isMobile && { width: '48%', flex: 0, flexGrow: 1, minWidth: 120 },
                              payMethod === m.id && styles.payMethodBtnActive,
                            ]}
                            onPress={() => setPayMethod(m.id as any)}
                          >
                            <Text
                              style={[
                                styles.payMethodText,
                                payMethod === m.id && styles.payMethodTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {m.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  );
                })()}

                {/* Payment Received Toggle (Yes/No) */}
                <Text style={styles.fieldLabel}>Payment Status *</Text>
                <View style={[{ flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 10 }]}>
                  <TouchableOpacity
                    style={[styles.recBtn, isMobile && { width: '100%', flex: 0 }, payReceived && styles.recBtnActive]}
                    onPress={() => setPayReceived(true)}
                  >
                    <Text style={[styles.recBtnText, payReceived && styles.recBtnTextActive]}>
                      ✓ Settled & Paid in Full
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.recBtn, isMobile && { width: '100%', flex: 0 }, !payReceived && styles.recBtnUnpaidActive]}
                    onPress={() => setPayReceived(false)}
                  >
                    <Text style={[styles.recBtnText, !payReceived && styles.recBtnTextActive]}>
                      ⚠️ Delivery COD / Unpaid
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
                    {!payGstinValidation.isValid && Boolean(payGstinValidation.error) && (
                      <Text style={{ color: '#ef4444', fontSize: 10, marginTop: 3, fontWeight: '700' }}>
                        ⚠️ {payGstinValidation.error}
                      </Text>
                    )}
                  </View>
                )}

                {/* Confirm Close Button */}
                {(() => {
                  const finalPayable = payTotals?.payableAmount ?? payOrderModal?.payable_amount ?? 0;
                  const alreadyPaid = Number(payOrderModal?.paid_amount || 0);
                  const remainingBalance = Math.max(0, finalPayable - alreadyPaid);

                  return (
                    <TouchableOpacity
                      style={[styles.saveModalBtn, (closingOrder || !payGstinValidation.isValid) && styles.btnDisabled]}
                      onPress={handleConfirmCloseAndPay}
                      disabled={closingOrder || !payGstinValidation.isValid}
                    >
                      {closingOrder ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.saveModalBtnText}>
                          {remainingBalance <= 0
                            ? 'SETTLE ORDER & RELEASE TABLE (₹0 DUE)'
                            : `COLLECT ${formatCurrency(remainingBalance)} & SETTLE BILL`}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })()}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 4. VIEW FINAL BILL / TAX INVOICE MODAL                      */}
      {/* ============================================================ */}
      {viewOrderModal && (() => {
        const isTaxInvoice =
          settings?.is_gst_enabled !== false &&
          ((viewOrderModal.cgst_amount || 0) > 0 ||
           (viewOrderModal.sgst_amount || 0) > 0 ||
           (settings?.tax_invoice_enabled !== false && Boolean(settings?.gstin?.trim())));
        const invNo = viewOrderModal.invoice_number || viewOrderModal.order_number;
        const dynamicTaxRate = (viewOrderModal as any).tax_rate !== undefined && (viewOrderModal as any).tax_rate !== null
          ? Number((viewOrderModal as any).tax_rate)
          : (Number(settings?.default_tax_rate) > 0 ? Number(settings.default_tax_rate) : 5.0);
        const halfRate = (dynamicTaxRate / 2) % 1 === 0 ? String(dynamicTaxRate / 2) : (dynamicTaxRate / 2).toFixed(1);
        const subtotalVal = getOrderSubtotal(viewOrderModal);
        const isPaid = viewOrderModal.payment_status === 'paid';
        const isCompleted = viewOrderModal.status === 'completed';

        return (
          <Modal visible={Boolean(viewOrderModal)} transparent animationType="slide">
            <View style={[styles.modalOverlay, isMobile && { paddingHorizontal: 8, paddingVertical: 12 }]}>
              <View
                style={[
                  styles.modalContent,
                  isMobile && { padding: 12, borderRadius: 16 },
                  {
                    maxHeight: windowHeight * (isMobile ? 0.95 : 0.9),
                    maxWidth: 540,
                    width: '100%',
                    display: 'flex',
                  },
                ]}
              >
                {/* Header */}
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, paddingRight: 8 }}>
                    {formatLogoDataUri(activeRestaurant?.logo_url || settings.logo_url) ? (
                      <Image
                        source={{ uri: formatLogoDataUri(activeRestaurant?.logo_url || settings.logo_url) }}
                        style={{ width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', flexShrink: 0 }}
                        resizeMode="contain"
                      />
                    ) : null}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.modalTitle, { fontSize: 15 }]} numberOfLines={1}>
                        {isTaxInvoice ? 'Tax Invoice' : 'Retail Bill'} #{invNo}
                      </Text>
                      <Text style={[styles.modalSubTitle, { fontSize: 11 }]} numberOfLines={1}>
                        {activeRestaurant?.name || settings.name}
                        {isTaxInvoice && settings.gstin ? ` • GSTIN: ${settings.gstin}` : ''}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setViewOrderModal(null)}
                    style={[styles.modalCloseBtn, { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={true}
                  style={{ flexShrink: 1 }}
                  contentContainerStyle={{ paddingBottom: 16 }}
                >
                  {/* Order Metadata Card */}
                  <View style={styles.invoiceMetaCard}>
                    <View style={styles.invoiceMetaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invoiceMetaLabel}>ORDER ID</Text>
                        <Text style={styles.invoiceMetaVal}>#{viewOrderModal.order_number}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.invoiceMetaLabel}>TYPE</Text>
                        <Text style={[styles.invoiceMetaVal, { color: '#2563eb' }]}>
                          {viewOrderModal.order_type.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.invoiceMetaDivider} />

                    <View style={styles.invoiceMetaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invoiceMetaLabel}>DATE & TIME</Text>
                        <Text style={styles.invoiceMetaVal}>{formatOrderDateTime(viewOrderModal.created_at)}</Text>
                      </View>
                      {viewOrderModal.table_number ? (
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={styles.invoiceMetaLabel}>TABLE</Text>
                          <Text style={styles.invoiceMetaVal}>{formatTableLabel(viewOrderModal.table_number)}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.invoiceMetaDivider} />

                    <View style={styles.invoiceMetaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invoiceMetaLabel}>CUSTOMER</Text>
                        <Text style={styles.invoiceMetaVal}>{viewOrderModal.customer_name || 'Walk-in Guest'}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.invoiceMetaLabel}>PHONE</Text>
                        <Text style={styles.invoiceMetaVal}>{viewOrderModal.customer_phone || 'N/A'}</Text>
                      </View>
                    </View>

                    {isTaxInvoice && viewOrderModal.customer_gstin ? (
                      <>
                        <View style={styles.invoiceMetaDivider} />
                        <View style={styles.invoiceMetaRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.invoiceMetaLabel}>CUSTOMER GSTIN (B2B)</Text>
                            <Text style={[styles.invoiceMetaVal, { color: '#1d4ed8' }]}>{viewOrderModal.customer_gstin}</Text>
                          </View>
                        </View>
                      </>
                    ) : null}

                    {isTaxInvoice ? (
                      <>
                        <View style={styles.invoiceMetaDivider} />
                        <View style={styles.invoiceMetaRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.invoiceMetaLabel}>PLACE OF SUPPLY</Text>
                            <Text style={styles.invoiceMetaVal}>{settings?.state || 'West Bengal'} ({settings?.state_code || '19'})</Text>
                          </View>
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Text style={styles.invoiceMetaLabel}>REVERSE CHARGE</Text>
                            <Text style={styles.invoiceMetaVal}>No</Text>
                          </View>
                        </View>
                      </>
                    ) : null}

                    <View style={styles.invoiceMetaDivider} />

                    <View style={styles.invoiceMetaRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invoiceMetaLabel}>ORDER STATUS</Text>
                        <View style={[styles.invoiceStatusPill, isCompleted ? styles.invoiceStatusCompleted : styles.invoiceStatusActive]}>
                          <Text style={[styles.invoiceStatusPillText, isCompleted ? { color: '#15803d' } : { color: '#1d4ed8' }]}>
                            {viewOrderModal.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.invoiceMetaLabel}>PAYMENT</Text>
                        <View style={[styles.invoiceStatusPill, isPaid ? styles.invoiceStatusPaid : styles.invoiceStatusUnpaid]}>
                          <Text style={[styles.invoiceStatusPillText, isPaid ? { color: '#15803d' } : { color: '#dc2626' }]}>
                            {isPaid ? `✓ PAID (${(viewOrderModal.payment_method || 'PAID').toUpperCase()})` : '⚠️ UNPAID'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Payment Proof Banner (if present) */}
                  {viewOrderModal.payment_proof_url ? (
                    <View style={styles.invoiceProofCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#0f172a' }}>
                          📸 Customer Online Payment Proof:
                        </Text>
                        <View style={{ backgroundColor: isPaid ? '#dcfce7' : '#eff6ff', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: isPaid ? '#15803d' : '#1d4ed8' }}>
                            {isPaid ? '✓ VERIFIED & PAID' : Boolean(viewOrderModal.payment_verified_at) ? '✓ PAYMENT VERIFIED' : 'PENDING'}
                          </Text>
                        </View>
                      </View>
                      <Image
                        source={{ uri: viewOrderModal.payment_proof_url }}
                        style={{ width: '100%', height: 200, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' }}
                        resizeMode="contain"
                      />
                    </View>
                  ) : null}

                  {/* Items Card */}
                  <View style={styles.invoiceItemsCard}>
                    <Text style={styles.invoiceSectionTitle}>ORDERED ITEMS ({viewOrderModal.items?.length || 0})</Text>
                    {(viewOrderModal.items || []).map((itm, i) => (
                      <View key={itm.id || i} style={styles.invoiceItemRow}>
                        <View style={styles.invoiceQtyBadge}>
                          <Text style={styles.invoiceQtyText}>{itm.quantity}x</Text>
                        </View>
                        <Text style={styles.invoiceItemName} numberOfLines={2}>{itm.product_name}</Text>
                        <Text style={styles.invoiceItemPrice}>
                          {formatCurrency((Number(itm.unit_price) && Number(itm.quantity)) ? (Number(itm.unit_price) * Number(itm.quantity)) : (Number(itm.subtotal) || Number(itm.total) || 0))}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Financial Breakdown Card */}
                  <View style={styles.invoiceTotalsCard}>
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Subtotal</Text>
                      <Text style={styles.invoiceVal}>{formatCurrency(subtotalVal)}</Text>
                    </View>

                    {Boolean(viewOrderModal.discount_amount && viewOrderModal.discount_amount > 0) && (
                      <View style={styles.invoiceRow}>
                        <Text style={[styles.invoiceLabel, { color: '#16a34a', fontWeight: '700' }]}>
                          Discount {viewOrderModal.discount_type === 'percentage' ? `(${viewOrderModal.discount_value || ''}%)` : (viewOrderModal.discount_value ? `(₹${viewOrderModal.discount_value})` : '')}
                        </Text>
                        <Text style={[styles.invoiceVal, { color: '#16a34a', fontWeight: '800' }]}>
                          -{formatCurrency(viewOrderModal.discount_amount)}
                        </Text>
                      </View>
                    )}

                    {Boolean(viewOrderModal.coupon_discount && viewOrderModal.coupon_discount > 0) && (
                      <View style={styles.invoiceRow}>
                        <Text style={[styles.invoiceLabel, { color: '#16a34a', fontWeight: '700' }]}>
                          Coupon ({viewOrderModal.coupon_code || ''})
                        </Text>
                        <Text style={[styles.invoiceVal, { color: '#16a34a', fontWeight: '800' }]}>
                          -{formatCurrency(viewOrderModal.coupon_discount)}
                        </Text>
                      </View>
                    )}

                    {isTaxInvoice && (viewOrderModal.cgst_amount || 0) + (viewOrderModal.sgst_amount || 0) > 0 ? (
                      <>
                        <View style={styles.invoiceRow}>
                          <Text style={styles.invoiceLabel}>Taxable Amount</Text>
                          <Text style={styles.invoiceVal}>
                            {formatCurrency(viewOrderModal.taxable_amount !== undefined && viewOrderModal.taxable_amount > 0 ? viewOrderModal.taxable_amount : Math.max(0, subtotalVal - (viewOrderModal.discount_amount || 0) - (viewOrderModal.coupon_discount || 0)))}
                          </Text>
                        </View>
                        <View style={styles.invoiceRow}>
                          <Text style={styles.invoiceLabel}>CGST ({halfRate}%)</Text>
                          <Text style={styles.invoiceVal}>{formatCurrency(viewOrderModal.cgst_amount || 0)}</Text>
                        </View>
                        <View style={styles.invoiceRow}>
                          <Text style={styles.invoiceLabel}>SGST ({halfRate}%)</Text>
                          <Text style={styles.invoiceVal}>{formatCurrency(viewOrderModal.sgst_amount || 0)}</Text>
                        </View>
                      </>
                    ) : null}

                    {Boolean(viewOrderModal.delivery_charge && viewOrderModal.delivery_charge > 0) && (
                      <View style={styles.invoiceRow}>
                        <Text style={styles.invoiceLabel}>Delivery Charge</Text>
                        <Text style={styles.invoiceVal}>{formatCurrency(viewOrderModal.delivery_charge)}</Text>
                      </View>
                    )}

                    {Boolean(viewOrderModal.round_off) && (
                      <View style={styles.invoiceRow}>
                        <Text style={styles.invoiceLabel}>Round Off</Text>
                        <Text style={styles.invoiceVal}>
                          {viewOrderModal.round_off > 0 ? '+' : ''}{formatCurrency(viewOrderModal.round_off)}
                        </Text>
                      </View>
                    )}

                    {/* Grand Total Banner */}
                    <View style={styles.invoiceGrandTotalBanner}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.invoiceGrandTotalLabel}>Grand Total</Text>
                        <Text style={styles.invoiceGrandTotalVal}>{formatCurrency(viewOrderModal.payable_amount)}</Text>
                      </View>
                      <Text style={styles.invoiceWordsText}>
                        ({numberToWords(viewOrderModal.payable_amount || 0)})
                      </Text>
                    </View>
                  </View>

                  {/* Print and Share buttons */}
                  <View style={[styles.invoiceActionsRow, isMobile && styles.invoiceActionsCol]}>
                    <TouchableOpacity
                      style={[styles.invoiceActionBtn, styles.invoiceBtnThermal]}
                      onPress={() => printService.printFinalReceiptThermal(viewOrderModal, settings, user?.full_name)}
                    >
                      <Text style={styles.invoiceBtnText}>🖨️ Thermal Bill</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.invoiceActionBtn, styles.invoiceBtnKot]}
                      onPress={() => printService.printKotThermal(viewOrderModal, settings)}
                    >
                      <Text style={styles.invoiceBtnText}>🖨️ KOT Slip</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.invoiceActionBtn, styles.invoiceBtnA4]}
                      onPress={() => printService.printTaxInvoiceA4(viewOrderModal, settings)}
                    >
                      <Text style={styles.invoiceBtnText}>📄 Tax Invoice A4</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  refreshHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    gap: 4,
  },
  refreshHeaderBtnText: {
    fontSize: 11,
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
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  subTitle: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 1,
  },
  search: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    height: 32,
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '500',
  },
  categoryTabRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },
  categoryTabBtn: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  categoryTabText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  categoryTabTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 4,
  },
  tabBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabBtnActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  tabText: {
    fontSize: 10.5,
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
    padding: 10,
    gap: 10,
  },
  listGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 10,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
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
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flexShrink: 1,
  },
  orderNum: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0f172a',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    alignSelf: 'center',
  },
  typeBadgeText: {
    fontSize: 9.5,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    alignSelf: 'center',
  },
  statusConfirmed: { backgroundColor: '#eff6ff' },
  statusPreparing: { backgroundColor: '#fef3c7' },
  statusReady: { backgroundColor: '#e0e7ff' },
  statusServed: { backgroundColor: '#dcfce7' },
  statusCompleted: { backgroundColor: '#f1f5f9' },
  statusCancelled: { backgroundColor: '#fee2e2' },
  statusOutForDelivery: { backgroundColor: '#ffedd5' },
  statusBadgeText: { fontSize: 9.5, fontWeight: '900' },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
    flexWrap: 'wrap',
    gap: 4,
  },
  custText: { fontSize: 11.5, color: '#334155' },
  timeText: { fontSize: 10.5, color: '#64748b' },
  tableTextInline: { fontSize: 11.5, color: '#334155' },
  tableText: { fontSize: 11.5, fontWeight: '700', color: '#0f172a', marginVertical: 1 },
  addressText: { fontSize: 10.5, color: '#64748b', marginVertical: 1 },
  itemsBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  itemsTitle: { fontSize: 9.5, fontWeight: '800', color: '#64748b', marginBottom: 2, textTransform: 'uppercase' },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 1, paddingVertical: 1 },
  itemQty: { width: 20, fontSize: 11, fontWeight: '900', color: '#2563eb' },
  itemName: { flex: 1, fontSize: 11.5, fontWeight: '700', color: '#0f172a' },
  itemPrice: { fontSize: 11.5, fontWeight: '800', color: '#334155' },
  notesBox: {
    backgroundColor: '#fffbeb',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    marginBottom: 4,
  },
  notesText: { fontSize: 10.5, color: '#b45309', fontWeight: '600' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    paddingTop: 6,
    marginBottom: 6,
  },
  payableLabel: { fontSize: 9.5, color: '#64748b', fontWeight: '700' },
  payableVal: { fontSize: 15, fontWeight: '900', color: '#16a34a' },
  payStatusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, alignSelf: 'stretch', alignItems: 'center' },
  payStatusPaid: { backgroundColor: '#dcfce7' },
  payStatusUnpaid: { backgroundColor: '#fee2e2' },
  payStatusText: { fontSize: 9.5, fontWeight: '900' },
  payStatusTextPaid: { color: '#15803d' },
  payStatusTextUnpaid: { color: '#b91c1c' },
  cardActionsGrid: {
    marginTop: 2,
  },
  cardActionRow: {
    flexDirection: 'row',
    gap: 5,
  },
  gridActionBtn: {
    flex: 1,
    paddingVertical: 5.5,
    paddingHorizontal: 3,
    minHeight: 29,
    borderRadius: 6,
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
  actionPaymentBg: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
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
  actionBtnTextKot: { color: '#c2410c', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextDispatch: { color: '#c2410c', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextDelivered: { color: '#15803d', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextPayment: { color: '#1d4ed8', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextHold: { color: '#d97706', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextResume: { color: '#059669', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextBlue: { color: '#1d4ed8', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextRed: { color: '#e11d48', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextGreen: { color: '#ffffff', fontSize: 10.5, fontWeight: '900' },
  actionBtnTextWhite: { color: '#ffffff', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextDark: { color: '#334155', fontSize: 10.5, fontWeight: '800' },
  actionBtnTextMuted: { color: '#94a3b8', fontSize: 9.5, fontWeight: '800' },
  orderFinanceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  orderFinanceCol: {
    flex: 1,
    alignItems: 'center',
  },
  orderFinanceDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#cbd5e1',
  },
  orderFinanceLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  orderFinanceVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 1,
  },
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
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
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
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginVertical: 2 },
  billLabel: { fontSize: 11, color: '#64748b', flexShrink: 1 },
  billVal: { fontSize: 11, fontWeight: '700', color: '#0f172a' },
  billTotalRow: { borderTopWidth: 1, borderColor: '#cbd5e1', paddingTop: 6, marginTop: 4 },
  billTotalLabel: { fontSize: 13, fontWeight: '900', color: '#0f172a' },
  billTotalVal: { fontSize: 16, fontWeight: '900', color: '#16a34a' },
  wordsText: { fontSize: 9, fontStyle: 'italic', color: '#64748b', marginTop: 2 },
  payMethodsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
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
    color: '#475569',
    fontSize: 10.5,
    fontWeight: '700',
  },
  invoiceMetaCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
  },
  invoiceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invoiceMetaDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 6,
  },
  invoiceMetaLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  invoiceMetaVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  invoiceStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  invoiceStatusCompleted: {
    backgroundColor: '#dcfce7',
  },
  invoiceStatusActive: {
    backgroundColor: '#dbeafe',
  },
  invoiceStatusPaid: {
    backgroundColor: '#dcfce7',
  },
  invoiceStatusUnpaid: {
    backgroundColor: '#fee2e2',
  },
  invoiceStatusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  invoiceProofCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 10,
    marginBottom: 10,
  },
  invoiceItemsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
  },
  invoiceSectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  invoiceItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  invoiceQtyBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  invoiceQtyText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563eb',
  },
  invoiceItemName: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  invoiceItemPrice: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  invoiceTotalsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2.5,
  },
  invoiceLabel: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '600',
  },
  invoiceVal: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '700',
  },
  invoiceGrandTotalBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  invoiceGrandTotalLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#166534',
  },
  invoiceGrandTotalVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#15803d',
  },
  invoiceWordsText: {
    fontSize: 9.5,
    fontStyle: 'italic',
    color: '#166534',
    marginTop: 2,
  },
  invoiceActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  invoiceActionsCol: {
    flexDirection: 'column',
    gap: 8,
  },
  invoiceActionBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  invoiceBtnThermal: {
    backgroundColor: '#0f172a',
  },
  invoiceBtnKot: {
    backgroundColor: '#ea580c',
  },
  invoiceBtnA4: {
    backgroundColor: '#2563eb',
  },
  invoiceBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
