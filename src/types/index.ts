export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'CUSTOMER';

export type RestaurantStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  legal_name?: string;
  logo_url?: string;
  banner_url?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  status: RestaurantStatus;
  banner_urls?: string[];
  gallery_urls?: string[];
  created_at: string;
  updated_at?: string;
}

export interface RestaurantMember {
  id: string;
  restaurant_id: string;
  user_id: string;
  role: 'ADMIN' | 'STAFF';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  restaurant?: Restaurant;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  created_at: string;
  updated_at?: string;
}

export type PaperSize = '58mm' | '80mm' | 'A4';

export interface RestaurantSettings {
  id: string;
  restaurant_id?: string;
  name: string;
  legal_name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  state: string;
  logo_url?: string;
  banner_url?: string;
  banner_urls?: string[];
  gallery_urls?: string[];
  invoice_prefix: string;
  kot_prefix: string;
  default_tax_rate: number;
  currency: string;
  currency_symbol: string;
  service_charge_rate: number;
  kot_paper_size?: PaperSize;
  bill_paper_size?: PaperSize;
  auto_print_kot?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  id: string;
  restaurant_id?: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  display_order: number;
  is_active: boolean;
  item_count?: number;
}

export type FoodType = 'veg' | 'non-veg' | 'egg';

export interface Product {
  id: string;
  restaurant_id?: string;
  sku: string;
  name: string;
  category_id: string;
  category_name?: string;
  description?: string;
  food_type: FoodType;
  price: number;
  discounted_price?: number;
  tax_rate: number;
  hsn_code: string;
  image_url?: string;
  images?: string[];
  is_available: boolean;
  stock_quantity: number;
  unit: string;
  preparation_time_mins: number;
  is_active: boolean;
  created_at?: string;
}

export type TableSection = 'Ground Floor' | 'First Floor' | 'Outdoor' | 'AC Section' | 'VIP Section' | 'VIP';
export type TableStatus = 'available' | 'occupied' | 'reserved';

export interface DiningTable {
  id: string;
  restaurant_id?: string;
  table_number: string;
  seating_capacity: number;
  section: TableSection;
  is_active: boolean;
  qr_code_hash: string;
  status: TableStatus;
  current_order_id?: string;
}

export type OrderType = 'dine_in' | 'takeaway' | 'delivery';

export type OrderStatus =
  | 'draft'
  | 'held'
  | 'confirmed'
  | 'kot_generated'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

export type OrderSource = 'POS' | 'CUSTOMER_QR' | 'CUSTOMER_APP';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  tax_rate: number;
  tax_amount: number;
  item_notes?: string;
  subtotal: number;
  total: number;
  image_url?: string;
}

export interface Order {
  id: string;
  restaurant_id?: string;
  order_number: string;
  order_type: OrderType;
  order_source?: OrderSource;
  table_id?: string;
  table_number?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  delivery_landmark?: string;
  delivery_charge: number;
  status: OrderStatus;
  subtotal: number;
  discount_type?: 'none' | 'fixed' | 'percentage';
  discount_value?: number;
  discount_amount: number;
  taxable_amount?: number;
  coupon_code?: string;
  coupon_discount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  service_charge: number;
  grand_total: number;
  round_off: number;
  payable_amount: number;
  final_amount?: number;
  paid_amount?: number;
  payment_method?: string;
  payment_status: PaymentStatus;
  notes?: string;
  items: OrderItem[];
  kots?: KOT[];
  payments?: Payment[];
  stock_deducted?: boolean;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface KOTItem {
  id: string;
  kot_id: string;
  product_name: string;
  quantity: number;
  notes?: string;
}

export interface KOT {
  id: string;
  restaurant_id?: string;
  kot_number: string;
  order_id: string;
  order_number?: string;
  order_type: OrderType;
  table_number?: string;
  customer_name?: string;
  kitchen_notes?: string;
  status: 'pending' | 'in_progress' | 'ready' | 'served';
  items: KOTItem[];
  created_at: string;
}

export type DiscountType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  restaurant_id?: string;
  code: string;
  description?: string;
  discount_type: DiscountType;
  discount_value: number;
  min_order_value: number;
  max_discount?: number;
  per_user_limit: number;
  usage_limit?: number;
  used_count: number;
  is_active: boolean;
  start_date?: string;
  expiry_date?: string;
  created_at?: string;
  updated_at?: string;
}

export type PaymentMethod = 'cash' | 'card' | 'upi' | 'room' | 'other' | 'split' | 'due';

export interface Payment {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  amount: number;
  reference_number?: string;
  notes?: string;
  created_at: string;
}

export interface SplitPerson {
  id: string;
  name: string;
  amount: number;
  items?: OrderItem[];
  payment_method?: PaymentMethod;
  paymentMethod?: PaymentMethod;
  is_paid?: boolean;
  isPaid?: boolean;
}

export type SplitPayment = SplitPerson;

export interface AuditLog {
  id: string;
  restaurant_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  performed_by?: string;
  performed_by_name?: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
}

export interface SavedAddress {
  id: string;
  user_id: string;
  label: string;
  address: string;
  landmark?: string;
  is_default: boolean;
  created_at: string;
}

export type RegisterStatus = 'open' | 'closed';

export interface DayRegister {
  id: string;
  restaurant_id?: string;
  register_date: string; // YYYY-MM-DD (local restaurant cycle 00:00-24:00)
  status: RegisterStatus;
  opening_cash_float: number;
  cash_sales: number;
  upi_sales: number;
  card_sales: number;
  digital_sales?: number;
  total_sales: number;
  expected_cash: number;
  actual_cash_counted?: number;
  cash_difference?: number;
  notes?: string;
  opened_at: string;
  opened_by: string;
  closed_at?: string;
  closed_by?: string;
}

export interface ItemSalesSummary {
  product_id: string;
  product_name: string;
  sku: string;
  category_name: string;
  food_type: FoodType;
  units_sold: number;
  total_revenue: number;
  average_price: number;
  share_percentage: number;
}

export interface DaySalesSummary {
  date: string; // YYYY-MM-DD
  formatted_date: string;
  total_orders: number;
  paid_orders_count: number;
  cancelled_orders_count: number;
  gross_sales: number;
  discount_amount: number;
  tax_collected: number;
  net_sales: number;
  cash_sales: number;
  upi_sales: number;
  card_sales: number;
  dine_in_sales: number;
  takeaway_sales: number;
  delivery_sales: number;
  qr_sales: number;
  average_order_value: number;
}

export * from './saas';
export * from './marketplace';
export * from './permissions';
