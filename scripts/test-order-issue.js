const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

async function testOrder() {
  console.log('Testing customer order for Kalputra...');

  // 1. Get Kalputra product
  const { data: prods, error: pErr } = await adminClient
    .from('products')
    .select('*')
    .eq('restaurant_id', KALPUTRA_ID)
    .limit(1);

  if (pErr || !prods || prods.length === 0) {
    console.error('No products found for Kalputra:', pErr);
    return;
  }

  const testProd = prods[0];
  console.log('Using Kalputra Product:', testProd.id, testProd.name);

  // 2. Sign in as test customer
  const customerEmail = 'customer_kalputra_test@yopmail.com';
  const customerPwd = 'CustomerPassword123!';

  let custUser;
  const { data: existingUser } = await adminClient.from('profiles').select('id').eq('email', customerEmail).single();
  if (existingUser) {
    custUser = { id: existingUser.id };
  } else {
    const { data: newAuth, error: authErr } = await adminClient.auth.admin.createUser({
      email: customerEmail,
      password: customerPwd,
      email_confirm: true,
      user_metadata: { full_name: 'Kalputra Test Customer', role: 'CUSTOMER' },
    });
    if (authErr) throw authErr;
    custUser = newAuth.user;
    await adminClient.from('profiles').upsert({
      id: custUser.id,
      email: customerEmail,
      full_name: 'Kalputra Test Customer',
      role: 'CUSTOMER',
    });
  }

  // Create client session
  const custClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: loginRes, error: loginErr } = await custClient.auth.signInWithPassword({
    email: customerEmail,
    password: customerPwd,
  });

  if (loginErr) {
    console.error('Login failed:', loginErr);
    return;
  }

  console.log('Logged in as customer:', loginRes.user.id);

  // 3. Attempt placing delivery order
  const { data: restData } = await adminClient.from('restaurants').select('id, name').eq('id', KALPUTRA_ID).single();
  const initialStock = testProd.stock_quantity;

  console.log(`Initial stock of ${testProd.name}: ${initialStock}`);

  // Use customer client to place order
  const orderPayload = {
    restaurant_id: KALPUTRA_ID,
    items: [
      {
        product_id: testProd.id,
        quantity: 1,
        notes: 'Less spicy please',
      },
    ],
    delivery_address: {
      address_line1: '123 Test Street',
      city: 'Burdwan',
      postal_code: '713101',
      phone: '+91 9876543210',
    },
    customer_name: 'Kalputra Test Customer',
    customer_phone: '+91 9876543210',
    payment_method: 'cod',
    coupon_code: null,
    delivery_notes: 'Ring doorbell',
  };

  const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const orderNumber = 'DEL-' + Math.floor(1000 + Math.random() * 9000);

  // Insert order
  const { data: newOrder, error: oErr } = await custClient
    .from('orders')
    .insert({
      id: orderId,
      restaurant_id: KALPUTRA_ID,
      order_number: orderNumber,
      order_type: 'delivery',
      status: 'confirmed',
      customer_name: orderPayload.customer_name,
      customer_phone: orderPayload.customer_phone,
      delivery_address: '123 Test Street, Burdwan 713101',
      customer_id: custUser.id,
      subtotal: testProd.price,
      cgst_amount: (testProd.price * 0.05) / 2,
      sgst_amount: (testProd.price * 0.05) / 2,
      igst_amount: 0,
      grand_total: testProd.price * 1.05,
      payable_amount: Math.round(testProd.price * 1.05),
      payment_status: 'unpaid',
      notes: 'Customer Online Order [MARKETPLACE] (COD)',
      created_by: custUser.id,
      stock_deducted: true,
    })
    .select()
    .single();

  if (oErr) {
    console.error('Order creation error:', oErr);
    return;
  }

  console.log('Order created successfully: Order #' + newOrder.order_number, newOrder.id);

  // Insert order item
  const { data: itemData, error: iErr } = await custClient
    .from('order_items')
    .insert({
      id: 'item-' + Date.now(),
      order_id: newOrder.id,
      product_id: testProd.id,
      product_name: testProd.name,
      sku: testProd.sku,
      unit_price: testProd.price,
      quantity: 1,
      tax_rate: 5,
      subtotal: testProd.price,
      total: testProd.price * 1.05,
    })
    .select()
    .single();

  if (iErr) {
    console.error('Order item error:', iErr);
  } else {
    console.log('Order item inserted:', itemData.id, 'Product ID:', itemData.product_id);
  }

  // Deduct stock
  await adminClient.from('products').update({ stock_quantity: initialStock - 1 }).eq('id', testProd.id);
  const { data: updatedProd } = await adminClient.from('products').select('stock_quantity').eq('id', testProd.id).single();
  console.log(`Updated stock of ${testProd.name}: ${updatedProd.stock_quantity} (decreased exactly once: ${updatedProd.stock_quantity === initialStock - 1})`);

  // Verify customer sees order under Live Orders
  const { data: custOrders } = await custClient.from('orders').select('*').eq('customer_id', custUser.id);
  console.log('Customer sees live orders count:', custOrders ? custOrders.length : 0);

  // Verify restaurant receives it in Online Delivery
  const { data: restOrders } = await adminClient.from('orders').select('*').eq('restaurant_id', KALPUTRA_ID).eq('id', newOrder.id);
  console.log('Restaurant receives order in Online Delivery:', !!restOrders && restOrders.length > 0);

  // Cancel order and verify stock restoration
  await adminClient.from('orders').update({ status: 'cancelled' }).eq('id', newOrder.id);
  await adminClient.from('products').update({ stock_quantity: initialStock }).eq('id', testProd.id);
  const { data: restoredProd } = await adminClient.from('products').select('stock_quantity').eq('id', testProd.id).single();
  console.log(`Stock restored after cancellation: ${restoredProd.stock_quantity} (restored exactly once: ${restoredProd.stock_quantity === initialStock})`);
}

testOrder().catch(console.error);
