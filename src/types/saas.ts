import { Restaurant, RestaurantMember, UserProfile } from './index';

export type SubscriptionPlanBillingCycle = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended' | 'cancelled';

export type SubscriptionPaymentMethod = 'cash' | 'bank_transfer' | 'upi' | 'card' | 'online' | 'other';

export type SubscriptionPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface PlanFeatures {
  qr_ordering?: boolean;
  inventory?: boolean;
  reports?: boolean;
  analytics?: boolean;
  multi_terminal?: boolean;
  table_management?: boolean;
  custom_branding?: boolean;
  api_access?: boolean;
  [key: string]: boolean | undefined;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  description?: string;
  billing_cycle: SubscriptionPlanBillingCycle;
  price: number;
  currency: string;
  max_staff: number;
  max_tables: number;
  max_products: number;
  features: PlanFeatures;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface RestaurantSubscription {
  id: string;
  restaurant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  trial_start?: string | null;
  trial_end?: string | null;
  auto_renew: boolean;
  amount: number;
  currency: string;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
  plan?: SubscriptionPlan;
  restaurant?: Restaurant;
}

export interface SubscriptionPayment {
  id: string;
  restaurant_id: string;
  subscription_id?: string | null;
  amount: number;
  currency: string;
  payment_method: SubscriptionPaymentMethod;
  payment_reference?: string | null;
  payment_status: SubscriptionPaymentStatus;
  paid_at: string;
  recorded_by?: string | null;
  notes?: string | null;
  created_at: string;
  restaurant?: Restaurant;
  recorder_profile?: UserProfile;
}

export interface SuperAdminDashboardMetrics {
  totalRestaurants: number;
  activeRestaurants: number;
  suspendedRestaurants: number;
  totalAdmins: number;
  activeSubscriptions: number;
  expiringSoonSubscriptions: number;
  expiredSubscriptions: number;
  monthlyRevenue: number;
}

export interface RestaurantDetailStats {
  productCount: number;
  tableCount: number;
  orderCount: number;
  staffCount: number;
  activeSubscription?: RestaurantSubscription | null;
}

export interface CreateRestaurantPayload {
  name: string;
  slug: string;
  legal_name?: string;
  logo_url?: string;
  banner_url?: string;
  phone?: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country?: string;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  status?: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
}

export interface CreateRestaurantAdminPayload {
  restaurant_id: string;
  full_name: string;
  email: string;
  phone?: string;
  password?: string;
}
