const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

// Replicate customer panel logic from app/(marketplace)/orders.tsx & app/(marketplace)/order/[id].tsx
function filterCustomerLiveOrders(orders) {
  return orders.filter((o) =>
    ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'served'].includes(o.status)
  );
}

function filterCustomerHistoryOrders(orders) {
  return orders.filter((o) =>
    ['delivered', 'completed', 'cancelled'].includes(o.status)
  );
}

function getCustomerStageProgress(status) {
  const isStage1Active = true;
  const isStage2Active = ['out_for_delivery', 'served', 'delivered', 'completed'].includes(status);
  const isStage3Active = ['delivered', 'completed'].includes(status);

  return {
    isStage1Active,
    isStage2Active,
    isStage3Active,
    currentStageLabel: isStage3Active ? 'Delivered' : isStage2Active ? 'Out for Delivery' : 'Ordered',
  };
}

async function runFullLifecycleTest() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: CUSTOMER ORDER -> DISPATCH -> SETTLEMENT');
  console.log('================================================================\n');

  let allPassed = true;
  function record(name, pass, detail) {
    if (!pass) allPassed = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  try {
    // 1. Authenticate as Customer
    const { data: userList } = await adminClient.auth.admin.listUsers();
    const custUserRecord = userList.users.find(u => u.email === 'customer_kalputra_test@yopmail.com' || u.email === 'raj@yopmail.com');
    if (custUserRecord) {
      await adminClient.auth.admin.updateUserById(custUserRecord.id, { password: 'Password123!' });
    }

    const customerClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: authData, error: aErr } = await customerClient.auth.signInWithPassword({
      email: custUserRecord?.email || 'customer_kalputra_test@yopmail.com',
      password: 'Password123!',
    });
    if (aErr) throw aErr;
    const customerUser = authData.user;
    record('1. Customer logged in', !!customerUser, `Customer: ${customerUser.email} (${customerUser.id})`);

    // 2. Fetch a valid product for Kalputra
    const { data: products } = await adminClient
      .from('products')
      .select('*')
      .eq('restaurant_id', KALPUTRA_ID)
      .limit(1);

    const testProd = products[0];
    record('2. Kalputra test product found', !!testProd, `${testProd.name} (₹${testProd.price})`);

    // 3. Place new Delivery Order from Customer Panel
    const orderId = 'ord-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const orderNumber = 'DEL-' + Math.floor(1000 + Math.random() * 9000);
    const subtotal = testProd.price;
    const tax = (subtotal * 5) / 100;
    const total = Math.round(subtotal + tax);

    const { data: newOrder, error: orderErr } = await customerClient
      .from('orders')
      .insert({
        id: orderId,
        restaurant_id: KALPUTRA_ID,
        order_number: orderNumber,
        order_type: 'delivery',
        status: 'confirmed',
        customer_name: 'Raj Customer',
        customer_phone: '+91 98888 11111',
        delivery_address: 'Burdwan Station Road, Clock Tower, Burdwan 713101',
        customer_id: customerUser.id,
        subtotal: subtotal,
        cgst_amount: tax / 2,
        sgst_amount: tax / 2,
        grand_total: total,
        payable_amount: total,
        payment_status: 'unpaid',
        notes: 'Customer Online Order [MARKETPLACE] (COD)',
        created_by: customerUser.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*, items:order_items(*)')
      .single();

    if (orderErr) throw orderErr;

    const newOrderId = newOrder.id;
    record('3. Customer placed delivery order', !!newOrderId, `Order ID: ${newOrderId}, Order #: ${newOrder.order_number}`);

    // 4. Verify initial status in Customer Live Orders
    const { data: custOrders1 } = await adminClient
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('customer_id', customerUser.id)
      .eq('id', newOrderId);

    const initialLive = filterCustomerLiveOrders(custOrders1);
    const initialStage = getCustomerStageProgress(custOrders1[0].status);
    record('4. Order appears in Customer Live Orders (Stage 1: Ordered)', initialLive.length === 1 && initialStage.currentStageLabel === 'Ordered', `Status: ${custOrders1[0].status}, Stage: ${initialStage.currentStageLabel}`);

    // 5. Admin logs in (Kalputra Admin)
    const adminUserClient = createClient(SUPABASE_URL, ANON_KEY);
    // Ensure admin user password
    const adminUserRecord = userList.users.find(u => u.email === 'kalputra@yopmail.com');
    if (adminUserRecord) {
      await adminClient.auth.admin.updateUserById(adminUserRecord.id, { password: 'Password123!' });
    }
    const { data: adminAuthData, error: adAuthErr } = await adminUserClient.auth.signInWithPassword({
      email: 'kalputra@yopmail.com',
      password: 'Password123!',
    });
    if (adAuthErr) throw adAuthErr;
    record('5. Kalputra Admin logged in', !!adminAuthData.user, `Admin UID: ${adminAuthData.user.id}`);

    // 6. Admin marks Dispatch / Out for Delivery (mapped to 'served' in DB for check constraint compatibility)
    const { data: dispOrder, error: dispErr } = await adminUserClient
      .from('orders')
      .update({ status: 'served', updated_at: new Date().toISOString() })
      .eq('id', newOrderId)
      .select('*, items:order_items(*)')
      .single();

    if (dispErr) throw dispErr;
    record('6. Admin updated order status to dispatch (served)', dispOrder.status === 'served', `DB Status: ${dispOrder.status}`);

    // 7. Check Customer Panel after Dispatch: MUST NOT VANISH, MUST SHOW OUT FOR DELIVERY
    const { data: custOrders2 } = await customerClient
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('customer_id', customerUser.id)
      .eq('id', newOrderId);

    const liveAfterDispatch = filterCustomerLiveOrders(custOrders2);
    const stageAfterDispatch = getCustomerStageProgress(custOrders2[0].status);

    record(
      '7. Customer sees dispatched order in Live Orders (NOT vanished)',
      liveAfterDispatch.length === 1,
      `Live orders count: ${liveAfterDispatch.length}`
    );
    record(
      '8. Customer 3-stage tracker shows Stage 2: Out for Delivery',
      stageAfterDispatch.isStage2Active && !stageAfterDispatch.isStage3Active && stageAfterDispatch.currentStageLabel === 'Out for Delivery',
      `Current tracker stage: ${stageAfterDispatch.currentStageLabel} (Stage 2 active: ${stageAfterDispatch.isStage2Active})`
    );

    // 8. Admin settles payment and marks order completed
    const { data: settledOrder, error: setErr } = await adminUserClient
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        paid_amount: custOrders2[0].payable_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', newOrderId)
      .select('*, items:order_items(*)')
      .single();

    if (setErr) throw setErr;
    record('9. Admin settled payment (status=completed, payment=paid)', settledOrder.status === 'completed' && settledOrder.payment_status === 'paid', `Status: ${settledOrder.status}, Payment: ${settledOrder.payment_status}`);

    // 9. Check Customer Panel after Settlement: MOVES TO ORDER HISTORY, STAGE 3 DELIVERED
    const { data: custOrders3 } = await customerClient
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('customer_id', customerUser.id)
      .eq('id', newOrderId);

    const liveAfterSettle = filterCustomerLiveOrders(custOrders3);
    const historyAfterSettle = filterCustomerHistoryOrders(custOrders3);
    const stageAfterSettle = getCustomerStageProgress(custOrders3[0].status);

    record(
      '10. Order cleared from Customer Live list upon completion',
      liveAfterSettle.length === 0,
      `Live orders count: ${liveAfterSettle.length}`
    );
    record(
      '11. Order appears in Customer Order History tab',
      historyAfterSettle.length === 1,
      `History orders count: ${historyAfterSettle.length}`
    );
    record(
      '12. Customer 3-stage tracker shows Stage 3: Delivered',
      stageAfterSettle.isStage3Active && stageAfterSettle.currentStageLabel === 'Delivered',
      `Current tracker stage: ${stageAfterSettle.currentStageLabel} (Stage 3 active: ${stageAfterSettle.isStage3Active})`
    );

  } catch (err) {
    record('Lifecycle Execution Error', false, err.message);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('COMPLETE ORDER LIFECYCLE (ORDER -> DISPATCH -> SETTLE): PASS');
  } else {
    console.log('COMPLETE ORDER LIFECYCLE (ORDER -> DISPATCH -> SETTLE): FAIL');
  }
  console.log('================================================================\n');
}

runFullLifecycleTest();
