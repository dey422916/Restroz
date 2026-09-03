require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const client = createClient(SUPABASE_URL, ANON_KEY);

async function profile() {
  console.log('=== RESTROZ RUNTIME EGRESS PROFILING ===\n');

  // Authenticate Admin & Customer
  const { data: adminAuth } = await client.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });
  const { data: custAuth } = await client.auth.signInWithPassword({
    email: 'customer_kalputra_test@yopmail.com',
    password: 'Password123!',
  });

  const restId = 'c0000000-0000-0000-0000-000000000001';
  const customerId = custAuth?.user?.id;

  const queries = [
    {
      name: 'Full Orders Fetch (getOrders)',
      file: 'orderService.ts / getOrders()',
      table: 'orders + order_items + payments + kots + kot_items',
      query: client
        .from('orders')
        .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
        .eq('restaurant_id', restId)
        .order('created_at', { ascending: false }),
      pollingIntervalSec: 6, // In Dashboard.tsx (6s) & previously POS
      usesSelectAll: true,
      paginated: false,
    },
    {
      name: 'Paginated Orders (getOrdersPaginated - 30 items)',
      file: 'orderService.ts / getOrdersPaginated()',
      table: 'orders + order_items + payments + kots + kot_items',
      query: client
        .from('orders')
        .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
        .eq('restaurant_id', restId)
        .order('created_at', { ascending: false })
        .range(0, 30),
      pollingIntervalSec: 45, // 45s reconciliation
      usesSelectAll: true,
      paginated: true,
    },
    {
      name: 'Full KOTs Fetch (getKots)',
      file: 'kotService.ts / getKots()',
      table: 'kots + kot_items',
      query: client
        .from('kots')
        .select('*, items:kot_items(*)')
        .eq('restaurant_id', restId)
        .order('created_at', { ascending: false }),
      pollingIntervalSec: 4, // in kot-screen.tsx (4s)
      usesSelectAll: true,
      paginated: false,
    },
    {
      name: 'Full Products Fetch (getProducts)',
      file: 'productService.ts / getProducts()',
      table: 'products',
      query: client
        .from('products')
        .select('*')
        .eq('restaurant_id', restId),
      pollingIntervalSec: null,
      usesSelectAll: true,
      paginated: false,
    },
    {
      name: 'Categories Fetch (getCategories)',
      file: 'categoryService.ts / getCategories()',
      table: 'categories',
      query: client
        .from('categories')
        .select('*')
        .eq('restaurant_id', restId),
      pollingIntervalSec: null,
      usesSelectAll: true,
      paginated: false,
    },
    {
      name: 'Tables Fetch (getTables)',
      file: 'tableService.ts / getTables()',
      table: 'dining_tables',
      query: client
        .from('dining_tables')
        .select('*')
        .eq('restaurant_id', restId),
      pollingIntervalSec: null,
      usesSelectAll: true,
      paginated: false,
    },
    {
      name: 'Marketplace Public Restaurants',
      file: 'marketplaceService.ts / getPublicRestaurants()',
      table: 'restaurants + restaurant_public_profiles',
      query: client
        .from('restaurants')
        .select('*, public_profile:restaurant_public_profiles(*)')
        .eq('status', 'ACTIVE'),
      pollingIntervalSec: null,
      usesSelectAll: true,
      paginated: false,
    },
    {
      name: 'Customer Orders Fetch (getCustomerOrders)',
      file: 'marketplaceService.ts / getCustomerOrders()',
      table: 'orders + restaurants + order_items',
      query: client
        .from('orders')
        .select('*, restaurant:restaurants(id, name, slug, logo_url, address, phone), items:order_items(*)')
        .eq('customer_id', customerId || '')
        .order('created_at', { ascending: false }),
      pollingIntervalSec: 4, // in table/[tableId].tsx (4s) & menu/orders.tsx (3s)
      usesSelectAll: true,
      paginated: false,
    },
    {
      name: 'Customer Order History Paginated (20 items)',
      file: 'marketplaceService.ts / getCustomerOrderHistoryPaginated()',
      table: 'orders + restaurants + order_items',
      query: client
        .from('orders')
        .select('*, restaurant:restaurants(id, name, slug, logo_url, address, phone), items:order_items(*)')
        .eq('customer_id', customerId || '')
        .in('status', ['delivered', 'completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .range(0, 20),
      pollingIntervalSec: null,
      usesSelectAll: true,
      paginated: true,
    },
    {
      name: 'Restaurant Settings Fetch (getSettings)',
      file: 'settingsService.ts / getSettings()',
      table: 'restaurant_settings',
      query: client
        .from('restaurant_settings')
        .select('*')
        .eq('restaurant_id', restId)
        .single(),
      pollingIntervalSec: null,
      usesSelectAll: true,
      paginated: false,
    },
  ];

  const results = [];

  for (const item of queries) {
    const start = Date.now();
    const { data, error } = await item.query;
    const duration = Date.now() - start;

    if (error) {
      console.warn(`Query ${item.name} error:`, error.message);
      continue;
    }

    const jsonStr = JSON.stringify(data || '');
    const byteSize = Buffer.byteLength(jsonStr, 'utf8');
    const rowCount = Array.isArray(data) ? data.length : data ? 1 : 0;
    const colCount = Array.isArray(data) && data[0] ? Object.keys(data[0]).length : data ? Object.keys(data).length : 0;

    const rpm = item.pollingIntervalSec ? Math.round(60 / item.pollingIntervalSec) : 0;
    const bytesPerMin = rpm * byteSize;
    const bytesPerHour = bytesPerMin * 60;
    const mbPerHour = (bytesPerHour / (1024 * 1024)).toFixed(2);
    const mbPerDay = (bytesPerHour * 24 / (1024 * 1024)).toFixed(2);
    const gbPerMonth = (bytesPerHour * 24 * 30 / (1024 * 1024 * 1024)).toFixed(2);

    results.push({
      name: item.name,
      file: item.file,
      table: item.table,
      durationMs: duration,
      rowCount,
      colCount,
      byteSize,
      kbSize: (byteSize / 1024).toFixed(2),
      pollingIntervalSec: item.pollingIntervalSec,
      rpm,
      mbPerHour: Number(mbPerHour),
      mbPerDay: Number(mbPerDay),
      gbPerMonth: Number(gbPerMonth),
      usesSelectAll: item.usesSelectAll ? 'YES' : 'NO',
      paginated: item.paginated ? 'YES' : 'NO',
    });
  }

  // Print Summary Table
  console.log('---------------------------------------------------------------------------------------------------------');
  console.log(
    'Query Name'.padEnd(36) +
    'Rows'.padEnd(8) +
    'Size (KB)'.padEnd(12) +
    'Poll (s)'.padEnd(10) +
    'RPM'.padEnd(8) +
    'MB/Hour'.padEnd(12) +
    'GB/Month'
  );
  console.log('---------------------------------------------------------------------------------------------------------');

  for (const r of results) {
    console.log(
      r.name.padEnd(36) +
      String(r.rowCount).padEnd(8) +
      String(r.kbSize + ' KB').padEnd(12) +
      String(r.pollingIntervalSec ? r.pollingIntervalSec + 's' : 'None').padEnd(10) +
      String(r.rpm).padEnd(8) +
      String(r.mbPerHour + ' MB').padEnd(12) +
      String(r.gbPerMonth + ' GB')
    );
  }
  console.log('---------------------------------------------------------------------------------------------------------\n');

  console.log('Detailed JSON Profile:\n', JSON.stringify(results, null, 2));
}

profile().catch((e) => {
  console.error('Profiling error:', e);
  process.exit(1);
});
