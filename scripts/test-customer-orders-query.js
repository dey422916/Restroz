const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testQuery() {
  console.log('Testing raw customer query...');
  
  // Test 1: Minimal select on orders
  const { data: d1, error: e1 } = await supabase
    .from('orders')
    .select('id, restaurant_id, customer_id, status, created_at, payable_amount')
    .limit(5);
  console.log('Test 1 (Minimal select):', { count: d1?.length, error: e1 });

  // Test 2: Select with items:order_items(*)
  const { data: d2, error: e2 } = await supabase
    .from('orders')
    .select('id, items:order_items(*)')
    .limit(5);
  console.log('Test 2 (With order_items):', { count: d2?.length, error: e2 });

  // Test 3: Select with restaurant:restaurant_id(...)
  const { data: d3, error: e3 } = await supabase
    .from('orders')
    .select('id, restaurant:restaurant_id(name, slug, logo_url, address, phone)')
    .limit(5);
  console.log('Test 3 (With restaurant:restaurant_id):', { count: d3?.length, error: e3 });

  // Test 4: The exact query in getCustomerOrders
  const { data: d4, error: e4 } = await supabase
    .from('orders')
    .select(`
      *,
      restaurant:restaurant_id(name, slug, logo_url, address, phone),
      items:order_items(*)
    `)
    .limit(5);
  console.log('Test 4 (Full query):', { count: d4?.length, error: e4 });
}

testQuery().catch(console.error);
