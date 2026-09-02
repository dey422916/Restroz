import { Order, OrderItem, OrderStatus, OrderSource, Payment, PaymentMethod, PaymentStatus, DiningTable, KOT } from '../../types';
import { mockStorage } from '../mockStorage';
import { supabase, isSupabaseConfigured } from '../supabase';
import { tableService } from './tableService';
import { settingsService } from './settingsService';
import { kotService } from './kotService';
import { auditService } from './auditService';
import { subscriptionService } from './subscriptionService';
import { getOrderSubtotal } from '../../utils/gst';
import { DEFAULT_RESTAURANT_ID } from './restaurantService';

export const resolveOrderSource = (ord: Partial<Order>): OrderSource => {
  // 1. ONLINE DELIVERY (Customer app / Web delivery):
  if (
    ord.order_type === 'delivery' ||
    Boolean(ord.delivery_address && ord.delivery_address.trim()) ||
    ord.notes?.includes('[ONLINE_DELIVERY]') ||
    ord.notes?.includes('[ONLINE_APP]') ||
    ord.notes?.includes('[DELIVERY]') ||
    ord.created_by === 'CUSTOMER_APP' ||
    ord.created_by === 'CUSTOMER' ||
    ord.order_source === 'CUSTOMER_APP'
  ) {
    return 'CUSTOMER_APP';
  }

  // 2. POS ORDERS (Created from POS Terminal):
  if (
    ord.notes?.includes('[POS]') ||
    ord.created_by?.toLowerCase().includes('pos') ||
    ord.order_source === 'POS'
  ) {
    return 'POS';
  }

  // 3. CUSTOMER QR DIGITAL MENU (Dine-in at table):
  if (
    ord.notes?.includes('[QR_DINE_IN]') ||
    ord.notes?.includes('[QR_ORDER]') ||
    ord.notes?.includes('QR') ||
    ord.order_source === 'CUSTOMER_QR' ||
    (ord.order_type === 'dine_in' && (ord.table_id || ord.table_number))
  ) {
    return 'CUSTOMER_QR';
  }

  // 4. Fallback:
  return 'POS';
};

export const normalizeOrderStatus = (ord: Partial<Order>): OrderStatus => {
  if (
    ord.status === 'served' &&
    (ord.order_type === 'delivery' || ord.notes?.includes('[ONLINE_DELIVERY]') || ord.delivery_address || ord.order_source === 'CUSTOMER_APP')
  ) {
    return 'out_for_delivery';
  }
  if (ord.status) {
    return ord.status as OrderStatus;
  }
  return 'confirmed';
};

export const orderService = {
  async generateNextOrderNumber(
    prefix: string = 'INV-',
    restaurantId: string = DEFAULT_RESTAURANT_ID
  ): Promise<string> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('get_next_order_number', {
          p_restaurant_id: restaurantId,
        });
        if (!error && data) {
          return data as string;
        }
        if (error) {
          console.warn('get_next_order_number RPC returned error:', error);
        }
      } catch (err) {
        console.warn('get_next_order_number RPC exception:', err);
      }
    }
    const curYear = new Date().getFullYear();
    const uniqueSuffix = Date.now().toString().slice(-6);
    return `${prefix}${curYear}-${uniqueSuffix}`;
  },

  async getOrders(restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Order[]> {
    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('orders')
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .order('created_at', { ascending: false });

        if (restaurantId) {
          query = query.eq('restaurant_id', restaurantId);
        }

        const { data, error } = await query;

        if (!error && data) {
          const sanitizedOrders = (data as Order[]).map((ord) => ({
            ...ord,
            restaurant_id: ord.restaurant_id || restaurantId,
            order_source: resolveOrderSource(ord),
            status: normalizeOrderStatus(ord),
            subtotal: getOrderSubtotal(ord),
          }));
          mockStorage.saveOrders(sanitizedOrders);
          return sanitizedOrders;
        }
      } catch (e) {
        console.warn('Supabase fetch orders failed, using local cache:', e);
      }
    }
    const local = mockStorage.getOrders();
    return local.map((ord) => ({
      ...ord,
      restaurant_id: ord.restaurant_id || restaurantId,
      order_source: resolveOrderSource(ord),
      status: normalizeOrderStatus(ord),
      subtotal: getOrderSubtotal(ord),
    }));
  },

  async verifyOrderTenantAccess(order: Order, requiredRestaurantId?: string): Promise<boolean> {
    if (!order) return false;
    if (!isSupabaseConfigured) {
      if (requiredRestaurantId && order.restaurant_id !== requiredRestaurantId) {
        return false;
      }
      return true;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Unauthenticated access (e.g. initial guest load): allow only if restaurantId matches
        return !requiredRestaurantId || order.restaurant_id === requiredRestaurantId;
      }

      // Check profile role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const userRole = profile?.role;

      // 1. SUPER_ADMIN: Can access any order across all tenants (unless explicitly scoped by active restaurant)
      if (userRole === 'SUPER_ADMIN') {
        if (requiredRestaurantId && order.restaurant_id !== requiredRestaurantId) {
          return false;
        }
        return true;
      }

      // 2. RESTAURANT ADMIN / STAFF: Must belong to order.restaurant_id
      if (userRole === 'ADMIN' || userRole === 'STAFF') {
        if (requiredRestaurantId && order.restaurant_id !== requiredRestaurantId) {
          return false;
        }
        const { data: membership } = await supabase
          .from('restaurant_members')
          .select('id, restaurant_id, is_active')
          .eq('user_id', user.id)
          .eq('restaurant_id', order.restaurant_id)
          .eq('is_active', true)
          .maybeSingle();

        if (membership) {
          return true;
        }
        return false;
      }

      // 3. CUSTOMER: Can only access if order.customer_id === user.id
      if (order.customer_id === user.id) {
        return true;
      }

      return false;
    } catch (e) {
      console.warn('Tenant access verification error:', e);
      return false;
    }
  },

  async getOrderById(orderId: string, restaurantId?: string): Promise<Order | null> {
    if (!orderId) return null;
    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('orders')
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .eq('id', orderId);

        if (restaurantId) {
          query = query.eq('restaurant_id', restaurantId);
        }

        const { data, error } = await query.maybeSingle();

        if (!error && data) {
          const ord = data as Order;
          const hasAccess = await this.verifyOrderTenantAccess(ord, restaurantId);
          if (!hasAccess) {
            return null;
          }
          return {
            ...ord,
            order_source: resolveOrderSource(ord),
            status: normalizeOrderStatus(ord),
            subtotal: getOrderSubtotal(ord),
          };
        }
      } catch (err) {
        console.warn('Supabase getOrderById error:', err);
      }
    }
    const all = mockStorage.getOrders();
    const found = all.find((o) => o.id === orderId && (!restaurantId || o.restaurant_id === restaurantId));
    if (found) {
      const hasAccess = await this.verifyOrderTenantAccess(found, restaurantId);
      if (!hasAccess) {
        return null;
      }
      return {
        ...found,
        order_source: resolveOrderSource(found),
        status: normalizeOrderStatus(found),
        subtotal: getOrderSubtotal(found),
      };
    }
    return null;
  },

  async getCustomerOrders(customerId: string): Promise<Order[]> {
    if (!customerId) return [];

    if (isSupabaseConfigured) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && user.id !== customerId) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.role !== 'SUPER_ADMIN') {
            return []; // Block foreign customer order snooping
          }
        }

        const { data: orders, error } = await supabase
          .from('orders')
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });

        if (!error && orders) {
          const orderIds = orders.map((o) => o.id);
          let directKots: any[] = [];
          if (orderIds.length > 0) {
            const { data } = await supabase
              .from('kots')
              .select('*, items:kot_items(*)')
              .in('order_id', orderIds);
            if (data) directKots = data;
          }

          return orders.map((ord) => {
            let orderKots =
              ord.kots && ord.kots.length > 0
                ? ord.kots
                : directKots.filter((k) => k.order_id === ord.id);

            if (!orderKots || orderKots.length === 0) {
              const kotStatus =
                ord.status === 'served' || ord.status === 'completed'
                  ? 'served'
                  : ord.status === 'ready'
                  ? 'ready'
                  : ord.status === 'preparing'
                  ? 'in_progress'
                  : 'pending';

              orderKots = [
                {
                  id: 'kot-' + ord.id,
                  kot_number: `KOT-${ord.order_number?.replace(/^[^\d]*/, '') || '0001'}`,
                  order_id: ord.id,
                  order_number: ord.order_number,
                  order_type: ord.order_type,
                  table_number: ord.table_number,
                  customer_name: ord.customer_name,
                  status: kotStatus,
                  items: (ord.items || []).map((i: any) => ({
                    id: 'ki-' + i.id,
                    kot_id: 'kot-' + ord.id,
                    product_name: i.product_name,
                    quantity: i.quantity,
                  })),
                  created_at: ord.created_at,
                },
              ];
            }

            return {
              ...ord,
              order_source: resolveOrderSource(ord),
              status: normalizeOrderStatus(ord),
              subtotal: getOrderSubtotal(ord),
              kots: orderKots,
            };
          }) as Order[];
        }
      } catch (e) {
        console.warn('Supabase getCustomerOrders failed:', e);
      }
    }

    const all = mockStorage.getOrders();
    return all.filter((o) => o.customer_id === customerId).map((ord) => ({
      ...ord,
      order_source: resolveOrderSource(ord),
      status: normalizeOrderStatus(ord),
      subtotal: getOrderSubtotal(ord),
    }));
  },

  async createOrder(
    orderData: Partial<Order> & { payment_method?: PaymentMethod; initial_payment_amount?: number }
  ): Promise<Order> {
    if (orderData.order_type === 'dine_in' && !orderData.table_id && !orderData.table_number) {
      throw new Error('Please select a dining table for Dine-In orders.');
    }

    let targetRestaurantId = orderData.restaurant_id || DEFAULT_RESTAURANT_ID;
    const settings = await settingsService.getSettings(targetRestaurantId);

    // RESTRICTION: Block order creation if the restaurant does not have an active SaaS subscription
    const subAccess = await subscriptionService.checkTenantAccess(targetRestaurantId);
    if (!subAccess.isAllowed) {
      throw new Error(
        subAccess.message ||
        `Orders cannot be taken: "${settings.name || 'This restaurant'}" does not have an active subscription. Please activate a SaaS subscription to accept orders.`
      );
    }

    let orderNumber = await this.generateNextOrderNumber(settings.invoice_prefix || 'INV-', targetRestaurantId);

    const paymentMethod = orderData.payment_method || 'cash';
    const isPaid = orderData.payment_status === 'paid';
    const computedSubtotal = getOrderSubtotal(orderData);
    const resolvedSource = resolveOrderSource(orderData);
    let finalNotes = orderData.notes;
    if (resolvedSource === 'CUSTOMER_QR') {
      if (!finalNotes?.includes('[QR_DINE_IN]')) {
        finalNotes = `[QR_DINE_IN] ${finalNotes || ''}`.trim();
      }
    }

    // Resolve valid table_id from DB scoped to target restaurant to prevent foreign key violations
    let resolvedTableId = orderData.table_id || null;
    let resolvedTableNumber = orderData.table_number || null;

    if (resolvedTableId || resolvedTableNumber) {
      try {
        let matched: DiningTable | null = null;
        if (resolvedTableId) {
          matched = await tableService.resolveTable(resolvedTableId);
        }
        if (!matched) {
          const allTables = await tableService.getTables(targetRestaurantId);
          matched =
            allTables.find((t) => {
              const cleanTId = t.id.toLowerCase().replace(/[-_ ]/g, '');
              const cleanTNum = t.table_number.toLowerCase().replace(/[-_ ]/g, '');
              const inputId = (resolvedTableId || '').toLowerCase().replace(/[-_ ]/g, '');
              const inputNum = (resolvedTableNumber || '').toLowerCase().replace(/[-_ ]/g, '');
              return (
                t.id === resolvedTableId ||
                t.table_number === resolvedTableNumber ||
                cleanTId === inputId ||
                cleanTNum === inputNum ||
                cleanTNum === `table${inputId}` ||
                cleanTId === `tbl${inputNum}` ||
                cleanTId === `tbl${inputId}`
              );
            }) || null;
        }
        if (matched) {
          resolvedTableId = matched.id;
          resolvedTableNumber = matched.table_number;
          if (matched.restaurant_id) {
            targetRestaurantId = matched.restaurant_id;
          }
        }
      } catch (e) {
        console.warn('Table lookup exception in createOrder:', e);
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validCustomerId = orderData.customer_id && uuidRegex.test(orderData.customer_id) ? orderData.customer_id : null;
    const validCreatedBy = orderData.created_by && uuidRegex.test(orderData.created_by) ? orderData.created_by : null;

    const newOrder: Order = {
      id: 'ord-' + Date.now() + Math.random().toString(36).substr(2, 4),
      restaurant_id: targetRestaurantId,
      order_number: orderNumber,
      order_source: resolvedSource,
      order_type: orderData.order_type || 'dine_in',
      table_id: resolvedTableId || undefined,
      table_number: resolvedTableNumber || undefined,
      customer_id: validCustomerId || undefined,
      customer_name:
        orderData.customer_name ||
        (resolvedTableNumber ? `${resolvedTableNumber} Guest` : orderData.order_type === 'dine_in' ? 'Dine-in Guest' : 'Customer'),
      customer_phone: orderData.customer_phone,
      delivery_address: orderData.delivery_address,
      delivery_landmark: orderData.delivery_landmark,
      delivery_charge: orderData.delivery_charge || 0,
      status: orderData.status || 'confirmed',
      subtotal: computedSubtotal,
      discount_amount: orderData.discount_amount || 0,
      coupon_code: orderData.coupon_code,
      coupon_discount: orderData.coupon_discount || 0,
      cgst_amount: orderData.cgst_amount || 0,
      sgst_amount: orderData.sgst_amount || 0,
      igst_amount: orderData.igst_amount || 0,
      service_charge: orderData.service_charge || 0,
      grand_total: orderData.grand_total || 0,
      round_off: orderData.round_off || 0,
      payable_amount: orderData.payable_amount || 0,
      paid_amount: isPaid ? (orderData.payable_amount || 0) : 0,
      payment_status: isPaid ? 'paid' : 'unpaid',
      notes: finalNotes,
      items: orderData.items || [],
      payments: orderData.payments || [],
      kots: orderData.kots || [],
      created_by: validCreatedBy || undefined,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        // For unauthenticated Guest QR orders, execute via the atomic server-side RPC
        if (resolvedSource === 'CUSTOMER_QR' && !validCustomerId && resolvedTableId) {
          try {
            const { data: rpcData, error: rpcError } = await supabase.rpc('create_guest_qr_order', {
              p_restaurant_id: targetRestaurantId,
              p_table_id: resolvedTableId,
              p_customer_name: newOrder.customer_name || `${resolvedTableNumber || 'Table'} Guest`,
              p_customer_phone: newOrder.customer_phone || '',
              p_items: (newOrder.items || []).map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
                item_notes: i.item_notes || '',
              })),
              p_notes: newOrder.notes || '',
              p_coupon_code: newOrder.coupon_code || null,
            });

            if (!rpcError && rpcData) {
              const parsedOrder: Order = {
                ...rpcData,
                order_source: 'CUSTOMER_QR',
                items: rpcData.items || newOrder.items || [],
              };
              try {
                await tableService.updateTableStatus(resolvedTableId, 'occupied');
              } catch (tErr) {
                console.warn('Table status update warning:', tErr);
              }
              mockStorage.saveOrders([parsedOrder, ...mockStorage.getOrders().filter((o) => o.id !== parsedOrder.id)]);
              return parsedOrder;
            }
          } catch (rpcEx) {
            console.warn('create_guest_qr_order RPC fallback to direct insert:', rpcEx);
          }
        }

        const { items, payments, kots, order_source, ...orderRecord } = newOrder;
        let dbPayload = {
          ...orderRecord,
          restaurant_id: targetRestaurantId,
          table_id: resolvedTableId,
          customer_id: validCustomerId,
        };

        let { data: createdDbOrder, error: orderError } = await supabase
          .from('orders')
          .insert([dbPayload])
          .select()
          .single();

        // If duplicate order number, retry with unique timestamp suffix
        if (orderError && (orderError.code === '23505' || orderError.message?.includes('duplicate key'))) {
          console.warn('Duplicate order number detected, retrying with unique suffix...');
          orderNumber = `${settings.invoice_prefix || 'INV-'}${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
          dbPayload.order_number = orderNumber;
          newOrder.order_number = orderNumber;
          const retryRes = await supabase
            .from('orders')
            .insert([dbPayload])
            .select()
            .single();
          createdDbOrder = retryRes.data;
          orderError = retryRes.error;
        }

        if (!orderError && createdDbOrder) {
          // Insert order items with product_id foreign-key validation
          if (items && items.length > 0) {
            let validProductIds = new Set<string>();
            try {
              const { data: dbProducts } = await supabase.from('products').select('id');
              if (dbProducts) {
                validProductIds = new Set(dbProducts.map((p) => p.id));
              }
            } catch (err) {
              console.warn('Product lookup for foreign key check failed:', err);
            }

            const formattedItems = items.map((i) => ({
              id: i.id?.startsWith('item-') ? i.id : 'item-' + Date.now() + Math.random().toString(36).substr(2, 4),
              order_id: createdDbOrder.id,
              product_id: i.product_id && validProductIds.has(i.product_id) ? i.product_id : null,
              product_name: i.product_name,
              unit_price: Number(i.unit_price) || 0,
              quantity: Number(i.quantity) || 1,
              tax_rate: Number(i.tax_rate) || 5,
              tax_amount: Number(i.tax_amount) || 0,
              subtotal: Number(i.subtotal) || 0,
              total: Number(i.total) || 0,
              item_notes: i.item_notes || null,
              image_url: i.image_url || null,
              created_at: new Date().toISOString(),
            }));
            const { error: itemInsertErr } = await supabase.from('order_items').insert(formattedItems);
            if (itemInsertErr) {
              console.warn('Order items insert warning:', itemInsertErr);
            }
          }

          // Insert payment record if paid
          if (paymentMethod && isPaid) {
            const payRecord = {
              id: 'pay-' + Date.now(),
              order_id: createdDbOrder.id,
              payment_method: paymentMethod,
              amount: createdDbOrder.payable_amount,
              reference_number: 'TXN-' + Date.now(),
              created_at: new Date().toISOString(),
            };
            await supabase.from('payments').insert([payRecord]);
          }

          // Deduct product stock quantities
          if (items && items.length > 0) {
            for (const itm of items) {
              if (itm.product_id && itm.quantity > 0) {
                try {
                  const { data: curP } = await supabase
                    .from('products')
                    .select('stock_quantity')
                    .eq('id', itm.product_id)
                    .single();
                  if (curP) {
                    const newStock = Math.max(0, (curP.stock_quantity || 0) - itm.quantity);
                    await supabase
                      .from('products')
                      .update({ stock_quantity: newStock, is_available: newStock > 0 })
                      .eq('id', itm.product_id);
                  }
                } catch (err) {
                  console.warn('Stock deduction exception:', err);
                }
              }
            }
          }

          // Mark table as occupied for dine_in
          if (newOrder.order_type === 'dine_in' && newOrder.table_id) {
            try {
              await tableService.updateTableStatus(newOrder.table_id, 'occupied');
            } catch (tErr) {
              console.warn('Table status update warning:', tErr);
            }
          }

          // Automatically generate KOT for the order (held orders must NOT generate KOT)
          const fullCreatedOrder: Order = {
            ...createdDbOrder,
            items: items || [],
          };
          let generatedKot: KOT | undefined;
          if (newOrder.status !== 'held') {
            generatedKot = await kotService.generateKot(fullCreatedOrder);
            fullCreatedOrder.kots = generatedKot ? [generatedKot] : [];
          } else {
            fullCreatedOrder.kots = [];
          }

          await auditService.log('CREATE_ORDER', {
            order_number: fullCreatedOrder.order_number,
            order_type: fullCreatedOrder.order_type,
            table: fullCreatedOrder.table_number,
            payable_amount: fullCreatedOrder.payable_amount,
          });

          await this.getOrders();
          return fullCreatedOrder;
        } else if (orderError) {
          console.error('Supabase order insert error:', orderError);
          throw new Error(`Database error: ${orderError.message}`);
        }
      } catch (e: any) {
        console.warn('Supabase create order exception:', e);
        throw e;
      }
    }

    // Local fallback
    const orders = mockStorage.getOrders();
    orders.unshift(newOrder);
    mockStorage.saveOrders(orders);

    // Deduct local stock
    if (newOrder.items && newOrder.items.length > 0) {
      const prods = mockStorage.getProducts();
      newOrder.items.forEach((itm) => {
        const p = prods.find((x) => x.id === itm.product_id);
        if (p) {
          p.stock_quantity = Math.max(0, (p.stock_quantity || 0) - itm.quantity);
          p.is_available = p.stock_quantity > 0;
        }
      });
      mockStorage.saveProducts(prods);
    }

    if (newOrder.order_type === 'dine_in' && newOrder.table_id) {
      try {
        await tableService.updateTableStatus(newOrder.table_id, 'occupied');
      } catch (tErr) {
        console.warn('Table status update warning:', tErr);
      }
    }

    const generatedKot = await kotService.generateKot(newOrder);
    newOrder.kots = [generatedKot];
    return newOrder;
  },

  /**
   * Edit an active order before final settlement:
   * - Computes item diff: generates Supplementary KOT for added items & deducts stock.
   * - For removed/reduced items: generates Kitchen cancellation ticket & restores stock.
   * - Recalculates all order totals and updates database.
   */
  async editActiveOrder(params: {
    orderId: string;
    updatedItems: OrderItem[];
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    deliveryLandmark?: string;
    deliveryCharge?: number;
    tableId?: string;
    tableNumber?: string;
    notes?: string;
    discountAmount?: number;
    couponCode?: string;
    couponDiscount?: number;
    reason?: string;
  }): Promise<Order> {
    const {
      orderId,
      updatedItems,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryLandmark,
      deliveryCharge = 0,
      tableId,
      tableNumber,
      notes,
      discountAmount = 0,
      couponCode,
      couponDiscount = 0,
      reason,
    } = params;

    // Fetch existing order
    const existingOrder = await this.getOrderById(orderId);
    if (!existingOrder) throw new Error('Order not found');
    if (existingOrder.status === 'completed' || existingOrder.status === 'cancelled') {
      throw new Error(`Cannot edit an order that is already ${existingOrder.status.toUpperCase()}.`);
    }

    const oldItems = existingOrder.items || [];

    // Calculate item differences
    const addedItems: OrderItem[] = [];
    const reducedOrRemovedItems: { product_name: string; old_quantity: number; new_quantity: number }[] = [];

    // Map old items by product_id
    const oldItemMap = new Map<string, OrderItem>();
    oldItems.forEach((i) => oldItemMap.set(i.product_id, i));

    // Map new items by product_id
    const newItemMap = new Map<string, OrderItem>();
    updatedItems.forEach((i) => newItemMap.set(i.product_id, i));

    // Check newly added items or increased quantity
    for (const newItem of updatedItems) {
      const oldItem = oldItemMap.get(newItem.product_id);
      if (!oldItem) {
        // Completely new item
        addedItems.push(newItem);
      } else if (newItem.quantity > oldItem.quantity) {
        // Increased quantity
        const diffQty = newItem.quantity - oldItem.quantity;
        addedItems.push({
          ...newItem,
          quantity: diffQty,
        });
      }
    }

    // Check removed or reduced items
    for (const oldItem of oldItems) {
      const newItem = newItemMap.get(oldItem.product_id);
      if (!newItem) {
        // Completely removed
        reducedOrRemovedItems.push({
          product_name: oldItem.product_name,
          old_quantity: oldItem.quantity,
          new_quantity: 0,
        });
      } else if (newItem.quantity < oldItem.quantity) {
        // Reduced quantity
        reducedOrRemovedItems.push({
          product_name: oldItem.product_name,
          old_quantity: oldItem.quantity,
          new_quantity: newItem.quantity,
        });
      }
    }

    // Generate Supplementary KOT for added items & deduct stock
    let generatedKot: KOT | undefined;
    if (addedItems.length > 0) {
      generatedKot = await kotService.generateKot(existingOrder, reason || 'Supplementary addition from POS', addedItems);
      if (isSupabaseConfigured) {
        for (const itm of addedItems) {
          try {
            const { data: curP } = await supabase.from('products').select('stock_quantity').eq('id', itm.product_id).single();
            if (curP) {
              const newStock = Math.max(0, (curP.stock_quantity || 0) - itm.quantity);
              await supabase.from('products').update({ stock_quantity: newStock, is_available: newStock > 0 }).eq('id', itm.product_id);
            }
          } catch (e) {
            console.warn('Stock update for added items exception:', e);
          }
        }
      }
    }

    // Generate cancellation ticket for reduced/removed items & restore stock
    for (const red of reducedOrRemovedItems) {
      await kotService.generateCancellationTicket(existingOrder, {
        ...red,
        reason: reason || 'Customer requested item modification',
      });
      const diffRestored = red.old_quantity - red.new_quantity;
      const matchingOld = oldItems.find((x) => x.product_name === red.product_name);
      if (matchingOld && isSupabaseConfigured) {
        try {
          const { data: curP } = await supabase.from('products').select('stock_quantity').eq('id', matchingOld.product_id).single();
          if (curP) {
            const restored = (curP.stock_quantity || 0) + diffRestored;
            await supabase.from('products').update({ stock_quantity: restored, is_available: true }).eq('id', matchingOld.product_id);
          }
        } catch (e) {
          console.warn('Stock restore exception:', e);
        }
      }
    }

    // Recalculate totals
    const subtotal = updatedItems.reduce((sum, i) => sum + i.total, 0);
    const taxableAfterDiscounts = Math.max(0, subtotal - discountAmount - couponDiscount);
    const cgstAmount = Math.round(taxableAfterDiscounts * 0.025 * 100) / 100;
    const sgstAmount = Math.round(taxableAfterDiscounts * 0.025 * 100) / 100;
    const grandTotal = taxableAfterDiscounts + cgstAmount + sgstAmount + deliveryCharge;
    const payableAmount = Math.round(grandTotal);
    const roundOff = Math.round((payableAmount - grandTotal) * 100) / 100;

    // Handle table changes
    if (existingOrder.order_type === 'dine_in' && tableId && tableId !== existingOrder.table_id) {
      if (existingOrder.table_id) {
        await this.releaseTableIfSafe(existingOrder.table_id, orderId);
      }
      await tableService.updateTableStatus(tableId, 'occupied');
    }

    const updatePayload: Partial<Order> = {
      customer_name: customerName ?? existingOrder.customer_name,
      customer_phone: customerPhone ?? existingOrder.customer_phone,
      delivery_address: deliveryAddress ?? existingOrder.delivery_address,
      delivery_landmark: deliveryLandmark ?? existingOrder.delivery_landmark,
      delivery_charge: deliveryCharge,
      table_id: tableId ?? existingOrder.table_id,
      table_number: tableNumber ?? existingOrder.table_number,
      notes: notes ?? existingOrder.notes,
      subtotal,
      discount_amount: discountAmount,
      coupon_code: couponCode,
      coupon_discount: couponDiscount,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      grand_total: grandTotal,
      round_off: roundOff,
      payable_amount: payableAmount,
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        // Delete old items and insert updated items
        await supabase.from('order_items').delete().eq('order_id', orderId);
        const formattedItems = updatedItems.map((i) => ({
          id: i.id?.startsWith('item-') ? i.id : 'item-' + Date.now() + Math.random().toString(36).substr(2, 4),
          order_id: orderId,
          product_id: i.product_id || null,
          product_name: i.product_name,
          unit_price: Number(i.unit_price) || 0,
          quantity: Number(i.quantity) || 1,
          tax_rate: Number(i.tax_rate) || 5,
          tax_amount: Number(i.tax_amount) || 0,
          subtotal: Number(i.subtotal) || (Number(i.unit_price) * Number(i.quantity)) || 0,
          total: Number(i.total) || (Number(i.unit_price) * Number(i.quantity)) || 0,
          item_notes: i.item_notes || null,
          image_url: i.image_url || null,
          created_at: new Date().toISOString(),
        }));
        await supabase.from('order_items').insert(formattedItems);

        const { data: updatedOrder, error } = await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', orderId)
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .single();

        if (!error && updatedOrder) {
          await auditService.log('UPDATE_ORDER', {
            order_number: updatedOrder.order_number,
            added_items_count: addedItems.length,
            removed_items_count: reducedOrRemovedItems.length,
            new_payable_amount: updatedOrder.payable_amount,
            reason: reason || 'Active order edited from POS',
          });
          await this.getOrders();
          const finalResult = {
            ...updatedOrder,
            latest_kot: generatedKot,
          };
          return finalResult as Order;
        }
      } catch (e) {
        console.warn('Supabase editActiveOrder failed, falling back:', e);
      }
    }

    // Local fallback
    const localOrders = mockStorage.getOrders();
    const idx = localOrders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      localOrders[idx] = {
        ...localOrders[idx],
        ...updatePayload,
        items: updatedItems,
      };
      mockStorage.saveOrders(localOrders);
      const finalLocal = {
        ...localOrders[idx],
        latest_kot: generatedKot,
      };
      return finalLocal as Order;
    }
    return existingOrder;
  },

  /**
   * Cancel an active order with required reason:
   * - Does NOT delete order or KOTs.
   * - Sets status = 'cancelled'.
   * - Restores product stock exactly once.
   * - Releases table safely (only if no other active orders on table).
   * - Preserves payment records (marking refund/reversal needed if already paid).
   */
  async cancelActiveOrder(orderId: string, reason: string): Promise<Order> {
    const trimmedReason = (reason || '').trim();
    if (!trimmedReason) {
      throw new Error('A cancellation reason is required (e.g. Customer changed mind, Duplicate order, Wrong table).');
    }

    const targetOrder = await this.getOrderById(orderId);
    if (!targetOrder) throw new Error('Order not found');

    if (targetOrder.status === 'completed') {
      throw new Error('Cannot cancel an order that is already completed. Please use Void / Refund workflow.');
    }
    if (targetOrder.status === 'cancelled') {
      return targetOrder;
    }

    const cancelNotes = `[CANCELLED] Reason: ${trimmedReason} | Prev Status: ${targetOrder.status} | Cancelled At: ${new Date().toLocaleTimeString()}`;

    if (isSupabaseConfigured) {
      try {
        // Restore stock
        if (targetOrder.items && targetOrder.items.length > 0) {
          for (const itm of targetOrder.items) {
            if (itm.product_id && itm.quantity > 0) {
              try {
                const { data: curP } = await supabase.from('products').select('stock_quantity').eq('id', itm.product_id).single();
                if (curP) {
                  const restored = (curP.stock_quantity || 0) + itm.quantity;
                  await supabase.from('products').update({ stock_quantity: restored, is_available: true }).eq('id', itm.product_id);
                }
              } catch (e) {
                console.warn('Stock restore on cancellation exception:', e);
              }
            }
          }
        }

        // Release table safely
        if (targetOrder.order_type === 'dine_in' && targetOrder.table_id) {
          await this.releaseTableIfSafe(targetOrder.table_id, orderId);
        }

        const { data: cancelledOrder, error } = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            notes: targetOrder.notes ? `${targetOrder.notes} • ${cancelNotes}` : cancelNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId)
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .single();

        if (!error && cancelledOrder) {
          await auditService.log('CANCEL_ORDER', {
            order_number: cancelledOrder.order_number,
            reason: trimmedReason,
            had_payment: cancelledOrder.payment_status === 'paid',
          });
          await this.getOrders();
          return cancelledOrder as Order;
        }
      } catch (e) {
        console.warn('Supabase cancelActiveOrder failed:', e);
      }
    }

    // Local fallback
    const localOrders = mockStorage.getOrders();
    const idx = localOrders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      localOrders[idx].status = 'cancelled';
      localOrders[idx].notes = targetOrder.notes ? `${targetOrder.notes} • ${cancelNotes}` : cancelNotes;
      if (localOrders[idx].table_id) {
        await tableService.updateTableStatus(localOrders[idx].table_id!, 'available');
      }
      mockStorage.saveOrders(localOrders);
      return localOrders[idx];
    }
    return targetOrder;
  },

  /**
   * Put an active order on Hold.
   * - Sets status = 'held'.
   * - Does NOT release dining table (table remains OCCUPIED).
   * - Does NOT print another KOT.
   */
  async holdOrder(orderId: string): Promise<Order> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new Error(`Cannot hold an order that is already ${order.status.toUpperCase()}.`);
    }
    const updated = await this.updateOrderStatus(orderId, 'held');
    if (updated.table_id) {
      await tableService.updateTableStatus(updated.table_id, 'occupied');
    }
    await auditService.log('HOLD_ORDER', {
      order_id: orderId,
      order_number: order.order_number,
      table_number: order.table_number,
    });
    return updated;
  },

  /**
   * Resume a Held order.
   * - Restores status = 'confirmed'.
   * - Table remains OCCUPIED.
   * - Does NOT print a new KOT.
   */
  async resumeOrder(orderId: string): Promise<Order> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status !== 'held') {
      return order;
    }
    const updated = await this.updateOrderStatus(orderId, 'confirmed');
    if (updated.table_id) {
      await tableService.updateTableStatus(updated.table_id, 'occupied');
    }
    await auditService.log('RESUME_ORDER', {
      order_id: orderId,
      order_number: order.order_number,
      table_number: order.table_number,
    });
    return updated;
  },

  /**
   * Close Order and Settle Payment (CASH, ONLINE / UPI, CARD, SPLIT, ROOM):
   * - Computes final bill amounts.
   * - Records payment.
   * - Marks payment_status as paid or unpaid (e.g. COD / Delivery).
   * - Marks status = 'completed' (locks editing).
   * - Releases dining table safely.
   */
  async closeAndPayOrder(params: {
    orderId: string;
    paymentMethod: PaymentMethod;
    paymentReceived: boolean;
    amountPaid?: number;
    transactionReference?: string;
    notes?: string;
    discountType?: 'none' | 'fixed' | 'percentage';
    discountValue?: number;
    discountAmount?: number;
    taxableAmount?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    grandTotal?: number;
    roundOff?: number;
    payableAmount?: number;
  }): Promise<Order> {
    const {
      orderId,
      paymentMethod,
      paymentReceived,
      amountPaid,
      transactionReference,
      notes,
      discountType,
      discountValue,
      discountAmount,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      grandTotal,
      roundOff,
      payableAmount,
    } = params;

    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');
    if (order.status === 'completed') throw new Error('Order is already completed and locked.');
    if (order.status === 'cancelled') throw new Error('Cannot close a cancelled order.');

    const targetPayable = payableAmount !== undefined ? payableAmount : order.payable_amount;
    const finalPaidAmount = paymentReceived ? (amountPaid ?? targetPayable) : 0;
    const finalPaymentStatus = paymentReceived ? 'paid' : 'unpaid';
    const finalOrderStatus: OrderStatus = 'completed';

    const payRecord: Payment = {
      id: 'pay-' + Date.now(),
      order_id: orderId,
      payment_method: paymentMethod,
      amount: finalPaidAmount,
      reference_number: transactionReference || (paymentReceived ? 'TXN-' + Date.now() : undefined),
      created_at: new Date().toISOString(),
    };

    const updatePayload: any = {
      status: finalOrderStatus,
      payment_status: finalPaymentStatus,
      paid_amount: finalPaidAmount,
      notes: notes ? (order.notes ? `${order.notes} • ${notes}` : notes) : order.notes,
      updated_at: new Date().toISOString(),
    };

    if (discountAmount !== undefined) updatePayload.discount_amount = discountAmount;
    if (cgstAmount !== undefined) updatePayload.cgst_amount = cgstAmount;
    if (sgstAmount !== undefined) updatePayload.sgst_amount = sgstAmount;
    if (grandTotal !== undefined) updatePayload.grand_total = grandTotal;
    if (roundOff !== undefined) updatePayload.round_off = roundOff;
    if (payableAmount !== undefined) updatePayload.payable_amount = payableAmount;

    if (isSupabaseConfigured) {
      try {
        if (paymentReceived) {
          await supabase.from('payments').insert([payRecord]);
        }

        // Release table if completed
        if (order.order_type === 'dine_in' && order.table_id) {
          await this.releaseTableIfSafe(order.table_id, orderId);
        }

        const { data: updated, error } = await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', orderId)
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .single();

        if (!error && updated) {
          await auditService.log('CLOSE_ORDER', {
            order_number: updated.order_number,
            payment_method: paymentMethod,
            payment_received: paymentReceived,
            amount: finalPaidAmount,
            status: updated.status,
            discount_amount: discountAmount,
          });
          await this.getOrders();
          return {
            ...updated,
            order_source: resolveOrderSource(updated),
            subtotal: getOrderSubtotal(updated),
            discount_type: discountType,
            discount_value: discountValue,
            taxable_amount: taxableAmount,
          } as Order;
        }
      } catch (e) {
        console.warn('Supabase closeAndPayOrder failed:', e);
      }
    }

    // Local fallback
    const localOrders = mockStorage.getOrders();
    const idx = localOrders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      localOrders[idx] = {
        ...localOrders[idx],
        ...updatePayload,
        discount_type: discountType,
        discount_value: discountValue,
        taxable_amount: taxableAmount,
      };
      if (localOrders[idx].table_id) {
        await tableService.updateTableStatus(localOrders[idx].table_id!, 'available');
      }
      mockStorage.saveOrders(localOrders);
      return localOrders[idx];
    }
    return order;
  },

  /**
   * Helper: checks if any OTHER active orders exist for this table before setting status = available.
   */
  async releaseTableIfSafe(tableId: string, currentOrderId: string): Promise<void> {
    if (!tableId) return;

    if (isSupabaseConfigured) {
      try {
        const { data: otherActive } = await supabase
          .from('orders')
          .select('id')
          .eq('table_id', tableId)
          .neq('id', currentOrderId)
          .in('status', ['confirmed', 'preparing', 'ready', 'served', 'held', 'kot_generated']);

        if (!otherActive || otherActive.length === 0) {
          await tableService.updateTableStatus(tableId, 'available');
        }
        return;
      } catch (e) {
        console.warn('Safe table release check failed:', e);
      }
    }

    const all = mockStorage.getOrders();
    const otherActiveLocal = all.filter(
      (o) => o.table_id === tableId && o.id !== currentOrderId && ['confirmed', 'preparing', 'ready', 'served', 'held', 'kot_generated'].includes(o.status)
    );
    if (otherActiveLocal.length === 0) {
      await tableService.updateTableStatus(tableId, 'available');
    }
  },

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    let dbStatus: string = status;
    if (status === 'out_for_delivery') {
      dbStatus = 'served';
    } else if (status === 'delivered') {
      dbStatus = 'completed';
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .update({ status: dbStatus, updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .single();

        if (!error && data) {
          if ((dbStatus === 'completed' || dbStatus === 'cancelled') && data.table_id) {
            await this.releaseTableIfSafe(data.table_id, orderId);
          }

          // If cancelled, restore stock
          if (dbStatus === 'cancelled' && data.items && data.items.length > 0) {
            for (const itm of data.items) {
              if (itm.product_id && itm.quantity > 0) {
                try {
                  const { data: curP } = await supabase.from('products').select('stock_quantity').eq('id', itm.product_id).single();
                  if (curP) {
                    const restored = (curP.stock_quantity || 0) + itm.quantity;
                    await supabase.from('products').update({ stock_quantity: restored, is_available: true }).eq('id', itm.product_id);
                  }
                } catch (err) {
                  console.warn('Stock restore exception:', err);
                }
              }
            }
          }

          await auditService.log('UPDATE_ORDER_STATUS', { order_id: orderId, status });
          await this.getOrders();
          return {
            ...data,
            order_source: resolveOrderSource(data),
            status: normalizeOrderStatus(data),
            subtotal: getOrderSubtotal(data),
          } as Order;
        } else if (error) {
          console.warn('Supabase update status error:', error.message);
        }
      } catch (e) {
        console.warn('Supabase update status failed, using local storage:', e);
      }
    }

    const orders = mockStorage.getOrders();
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) throw new Error('Order not found');

    orders[idx].status = status;
    orders[idx].updated_at = new Date().toISOString();

    if ((status === 'completed' || status === 'cancelled') && orders[idx].table_id) {
      await this.releaseTableIfSafe(orders[idx].table_id!, orderId);
    }

    mockStorage.saveOrders(orders);
    return orders[idx];
  },

  async updatePaymentStatus(orderId: string, paymentStatus: PaymentStatus): Promise<Order> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .update({ payment_status: paymentStatus, updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .single();

        if (!error && data) {
          await auditService.log('UPDATE_PAYMENT_STATUS', { order_id: orderId, payment_status: paymentStatus });
          return {
            ...data,
            order_source: resolveOrderSource(data),
            status: normalizeOrderStatus(data),
            subtotal: getOrderSubtotal(data),
          } as Order;
        }
      } catch (err: any) {
        console.warn('updatePaymentStatus error:', err.message);
      }
    }

    const orders = mockStorage.getOrders();
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) throw new Error('Order not found');
    orders[idx].payment_status = paymentStatus;
    orders[idx].updated_at = new Date().toISOString();
    mockStorage.saveOrders(orders);
    return orders[idx];
  },

  async addPayment(orderId: string, payment: Omit<Payment, 'id' | 'order_id' | 'created_at'>): Promise<Order> {
    const newPayment: Payment = {
      ...payment,
      id: 'pay-' + Date.now(),
      order_id: orderId,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('payments').insert([newPayment]);
        if (!error) {
          const { data: order } = await supabase.from('orders').select('payable_amount, paid_amount').eq('id', orderId).single();
          if (order) {
            const newPaid = (order.paid_amount || 0) + payment.amount;
            const newPayStatus = newPaid >= order.payable_amount ? 'paid' : newPaid > 0 ? 'partially_paid' : 'unpaid';

            const { data: updated } = await supabase
              .from('orders')
              .update({ paid_amount: newPaid, payment_status: newPayStatus })
              .eq('id', orderId)
              .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
              .single();

            if (updated) {
              await this.getOrders();
              return updated as Order;
            }
          }
        }
      } catch (e) {
        console.warn('Supabase add payment failed, using local fallback:', e);
      }
    }

    const orders = mockStorage.getOrders();
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) throw new Error('Order not found');

    if (!orders[idx].payments) orders[idx].payments = [];
    orders[idx].payments!.push(newPayment);

    const totalPaid = orders[idx].payments!.reduce((sum, p) => sum + p.amount, 0);
    orders[idx].paid_amount = totalPaid;

    if (totalPaid >= orders[idx].payable_amount) {
      orders[idx].payment_status = 'paid';
    } else if (totalPaid > 0) {
      orders[idx].payment_status = 'partially_paid';
    }

    mockStorage.saveOrders(orders);
    return orders[idx];
  },

  async closeAndSettleOrder(
    orderId: string,
    params: {
      payment_method: PaymentMethod;
      amount: number;
      reference_number?: string;
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
  ): Promise<Order> {
    const target = await this.getOrderById(orderId);
    if (!target) throw new Error('Order not found');

    const finalPayable = params.payable_amount !== undefined ? params.payable_amount : target.payable_amount;
    const finalPaid = Math.max(finalPayable, params.amount);

    const updatePayload: any = {
      status: 'completed',
      payment_status: 'paid',
      paid_amount: finalPaid,
      updated_at: new Date().toISOString(),
    };

    if (params.discount_amount !== undefined) updatePayload.discount_amount = params.discount_amount;
    if (params.cgst_amount !== undefined) updatePayload.cgst_amount = params.cgst_amount;
    if (params.sgst_amount !== undefined) updatePayload.sgst_amount = params.sgst_amount;
    if (params.grand_total !== undefined) updatePayload.grand_total = params.grand_total;
    if (params.round_off !== undefined) updatePayload.round_off = params.round_off;
    if (params.payable_amount !== undefined) updatePayload.payable_amount = params.payable_amount;

    if (isSupabaseConfigured) {
      try {
        const payRecord = {
          id: 'pay-' + Date.now(),
          order_id: orderId,
          payment_method: params.payment_method,
          amount: params.amount,
          reference_number: params.reference_number || `TXN-${Date.now()}`,
          created_at: new Date().toISOString(),
        };
        await supabase.from('payments').insert([payRecord]);

        const { data: updated, error } = await supabase
          .from('orders')
          .update(updatePayload)
          .eq('id', orderId)
          .eq('restaurant_id', target.restaurant_id)
          .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
          .single();

        if (target.table_id) {
          await this.releaseTableIfSafe(target.table_id, orderId);
        }

        if (!error && updated) {
          await this.getOrders();
          return {
            ...updated,
            order_source: resolveOrderSource(updated),
            subtotal: getOrderSubtotal(updated),
            discount_type: params.discount_type,
            discount_value: params.discount_value,
            taxable_amount: params.taxable_amount,
          } as Order;
        }
      } catch (e) {
        console.warn('Supabase closeAndSettleOrder failed, falling back to local cache:', e);
      }
    }

    const localOrders = mockStorage.getOrders();
    const idx = localOrders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      localOrders[idx] = {
        ...localOrders[idx],
        ...updatePayload,
        discount_type: params.discount_type,
        discount_value: params.discount_value,
        taxable_amount: params.taxable_amount,
      };
      if (!localOrders[idx].payments) localOrders[idx].payments = [];
      localOrders[idx].payments!.push({
        id: 'pay-' + Date.now(),
        order_id: orderId,
        payment_method: params.payment_method,
        amount: params.amount,
        reference_number: params.reference_number || `TXN-${Date.now()}`,
        created_at: new Date().toISOString(),
      });
      mockStorage.saveOrders(localOrders);
      if (target.table_id) {
        await tableService.updateTableStatus(target.table_id, 'available');
      }
      return localOrders[idx];
    }
    return target;
  },

  /**
   * Delete an order and its child records completely from database, and release table safely
   */
  async deleteOrder(orderId: string): Promise<boolean> {
    if (!orderId) return false;

    let targetTableId: string | undefined;

    if (isSupabaseConfigured) {
      try {
        const { data: ord } = await supabase.from('orders').select('table_id').eq('id', orderId).single();
        targetTableId = ord?.table_id;

        // Delete children
        const { data: kotData } = await supabase.from('kots').select('id').eq('order_id', orderId);
        if (kotData && kotData.length > 0) {
          const kotIds = kotData.map((k) => k.id);
          await supabase.from('kot_items').delete().in('kot_id', kotIds);
        }
        await supabase.from('kots').delete().eq('order_id', orderId);
        await supabase.from('payments').delete().eq('order_id', orderId);
        await supabase.from('order_items').delete().eq('order_id', orderId);
        await supabase.from('orders').delete().eq('id', orderId);

        if (targetTableId) {
          await this.releaseTableIfSafe(targetTableId, orderId);
        }

        await this.getOrders();
        return true;
      } catch (e) {
        console.warn('Supabase deleteOrder failed:', e);
      }
    }

    const localOrders = mockStorage.getOrders();
    const target = localOrders.find((o) => o.id === orderId);
    targetTableId = target?.table_id;
    const remaining = localOrders.filter((o) => o.id !== orderId);
    mockStorage.saveOrders(remaining);

    if (targetTableId) {
      await this.releaseTableIfSafe(targetTableId, orderId);
    }
    return true;
  },

  /**
   * Remove all cancelled orders from database and release any occupied tables
   */
  async deleteCancelledOrders(): Promise<number> {
    if (isSupabaseConfigured) {
      try {
        const { data: cancelledOrders } = await supabase
          .from('orders')
          .select('id, table_id')
          .eq('status', 'cancelled');

        if (cancelledOrders && cancelledOrders.length > 0) {
          const ids = cancelledOrders.map((o) => o.id);
          const tableIds = cancelledOrders.map((o) => o.table_id).filter(Boolean) as string[];

          // Delete children
          const { data: kotData } = await supabase.from('kots').select('id').in('order_id', ids);
          if (kotData && kotData.length > 0) {
            const kotIds = kotData.map((k) => k.id);
            await supabase.from('kot_items').delete().in('kot_id', kotIds);
          }
          await supabase.from('kots').delete().in('order_id', ids);
          await supabase.from('payments').delete().in('order_id', ids);
          await supabase.from('order_items').delete().in('order_id', ids);
          await supabase.from('orders').delete().in('id', ids);

          // Also clean local cache
          const localOrders = mockStorage.getOrders();
          const remaining = localOrders.filter((o) => o.status !== 'cancelled');
          mockStorage.saveOrders(remaining);

          await this.getOrders();
          return ids.length;
        }
      } catch (e) {
        console.warn('Supabase deleteCancelledOrders failed:', e);
      }
    }

    const localOrders = mockStorage.getOrders();
    const cancelled = localOrders.filter((o) => o.status === 'cancelled');
    const remaining = localOrders.filter((o) => o.status !== 'cancelled');
    mockStorage.saveOrders(remaining);

    for (const c of cancelled) {
      if (c.table_id) {
        await tableService.updateTableStatus(c.table_id, 'available');
      }
    }

    return cancelled.length;
  },
};
