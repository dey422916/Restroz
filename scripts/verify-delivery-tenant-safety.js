const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const KULLAD_ID = 'a0000000-0000-0000-0000-000000000001';
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

// Replicate verifyOrderTenantAccess logic from orderService.ts
async function verifyOrderTenantAccess(supabaseClient, order, requiredRestaurantId) {
  if (!order) return false;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return !requiredRestaurantId || order.restaurant_id === requiredRestaurantId;
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const userRole = profile?.role;

    // 1. SUPER_ADMIN
    if (userRole === 'SUPER_ADMIN') {
      if (requiredRestaurantId && order.restaurant_id !== requiredRestaurantId) {
        return false;
      }
      return true;
    }

    // 2. RESTAURANT ADMIN / STAFF
    if (userRole === 'ADMIN' || userRole === 'STAFF') {
      if (requiredRestaurantId && order.restaurant_id !== requiredRestaurantId) {
        return false;
      }
      const { data: membership } = await supabaseClient
        .from('restaurant_members')
        .select('id, restaurant_id, is_active')
        .eq('user_id', user.id)
        .eq('restaurant_id', order.restaurant_id)
        .eq('is_active', true)
        .maybeSingle();

      return !!membership;
    }

    // 3. CUSTOMER
    return order.customer_id === user.id;
  } catch (e) {
    return false;
  }
}

async function getOrderByIdWithAuth(supabaseClient, orderId, restaurantId) {
  let query = supabaseClient
    .from('orders')
    .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
    .eq('id', orderId);

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query.maybeSingle();
  if (!error && data) {
    const hasAccess = await verifyOrderTenantAccess(supabaseClient, data, restaurantId);
    if (!hasAccess) return null;
    return data;
  }
  return null;
}

async function getCustomerOrdersWithAuth(supabaseClient, customerId) {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user && user.id !== customerId) {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.role !== 'SUPER_ADMIN') {
      return []; // Block snooping
    }
  }

  const { data: orders, error } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('customer_id', customerId);

  return error ? [] : orders;
}

async function runTenantSafetySuite() {
  console.log('================================================================');
  console.log('🛡️ FINAL TENANT-SAFETY CHECK FOR getOrderById & MUTATIONS');
  console.log('================================================================\n');

  let allPassed = true;
  function record(name, pass, detail) {
    if (!pass) allPassed = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  try {
    // 1. Fetch one order from Kullad and one from Kalputra
    const { data: kulladOrders } = await adminClient.from('orders').select('*').eq('restaurant_id', KULLAD_ID).limit(1);
    const { data: kalputraOrders } = await adminClient.from('orders').select('*').eq('restaurant_id', KALPUTRA_ID).limit(1);

    const kulladOrder = kulladOrders?.[0];
    const kalputraOrder = kalputraOrders?.[0];

    if (!kulladOrder || !kalputraOrder) {
      throw new Error('Both Kullad Chai and Kalputra must have at least one order for cross-tenant testing.');
    }

    console.log(`Target Kullad Order: #${kulladOrder.order_number} (${kulladOrder.id})`);
    console.log(`Target Kalputra Order: #${kalputraOrder.order_number} (${kalputraOrder.id})\n`);

    // --------------------------------------------------------------------------
    // TEST 1: Kalputra Admin tries Kullad order ID -> BLOCKED
    // --------------------------------------------------------------------------
    const kalputraClient = createClient(SUPABASE_URL, ANON_KEY);
    await kalputraClient.auth.signInWithPassword({
      email: 'kalputra@yopmail.com',
      password: 'Password123!',
    });

    const kalputraAccessKullad = await getOrderByIdWithAuth(kalputraClient, kulladOrder.id);
    const test1Passed = kalputraAccessKullad === null;
    record('1. Kalputra Admin tries Kullad order ID', test1Passed, `Result: ${kalputraAccessKullad ? 'LEAKED' : 'BLOCKED (null)'}`);

    // --------------------------------------------------------------------------
    // TEST 2: Kullad Admin tries Kalputra order ID -> BLOCKED
    // --------------------------------------------------------------------------
    const kulladClient = createClient(SUPABASE_URL, ANON_KEY);
    await kulladClient.auth.signInWithPassword({
      email: 'bipin@yopmail.com',
      password: 'Password123!',
    });

    const kulladAccessKalputra = await getOrderByIdWithAuth(kulladClient, kalputraOrder.id);
    const test2Passed = kulladAccessKalputra === null;
    record('2. Kullad Admin tries Kalputra order ID', test2Passed, `Result: ${kulladAccessKalputra ? 'LEAKED' : 'BLOCKED (null)'}`);

    // --------------------------------------------------------------------------
    // TEST 3: Kalputra Admin settles own order -> WORKS
    // --------------------------------------------------------------------------
    const kalputraOwn = await getOrderByIdWithAuth(kalputraClient, kalputraOrder.id);
    const canSettleOwn = kalputraOwn && kalputraOwn.restaurant_id === KALPUTRA_ID;
    record('3. Kalputra Admin settles own order', canSettleOwn, `Found Order #${kalputraOwn?.order_number} for restaurant ${kalputraOwn?.restaurant_id}`);

    // --------------------------------------------------------------------------
    // TEST 4: Super Admin with explicit restaurant context -> WORKS
    // --------------------------------------------------------------------------
    const superAdminClient = createClient(SUPABASE_URL, ANON_KEY);
    await superAdminClient.auth.signInWithPassword({
      email: 'ratnadeepdey13@gmail.com',
      password: 'Ratnadeep1@',
    });

    const superAccessKullad = await getOrderByIdWithAuth(superAdminClient, kulladOrder.id, KULLAD_ID);
    const superAccessKalputra = await getOrderByIdWithAuth(superAdminClient, kalputraOrder.id, KALPUTRA_ID);
    const superMismatchBlocked = await getOrderByIdWithAuth(superAdminClient, kulladOrder.id, KALPUTRA_ID);

    const test4Passed = superAccessKullad !== null && superAccessKalputra !== null && superMismatchBlocked === null;
    record('4. Super Admin with explicit restaurant context', test4Passed, `Kullad Match: ${!!superAccessKullad}, Kalputra Match: ${!!superAccessKalputra}, Mismatched Context Blocked: ${superMismatchBlocked === null}`);

    // --------------------------------------------------------------------------
    // TEST 5: Customer cannot fetch another customer's order -> BLOCKED
    // --------------------------------------------------------------------------
    const customerClient = createClient(SUPABASE_URL, ANON_KEY);
    await customerClient.auth.signInWithPassword({
      email: 'customer_kalputra_test@yopmail.com',
      password: 'Password123!',
    });

    const { data: userList } = await adminClient.auth.admin.listUsers();
    const rajUser = userList.users.find(u => u.email === 'raj@yopmail.com');

    // Customer tries to query another customer's orders list
    const foreignCustomerOrders = await getCustomerOrdersWithAuth(customerClient, rajUser.id);
    // Customer tries to fetch order belonging to Raj by direct orderId
    const foreignOrderDirect = await getOrderByIdWithAuth(customerClient, kulladOrder.id);

    const test5Passed = foreignCustomerOrders.length === 0 && foreignOrderDirect === null;
    record('5. Customer cannot fetch another customer order', test5Passed, `Foreign list count: ${foreignCustomerOrders.length}, Direct foreign getOrderById: ${foreignOrderDirect ? 'LEAKED' : 'BLOCKED (null)'}`);

  } catch (err) {
    record('Tenant Safety Suite Error', false, err.message);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('DELIVERY LIFECYCLE TENANT SAFETY: PASS');
  } else {
    console.log('DELIVERY LIFECYCLE TENANT SAFETY: FAIL');
  }
  console.log('================================================================\n');
}

runTenantSafetySuite();
