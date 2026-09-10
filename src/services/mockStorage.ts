import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RestaurantSettings,
  Category,
  Product,
  DiningTable,
  Coupon,
  Order,
  KOT,
  UserProfile,
  AuditLog,
} from '../types';

const SETTINGS_KEY = 'ratnadeep_settings';
const CATEGORIES_KEY = 'ratnadeep_categories';
const PRODUCTS_KEY = 'ratnadeep_products';
const TABLES_KEY = 'ratnadeep_tables';
const COUPONS_KEY = 'ratnadeep_coupons';
const ORDERS_KEY = 'ratnadeep_orders';
const KOTS_KEY = 'ratnadeep_kots';
const PROFILES_KEY = 'ratnadeep_profiles';
const AUDIT_KEY = 'ratnadeep_audit_logs';

export const DEFAULT_SETTINGS: RestaurantSettings = {
  id: '',
  name: 'RestroZ Restaurant',
  legal_name: 'Ratnadeep Foods Pvt Ltd',
  address: 'Road No. 36, Jubilee Hills, Hyderabad - 500033',
  phone: '+91 98765 43210',
  email: 'contact@ratnadeepfoods.com',
  gstin: '36AAAAA0000A1Z5',
  state: 'Telangana',
  logo_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=200&q=80',
  invoice_prefix: 'INV-',
  kot_prefix: 'KOT-',
  default_tax_rate: 5.0,
  currency: 'INR',
  currency_symbol: '₹',
  service_charge_rate: 0.0,
  kot_paper_size: '80mm',
  bill_paper_size: '80mm',
  auto_print_kot: false,
};

export const SEED_PROFILES: UserProfile[] = [
  {
    id: 'user-admin',
    email: 'ratnadeepdey13@gmail.com',
    full_name: 'Ratnadeep Dey (Admin)',
    phone: '+91 99999 11111',
    role: 'ADMIN',
    created_at: new Date().toISOString(),
  },
  {
    id: 'user-staff',
    email: 'souvik@yopmail.com',
    full_name: 'Souvik Staff',
    phone: '+91 99999 22222',
    role: 'STAFF',
    created_at: new Date().toISOString(),
  },
  {
    id: 'user-customer',
    email: 'raj@yopmail.com',
    full_name: 'Raj Customer',
    phone: '+91 99999 33333',
    role: 'CUSTOMER',
    created_at: new Date().toISOString(),
  },
];

export const SEED_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'Biryani',
    slug: 'biryani',
    description: 'Authentic Hyderabadi Dum Biryanis',
    image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    display_order: 1,
    is_active: true,
  },
  {
    id: 'cat-2',
    name: 'Starters',
    slug: 'starters',
    description: 'Crispy, spicy & succulent tandoori starters',
    image_url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=600&q=80',
    display_order: 2,
    is_active: true,
  },
  {
    id: 'cat-3',
    name: 'Main Course',
    slug: 'main-course',
    description: 'Rich Indian curries & breads',
    image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    display_order: 3,
    is_active: true,
  },
  {
    id: 'cat-4',
    name: 'Chinese',
    slug: 'chinese',
    description: 'Wok-tossed noodles & Manchurian',
    image_url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80',
    display_order: 4,
    is_active: true,
  },
  {
    id: 'cat-5',
    name: 'Beverages',
    slug: 'beverages',
    description: 'Refreshing mocktails & lassi',
    image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    display_order: 5,
    is_active: true,
  },
  {
    id: 'cat-6',
    name: 'Desserts',
    slug: 'desserts',
    description: 'Traditional Nizami sweets',
    image_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
    display_order: 6,
    is_active: true,
  },
];

export const SEED_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    sku: 'BIR-001',
    name: 'Hyderabadi Chicken Dum Biryani',
    category_id: 'cat-1',
    category_name: 'Biryani',
    description: 'Layered basmati rice cooked with chicken & secret spices in dum style.',
    food_type: 'non-veg',
    price: 340,
    discounted_price: 320,
    tax_rate: 5,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 45,
    unit: 'full portion',
    preparation_time_mins: 20,
    is_active: true,
  },
  {
    id: 'prod-2',
    sku: 'BIR-002',
    name: 'Mutton Dum Biryani',
    category_id: 'cat-1',
    category_name: 'Biryani',
    description: 'Tender baby lamb marinated overnight & slow cooked with saffron rice.',
    food_type: 'non-veg',
    price: 450,
    discounted_price: 420,
    tax_rate: 5,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 30,
    unit: 'full portion',
    preparation_time_mins: 25,
    is_active: true,
  },
  {
    id: 'prod-3',
    sku: 'STR-001',
    name: 'Apollo Fish Fry',
    category_id: 'cat-2',
    category_name: 'Starters',
    description: 'Boneless fish fillets tossed in curry leaves & spicy yoghurt sauce.',
    food_type: 'non-veg',
    price: 380,
    tax_rate: 5,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 20,
    unit: 'plate',
    preparation_time_mins: 15,
    is_active: true,
  },
  {
    id: 'prod-4',
    sku: 'STR-002',
    name: 'Paneer 65',
    category_id: 'cat-2',
    category_name: 'Starters',
    description: 'Crispy cottage cheese cubes sauteed in garlic chili sauce.',
    food_type: 'veg',
    price: 260,
    tax_rate: 5,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 35,
    unit: 'plate',
    preparation_time_mins: 12,
    is_active: true,
  },
  {
    id: 'prod-5',
    sku: 'MAIN-001',
    name: 'Butter Chicken Gravy',
    category_id: 'cat-3',
    category_name: 'Main Course',
    description: 'Smoked tandoori chicken simmered in rich creamy tomato butter gravy.',
    food_type: 'non-veg',
    price: 350,
    tax_rate: 5,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 30,
    unit: 'portion',
    preparation_time_mins: 15,
    is_active: true,
  },
  {
    id: 'prod-6',
    sku: 'BEV-001',
    name: 'Mango Lassi',
    category_id: 'cat-5',
    category_name: 'Beverages',
    description: 'Thick chilled sweet yoghurt blended with Alphonso mango pulp.',
    food_type: 'veg',
    price: 110,
    tax_rate: 5,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 50,
    unit: 'glass',
    preparation_time_mins: 5,
    is_active: true,
  },
];

export const SEED_TABLES: DiningTable[] = [
  { id: 'tbl-1', table_number: 'Table 1', seating_capacity: 4, section: 'Ground Floor', is_active: true, qr_code_hash: 'QR_TBL_1', status: 'available' },
  { id: 'tbl-2', table_number: 'Table 2', seating_capacity: 4, section: 'Ground Floor', is_active: true, qr_code_hash: 'QR_TBL_2', status: 'available' },
  { id: 'tbl-3', table_number: 'Table 3', seating_capacity: 2, section: 'Ground Floor', is_active: true, qr_code_hash: 'QR_TBL_3', status: 'available' },
  { id: 'tbl-4', table_number: 'Table 4', seating_capacity: 6, section: 'First Floor', is_active: true, qr_code_hash: 'QR_TBL_4', status: 'available' },
  { id: 'tbl-5', table_number: 'Table 5', seating_capacity: 8, section: 'VIP Section', is_active: true, qr_code_hash: 'QR_TBL_5', status: 'available' },
  { id: 'tbl-6', table_number: 'Table 6', seating_capacity: 4, section: 'Outdoor', is_active: true, qr_code_hash: 'QR_TBL_6', status: 'available' },
  { id: 'tbl-7', table_number: 'Table 7', seating_capacity: 6, section: 'AC Section', is_active: true, qr_code_hash: 'QR_TBL_7', status: 'available' },
];

export const SEED_COUPONS: Coupon[] = [
  {
    id: 'coup-1',
    code: 'WELCOME10',
    description: '10% discount on orders above ₹300',
    discount_type: 'percentage',
    discount_value: 10,
    min_order_value: 300,
    max_discount: 150,
    per_user_limit: 1,
    used_count: 14,
    is_active: true,
  },
  {
    id: 'coup-2',
    code: 'FOOD100',
    description: 'Flat ₹100 OFF on orders above ₹600',
    discount_type: 'fixed',
    discount_value: 100,
    min_order_value: 600,
    per_user_limit: 2,
    used_count: 8,
    is_active: true,
  },
];

// Memory fallback cache for synchronous quick reads
let inMemoryData: Record<string, any> = {
  [SETTINGS_KEY]: DEFAULT_SETTINGS,
  [CATEGORIES_KEY]: SEED_CATEGORIES,
  [PRODUCTS_KEY]: SEED_PRODUCTS,
  [TABLES_KEY]: SEED_TABLES,
  [COUPONS_KEY]: SEED_COUPONS,
  [ORDERS_KEY]: [],
  [KOTS_KEY]: [],
  [PROFILES_KEY]: SEED_PROFILES,
  [AUDIT_KEY]: [],
};

export const mockStorage = {
  getSettings: (): RestaurantSettings => inMemoryData[SETTINGS_KEY],
  saveSettings: (settings: RestaurantSettings) => {
    inMemoryData[SETTINGS_KEY] = settings;
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  },

  getCategories: (): Category[] => inMemoryData[CATEGORIES_KEY],
  saveCategories: (cats: Category[]) => {
    inMemoryData[CATEGORIES_KEY] = cats;
    AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats)).catch(() => {});
  },

  getProducts: (): Product[] => inMemoryData[PRODUCTS_KEY],
  saveProducts: (prods: Product[]) => {
    inMemoryData[PRODUCTS_KEY] = prods;
    AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(prods)).catch(() => {});
  },

  getTables: (): DiningTable[] => inMemoryData[TABLES_KEY],
  saveTables: (tbls: DiningTable[]) => {
    inMemoryData[TABLES_KEY] = tbls;
    AsyncStorage.setItem(TABLES_KEY, JSON.stringify(tbls)).catch(() => {});
  },

  getCoupons: (): Coupon[] => inMemoryData[COUPONS_KEY],
  saveCoupons: (coups: Coupon[]) => {
    inMemoryData[COUPONS_KEY] = coups;
    AsyncStorage.setItem(COUPONS_KEY, JSON.stringify(coups)).catch(() => {});
  },

  getOrders: (restaurantId?: string): Order[] => {
    const list = inMemoryData[ORDERS_KEY] || [];
    if (!restaurantId) return list;
    return list.filter((o: Order) => o.restaurant_id === restaurantId);
  },
  saveOrders: (orders: Order[], restaurantId?: string) => {
    const existing = inMemoryData[ORDERS_KEY] || [];
    const map = new Map<string, Order>();
    existing.forEach((o: Order) => {
      if (o && o.id) map.set(o.id, o);
    });
    orders.forEach((o: Order) => {
      if (o && o.id) {
        if (restaurantId && !o.restaurant_id) {
          o.restaurant_id = restaurantId;
        }
        map.set(o.id, { ...(map.get(o.id) || {}), ...o });
      }
    });
    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
    );
    inMemoryData[ORDERS_KEY] = merged;
    AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(merged)).catch(() => {});
  },

  getKots: (restaurantId?: string): KOT[] => {
    const list = inMemoryData[KOTS_KEY] || [];
    if (!restaurantId) return list;
    return list.filter((k: KOT) => k.restaurant_id === restaurantId);
  },
  saveKots: (kots: KOT[], restaurantId?: string) => {
    if (restaurantId) {
      const existing = (inMemoryData[KOTS_KEY] || []).filter((k: KOT) => k.restaurant_id !== restaurantId);
      const scoped = kots.filter((k: KOT) => k.restaurant_id === restaurantId);
      inMemoryData[KOTS_KEY] = [...scoped, ...existing];
    } else {
      inMemoryData[KOTS_KEY] = kots;
    }
    AsyncStorage.setItem(KOTS_KEY, JSON.stringify(inMemoryData[KOTS_KEY])).catch(() => {});
  },

  getProfiles: (): UserProfile[] => inMemoryData[PROFILES_KEY],
  saveProfiles: (profiles: UserProfile[]) => {
    inMemoryData[PROFILES_KEY] = profiles;
    AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles)).catch(() => {});
  },

  getAuditLogs: (): AuditLog[] => inMemoryData[AUDIT_KEY],
  addAuditLog: (log: Omit<AuditLog, 'id' | 'created_at'>) => {
    const logs = inMemoryData[AUDIT_KEY] || [];
    const newLog: AuditLog = {
      ...log,
      id: 'audit-' + Date.now(),
      created_at: new Date().toISOString(),
    };
    logs.unshift(newLog);
    inMemoryData[AUDIT_KEY] = logs;
    AsyncStorage.setItem(AUDIT_KEY, JSON.stringify(logs)).catch(() => {});
  },

  updateProduct: (id: string, updates: Partial<Product>): Product | null => {
    const prods: Product[] = inMemoryData[PRODUCTS_KEY] || [];
    const idx = prods.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const updated = { ...prods[idx], ...updates };
    prods[idx] = updated;
    mockStorage.saveProducts(prods);
    return updated;
  },
  addProduct: (item: Omit<Product, 'id'>): Product => {
    const prods: Product[] = inMemoryData[PRODUCTS_KEY] || [];
    const newProd = { ...item, id: 'prod-' + Date.now() } as Product;
    prods.push(newProd);
    mockStorage.saveProducts(prods);
    return newProd;
  },
  deleteProduct: (id: string) => {
    const prods: Product[] = inMemoryData[PRODUCTS_KEY] || [];
    mockStorage.saveProducts(prods.filter((p) => p.id !== id));
  },

  updateCategory: (id: string, updates: Partial<Category>): Category | null => {
    const cats: Category[] = inMemoryData[CATEGORIES_KEY] || [];
    const idx = cats.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated = { ...cats[idx], ...updates };
    cats[idx] = updated;
    mockStorage.saveCategories(cats);
    return updated;
  },
  addCategory: (item: Omit<Category, 'id'>): Category => {
    const cats: Category[] = inMemoryData[CATEGORIES_KEY] || [];
    const newCat = { ...item, id: 'cat-' + Date.now() } as Category;
    cats.push(newCat);
    mockStorage.saveCategories(cats);
    return newCat;
  },
  deleteCategory: (id: string) => {
    const cats: Category[] = inMemoryData[CATEGORIES_KEY] || [];
    mockStorage.saveCategories(cats.filter((c) => c.id !== id));
  },

  updateTable: (id: string, updates: Partial<DiningTable>): DiningTable | null => {
    const tbls: DiningTable[] = inMemoryData[TABLES_KEY] || [];
    const idx = tbls.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const updated = { ...tbls[idx], ...updates };
    tbls[idx] = updated;
    mockStorage.saveTables(tbls);
    return updated;
  },
  addTable: (item: Omit<DiningTable, 'id'>): DiningTable => {
    const tbls: DiningTable[] = inMemoryData[TABLES_KEY] || [];
    const newTbl = { ...item, id: 'tbl-' + Date.now() } as DiningTable;
    tbls.push(newTbl);
    mockStorage.saveTables(tbls);
    return newTbl;
  },
  deleteTable: (id: string) => {
    const tbls: DiningTable[] = inMemoryData[TABLES_KEY] || [];
    mockStorage.saveTables(tbls.filter((t) => t.id !== id));
  },

  updateCoupon: (id: string, updates: Partial<Coupon>): Coupon | null => {
    const coups: Coupon[] = inMemoryData[COUPONS_KEY] || [];
    const idx = coups.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated = { ...coups[idx], ...updates };
    coups[idx] = updated;
    mockStorage.saveCoupons(coups);
    return updated;
  },
  addCoupon: (item: Omit<Coupon, 'id'>): Coupon => {
    const coups: Coupon[] = inMemoryData[COUPONS_KEY] || [];
    const newCoup = { ...item, id: 'coup-' + Date.now() } as Coupon;
    coups.push(newCoup);
    mockStorage.saveCoupons(coups);
    return newCoup;
  },
  deleteCoupon: (id: string) => {
    const coups: Coupon[] = inMemoryData[COUPONS_KEY] || [];
    mockStorage.saveCoupons(coups.filter((c) => c.id !== id));
  },
};
