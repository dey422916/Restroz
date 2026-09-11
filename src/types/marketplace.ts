import { FoodType, Restaurant } from './index';

export interface RestaurantPublicProfile {
  id: string;
  restaurant_id: string;
  marketplace_enabled: boolean;
  accepts_delivery: boolean;
  accepts_takeaway: boolean;
  is_open: boolean;
  delivery_radius_km: number;
  minimum_order_value: number;
  estimated_delivery_minutes: number;
  cuisine_tags: string[];
  banner_url?: string;
  banner_urls?: string[];
  gallery_urls?: string[];
  public_description?: string;
  opening_time: string;
  closing_time: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number;
  is_outside_radius?: boolean;
  created_at: string;
  updated_at?: string;
  restaurant?: Restaurant;
}

export interface CustomerAddress {
  id: string;
  user_id: string;
  label: 'Home' | 'Work' | 'Other' | string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postal_code: string;
  latitude?: number;
  longitude?: number;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CustomerCartItem {
  product_id: string;
  name: string;
  price: number;
  tax_rate: number;
  food_type: FoodType;
  image_url?: string;
  quantity: number;
  notes?: string;
}

export interface CustomerCart {
  restaurantId: string | null;
  restaurantName: string | null;
  restaurantLogo?: string | null;
  items: CustomerCartItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  taxTotal: number;
  deliveryFee: number;
  couponCode?: string;
  payableAmount: number;
  isGstEnabled?: boolean;
  taxRate?: number;
}

export interface DeliveryOrderPayload {
  restaurant_id: string;
  items: Array<{
    product_id: string;
    quantity: number;
    notes?: string;
  }>;
  delivery_address: CustomerAddress | string;
  customer_name: string;
  customer_phone: string;
  payment_method: 'cod' | 'online';
  coupon_code?: string;
  delivery_notes?: string;
  idempotency_key?: string;
}

export type CustomerOrderStage = 'ordered' | 'out_for_delivery' | 'delivered';

export interface CustomerOrderProgress {
  stage: CustomerOrderStage;
  label: string;
  description: string;
  badgeColor: string;
}

export interface OrderStatusEvent {
  id: string;
  order_id: string;
  restaurant_id: string;
  old_status?: string;
  new_status: string;
  changed_by?: string;
  actor_type: 'CUSTOMER' | 'RESTAURANT_STAFF' | 'RESTAURANT_ADMIN' | 'SUPER_ADMIN' | 'SYSTEM';
  note?: string;
  created_at: string;
}

export interface CustomerNotification {
  id: string;
  user_id: string;
  order_id?: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export interface ReorderItemResult {
  product_id: string;
  name: string;
  price: number;
  available: boolean;
  quantity: number;
  reason?: string;
}

export interface ReorderResult {
  restaurantId: string;
  restaurantName: string;
  addedItems: CustomerCartItem[];
  unavailableItems: ReorderItemResult[];
}
