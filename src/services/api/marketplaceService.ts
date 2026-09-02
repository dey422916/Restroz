import { supabase } from '../supabase';
import {
  CustomerAddress,
  CustomerOrderProgress,
  DeliveryOrderPayload,
  RestaurantPublicProfile,
  OrderStatusEvent,
  CustomerNotification,
  ReorderResult,
  ReorderItemResult,
  CustomerCartItem,
} from '../../types/marketplace';
import { Order, Product, UserProfile, Restaurant, Category } from '../../types';
import { couponService } from './couponService';
import { parseBannerUrls } from '../../utils/mediaUtils';

// Haversine Distance in Kilometers
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export const marketplaceService = {
  // 1. Get All Active Marketplace Restaurants
  async getMarketplaceRestaurants(options?: {
    customerLat?: number | null;
    customerLng?: number | null;
    customerCity?: string | null;
    cuisine?: string;
    search?: string;
  }): Promise<
    Array<Restaurant & { public_profile?: RestaurantPublicProfile; is_active_sub: boolean }>
  > {
    const { data: rests, error: restErr } = await supabase
      .from('restaurants')
      .select(`
        *,
        public_profile:restaurant_public_profiles(*)
      `)
      .eq('status', 'ACTIVE')
      .order('name');

    if (restErr) {
      console.warn('Error fetching marketplace restaurants:', restErr);
      return [];
    }

    const defaultBanner =
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80';

    // Map all active restaurants and calculate location distance
    let mapped = (rests || []).map((r) => {
      const pubProf = Array.isArray(r.public_profile) ? r.public_profile[0] : r.public_profile;
      const parsedBanners = parseBannerUrls(pubProf?.banner_url || r.banner_url);
      const banner = parsedBanners[0] || defaultBanner;

      const restLat = Number(r.latitude || pubProf?.latitude);
      const restLng = Number(r.longitude || pubProf?.longitude);

      let distance_km: number | undefined = undefined;
      let is_outside_radius: boolean = false;

      if (
        options?.customerLat != null &&
        options?.customerLng != null &&
        !isNaN(restLat) &&
        !isNaN(restLng) &&
        restLat !== 0 &&
        restLng !== 0
      ) {
        distance_km = calculateDistanceKm(
          Number(options.customerLat),
          Number(options.customerLng),
          restLat,
          restLng
        );
        const radius = pubProf?.delivery_radius_km || 15;
        is_outside_radius = distance_km > radius;
      }

      return {
        ...r,
        banner_url: banner,
        banner_urls: parsedBanners,
        public_profile: {
          id: pubProf?.id || 'pub-' + r.id,
          restaurant_id: r.id,
          marketplace_enabled: pubProf?.marketplace_enabled !== false,
          accepts_delivery: pubProf?.accepts_delivery !== false,
          accepts_takeaway: pubProf?.accepts_takeaway !== false,
          is_open: pubProf?.is_open !== false,
          delivery_radius_km: pubProf?.delivery_radius_km || 15,
          minimum_order_value: pubProf?.minimum_order_value || 0,
          estimated_delivery_minutes: pubProf?.estimated_delivery_minutes || 30,
          cuisine_tags: pubProf?.cuisine_tags || ['Multi-Cuisine', 'Fast Food', 'North Indian'],
          banner_url: banner,
          banner_urls: parsedBanners,
          public_description:
            pubProf?.public_description ||
            `${r.name} - Fresh delicious meals prepared and delivered hot.`,
          opening_time: pubProf?.opening_time || '09:00 AM',
          closing_time: pubProf?.closing_time || '11:00 PM',
          latitude: restLat || null,
          longitude: restLng || null,
          distance_km,
          is_outside_radius,
          created_at: pubProf?.created_at || new Date().toISOString(),
        },
        is_active_sub: true,
      };
    });

    // If customer coordinates provided, sort nearest first
    if (options?.customerLat != null && options?.customerLng != null) {
      mapped.sort((a, b) => {
        const distA = a.public_profile?.distance_km ?? 999999;
        const distB = b.public_profile?.distance_km ?? 999999;
        return distA - distB;
      });
    } else if (options?.customerCity) {
      const cityLower = options.customerCity.trim().toLowerCase();
      mapped.sort((a, b) => {
        const aCityMatch = (a.city || '').toLowerCase().includes(cityLower) ? 0 : 1;
        const bCityMatch = (b.city || '').toLowerCase().includes(cityLower) ? 0 : 1;
        return aCityMatch - bCityMatch;
      });
    }

    return mapped;
  },

  async getAvailableRestaurants(options?: {
    cuisine?: string;
    search?: string;
    customerLat?: number;
    customerLng?: number;
  }) {
    return this.getMarketplaceRestaurants(options);
  },

  // 2. Get Single Restaurant Public Details
  async getRestaurantPublicDetails(
    restaurantId: string
  ): Promise<(Restaurant & { public_profile?: RestaurantPublicProfile }) | null> {
    const { data, error } = await supabase
      .from('restaurants')
      .select(`
        *,
        public_profile:restaurant_public_profiles(*)
      `)
      .eq('id', restaurantId)
      .single();

    if (error || !data) return null;

    const pubProf = Array.isArray(data.public_profile) ? data.public_profile[0] : data.public_profile;
    const parsedBanners = parseBannerUrls(pubProf?.banner_url || data.banner_url);
    const banner = parsedBanners[0] || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80';

    return {
      ...data,
      banner_url: banner,
      banner_urls: parsedBanners,
      public_profile: {
        ...(pubProf || {}),
        id: pubProf?.id || 'pub-' + data.id,
        restaurant_id: data.id,
        marketplace_enabled: pubProf?.marketplace_enabled !== false,
        accepts_delivery: pubProf?.accepts_delivery !== false,
        accepts_takeaway: pubProf?.accepts_takeaway !== false,
        is_open: pubProf?.is_open !== false,
        delivery_radius_km: pubProf?.delivery_radius_km || 15,
        minimum_order_value: pubProf?.minimum_order_value || 0,
        estimated_delivery_minutes: pubProf?.estimated_delivery_minutes || 30,
        cuisine_tags: pubProf?.cuisine_tags || ['Multi-Cuisine', 'Fast Food', 'North Indian'],
        banner_url: banner,
        banner_urls: parsedBanners,
        public_description: pubProf?.public_description || `${data.name} - Fresh delicious meals prepared and delivered hot.`,
        opening_time: pubProf?.opening_time || '09:00 AM',
        closing_time: pubProf?.closing_time || '11:00 PM',
      },
    };
  },

  // 3. Get Restaurant Public Menu (Categories + Active/Available Products)
  async getRestaurantMenu(
    restaurantId: string
  ): Promise<{ categories: Category[]; products: Product[] }> {
    const [catRes, prodRes] = await Promise.all([
      supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .eq('is_available', true)
        .order('name', { ascending: true }),
    ]);

    const categories = catRes.data || [];
    const products = prodRes.data || [];

    return { categories, products };
  },

  // 4. Customer Addresses CRUD
  async getCustomerAddresses(): Promise<CustomerAddress[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching customer addresses:', error);
      return [];
    }
    return data || [];
  },

  async createCustomerAddress(
    payload: Omit<CustomerAddress, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ): Promise<CustomerAddress> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be logged in to save an address.');

    // If marked default, unset other defaults
    if (payload.is_default) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('user_id', user.id);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .insert({
        ...payload,
        user_id: user.id,
      })
      .select()
      .single();

    if (error || !data) throw error || new Error('Failed to create address.');
    return data;
  },

  async updateCustomerAddress(
    id: string,
    payload: Partial<CustomerAddress>
  ): Promise<CustomerAddress> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated.');

    if (payload.is_default) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('user_id', user.id);
    }

    const { data, error } = await supabase
      .from('customer_addresses')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error || !data) throw error || new Error('Failed to update address.');
    return data;
  },

  async deleteCustomerAddress(id: string): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('customer_addresses').delete().eq('id', id).eq('user_id', user.id);
  },

  // 5. Create Customer Delivery Order via Server-Side Atomic RPC & Resilient Execution
  async placeDeliveryOrder(payload: DeliveryOrderPayload): Promise<Order> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Please log in to place an order.');

    // 0. Server-Side Idempotency & Rapid Double-Tap Protection
    try {
      const recentCutoff = new Date(Date.now() - 25000).toISOString();
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('customer_id', user.id)
        .eq('restaurant_id', payload.restaurant_id)
        .eq('order_type', 'delivery')
        .gte('created_at', recentCutoff)
        .order('created_at', { ascending: false })
        .limit(3);

      if (recentOrders && recentOrders.length > 0) {
        for (const candidate of recentOrders) {
          const isSameIdem = payload.idempotency_key && candidate.notes?.includes(payload.idempotency_key);
          const isSameCouponAndRecent =
            candidate.coupon_code === (payload.coupon_code || null) &&
            (Date.now() - new Date(candidate.created_at).getTime() < 12000);

          if (isSameIdem || isSameCouponAndRecent) {
            console.log('Idempotent order detected. Returning existing order:', candidate.order_number);
            return candidate as Order;
          }
        }
      }
    } catch (idemErr) {
      console.warn('Idempotency pre-check warning:', idemErr);
    }

    const effectiveDeliveryNotes = payload.idempotency_key
      ? (payload.delivery_notes ? `${payload.delivery_notes} [IDEM:${payload.idempotency_key}]` : `[IDEM:${payload.idempotency_key}]`)
      : (payload.delivery_notes || null);

    // 1. Primary Path: Server-Side Atomic RPC
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'create_customer_delivery_order',
        {
          p_restaurant_id: payload.restaurant_id,
          p_items: payload.items,
          p_delivery_address: payload.delivery_address,
          p_customer_name: payload.customer_name,
          p_customer_phone: payload.customer_phone,
          p_payment_method: payload.payment_method,
          p_coupon_code: payload.coupon_code || null,
          p_delivery_notes: effectiveDeliveryNotes,
        }
      );

      if (!rpcErr && rpcData) {
        return rpcData as Order;
      }
      if (rpcErr) {
        console.warn('create_customer_delivery_order RPC returned error, evaluating fallback:', rpcErr.message);
        if (!rpcErr.message.includes('uuid') && !rpcErr.message.includes('type uuid')) {
          throw new Error(rpcErr.message);
        }
      }
    } catch (e: any) {
      if (!e.message?.includes('uuid') && !e.message?.includes('type uuid')) {
        throw new Error(e.message || 'Failed to place delivery order.');
      }
    }

    // 2. Fallback Path: Client-authenticated atomic sequence
    try {
      const { data: rest, error: rErr } = await supabase
        .from('restaurants')
        .select('id, status, name')
        .eq('id', payload.restaurant_id)
        .single();

      if (rErr || !rest || rest.status !== 'ACTIVE') {
        throw new Error('Restaurant is currently inactive or unavailable.');
      }

      // Fetch products
      const productIds = payload.items.map((i) => i.product_id);
      const { data: prods, error: pErr } = await supabase
        .from('products')
        .select('*')
        .in('id', productIds);

      if (pErr || !prods || prods.length === 0) {
        throw new Error('Could not retrieve product information for order items.');
      }

      let subtotal = 0;
      const orderItemsToInsert: any[] = [];
      const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);

      for (const item of payload.items) {
        const prod = prods.find((p) => p.id === item.product_id);
        if (!prod) {
          throw new Error(`Product ${item.product_id} not found.`);
        }
        if (prod.restaurant_id !== payload.restaurant_id) {
          throw new Error(`Product ${prod.name} does not belong to this restaurant.`);
        }
        if (!prod.is_available || !prod.is_active) {
          throw new Error(`Product ${prod.name} is currently unavailable.`);
        }
        if (prod.stock_quantity !== null && prod.stock_quantity !== undefined && prod.stock_quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${prod.name}. Available: ${prod.stock_quantity}, requested: ${item.quantity}`);
        }

        const unitPrice = prod.discounted_price || prod.price;
        const lineSub = unitPrice * item.quantity;
        const taxRate = prod.tax_rate || 5.0;
        const taxAmount = (lineSub * taxRate) / 100.0;
        const lineTotal = lineSub + taxAmount;
        subtotal += lineSub;

        // Deduct stock
        if (prod.stock_quantity !== null && prod.stock_quantity !== undefined) {
          await supabase
            .from('products')
            .update({ stock_quantity: Math.max(0, prod.stock_quantity - item.quantity) })
            .eq('id', prod.id);
        }

        const itemId = 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
        orderItemsToInsert.push({
          id: itemId,
          order_id: orderId,
          product_id: prod.id,
          product_name: prod.name,
          unit_price: unitPrice,
          quantity: item.quantity,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          item_notes: item.notes || null,
          subtotal: lineSub,
          total: lineTotal,
        });
      }

      // 1. Server-side coupon validation and calculation BEFORE any order record insertion
      let serverCouponDiscount = 0;
      let validCoupon: any = null;

      if (payload.coupon_code && payload.coupon_code.trim()) {
        const valRes = await couponService.validateCouponCode(
          payload.coupon_code.trim(),
          subtotal,
          payload.restaurant_id
        );
        if (!valRes.isValid || !valRes.coupon) {
          throw new Error(valRes.message || 'Coupon validation failed.');
        }

        // Strictly check usage limit before creating any records
        if (
          valRes.coupon.usage_limit !== null &&
          valRes.coupon.usage_limit !== undefined &&
          (valRes.coupon.used_count || 0) >= valRes.coupon.usage_limit
        ) {
          throw new Error('This coupon code has reached its maximum usage limit.');
        }

        validCoupon = valRes.coupon;
        serverCouponDiscount = valRes.discountAmount;

        // Atomically attempt to increment usage BEFORE inserting the order
        const incrementSuccess = await couponService.incrementCouponUsage(
          validCoupon.id,
          payload.restaurant_id
        );
        if (!incrementSuccess) {
          throw new Error('This coupon code has reached its maximum usage limit.');
        }
      }

      // 2. Deduct product stock after coupon validation passes
      for (const item of payload.items) {
        const prod = prods.find((p) => p.id === item.product_id);
        if (prod && prod.stock_quantity !== null && prod.stock_quantity !== undefined) {
          await supabase
            .from('products')
            .update({ stock_quantity: Math.max(0, prod.stock_quantity - item.quantity) })
            .eq('id', prod.id);
        }
      }

      const discountedSubtotal = Math.max(0, subtotal - serverCouponDiscount);
      const taxTotal = (discountedSubtotal * 5.0) / 100.0;
      const cgst = taxTotal / 2.0;
      const sgst = taxTotal / 2.0;
      const grandTotal = discountedSubtotal + taxTotal;
      const payableAmount = Math.max(0, Math.round(grandTotal));
      const roundOff = payableAmount - grandTotal;
      const orderNumber = 'DEL-' + Math.floor(1000 + Math.random() * 9000);

      let addrText = '';
      if (typeof payload.delivery_address === 'object' && payload.delivery_address !== null) {
        const a = payload.delivery_address as any;
        addrText = `${a.address_line1 || ''}, ${a.landmark || ''}, ${a.city || ''} ${a.postal_code || ''} (Phone: ${a.phone || payload.customer_phone})`;
      } else {
        addrText = String(payload.delivery_address || '');
      }

      // 3. Insert confirmed order record
      const { data: newOrder, error: oErr } = await supabase
        .from('orders')
        .insert({
          id: orderId,
          restaurant_id: payload.restaurant_id,
          order_number: orderNumber,
          order_type: 'delivery',
          status: 'confirmed',
          customer_name: payload.customer_name,
          customer_phone: payload.customer_phone,
          delivery_address: addrText,
          customer_id: user.id,
          subtotal,
          cgst_amount: cgst,
          sgst_amount: sgst,
          igst_amount: 0,
          discount_amount: 0,
          coupon_code: validCoupon ? validCoupon.code : null,
          coupon_discount: serverCouponDiscount,
          delivery_charge: 0,
          service_charge: 0,
          round_off: roundOff,
          grand_total: grandTotal,
          payable_amount: payableAmount,
          payment_status: 'unpaid',
          notes: payload.delivery_notes || `Customer Online Order [MARKETPLACE] (${payload.payment_method.toUpperCase()})`,
          created_by: user.id,
          stock_deducted: true,
        })
        .select()
        .single();

      if (oErr || !newOrder) {
        throw new Error(oErr?.message || 'Failed to create order record.');
      }

      // 4. Insert order items immediately
      if (orderItemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase.from('order_items').insert(orderItemsToInsert);
        if (itemsErr) {
          console.warn('Error inserting order items for delivery order:', itemsErr);
        }
      }

      // 5. Record audit log
      try {
        await supabase.from('audit_logs').insert({
          restaurant_id: payload.restaurant_id,
          user_id: user.id,
          action: 'CUSTOMER_ORDER_PLACED',
          details: {
            order_id: orderId,
            order_number: orderNumber,
            payable_amount: payableAmount,
            payment_method: payload.payment_method,
            coupon_code: validCoupon ? validCoupon.code : null,
          },
        });
      } catch (aErr) {
        console.warn('Failed to record audit log for customer order:', aErr);
      }

      return newOrder as Order;
    } catch (fallbackErr: any) {
      throw new Error(fallbackErr.message || 'Failed to place delivery order.');
    }
  },

  // 6. Get Customer Orders (Live & History)
  async getCustomerOrders(): Promise<Order[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        restaurant:restaurant_id(name, slug, logo_url, address, phone),
        items:order_items(*)
      `)
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error loading customer orders:', error);
      return [];
    }
    return (data as any[]) || [];
  },

  // 7. 3-Stage Progress Mapper
  mapOrderToCustomerStage(status: string): CustomerOrderProgress {
    switch (status) {
      case 'out_for_delivery':
      case 'served':
        return {
          stage: 'out_for_delivery',
          label: 'Out for Delivery',
          description: 'Your food is on the way with the delivery partner.',
          badgeColor: '#F59E0B',
        };
      case 'delivered':
      case 'completed':
        return {
          stage: 'delivered',
          label: 'Delivered',
          description: 'Order delivered successfully. Enjoy your meal!',
          badgeColor: '#10B981',
        };
      case 'cancelled':
        return {
          stage: 'delivered',
          label: 'Cancelled',
          description: 'This order was cancelled.',
          badgeColor: '#EF4444',
        };
      case 'confirmed':
      case 'preparing':
      case 'ready':
      default:
        return {
          stage: 'ordered',
          label: 'Order Confirmed',
          description: 'The kitchen is preparing your delicious meal.',
          badgeColor: '#3B82F6',
        };
    }
  },

  // 8. Get Single Order Details (Isolated to customer)
  async getOrderDetails(orderId: string): Promise<Order | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Authentication required.');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        restaurant:restaurant_id(id, name, slug, logo_url, address, phone),
        items:order_items(*)
      `)
      .eq('id', orderId)
      .eq('customer_id', user.id)
      .single();

    if (error) {
      console.warn('Error fetching order details:', error);
      return null;
    }
    return data as any;
  },

  // 9. Cancel Customer Order (Before preparation)
  async cancelCustomerOrder(orderId: string, reason: string): Promise<any> {
    const { data, error } = await supabase.rpc('cancel_customer_order', {
      p_order_id: orderId,
      p_reason: reason,
    });

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  // 10. Update Delivery Order Status (For Restaurant Staff / Admin)
  async updateDeliveryOrderStatus(
    orderId: string,
    newStatus: string,
    note?: string,
    paymentConfirmed: boolean = false
  ): Promise<any> {
    const { data, error } = await supabase.rpc('update_delivery_order_status', {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_note: note || null,
      p_payment_confirmed: paymentConfirmed,
    });

    if (error) {
      throw new Error(error.message);
    }
    return data;
  },

  // 11. Get Order Status Events (Timeline)
  async getOrderStatusEvents(orderId: string): Promise<OrderStatusEvent[]> {
    const { data, error } = await supabase
      .from('order_status_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Error fetching status events:', error);
      return [];
    }
    return (data as OrderStatusEvent[]) || [];
  },

  // 12. Prepare Reorder (Validates current prices and product availability)
  async prepareReorder(orderId: string): Promise<ReorderResult> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Authentication required.');

    // Fetch original order with items
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        id, restaurant_id,
        restaurant:restaurant_id(id, name, status),
        items:order_items(*)
      `)
      .eq('id', orderId)
      .eq('customer_id', user.id)
      .single();

    if (orderErr || !order) {
      throw new Error('Order not found for reorder.');
    }

    const rest = order.restaurant as any;
    if (rest?.status !== 'ACTIVE') {
      throw new Error('This restaurant is currently inactive or unavailable.');
    }

    const itemIds = (order.items || []).map((i: any) => i.product_id).filter(Boolean);

    // Fetch current live products
    const { data: liveProducts } = await supabase
      .from('products')
      .select('*')
      .in('id', itemIds)
      .eq('restaurant_id', order.restaurant_id)
      .eq('is_active', true);

    const liveProdMap = new Map((liveProducts || []).map((p) => [p.id, p]));

    const addedItems: CustomerCartItem[] = [];
    const unavailableItems: ReorderItemResult[] = [];

    for (const oldItem of order.items || []) {
      const live = liveProdMap.get(oldItem.product_id);
      if (live && live.is_available !== false && (live.stock_quantity === null || live.stock_quantity >= oldItem.quantity)) {
        addedItems.push({
          product_id: live.id,
          name: live.name,
          price: live.price,
          tax_rate: live.tax_rate || 5,
          food_type: live.food_type || 'VEG',
          image_url: live.image_url,
          quantity: oldItem.quantity,
          notes: oldItem.item_notes,
        });
      } else {
        unavailableItems.push({
          product_id: oldItem.product_id,
          name: oldItem.product_name,
          price: oldItem.unit_price,
          available: false,
          quantity: oldItem.quantity,
          reason: !live ? 'Product discontinued' : (live.is_available === false ? 'Temporarily unavailable' : 'Out of stock'),
        });
      }
    }

    return {
      restaurantId: order.restaurant_id,
      restaurantName: rest?.name || 'Restaurant',
      addedItems,
      unavailableItems,
    };
  },

  // 13. Update Customer Profile
  async updateCustomerProfile(userId: string, data: { full_name?: string; phone?: string }): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: data.full_name,
        phone: data.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(error.message);
    }
  },
};
