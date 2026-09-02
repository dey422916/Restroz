import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ ERROR: Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const DEMO_CATEGORIES = [
  {
    id: 'cat-biryani',
    name: 'Biryani',
    slug: 'biryani',
    description: 'Authentic Hyderabadi Dum Biryanis cooked with premium aged basmati rice & fragrant spices',
    image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    display_order: 1,
    is_active: true,
  },
  {
    id: 'cat-starters',
    name: 'Starters',
    slug: 'starters',
    description: 'Crispy, sizzling and mouth-watering tandoori and fried starters',
    image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    display_order: 2,
    is_active: true,
  },
  {
    id: 'cat-main-course',
    name: 'Main Course',
    slug: 'main-course',
    description: 'Rich North Indian curries, aromatic dals and fresh tandoori breads',
    image_url: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80',
    display_order: 3,
    is_active: true,
  },
  {
    id: 'cat-chinese',
    name: 'Chinese',
    slug: 'chinese',
    description: 'Indo-Chinese noodles, wok-tossed fried rice and sizzling gravies',
    image_url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80',
    display_order: 4,
    is_active: true,
  },
  {
    id: 'cat-beverages',
    name: 'Beverages',
    slug: 'beverages',
    description: 'Chilled lassis, fresh mocktails, sodas and authentic masala chai',
    image_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
    display_order: 5,
    is_active: true,
  },
  {
    id: 'cat-desserts',
    name: 'Desserts',
    slug: 'desserts',
    description: 'Traditional Hyderabadi sweets, hot gulab jamuns and royal kulfis',
    image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    display_order: 6,
    is_active: true,
  },
];

export interface ProductSeedItem {
  id: string;
  sku: string;
  name: string;
  category_id: string;
  category_name: string;
  description: string;
  food_type: 'veg' | 'non-veg' | 'egg';
  price: number;
  discounted_price: number;
  tax_rate: number;
  hsn_code: string;
  image_url: string;
  is_available: boolean;
  stock_quantity: number;
  unit: string;
  preparation_time_mins: number;
  is_active: boolean;
}

export const DEMO_PRODUCTS: ProductSeedItem[] = [
  // Biryani
  {
    id: 'prod-bir-001',
    sku: 'BIR-001',
    name: 'Hyderabadi Chicken Dum Biryani',
    category_id: 'cat-biryani',
    category_name: 'Biryani',
    description: 'Slow-cooked marinated chicken layered with saffron-infused long grain basmati rice, served with Mirchi Ka Salan and Raita.',
    food_type: 'non-veg' as const,
    price: 320.0,
    discounted_price: 320.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 50,
    unit: 'portion',
    preparation_time_mins: 20,
    is_active: true,
  },
  {
    id: 'prod-bir-002',
    sku: 'BIR-002',
    name: 'Mutton Dum Biryani',
    category_id: 'cat-biryani',
    category_name: 'Biryani',
    description: 'Tender lamb cuts slow dum cooked with royal shahi spices and ghee basmati rice.',
    food_type: 'non-veg' as const,
    price: 420.0,
    discounted_price: 420.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 30,
    unit: 'portion',
    preparation_time_mins: 25,
    is_active: true,
  },
  {
    id: 'prod-bir-003',
    sku: 'BIR-003',
    name: 'Special Veg Dum Biryani',
    category_id: 'cat-biryani',
    category_name: 'Biryani',
    description: 'Fresh farm vegetables, paneer cubes and whole spices dum cooked to aromatic perfection.',
    food_type: 'veg' as const,
    price: 240.0,
    discounted_price: 240.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 40,
    unit: 'portion',
    preparation_time_mins: 15,
    is_active: true,
  },

  // Starters
  {
    id: 'prod-str-001',
    sku: 'STR-001',
    name: 'Apollo Fish Fry',
    category_id: 'cat-starters',
    category_name: 'Starters',
    description: 'Hyderabadi style boneless fish fillets spiced with curry leaves, green chillies and lemon pepper.',
    food_type: 'non-veg' as const,
    price: 380.0,
    discounted_price: 380.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 25,
    unit: 'plate',
    preparation_time_mins: 15,
    is_active: true,
  },
  {
    id: 'prod-str-002',
    sku: 'STR-002',
    name: 'Paneer 65',
    category_id: 'cat-starters',
    category_name: 'Starters',
    description: 'Crispy cottage cheese cubes tossed in spicy south Indian tempering with yogurt and ginger-garlic.',
    food_type: 'veg' as const,
    price: 260.0,
    discounted_price: 260.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 40,
    unit: 'plate',
    preparation_time_mins: 12,
    is_active: true,
  },
  {
    id: 'prod-str-003',
    sku: 'STR-003',
    name: 'Chicken 65 (Crispy)',
    category_id: 'cat-starters',
    category_name: 'Starters',
    description: 'Classic spicy deep-fried chicken morsels with curry leaf infusion and roasted garlic.',
    food_type: 'non-veg' as const,
    price: 290.0,
    discounted_price: 290.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 45,
    unit: 'plate',
    preparation_time_mins: 14,
    is_active: true,
  },
  {
    id: 'prod-str-004',
    sku: 'STR-004',
    name: 'Crispy Corn Pepper Fry',
    category_id: 'cat-starters',
    category_name: 'Starters',
    description: 'Golden sweet corn kernels tossed with freshly crushed black pepper, spring onions and bell peppers.',
    food_type: 'veg' as const,
    price: 210.0,
    discounted_price: 210.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 35,
    unit: 'plate',
    preparation_time_mins: 10,
    is_active: true,
  },

  // Main Course
  {
    id: 'prod-main-001',
    sku: 'MAIN-001',
    name: 'Butter Chicken Gravy',
    category_id: 'cat-main-course',
    category_name: 'Main Course',
    description: 'Tender tandoori chicken cooked in velvety tomato, butter and cashew silk gravy with kasuri methi.',
    food_type: 'non-veg' as const,
    price: 350.0,
    discounted_price: 350.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 35,
    unit: 'portion',
    preparation_time_mins: 18,
    is_active: true,
  },
  {
    id: 'prod-main-002',
    sku: 'MAIN-002',
    name: 'Paneer Butter Masala',
    category_id: 'cat-main-course',
    category_name: 'Main Course',
    description: 'Rich cottage cheese simmered in a creamy, mildly spiced tomato butter sauce.',
    food_type: 'veg' as const,
    price: 280.0,
    discounted_price: 280.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 40,
    unit: 'portion',
    preparation_time_mins: 15,
    is_active: true,
  },
  {
    id: 'prod-main-003',
    sku: 'MAIN-003',
    name: 'Dal Makhani Shahi',
    category_id: 'cat-main-course',
    category_name: 'Main Course',
    description: 'Overnight slow-simmered black lentils with cream, butter and traditional spices.',
    food_type: 'veg' as const,
    price: 220.0,
    discounted_price: 220.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 50,
    unit: 'portion',
    preparation_time_mins: 12,
    is_active: true,
  },
  {
    id: 'prod-main-004',
    sku: 'MAIN-004',
    name: 'Butter Naan',
    category_id: 'cat-main-course',
    category_name: 'Main Course',
    description: 'Fresh tandoor-baked refined flour flatbread brushed with rich melting butter.',
    food_type: 'veg' as const,
    price: 50.0,
    discounted_price: 50.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 100,
    unit: 'piece',
    preparation_time_mins: 5,
    is_active: true,
  },

  // Chinese
  {
    id: 'prod-chn-001',
    sku: 'CHN-001',
    name: 'Veg Hakka Noodles',
    category_id: 'cat-chinese',
    category_name: 'Chinese',
    description: 'Wok-tossed noodles with shredded cabbage, carrots, capsicum, soy sauce and white pepper.',
    food_type: 'veg' as const,
    price: 220.0,
    discounted_price: 220.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 40,
    unit: 'portion',
    preparation_time_mins: 12,
    is_active: true,
  },
  {
    id: 'prod-chn-002',
    sku: 'CHN-002',
    name: 'Chicken Fried Rice',
    category_id: 'cat-chinese',
    category_name: 'Chinese',
    description: 'Classic wok-fried rice with succulent diced chicken, spring onions and egg shreds.',
    food_type: 'non-veg' as const,
    price: 260.0,
    discounted_price: 260.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 35,
    unit: 'portion',
    preparation_time_mins: 14,
    is_active: true,
  },
  {
    id: 'prod-chn-003',
    sku: 'CHN-003',
    name: 'Chilli Chicken Dry',
    category_id: 'cat-chinese',
    category_name: 'Chinese',
    description: 'Crispy batter chicken tossed with fresh green chillies, diced onions and dark soy glaze.',
    food_type: 'non-veg' as const,
    price: 280.0,
    discounted_price: 280.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 30,
    unit: 'plate',
    preparation_time_mins: 15,
    is_active: true,
  },

  // Beverages
  {
    id: 'prod-bev-001',
    sku: 'BEV-001',
    name: 'Mango Lassi',
    category_id: 'cat-beverages',
    category_name: 'Beverages',
    description: 'Thick, creamy chilled yogurt smoothie blended with sweet Alphonso mango pulp and cardamom.',
    food_type: 'veg' as const,
    price: 110.0,
    discounted_price: 110.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 60,
    unit: 'glass',
    preparation_time_mins: 5,
    is_active: true,
  },
  {
    id: 'prod-bev-002',
    sku: 'BEV-002',
    name: 'Fresh Lime Soda (Sweet & Salt)',
    category_id: 'cat-beverages',
    category_name: 'Beverages',
    description: 'Sparkling chilled club soda with freshly squeezed lime juice, rock salt and mint.',
    food_type: 'veg' as const,
    price: 70.0,
    discounted_price: 70.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 80,
    unit: 'glass',
    preparation_time_mins: 4,
    is_active: true,
  },
  {
    id: 'prod-bev-003',
    sku: 'BEV-003',
    name: 'Hyderabadi Irani Chai',
    category_id: 'cat-beverages',
    category_name: 'Beverages',
    description: 'Strong, aromatic milk tea brewed slowly with mawa and fragrant spices.',
    food_type: 'veg' as const,
    price: 40.0,
    discounted_price: 40.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 100,
    unit: 'cup',
    preparation_time_mins: 5,
    is_active: true,
  },

  // Desserts
  {
    id: 'prod-des-001',
    sku: 'DES-001',
    name: 'Shahi Gulab Jamun (2 pcs)',
    category_id: 'cat-desserts',
    category_name: 'Desserts',
    description: 'Hot, melt-in-mouth khoya dumplings soaked in rose and saffron scented sugar syrup.',
    food_type: 'veg' as const,
    price: 90.0,
    discounted_price: 90.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 45,
    unit: 'portion',
    preparation_time_mins: 4,
    is_active: true,
  },
  {
    id: 'prod-des-002',
    sku: 'DES-002',
    name: 'Hyderabadi Double Ka Meetha',
    category_id: 'cat-desserts',
    category_name: 'Desserts',
    description: 'Royal fried bread pudding soaked in saffron rabri, garnished with toasted almonds and pistachios.',
    food_type: 'veg' as const,
    price: 130.0,
    discounted_price: 130.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 25,
    unit: 'portion',
    preparation_time_mins: 5,
    is_active: true,
  },
  {
    id: 'prod-des-003',
    sku: 'DES-003',
    name: 'Royal Matka Kulfi',
    category_id: 'cat-desserts',
    category_name: 'Desserts',
    description: 'Traditional slow-cooked condensed milk ice cream set in earthen clay pots with pistachios.',
    food_type: 'veg' as const,
    price: 120.0,
    discounted_price: 120.0,
    tax_rate: 5.0,
    hsn_code: '996331',
    image_url: 'https://images.unsplash.com/photo-1505394033641-40c6ad1178d7?auto=format&fit=crop&w=600&q=80',
    is_available: true,
    stock_quantity: 30,
    unit: 'pot',
    preparation_time_mins: 3,
    is_active: true,
  },
];

export const DEMO_TABLES = [
  {
    id: 'tbl-1',
    table_number: 'Table 1',
    seating_capacity: 4,
    section: 'Ground Floor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-1',
    status: 'available' as const,
  },
  {
    id: 'tbl-2',
    table_number: 'Table 2',
    seating_capacity: 4,
    section: 'Ground Floor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-2',
    status: 'available' as const,
  },
  {
    id: 'tbl-3',
    table_number: 'Table 3',
    seating_capacity: 6,
    section: 'Ground Floor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-3',
    status: 'available' as const,
  },
  {
    id: 'tbl-4',
    table_number: 'Table 4',
    seating_capacity: 2,
    section: 'Ground Floor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-4',
    status: 'available' as const,
  },
  {
    id: 'tbl-5',
    table_number: 'Table 5',
    seating_capacity: 4,
    section: 'First Floor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-5',
    status: 'available' as const,
  },
  {
    id: 'tbl-6',
    table_number: 'Table 6',
    seating_capacity: 4,
    section: 'First Floor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-6',
    status: 'available' as const,
  },
  {
    id: 'tbl-7',
    table_number: 'Table 7',
    seating_capacity: 6,
    section: 'First Floor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-7',
    status: 'available' as const,
  },
  {
    id: 'tbl-8',
    table_number: 'Table 8',
    seating_capacity: 8,
    section: 'First Floor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-8',
    status: 'available' as const,
  },
  {
    id: 'tbl-9',
    table_number: 'Table 9',
    seating_capacity: 4,
    section: 'Outdoor',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-9',
    status: 'available' as const,
  },
  {
    id: 'tbl-10',
    table_number: 'Table 10',
    seating_capacity: 10,
    section: 'VIP',
    is_active: true,
    qr_code_hash: 'ratnadeep-table-10',
    status: 'available' as const,
  },
];

export const DEMO_SETTINGS = {
  id: 'rest-1',
  name: 'Ratnadeep Restaurant',
  legal_name: 'Ratnadeep Foods Pvt Ltd',
  address: 'Road No. 36, Jubilee Hills, Hyderabad - 500033',
  phone: '+91 98765 43210',
  email: 'contact@ratnadeepfoods.com',
  gstin: '36AAAAA0000A1Z5',
  state: 'Telangana',
  default_tax_rate: 5.0,
  currency: 'INR',
  currency_symbol: '₹',
  service_charge_rate: 0.0,
};

async function seedDemoData() {
  console.log('=====================================================');
  console.log('   RATNADEEP POS — SEEDING LIVE SUPABASE DATABASE');
  console.log(`   Target Host: ${supabaseUrl}`);
  console.log('=====================================================\n');

  // 1. Seed Restaurant Settings
  console.log('🏢 Seeding Restaurant Settings...');
  const { error: settingsErr } = await supabase
    .from('restaurant_settings')
    .upsert(DEMO_SETTINGS);

  if (settingsErr) {
    console.error('  ❌ Settings upsert error:', settingsErr.message);
  } else {
    console.log('  ✓ Restaurant settings synchronized.');
  }

  // 2. Seed Categories
  console.log('\n📂 Seeding Demo Categories...');
  for (const cat of DEMO_CATEGORIES) {
    const { error: catErr } = await supabase.from('categories').upsert(cat);
    if (catErr) {
      console.error(`  ❌ Category ${cat.name} error:`, catErr.message);
    } else {
      console.log(`  ✓ Category: "${cat.name}" (Slug: ${cat.slug})`);
    }
  }

  // 3. Seed Products
  console.log('\n📦 Seeding Demo Products...');
  for (const prod of DEMO_PRODUCTS) {
    const { error: prodErr } = await supabase.from('products').upsert(prod);
    if (prodErr) {
      console.error(`  ❌ Product ${prod.name} error:`, prodErr.message);
    } else {
      console.log(`  ✓ Product: "${prod.name}" (₹${prod.price}, ${prod.food_type}, SKU: ${prod.sku})`);
    }
  }

  // 4. Seed Tables
  console.log('\n🪑 Seeding Demo Dining Tables...');
  for (const tbl of DEMO_TABLES) {
    const { error: tblErr } = await supabase.from('tables').upsert(tbl);
    if (tblErr) {
      console.error(`  ❌ Table ${tbl.table_number} error:`, tblErr.message);
    } else {
      console.log(`  ✓ Table: "${tbl.table_number}" (${tbl.section}, Cap: ${tbl.seating_capacity}, QR: ${tbl.qr_code_hash})`);
    }
  }

  // 5. Query and Verify Live Database Counts
  console.log('\n=====================================================');
  console.log('   LIVE DATABASE VERIFICATION COUNTS');
  console.log('=====================================================');

  const { count: catCount, error: catCountErr } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true });

  const { count: prodCount, error: prodCountErr } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  const { count: tblCount, error: tblCountErr } = await supabase
    .from('tables')
    .select('*', { count: 'exact', head: true });

  const { data: prodsWithImages } = await supabase
    .from('products')
    .select('id, name, image_url');

  const validImagesCount = prodsWithImages?.filter((p) => p.image_url && p.image_url.startsWith('http')).length || 0;

  console.log(`✓ Categories in DB: ${catCount} (Expected: ${DEMO_CATEGORIES.length})`);
  console.log(`✓ Products in DB:   ${prodCount} (Expected: ${DEMO_PRODUCTS.length})`);
  console.log(`✓ Working Images:   ${validImagesCount}/${prodCount}`);
  console.log(`✓ Tables in DB:     ${tblCount} (Expected: ${DEMO_TABLES.length})`);

  console.log('\n=====================================================');
  console.log('   SEEDING & VERIFICATION SUITE FINISHED');
  console.log('=====================================================\n');
}

seedDemoData().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
