import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Product,
  OrderItem,
  OrderType,
  DiningTable,
  Coupon,
  Order,
  KOT,
  PaymentMethod,
} from '../types';
import { calculateOrderTotals, CalculationResult } from '../utils/gst';
import { validateCoupon } from '../utils/validators';
import { orderService } from '../services/api/orderService';
import { kotService } from '../services/api/kotService';
import { dayRegisterService } from '../services/api/dayRegisterService';
import { mockStorage } from '../services/mockStorage';
import { useSettings } from './SettingsContext';
import { useNotification } from './NotificationContext';
import { useAuth } from './AuthContext';
import { printService } from '../services/printService';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { DEFAULT_RESTAURANT_ID } from '../services/api/restaurantService';
import { printedKotTracker } from '../utils/printedKotTracker';

interface CustomerInfo {
  name: string;
  phone: string;
  address?: string;
  landmark?: string;
  deliveryCharge?: number;
}

interface PosContextType {
  cartItems: OrderItem[];
  orderType: OrderType;
  selectedTable: DiningTable | null;
  customerInfo: CustomerInfo;
  orderNotes: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  appliedCoupon: Coupon | null;
  totals: CalculationResult;

  setOrderType: (type: OrderType) => void;
  setSelectedTable: (table: DiningTable | null) => void;
  setCustomerInfo: (info: Partial<CustomerInfo>) => void;
  setOrderNotes: (notes: string) => void;
  addToCart: (product: Product, quantity?: number, notes?: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  setItemNotes: (productId: string, notes: string) => void;
  setDiscount: (type: 'percentage' | 'fixed', value: number) => void;
  applyCouponCode: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  clearCart: () => void;

  heldOrders: Order[];
  holdCurrentOrder: () => Promise<Order | null>;
  resumeHeldOrder: (orderId: string) => Promise<void>;
  holdOrder: (orderId: string) => Promise<Order>;
  resumeOrder: (orderId: string) => Promise<Order>;

  activeOrders: Order[];
  refreshOrders: () => Promise<void>;
  pendingCustomerOrders: Order[];
  acceptCustomerOrder: (orderId: string) => Promise<void>;
  rejectCustomerOrder: (orderId: string) => Promise<void>;

  confirmOrder: () => Promise<Order>;
  updateActiveOrder: (orderId: string, reason?: string) => Promise<Order>;
  updateOrderPricesOnly: (orderId: string, reason?: string) => Promise<Order>;
  loadOrderIntoCart: (order: Order) => void;
  generateKot: (order: Order, kitchenNotes?: string) => Promise<KOT>;
  processPayment: (
    orderId: string,
    paymentMethod: PaymentMethod,
    amount: number,
    ref?: string,
    discountData?: {
      discount_type?: 'none' | 'fixed' | 'percentage';
      discount_value?: number;
      discount_amount?: number;
      taxable_amount?: number;
      cgst_amount?: number;
      sgst_amount?: number;
      grand_total?: number;
      round_off?: number;
      payable_amount?: number;
    }
  ) => Promise<Order>;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

export const PosProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const { showToast, playOrderBell } = useNotification();
  const { activeRestaurantId, user } = useAuth();

  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [orderType, setOrderTypeState] = useState<OrderType>('dine_in');
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [customerInfo, setCustomerInfoState] = useState<CustomerInfo>({ name: '', phone: '' });
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);

  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [heldOrders, setHeldOrders] = useState<Order[]>([]);
  const [pendingCustomerOrders, setPendingCustomerOrders] = useState<Order[]>([]);

  const refreshOrders = useCallback(async () => {
    if (!activeRestaurantId) return;
    const orders = await orderService.getOrders(activeRestaurantId);
    setActiveOrders(orders);

    const held = orders.filter((o) => o.status === 'held');
    setHeldOrders(held);

    const pending = orders.filter((o) => o.status === 'draft' && o.customer_name);
    setPendingCustomerOrders(pending);
  }, [activeRestaurantId]);

  useEffect(() => {
    refreshOrders();

    // Setup Supabase Realtime Listener for Instant Order Notifications
    if (isSupabaseConfigured) {
      const channelName = `realtime_orders_${Date.now()}`;
      const ordersChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            console.log('Realtime Order Event Received:', payload);
            showToast('info', 'Order Update', 'Live order status updated from cloud');
            playOrderBell();
            refreshOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ordersChannel);
      };
    } else {
      // Fallback polling for offline/local mode
      const interval = setInterval(() => {
        refreshOrders();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [refreshOrders, showToast, playOrderBell]);

  const setOrderType = (type: OrderType) => {
    setOrderTypeState(type);
    if (type !== 'dine_in') {
      setSelectedTable(null);
    }
  };

  const setCustomerInfo = (info: Partial<CustomerInfo>) => {
    setCustomerInfoState((prev) => ({ ...prev, ...info }));
  };

  const addToCart = (product: Product, quantity = 1, notes = '') => {
    if (orderType === 'dine_in' && !selectedTable) {
      showToast('error', 'Select Table First', 'Please select a dining table before adding items for Dine In.');
      return;
    }

    setCartItems((prev) => {
      const existingIdx = prev.findIndex((item) => item.product_id === product.id);
      if (existingIdx !== -1) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + quantity;
        const unitPrice = product.discounted_price || product.price;
        const taxRate = product.tax_rate;
        const subtotal = newQty * unitPrice;
        const taxAmount = (subtotal * taxRate) / 100;

        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          subtotal,
          tax_amount: taxAmount,
          total: subtotal + taxAmount,
          item_notes: notes || updated[existingIdx].item_notes,
        };
        return updated;
      }

      const unitPrice = product.discounted_price || product.price;
      const taxRate = product.tax_rate;
      const subtotal = quantity * unitPrice;
      const taxAmount = (subtotal * taxRate) / 100;

      const newItem: OrderItem = {
        id: 'item-' + Date.now() + Math.random().toString(36).substr(2, 4),
        order_id: '',
        product_id: product.id,
        product_name: product.name,
        unit_price: unitPrice,
        quantity,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        item_notes: notes,
        subtotal,
        total: subtotal + taxAmount,
        image_url: product.image_url,
      };

      return [...prev, newItem];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.product_id === productId) {
          const subtotal = quantity * item.unit_price;
          const taxAmount = (subtotal * item.tax_rate) / 100;
          return {
            ...item,
            quantity,
            subtotal,
            tax_amount: taxAmount,
            total: subtotal + taxAmount,
          };
        }
        return item;
      })
    );
  };

  const removeItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const setItemNotes = (productId: string, notes: string) => {
    setCartItems((prev) =>
      prev.map((item) => (item.product_id === productId ? { ...item, item_notes: notes } : item))
    );
  };

  const setDiscount = (type: 'percentage' | 'fixed', value: number) => {
    setDiscountType(type);
    setDiscountValue(Math.max(0, value));
  };

  const applyCouponCode = (code: string) => {
    const coupons = mockStorage.getCoupons();
    const coupon = coupons.find((c) => c.code.toUpperCase() === code.trim().toUpperCase());

    if (!coupon) {
      return { success: false, message: 'Invalid coupon code.' };
    }

    const currentTotals = calculateOrderTotals({
      items: cartItems,
      discountType,
      discountValue,
      serviceChargeRate: settings.service_charge_rate,
      deliveryCharge: orderType === 'delivery' ? (customerInfo.deliveryCharge || 0) : 0,
    });

    const validation = validateCoupon(coupon, currentTotals.subtotal);
    if (!validation.isValid) {
      return { success: false, message: validation.message };
    }

    setAppliedCoupon(coupon);
    return { success: true, message: 'Coupon applied!' };
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  const clearCart = () => {
    setCartItems([]);
    setSelectedTable(null);
    setCustomerInfoState({ name: '', phone: '' });
    setOrderNotes('');
    setDiscountValue(0);
    setAppliedCoupon(null);
  };

  const totals = calculateOrderTotals({
    items: cartItems,
    discountType,
    discountValue,
    coupon: appliedCoupon,
    serviceChargeRate: settings.service_charge_rate,
    deliveryCharge: orderType === 'delivery' ? (customerInfo.deliveryCharge || 0) : 0,
  });

  const holdCurrentOrder = async (): Promise<Order | null> => {
    if (cartItems.length === 0) return null;

    const targetRestId = activeRestaurantId || settings.restaurant_id || DEFAULT_RESTAURANT_ID;
    const heldOrder = await orderService.createOrder({
      restaurant_id: targetRestId,
      order_source: 'POS',
      created_by: user?.id,
      order_type: orderType,
      table_id: selectedTable?.id,
      table_number: selectedTable?.table_number,
      customer_name: customerInfo.name || 'Guest',
      customer_phone: customerInfo.phone,
      status: 'held',
      subtotal: totals.subtotal,
      discount_type: discountValue > 0 ? discountType : 'none',
      discount_value: discountValue,
      discount_amount: totals.discountAmount,
      coupon_code: appliedCoupon?.code,
      coupon_discount: totals.couponDiscount,
      taxable_amount: totals.taxableSubtotal,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      service_charge: totals.serviceCharge,
      grand_total: totals.rawTotal,
      round_off: totals.roundOff,
      payable_amount: totals.payableAmount,
      items: cartItems,
      notes: orderNotes ? `[POS] ${orderNotes}` : '[POS]',
    });

    showToast('info', 'Order Held', `Order #${heldOrder.order_number} put on hold.`);
    clearCart();
    await refreshOrders();
    return heldOrder;
  };

  const resumeHeldOrder = async (orderId: string): Promise<void> => {
    const order = activeOrders.find((o) => o.id === orderId) || (await orderService.getOrderById(orderId));
    if (!order) return;

    loadOrderIntoCart(order);
    await orderService.resumeOrder(orderId);
    showToast('success', 'Order Resumed into POS', `Order #${order.order_number} loaded into active terminal.`);
    await refreshOrders();
  };

  const holdOrder = async (orderId: string): Promise<Order> => {
    const updated = await orderService.holdOrder(orderId);
    showToast('info', 'Order Put on Hold', `Order #${updated.order_number} is now on hold.`);
    await refreshOrders();
    return updated;
  };

  const resumeOrder = async (orderId: string): Promise<Order> => {
    const updated = await orderService.resumeOrder(orderId);
    showToast('success', 'Order Resumed', `Order #${updated.order_number} has been resumed.`);
    await refreshOrders();
    return updated;
  };

  const confirmOrder = async (): Promise<Order> => {
    console.log('>>> [POS] confirmOrder entered! activeRestaurantId:', activeRestaurantId, 'settings.restaurant_id:', settings.restaurant_id, 'cartItems:', cartItems.length);
    const targetRestId = activeRestaurantId || settings.restaurant_id || DEFAULT_RESTAURANT_ID;
    const isRegOpen = await dayRegisterService.isRegisterOpen(targetRestId);
    console.log('>>> [POS] isRegisterOpen for', targetRestId, ':', isRegOpen);
    if (!isRegOpen) {
      throw new Error(
        'Restaurant Register is CLOSED. Please open the register from the Dashboard (Analytics & Operations) before placing POS orders.'
      );
    }

    if (cartItems.length === 0) {
      throw new Error('Please add at least one item to the cart before sending to kitchen.');
    }

    if (orderType === 'dine_in') {
      if (!selectedTable) {
        throw new Error('Please select a dining table for Dine In orders.');
      }
    } else if (orderType === 'takeaway') {
      if (!customerInfo.name?.trim()) {
        throw new Error('Customer Name is required for Takeaway orders.');
      }
      if (!customerInfo.phone?.trim()) {
        throw new Error('Customer Phone Number is required for Takeaway orders.');
      }
    } else if (orderType === 'delivery') {
      if (!customerInfo.name?.trim()) {
        throw new Error('Customer Name is required for Delivery orders.');
      }
      if (!customerInfo.phone?.trim()) {
        throw new Error('Customer Phone Number is required for Delivery orders.');
      }
      if (!customerInfo.address?.trim()) {
        throw new Error('Delivery Address is required for Delivery orders.');
      }
    }

    const newOrder = await orderService.createOrder({
      restaurant_id: targetRestId,
      order_source: 'POS',
      created_by: user?.id,
      order_type: orderType,
      table_id: selectedTable?.id,
      table_number: selectedTable?.table_number,
      customer_name: customerInfo.name?.trim() || (orderType === 'dine_in' ? 'Dine-in Guest' : 'Customer'),
      customer_phone: customerInfo.phone?.trim(),
      delivery_address: customerInfo.address?.trim(),
      delivery_landmark: customerInfo.landmark?.trim(),
      delivery_charge: customerInfo.deliveryCharge || 0,
      status: 'confirmed',
      payment_status: 'unpaid',
      subtotal: totals.subtotal,
      discount_type: discountValue > 0 ? discountType : 'none',
      discount_value: discountValue,
      discount_amount: totals.discountAmount,
      coupon_code: appliedCoupon?.code,
      coupon_discount: totals.couponDiscount,
      taxable_amount: totals.taxableSubtotal,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      service_charge: totals.serviceCharge,
      grand_total: totals.rawTotal,
      round_off: totals.roundOff,
      payable_amount: totals.payableAmount,
      items: cartItems,
      notes: orderNotes ? `[POS] ${orderNotes}` : '[POS]',
    });

    // Use the initial KOT generated with the order, or generate if missing
    const initialKot = (newOrder.kots && newOrder.kots.length > 0)
      ? newOrder.kots[0]
      : await kotService.generateKot(newOrder, orderNotes);

    if (settings.auto_print_kot) {
      const alreadyPrinted = await printedKotTracker.hasKotBeenAutoPrinted(initialKot);
      if (!alreadyPrinted) {
        await printService.printKotThermal(newOrder, settings, initialKot, false);
        await printedKotTracker.markKotAsAutoPrinted(initialKot.id, initialKot.kitchen_notes);
      }
    }

    showToast('success', 'Order & KOT Dispatched!', `Order #${newOrder.order_number} sent to Kitchen (KOT #${initialKot.kot_number}).`);
    clearCart();
    await refreshOrders();
    return newOrder;
  };

  const loadOrderIntoCart = (order: Order) => {
    if (!order) return;
    setCartItems(order.items || []);
    setOrderTypeState(order.order_type);
    setOrderNotes(order.notes?.replace('[POS]', '').trim() || '');
    if (order.table_id) {
      const tables = mockStorage.getTables();
      setSelectedTable(tables.find((t) => t.id === order.table_id) || {
        id: order.table_id,
        table_number: order.table_number || 'T1',
        restaurant_id: order.restaurant_id,
        seating_capacity: 4,
        section: 'Ground Floor',
        qr_code_hash: '',
        is_active: true,
        status: 'occupied',
      });
    }
    setCustomerInfoState({
      name: order.customer_name || '',
      phone: order.customer_phone || '',
      address: order.delivery_address,
      landmark: order.delivery_landmark,
      deliveryCharge: order.delivery_charge,
    });
    if (order.discount_type && order.discount_type !== 'none') {
      setDiscountType(order.discount_type);
      setDiscountValue(order.discount_value || order.discount_amount || 0);
    } else {
      setDiscountValue(0);
    }
  };

  const updateActiveOrder = async (orderId: string, reason?: string): Promise<Order> => {
    if (cartItems.length === 0) {
      throw new Error('Order must contain at least one item.');
    }

    const updated = await orderService.editActiveOrder({
      orderId,
      updatedItems: cartItems,
      customerName: customerInfo.name?.trim() || (orderType === 'dine_in' ? 'Dine-in Guest' : 'Customer'),
      customerPhone: customerInfo.phone?.trim(),
      deliveryAddress: customerInfo.address?.trim(),
      deliveryLandmark: customerInfo.landmark?.trim(),
      deliveryCharge: customerInfo.deliveryCharge || 0,
      tableId: selectedTable?.id,
      tableNumber: selectedTable?.table_number,
      notes: orderNotes ? `[POS] ${orderNotes}` : '[POS]',
      discountAmount: totals.discountAmount,
      couponCode: appliedCoupon?.code,
      couponDiscount: totals.couponDiscount,
      reason: reason || 'Updated from POS Terminal',
    });

    if ((updated as any).latest_kot) {
      const deltaKot = (updated as any).latest_kot;
      if (settings.auto_print_kot) {
        const alreadyPrinted = await printedKotTracker.hasKotBeenAutoPrinted(deltaKot);
        if (!alreadyPrinted) {
          await printService.printKotThermal(updated, settings, deltaKot, false);
          await printedKotTracker.markKotAsAutoPrinted(deltaKot.id, deltaKot.kitchen_notes);
        }
      }
      showToast('success', 'New Item KOT Saved', `Sent KOT #${deltaKot.kot_number} for new items.`);
    } else {
      showToast('success', 'Order Updated', `Order #${updated.order_number} successfully updated.`);
    }

    await refreshOrders();
    return updated;
  };

  const updateOrderPricesOnly = async (orderId: string, reason?: string): Promise<Order> => {
    if (cartItems.length === 0) {
      throw new Error('Order must contain at least one item.');
    }

    const updated = await orderService.editActiveOrder({
      orderId,
      updatedItems: cartItems,
      customerName: customerInfo.name?.trim() || (orderType === 'dine_in' ? 'Dine-in Guest' : 'Customer'),
      customerPhone: customerInfo.phone?.trim(),
      deliveryAddress: customerInfo.address?.trim(),
      deliveryLandmark: customerInfo.landmark?.trim(),
      deliveryCharge: customerInfo.deliveryCharge || 0,
      tableId: selectedTable?.id,
      tableNumber: selectedTable?.table_number,
      notes: orderNotes ? `[POS] ${orderNotes}` : '[POS]',
      discountAmount: totals.discountAmount,
      couponCode: appliedCoupon?.code,
      couponDiscount: totals.couponDiscount,
      reason: reason || 'Price & details updated from POS',
    });

    showToast('success', 'Prices & Details Updated', `Order #${updated.order_number} updated.`);
    await refreshOrders();
    return updated;
  };

  const generateKot = async (order: Order, kitchenNotes?: string, itemsToInclude?: OrderItem[]): Promise<KOT> => {
    const kot = await kotService.generateKot(order, kitchenNotes, itemsToInclude);
    showToast('warning', 'KOT Generated!', `KOT #${kot.kot_number} created.`);
    printService.printKotThermal(order, settings, kot);
    await refreshOrders();
    return kot;
  };

  const processPayment = async (
    orderId: string,
    paymentMethod: PaymentMethod,
    amount: number,
    ref?: string,
    discountData?: {
      discount_type?: 'none' | 'fixed' | 'percentage';
      discount_value?: number;
      discount_amount?: number;
      taxable_amount?: number;
      cgst_amount?: number;
      sgst_amount?: number;
      grand_total?: number;
      round_off?: number;
      payable_amount?: number;
    }
  ): Promise<Order> => {
    const updatedOrder = await orderService.closeAndSettleOrder(orderId, {
      payment_method: paymentMethod,
      amount,
      reference_number: ref,
      ...discountData,
    });

    showToast('success', 'Payment Completed & Bill Closed', `Order #${updatedOrder.order_number} finalized.`);
    // Auto-print final thermal receipt with persisted numbers
    await printService.printFinalReceiptThermal(updatedOrder, settings);

    clearCart();
    await refreshOrders();
    return updatedOrder;
  };

  const acceptCustomerOrder = async (orderId: string) => {
    await orderService.updateOrderStatus(orderId, 'confirmed');
    showToast('success', 'Customer Order Accepted', `Order #${orderId} accepted.`);
    await refreshOrders();
  };

  const rejectCustomerOrder = async (orderId: string) => {
    await orderService.updateOrderStatus(orderId, 'cancelled');
    showToast('error', 'Customer Order Rejected', `Order #${orderId} rejected.`);
    await refreshOrders();
  };

  return (
    <PosContext.Provider
      value={{
        cartItems,
        orderType,
        selectedTable,
        customerInfo,
        orderNotes,
        discountType,
        discountValue,
        appliedCoupon,
        totals,

        setOrderType,
        setSelectedTable,
        setCustomerInfo,
        setOrderNotes,
        addToCart,
        updateQuantity,
        removeItem,
        setItemNotes,
        setDiscount,
        applyCouponCode,
        removeCoupon,
        clearCart,

        heldOrders,
        holdCurrentOrder,
        resumeHeldOrder,
        holdOrder,
        resumeOrder,

        activeOrders,
        refreshOrders,
        pendingCustomerOrders,
        acceptCustomerOrder,
        rejectCustomerOrder,

        confirmOrder,
        updateActiveOrder,
        updateOrderPricesOnly,
        loadOrderIntoCart,
        generateKot,
        processPayment,
      }}
    >
      {children}
    </PosContext.Provider>
  );
};

export const usePos = () => {
  const context = useContext(PosContext);
  if (!context) {
    throw new Error('usePos must be used within a PosProvider');
  }
  return context;
};
