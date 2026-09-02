export interface RestaurantMemberPermissions {
  id?: string;
  restaurant_member_id: string;
  can_use_pos: boolean;
  can_view_orders: boolean;
  can_edit_orders: boolean;
  can_cancel_orders: boolean;
  can_manage_products: boolean;
  can_manage_categories: boolean;
  can_manage_tables: boolean;
  can_manage_coupons: boolean;
  can_view_reports: boolean;
  can_manage_register: boolean;
  can_view_settings: boolean;
  can_manage_settings: boolean;
  can_manage_staff: boolean;
  created_at?: string;
  updated_at?: string;
}

export type StaffPermissionPreset = 'CASHIER' | 'WAITER' | 'MANAGER' | 'KITCHEN' | 'CUSTOM';

export interface StaffMemberWithDetails {
  id: string; // restaurant_members.id
  user_id: string;
  restaurant_id: string;
  role: 'ADMIN' | 'STAFF';
  is_active: boolean;
  created_at: string;
  full_name: string;
  email: string;
  phone?: string;
  permissions: RestaurantMemberPermissions;
  preset?: StaffPermissionPreset;
}

export interface ResourceUsageMetric {
  current: number;
  max: number | null;
  is_unlimited: boolean;
  percentage: number;
}

export interface RestaurantPlanUsage {
  restaurant_id: string;
  plan: {
    id: string;
    name: string;
    code: string;
    status: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' | 'INACTIVE';
    start_date?: string;
    end_date?: string;
    price: number;
    billing_cycle: 'monthly' | 'yearly';
  };
  staff: ResourceUsageMetric;
  tables: ResourceUsageMetric;
  products: ResourceUsageMetric;
  features: Record<string, boolean>;
}

export const PERMISSION_PRESETS: Record<Exclude<StaffPermissionPreset, 'CUSTOM'>, Omit<RestaurantMemberPermissions, 'id' | 'restaurant_member_id' | 'created_at' | 'updated_at'>> = {
  CASHIER: {
    can_use_pos: true,
    can_view_orders: true,
    can_edit_orders: false,
    can_cancel_orders: false,
    can_manage_products: false,
    can_manage_categories: false,
    can_manage_tables: false,
    can_manage_coupons: false,
    can_view_reports: false,
    can_manage_register: true,
    can_view_settings: false,
    can_manage_settings: false,
    can_manage_staff: false,
  },
  WAITER: {
    can_use_pos: true,
    can_view_orders: true,
    can_edit_orders: true,
    can_cancel_orders: false,
    can_manage_products: false,
    can_manage_categories: false,
    can_manage_tables: true,
    can_manage_coupons: false,
    can_view_reports: false,
    can_manage_register: false,
    can_view_settings: false,
    can_manage_settings: false,
    can_manage_staff: false,
  },
  MANAGER: {
    can_use_pos: true,
    can_view_orders: true,
    can_edit_orders: true,
    can_cancel_orders: true,
    can_manage_products: true,
    can_manage_categories: true,
    can_manage_tables: true,
    can_manage_coupons: true,
    can_view_reports: true,
    can_manage_register: true,
    can_view_settings: true,
    can_manage_settings: false,
    can_manage_staff: false,
  },
  KITCHEN: {
    can_use_pos: false,
    can_view_orders: true,
    can_edit_orders: false,
    can_cancel_orders: false,
    can_manage_products: false,
    can_manage_categories: false,
    can_manage_tables: false,
    can_manage_coupons: false,
    can_view_reports: false,
    can_manage_register: false,
    can_view_settings: false,
    can_manage_settings: false,
    can_manage_staff: false,
  },
};
