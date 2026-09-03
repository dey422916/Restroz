const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runValidation() {
  console.log('=== VALIDATING CUSTOMER ORDERS QUERY & PIPELINE ===');

  // 1. Fetch latest delivery order in DB
  const { data: latestOrders, error: lErr } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, restaurant_id, status, payable_amount, created_at')
    .eq('order_type', 'delivery')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('Latest delivery orders in DB:', latestOrders, 'Error:', lErr);

  const testCustomerOrderId = latestOrders?.[0]?.id;
  const testCustomerId = latestOrders?.[0]?.customer_id;

  console.log('Target test customer ID:', testCustomerId);
  console.log('Target test order ID:', testCustomerOrderId);

  // 2. Test Customer Orders Query with restaurant:restaurants and items:order_items
  const { data: customerOrders, error: cErr } = await supabase
    .from('orders')
    .select(`
      *,
      restaurant:restaurants(id, name, slug, logo_url, address, phone),
      items:order_items(*)
    `)
    .eq('customer_id', testCustomerId)
    .order('created_at', { ascending: false });

  console.log('Customer Orders Query Result:');
  console.log('  HTTP Error:', cErr);
  console.log('  Orders Returned:', customerOrders?.length);
  if (customerOrders && customerOrders.length > 0) {
    const o = customerOrders[0];
    console.log('  Sample Order:', {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      customer_name: o.customer_name,
      customer_id: o.customer_id,
      restaurant: o.restaurant?.name,
      items: o.items?.map((i) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price })),
    });

    // 3. Test Live Deliveries vs History Filtering
    const liveStatuses = ['confirmed', 'kot_generated', 'preparing', 'ready', 'out_for_delivery', 'served', 'held'];
    const historyStatuses = ['delivered', 'completed', 'cancelled'];

    const isLive = !['delivered', 'completed', 'cancelled'].includes(o.status);
    console.log(`  Order Status: ${o.status} -> Tab: ${isLive ? 'Live Deliveries' : 'Order History'}`);
  }

  // 4. Test Single Order Details Query
  if (testCustomerOrderId) {
    const { data: singleOrder, error: sErr } = await supabase
      .from('orders')
      .select(`
        *,
        restaurant:restaurants(id, name, slug, logo_url, address, phone),
        items:order_items(*)
      `)
      .eq('id', testCustomerOrderId)
      .eq('customer_id', testCustomerId)
      .maybeSingle();

    console.log('Single Order Details Result:');
    console.log('  HTTP Error:', sErr);
    console.log('  Order details resolved:', singleOrder?.order_number, 'Restaurant:', singleOrder?.restaurant?.name);
  }

  console.log('=== VALIDATION COMPLETE ===');
}

runValidation().catch(console.error);
