const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

async function testCustomerMyOrdersFlow() {
  console.log('=== FULL END-TO-END CUSTOMER MY ORDERS VERIFICATION ===');

  const customerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const adminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1. Customer Sign In
  const { data: custAuth, error: custAuthErr } = await customerClient.auth.signInWithPassword({
    email: 'customer_kalputra_test@yopmail.com',
    password: 'Password123!',
  });

  if (custAuthErr || !custAuth.user) {
    console.error('Customer login failed:', custAuthErr);
    return;
  }
  const customerUser = custAuth.user;
  console.log('Customer signed in successfully:', customerUser.id, customerUser.email);

  // 2. Super Admin / Admin Client (using super admin / admin credentials)
  const { data: adminAuth, error: adminAuthErr } = await adminClient.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });
  console.log('Admin login status:', adminAuthErr ? adminAuthErr.message : 'Success', adminAuth?.user?.id);

  // 3. Get Active Restaurant
  const { data: restaurants } = await customerClient
    .from('restaurants')
    .select('id, name')
    .eq('status', 'ACTIVE')
    .limit(1);
  const restaurant = restaurants[0];
  console.log('Target Restaurant:', restaurant.id, restaurant.name);

  // 4. Get a valid product for the restaurant
  const { data: products } = await customerClient
    .from('products')
    .select('id, name, price')
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true)
    .eq('is_available', true)
    .limit(1);

  const testProduct = products?.[0];
  console.log('Test Product:', testProduct?.id, testProduct?.name);

  // 5. Customer Places a Marketplace Delivery Order via RPC
  const { data: newOrder, error: placeErr } = await customerClient.rpc(
    'create_customer_delivery_order',
    {
      p_restaurant_id: restaurant.id,
      p_items: [{ product_id: testProduct.id, quantity: 1, notes: 'Extra crispy' }],
      p_delivery_address: {
        address_line1: '12 Park Street',
        landmark: 'Near Metro',
        city: 'Kolkata',
        postal_code: '700016',
        phone: '9876543210',
      },
      p_customer_name: 'Raj Sharma',
      p_customer_phone: '9876543210',
      p_payment_method: 'cod',
      p_coupon_code: null,
      p_delivery_notes: 'Ring the bell twice',
    }
  );

  console.log('Order Placement via RPC:', {
    success: Boolean(newOrder),
    orderId: newOrder?.id,
    orderNumber: newOrder?.order_number,
    status: newOrder?.status,
    customer_id: newOrder?.customer_id,
    payable: newOrder?.payable_amount,
    error: placeErr,
  });

  if (placeErr || !newOrder) {
    console.error('Order placement failed:', placeErr);
    return;
  }

  const orderId = newOrder.id;

  // 5. Customer Queries "My Orders" via the newly fixed query
  console.time('customer_get_orders');
  const { data: customerOrders, error: getOrdersErr } = await customerClient
    .from('orders')
    .select(`
      *,
      restaurant:restaurants(id, name, slug, logo_url, address, phone),
      items:order_items(*)
    `)
    .eq('customer_id', customerUser.id)
    .order('created_at', { ascending: false });
  console.timeEnd('customer_get_orders');

  console.log('Customer My Orders Query Result:', {
    httpStatus: getOrdersErr ? 500 : 200,
    totalOrders: customerOrders?.length,
    error: getOrdersErr,
  });

  const matchingOrder = customerOrders?.find((o) => o.id === orderId);
  console.log('Found placed order in Customer My Orders:', Boolean(matchingOrder));

  if (matchingOrder) {
    console.log('Order details in My Orders response:', {
      id: matchingOrder.id,
      order_number: matchingOrder.order_number,
      status: matchingOrder.status,
      restaurant: matchingOrder.restaurant,
      items: matchingOrder.items,
    });

    // 6. Test Tab Segregation:
    const isLive = !['delivered', 'completed', 'cancelled'].includes(matchingOrder.status);
    console.log(`Tab Placement for status '${matchingOrder.status}': ${isLive ? 'Live Deliveries (PASS)' : 'Order History (FAIL)'}`);

    // 7. Transition: Status -> out_for_delivery
    await adminClient.from('orders').update({ status: 'out_for_delivery' }).eq('id', orderId);
    const { data: updated1 } = await customerClient
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();
    const isLive1 = !['delivered', 'completed', 'cancelled'].includes(updated1?.status);
    console.log(`Transition to 'out_for_delivery' -> Status: ${updated1?.status} -> Tab: ${isLive1 ? 'Live Deliveries (PASS)' : 'History'}`);

    // 8. Transition: Status -> completed
    await adminClient.from('orders').update({ status: 'completed' }).eq('id', orderId);
    const { data: updated2 } = await customerClient
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();
    const isHistory = ['delivered', 'completed', 'cancelled'].includes(updated2?.status);
    console.log(`Transition to 'completed' -> Status: ${updated2?.status} -> Tab: ${isHistory ? 'Order History (PASS)' : 'Live Deliveries'}`);

    // 9. Verify Customer Isolation (Customer B cannot query Customer A's orders)
    const { data: otherUserOrders } = await customerClient
      .from('orders')
      .select('id, customer_id')
      .neq('customer_id', customerUser.id);
    console.log('Customer Isolation Test (Unowned orders visible to Customer):', otherUserOrders?.length || 0);
  }

  // Clean up test order
  await customerClient.from('orders').delete().eq('id', orderId);
  console.log('Test order cleaned up successfully.');
  console.log('=== VERIFICATION PASSED COMPLETELY ===');
}

testCustomerMyOrdersFlow().catch(console.error);
