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
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { orderService, resolveOrderSource } from '../../src/services/api/orderService';
import { productService } from '../../src/services/api/productService';
import { tableService } from '../../src/services/api/tableService';
import { kotService } from '../../src/services/api/kotService';
import { printService, formatLogoDataUri } from '../../src/services/printService';
import { Order, OrderItem, OrderStatus, OrderSource, Product, DiningTable, RestaurantSettings, PaymentMethod } from '../../src/types';
import { formatCurrency, numberToWords } from '../../src/utils/currency';
import { getOrderSubtotal, calculateOrderTotals } from '../../src/utils/gst';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { printedKotTracker } from '../../src/utils/printedKotTracker';
import { cleanCustomerOrderNotes } from '../../src/utils/orderNotes';
import { isValidPhoneNumber } from '../../src/utils/phone';

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openOrderId } = useLocalSearchParams<{ openOrderId?: string }>();
  const { user, activeRestaurantId, activeRestaurant } = useAuth();
  const { settings } = useSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
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
  const [editDiscount, setEditDiscount] = useState<string>('0');
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

  const loadData = async () => {
    try {
      setLoading(true);
      const [orderList, prodList, tableList] = await Promise.all([
        orderService.getOrders(activeRestaurantId),
        productService.getProducts(activeRestaurantId),
        tableService.getTables(activeRestaurantId),
      ]);
      setOrders(orderList);
      setProducts(prodList);
      setTables(tableList);
    } catch (err: any) {
      console.warn('Failed to load orders data:', err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [activeRestaurantId])
  );

  // Auto-navigate to the correct tab/filter when redirected from KOT dispatch
  // Does NOT open the popup — popup should only appear after Settle Order
  const handledOpenOrderIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (openOrderId && orders.length > 0 && handledOpenOrderIdRef.current !== openOrderId) {
      handledOpenOrderIdRef.current = openOrderId;
      const targetOrder = orders.find((o) => o.id === openOrderId);
      if (targetOrder) {
        // Switch to the correct category tab
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

  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyHasMore, setHistoryHasMore] = useState<boolean>(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState<boolean>(false);

  const loadMoreHistoryOrders = async () => {
    if (!activeRestaurantId || loadingMoreHistory || !historyHasMore) return;
    try {
      setLoadingMoreHistory(true);
      const nextPage = historyPage + 1;
      const res = await orderService.getOrdersPaginated({
        restaurantId: activeRestaurantId,
        statusGroup: 'completed',
        page: nextPage,
        pageSize: 30,
      });

      setOrders((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        const newOnes = res.orders.filter((o) => !existingIds.has(o.id));
        return [...prev, ...newOnes];
      });
      setHistoryPage(nextPage);
      setHistoryHasMore(res.hasMore);
    } catch (e) {
      console.warn('Failed to load more completed orders:', e);
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  useEffect(() => {
    // 45-second low-frequency reconciliation fetch (Realtime handles instant changes)
    const interval = setInterval(async () => {
      if (activeRestaurantId) {
        const refreshed = await orderService.getOrders(activeRestaurantId);
        setOrders(refreshed);
      }
    }, 45000);
    return () => clearInterval(interval);
  }, [activeRestaurantId]);

  // Categorized order partitions
  const isOnlineDeliveryOrder = (o: Order): boolean => {
    const src = resolveOrderSource(o);
    if (src === 'CUSTOMER_APP') return true;
    if (o.order_type === 'delivery') return true;
    if (Boolean(o.delivery_address && o.delivery_address.trim())) return true;
    if (o.notes?.includes('[ONLINE_DELIVERY]') || o.notes?.includes('[DELIVERY]')) return true;
    if (o.created_by === 'CUSTOMER_APP' || o.created_by === 'CUSTOMER') return true;
    return false;
  };

  const isQrDigitalMenuOrder = (o: Order): boolean => {
    // Explicitly exclude any delivery / online app order from QR tab
    if (isOnlineDeliveryOrder(o)) return false;
    // POS orders with [POS] tag should never be classified as QR
    if (o.notes?.includes('[POS]')) return false;
    const src = resolveOrderSource(o);
    if (src === 'CUSTOMER_QR') return true;
    if (o.notes?.includes('[QR_DINE_IN]') || o.notes?.includes('[QR_ORDER]') || o.notes?.includes('QR')) return true;
    if (o.order_type === 'dine_in' && o.created_by !== 'POS_STAFF') {
      return Boolean(o.table_id || o.table_number);
    }
    return false;
  };

  const isPosOrder = (o: Order): boolean => {
    if (isOnlineDeliveryOrder(o) || isQrDigitalMenuOrder(o)) return false;
    const src = resolveOrderSource(o);
    return Boolean(src === 'POS' || o.created_by === 'POS_STAFF' || o.notes?.includes('[POS]'));
  };

  const onlineOrders = orders.filter(isOnlineDeliveryOrder);
  const qrOrders = orders.filter(isQrDigitalMenuOrder);
  const posOrders = orders.filter(isPosOrder);

  const currentCategoryOrders =
    categoryTab === 'pos'
      ? posOrders
      : categoryTab === 'online'
      ? onlineOrders
      : qrOrders;

  // Filtered orders within active category and status
  const filteredOrders = currentCategoryOrders.filter((o) => {
    const isActive = ['confirmed', 'held', 'kot_generated', 'preparing', 'ready', 'served', 'out_for_delivery'].includes(o.status);
    const isCompleted = ['delivered', 'completed'].includes(o.status);
    if (tabFilter === 'active' && !isActive) return false;
    if (tabFilter === 'completed' && !isCompleted) return false;
    if (tabFilter === 'cancelled' && o.status !== 'cancelled') return false;

    if (search) {
      const q = search.toLowerCase();
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.customer_phone && o.customer_phone.includes(q)) ||
        (o.table_number && o.table_number.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Open Edit Modal
  const openEditModal = (ord: Order) => {
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
    setEditDiscount(String(ord.discount_amount || 0));
    setEditReason('Item adjustment / guest request');
    setProdSearch('');
  };

  // Add Product to Edit list
  const handleAddProductToEdit = (prod: Product) => {
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
    const disc = parseFloat(editDiscount) || 0;
    const discType = editOrderModal.discount_type && editOrderModal.discount_type !== 'none'
      ? editOrderModal.discount_type
      : (disc > 0 ? 'fixed' : undefined);
    return calculateOrderTotals({
      items: editItems,
      discountType: discType,
      discountValue: disc,
      couponDiscount: editOrderModal.coupon_discount || 0,
      deliveryCharge: editOrderModal.delivery_charge || 0,
    });
  }, [editOrderModal, editItems, editDiscount]);

  // Save Edit Order
  const handleSaveEditOrder = async () => {
    if (!editOrderModal) return;
    if (editItems.length === 0) {
      Alert.alert('Empty Order', 'An order must contain at least one item.');
      return;
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
        discountAmount: parseFloat(editDiscount) || 0,
        reason: editReason.trim() || 'Active order modified from POS',
      });

      if ((updated as any).latest_kot) {
        printService.printKotThermal(updated, settings, (updated as any).latest_kot);
      }

      setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));

      Alert.alert(
        'Order Updated',
        `Order #${updated.order_number} has been updated.\nOrder items and bill recalculated successfully.${
          (updated as any).latest_kot ? '\n\n📄 Kitchen KOT ticket for new items generated & printed.' : ''
        }`
      );
      setEditOrderModal(null);
      await loadData();
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
      await orderService.cancelActiveOrder(cancelOrderModal.id, finalReason);
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
      const hasExistingKot = Boolean(order.kots && order.kots.length > 0);

      if (isOnlineDelivery && !hasExistingKot) {
        // Generate and persist initial KOT in database
        const newKot = await kotService.generateKot(order, 'Online Delivery Kitchen Slip');
        await printService.printKotThermal(order, settings, newKot, false);
        await printedKotTracker.markKotAsAutoPrinted(newKot.id, newKot.kitchen_notes);
        await orderService.updateOrderStatus(order.id, 'kot_generated');
        await loadData();
        Alert.alert('🖨️ KOT Generated & Printed', `KOT #${newKot.kot_number} generated for kitchen.`);
      } else {
        // Manual reprint of existing KOT
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
              await orderService.updateOrderStatus(order.id, 'completed');
              await orderService.updatePaymentStatus(order.id, 'paid');
              await loadData();
              Alert.alert('✅ Completed', `Order #${order.order_number} marked Delivered & Paid.`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
        {
          text: 'Delivered (Keep Payment UNPAID)',
          onPress: async () => {
            try {
              await orderService.updateOrderStatus(order.id, 'completed');
              await loadData();
              Alert.alert('✅ Delivered', `Order #${order.order_number} marked Delivered (Payment Unpaid).`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openPayModal = (order: Order) => {
    setPayOrderModal(order);
    setPayMethod('cash');
    setPayReceived(true);
    setPayTxnRef('');
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

    return calculateOrderTotals({
      items: payOrderModal.items || [],
      subtotal: paySubtotal,
      discountType: payDiscountType === 'none' ? undefined : payDiscountType,
      discountValue: validatedPayDiscount,
      couponDiscount: payOrderModal.coupon_discount || 0,
      deliveryCharge: payOrderModal.delivery_charge || 0,
    });
  }, [payOrderModal, payDiscountType, validatedPayDiscount, paySubtotal]);

  // Close & Pay Order confirmation
  const handleConfirmCloseAndPay = async () => {
    if (!payOrderModal) return;

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
          <View>
            <Text style={styles.title}>Orders Feed & Operations ({orders.length})</Text>
            <Text style={styles.subTitle}>Live dining, takeaway, online delivery & customer QR orders</Text>
          </View>
        </View>

        {/* 3 Main Order Source Tabs */}
        <View style={styles.categoryTabRow}>
          <TouchableOpacity
            style={[styles.categoryTabBtn, categoryTab === 'pos' && styles.categoryTabBtnActive]}
            onPress={() => setCategoryTab('pos')}
          >
            <Text style={[styles.categoryTabText, categoryTab === 'pos' && styles.categoryTabTextActive]}>
              🍽️ Dine In & Takeaway ({posOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="orders-tab-online"
            style={[styles.categoryTabBtn, categoryTab === 'online' && styles.categoryTabBtnActive]}
            onPress={() => setCategoryTab('online')}
          >
            <Text style={[styles.categoryTabText, categoryTab === 'online' && styles.categoryTabTextActive]}>
              🌐 Online Delivery ({onlineOrders.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.categoryTabBtn, categoryTab === 'qr' && styles.categoryTabBtnActive]}
            onPress={() => setCategoryTab('qr')}
          >
            <Text style={[styles.categoryTabText, categoryTab === 'qr' && styles.categoryTabTextActive]}>
              📱 QR Digital Menu ({qrOrders.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TextInput
          style={styles.search}
          placeholder="Search by Order #, Customer, Phone, Table..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />

        {/* Status Sub-filter Pills */}
        <View style={styles.tabRow}>
          {[
            {
              id: 'active',
              label: `🔥 Active (${currentCategoryOrders.filter((o) => ['confirmed', 'held', 'kot_generated', 'preparing', 'ready', 'served', 'out_for_delivery'].includes(o.status)).length})`,
            },
            {
              id: 'completed',
              label: `✓ Completed (${currentCategoryOrders.filter((o) => ['delivered', 'completed'].includes(o.status)).length})`,
            },
            {
              id: 'cancelled',
              label: `✕ Cancelled (${currentCategoryOrders.filter((o) => o.status === 'cancelled').length})`,
            },
            { id: 'all', label: `All (${currentCategoryOrders.length})` },
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
        <View style={styles.centerLoading}>
          <Text style={{ fontSize: 36 }}>📋</Text>
          <Text style={styles.emptyTitle}>No Orders Found</Text>
          <Text style={styles.emptySub}>
            {tabFilter === 'active'
              ? 'No active orders right now. Create an order in the POS terminal!'
              : 'No orders match your current filter.'}
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push('/(admin)/pos')}
          >
            <Text style={styles.emptyBtnText}>Go to POS Terminal</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            isTwoColumn && styles.listGrid,
            { paddingBottom: 24 },
          ]}
          showsVerticalScrollIndicator={true}
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
            const createdTime = order.created_at ? new Date(order.created_at).toLocaleTimeString() : 'Just now';

            // Real table resolution with section
            const linkedTable = tables.find((t) => t.id === order.table_id || t.table_number === order.table_number);
            const tableDisplayName = linkedTable
              ? (linkedTable.section ? `${linkedTable.table_number} (${linkedTable.section})` : linkedTable.table_number)
              : order.table_number || '';

            // Unified Single Type badge label & style
            let typeBadgeLabel = '🍽️ DINE IN';
            let typeBadgeStyle: any = styles.posSource;
            let typeBadgeTextStyle: any = { color: '#334155' };

            if (isCustomerQr) {
              typeBadgeLabel = `📱 QR • Table ${tableDisplayName || order.table_number || 'Table'}`;
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
              typeBadgeLabel = `🍽️ DINE IN • Table ${tableDisplayName || order.table_number || 'Table'}`;
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
                ]}
              >
                {/* Card Header: Order #, Unified Type Badge, Status Badge */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.orderNum}>#{order.order_number}</Text>
                    <View style={[styles.typeBadge, typeBadgeStyle]}>
                      <Text style={[styles.typeBadgeText, typeBadgeTextStyle]}>{typeBadgeLabel}</Text>
                    </View>
                  </View>

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
                    📱 Scanned Table QR: <Text style={{ fontWeight: '800', color: '#7c3aed' }}>Table {tableDisplayName}</Text>
                  </Text>
                ) : order.order_type === 'dine_in' && tableDisplayName ? (
                  <Text style={styles.tableText}>
                    🪑 Dining Table: <Text style={{ fontWeight: '800', color: '#0f172a' }}>Table {tableDisplayName}</Text>
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
                      const hasKot = Boolean((order.kots && order.kots.length > 0) || ['kot_generated', 'preparing', 'ready', 'out_for_delivery', 'served', 'completed', 'delivered'].includes(order.status));
                      const isDispatched = order.status === 'out_for_delivery' || ['delivered', 'completed'].includes(order.status);

                      return (
                        <>
                          {/* ROW 1: 3 Buttons (KOT, Dispatch/Delivered/View, Hold/Resume) */}
                          <View style={styles.cardActionRow}>
                            {/* BUTTON 1: KOT Action */}
                            {isOnlineDelivery ? (
                              hasKot ? (
                                <TouchableOpacity
                                  style={[styles.gridActionBtn, styles.actionDisabledBg]}
                                  disabled={true}
                                >
                                  <Text style={styles.actionBtnTextMuted}>✓ KOT Generated</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity
                                  testID={`order-kot-btn-${order.id}`}
                                  style={[styles.gridActionBtn, styles.actionKotBg]}
                                  onPress={() => handlePrintOrGenerateKot(order)}
                                >
                                  <Text style={styles.actionBtnTextKot}>🖨️ KOT</Text>
                                </TouchableOpacity>
                              )
                            ) : (
                              <TouchableOpacity
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
                                onPress={() => setViewOrderModal(order)}
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
                            <TouchableOpacity
                              style={[styles.gridActionBtn, styles.actionEditBg]}
                              onPress={() => openEditModal(order)}
                            >
                              <Text style={styles.actionBtnTextBlue}>✏️ Edit</Text>
                            </TouchableOpacity>

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
                          onPress={() => setViewOrderModal(order)}
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

          {/* Load More Completed Orders Button */}
          {(tabFilter === 'completed' || tabFilter === 'cancelled' || tabFilter === 'all') && historyHasMore && (
            <View style={{ width: '100%', paddingVertical: 16, alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: '#0F172A',
                  paddingVertical: 10,
                  paddingHorizontal: 24,
                  borderRadius: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
                onPress={loadMoreHistoryOrders}
                disabled={loadingMoreHistory}
              >
                {loadingMoreHistory ? (
                  <ActivityIndicator size="small" color="#0F172A" />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                    ⬇️ Load More Past Orders
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
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
                    Add/remove items & recalculate order bill
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
                        style={styles.stepperBtn}
                        onPress={() => handleAdjustEditQty(itm.product_id, itm.quantity + 1)}
                      >
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.editItemTotal}>{formatCurrency(itm.total)}</Text>
                  </View>
                ))}

                {/* Search & Add New Products */}
                <Text style={styles.fieldSectionHeader}>Add Items to Order:</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Search catalog dishes to add..."
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
                <Text style={styles.fieldLabel}>Discount Amount (₹):</Text>
                <TextInput
                  style={styles.fieldInput}
                  keyboardType="numeric"
                  value={editDiscount}
                  onChangeText={setEditDiscount}
                />

                {/* Reason for Modification */}
                <Text style={styles.fieldLabel}>Reason for Edit (Audit Log):</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Added 1x Naan, reduced 1x Biryani per guest request"
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
                        <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '600' }}>Discount:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>-{formatCurrency(editTotals.discountAmount)}</Text>
                      </View>
                    )}
                    {editTotals.couponDiscount > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '600' }}>Coupon Discount:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>-{formatCurrency(editTotals.couponDiscount)}</Text>
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
                    {payOrderModal?.order_type.toUpperCase()} • {payOrderModal?.table_number ? `Table ${payOrderModal.table_number}` : payOrderModal?.customer_name}
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
                  value={payTxnRef}
                  onChangeText={setPayTxnRef}
                />

                {/* Confirm Close Button */}
                <TouchableOpacity
                  style={[styles.saveModalBtn, closingOrder && styles.btnDisabled]}
                  onPress={handleConfirmCloseAndPay}
                  disabled={closingOrder}
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
      {viewOrderModal && (
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
                    <Text style={styles.modalTitle}>Tax Invoice #{viewOrderModal.order_number}</Text>
                    <Text style={styles.modalSubTitle}>
                      {activeRestaurant?.name || settings.name} • GSTIN: {settings.gstin}
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
                    <Text><Text style={{ fontWeight: '700' }}>Order Type:</Text> {viewOrderModal.order_type.toUpperCase()}</Text>
                    <Text><Text style={{ fontWeight: '700' }}>Table:</Text> {viewOrderModal.table_number || 'N/A'}</Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text><Text style={{ fontWeight: '700' }}>Customer:</Text> {viewOrderModal.customer_name || 'Guest'}</Text>
                    <Text><Text style={{ fontWeight: '700' }}>Phone:</Text> {viewOrderModal.customer_phone || 'N/A'}</Text>
                  </View>
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
                      <Text>{itm.quantity}x {itm.product_name}</Text>
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

                  <View style={styles.billRow}>
                    <Text>Taxable Amount:</Text>
                    <Text>{formatCurrency(Math.max(0, getOrderSubtotal(viewOrderModal) - (viewOrderModal.discount_amount || 0) - (viewOrderModal.coupon_discount || 0)))}</Text>
                  </View>

                  <View style={styles.billRow}>
                    <Text>CGST (2.5%):</Text>
                    <Text>{formatCurrency(viewOrderModal.cgst_amount)}</Text>
                  </View>
                  <View style={styles.billRow}>
                    <Text>SGST (2.5%):</Text>
                    <Text>{formatCurrency(viewOrderModal.sgst_amount)}</Text>
                  </View>

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
      )}
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
    marginBottom: 8,
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
});
