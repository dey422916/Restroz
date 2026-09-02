const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

function resolveOrderSource(ord) {
  if (
    ord.order_type === 'delivery' ||
    Boolean(ord.delivery_address && ord.delivery_address.trim()) ||
    ord.notes?.includes('[ONLINE_DELIVERY]') ||
    ord.notes?.includes('[ONLINE_APP]') ||
    ord.notes?.includes('[DELIVERY]') ||
    ord.created_by === 'CUSTOMER_APP' ||
    ord.created_by === 'CUSTOMER' ||
    ord.order_source === 'CUSTOMER_APP'
  ) {
    return 'CUSTOMER_APP';
  }
  return 'POS';
}

function isOnlineDeliveryOrder(o) {
  const src = resolveOrderSource(o);
  if (src === 'CUSTOMER_APP') return true;
  if (o.order_type === 'delivery') return true;
  if (Boolean(o.delivery_address && o.delivery_address.trim())) return true;
  if (o.notes?.includes('[ONLINE_DELIVERY]') || o.notes?.includes('[DELIVERY]')) return true;
  return false;
}

async function verifyKalputraOnlineOrders() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: KALPUTRA ONLINE DELIVERY ORDERS IN ADMIN FEED');
  console.log('================================================================\n');

  let allPassed = true;
  function record(name, pass, detail) {
    if (!pass) allPassed = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  try {
    // 1. Fetch Kalputra orders from Supabase using Kalputra restaurant_id
    const { data: kalputraOrders, error: ordErr } = await adminClient
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('restaurant_id', KALPUTRA_ID)
      .order('created_at', { ascending: false });

    if (ordErr) throw ordErr;

    record('1. Fetched orders from Kalputra tenant', !!kalputraOrders, `Found ${kalputraOrders?.length} total orders`);

    // 2. Filter online delivery orders
    const onlineOrders = (kalputraOrders || []).filter(isOnlineDeliveryOrder);
    record('2. Partitioned online delivery orders', onlineOrders.length > 0, `Found ${onlineOrders.length} online delivery orders`);

    // 3. Inspect the most recent online order
    const latestOnline = onlineOrders[0];
    if (latestOnline) {
      console.log('\n--- Latest Kalputra Online Order Details ---');
      console.log('Order Number:', latestOnline.order_number);
      console.log('Customer:', latestOnline.customer_name, `(${latestOnline.customer_phone})`);
      console.log('Address:', latestOnline.delivery_address);
      console.log('Order Type:', latestOnline.order_type);
      console.log('Status:', latestOnline.status);
      console.log('Payable Amount: ₹' + latestOnline.payable_amount);
      console.log('Items Count:', latestOnline.items?.length);

      const isActiveStatus = ['confirmed', 'preparing', 'ready', 'served', 'out_for_delivery'].includes(latestOnline.status);
      record('3. Order has active delivery status', isActiveStatus, `Status: ${latestOnline.status}`);
      record('4. Order belongs strictly to Kalputra ID', latestOnline.restaurant_id === KALPUTRA_ID, `Restaurant: ${latestOnline.restaurant_id}`);
      record('5. Order contains valid items snapshot', latestOnline.items && latestOnline.items.length > 0, `Items: ${latestOnline.items?.map(i => i.product_name).join(', ')}`);
    }

  } catch (err) {
    record('Verification Error', false, err.message);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('KALPUTRA ONLINE ORDER FEED: PASS');
  } else {
    console.log('KALPUTRA ONLINE ORDER FEED: FAIL');
  }
  console.log('================================================================\n');
}

verifyKalputraOnlineOrders();
