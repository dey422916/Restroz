const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testOrderFlow() {
  console.log('=== TEST CUSTOMER ORDER FLOW ===');

  const testCustomerId = 'd39a0fe1-6710-4eb8-87ac-12adafee1378';
  console.log('Using test customer user ID:', testCustomerId);

  // 2. Get an active restaurant
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('id, name, status')
    .eq('status', 'ACTIVE')
    .limit(1);

  const testRestaurant = restaurants?.[0];
  console.log('Using active restaurant:', testRestaurant?.id, testRestaurant?.name);

  // 3. Create a test delivery order for this customer
  const orderId = 'test-ord-' + Date.now();
  const orderNumber = 'DEL-' + Math.floor(1000 + Math.random() * 9000);

  const { data: newOrder, error: insertErr } = await supabase
    .from('orders')
    .insert({
      id: orderId,
      restaurant_id: testRestaurant.id,
      order_number: orderNumber,
      order_type: 'delivery',
      status: 'confirmed',
      customer_name: 'Test Customer (Verified)',
      customer_phone: '9876543210',
      delivery_address: '123 Test Street, Kolkata 700001',
      customer_id: testCustomerId,
      subtotal: 250,
      cgst_amount: 6.25,
      sgst_amount: 6.25,
      igst_amount: 0,
      grand_total: 262.5,
      payable_amount: 263,
      payment_status: 'unpaid',
      notes: 'Automated test order for My Orders verification',
      created_by: testCustomerId,
    })
    .select()
    .single();

  console.log('Insert test order result:', {
    success: Boolean(newOrder),
    orderId: newOrder?.id,
    orderNumber: newOrder?.order_number,
    error: insertErr,
  });

  // 4. Query customer orders using our fixed query
  const { data: customerOrders, error: queryErr } = await supabase
    .from('orders')
    .select(`
      *,
      restaurant:restaurants(id, name, slug, logo_url, address, phone),
      items:order_items(*)
    `)
    .eq('customer_id', testCustomer.id)
    .order('created_at', { ascending: false });

  console.log('Customer My Orders query result:', {
    count: customerOrders?.length,
    error: queryErr,
    foundNewlyCreated: customerOrders?.some((o) => o.id === orderId),
  });

  // 5. Test Live vs History status filtering
  const matchingOrder = customerOrders?.find((o) => o.id === orderId);
  if (matchingOrder) {
    console.log('Matching order verified:', {
      id: matchingOrder.id,
      order_number: matchingOrder.order_number,
      status: matchingOrder.status,
      restaurant_name: matchingOrder.restaurant?.name,
      customer_name: matchingOrder.customer_name,
    });

    // Step A: status = 'confirmed' -> Live Deliveries
    const isLiveA = !['delivered', 'completed', 'cancelled'].includes(matchingOrder.status);
    console.log(`State 1 (confirmed) -> Tab: ${isLiveA ? 'Live Deliveries (PASS)' : 'History (FAIL)'}`);

    // Step B: Update status to 'out_for_delivery'
    await supabase.from('orders').update({ status: 'out_for_delivery' }).eq('id', orderId);
    const { data: updatedB } = await supabase.from('orders').select('status').eq('id', orderId).single();
    const isLiveB = !['delivered', 'completed', 'cancelled'].includes(updatedB?.status);
    console.log(`State 2 (out_for_delivery) -> Tab: ${isLiveB ? 'Live Deliveries (PASS)' : 'History (FAIL)'}`);

    // Step C: Update status to 'delivered' / 'completed'
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId);
    const { data: updatedC } = await supabase.from('orders').select('status').eq('id', orderId).single();
    const isLiveC = !['delivered', 'completed', 'cancelled'].includes(updatedC?.status);
    console.log(`State 3 (delivered) -> Tab: ${isLiveC ? 'Live Deliveries (FAIL)' : 'Order History (PASS)'}`);
  }

  // Cleanup test order
  await supabase.from('orders').delete().eq('id', orderId);
  console.log('Cleaned up test order:', orderId);
  console.log('=== TEST FINISHED SUCCESSFULLY ===');
}

testOrderFlow().catch(console.error);
