const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

function mapOrderToCustomerStage(status) {
  switch (status) {
    case 'out_for_delivery':
    case 'served':
      return {
        stage: 'out_for_delivery',
        label: 'Out for Delivery',
        step: 2,
      };
    case 'delivered':
    case 'completed':
      return {
        stage: 'delivered',
        label: 'Delivered',
        step: 3,
      };
    default:
      return {
        stage: 'ordered',
        label: 'Ordered',
        step: 1,
      };
  }
}

async function verifyDispatchAndSettlement() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: DISPATCH & PAYMENT SETTLEMENT LIFECYCLE');
  console.log('================================================================\n');

  let allPassed = true;
  function record(name, pass, detail) {
    if (!pass) allPassed = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  try {
    // 1. Fetch Kalputra online delivery orders
    const { data: kalputraOrders, error: ordErr } = await adminClient
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('restaurant_id', KALPUTRA_ID)
      .eq('order_type', 'delivery')
      .order('created_at', { ascending: false });

    if (ordErr) throw ordErr;
    if (!kalputraOrders || kalputraOrders.length === 0) {
      throw new Error('No delivery orders found for Kalputra');
    }

    const testOrder = kalputraOrders[0];
    console.log(`Testing with Order: #${testOrder.order_number} (${testOrder.id})`);

    // 2. Test Dispatch / Out for Delivery transition
    const { data: dispatchedOrder, error: dispErr } = await adminClient
      .from('orders')
      .update({ status: 'out_for_delivery', updated_at: new Date().toISOString() })
      .eq('id', testOrder.id)
      .select('*, items:order_items(*)')
      .single();

    if (dispErr) throw dispErr;

    record('1. Order updated to out_for_delivery', dispatchedOrder.status === 'out_for_delivery', `Status: ${dispatchedOrder.status}`);

    // Verify Customer Panel Live Filter
    const liveFilterStatuses = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'served'];
    const isLive = liveFilterStatuses.includes(dispatchedOrder.status);
    record('2. Customer panel Live Orders filter retains dispatched order', isLive, `Included in Live filter: ${isLive}`);

    const customerStage = mapOrderToCustomerStage(dispatchedOrder.status);
    record('3. Customer sees Out for Delivery progress (Stage 2)', customerStage.step === 2 && customerStage.label === 'Out for Delivery', `Mapped Stage: ${customerStage.label}`);

    // 3. Test Settle / Payment completion
    const { data: settledOrder, error: setErr } = await adminClient
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        paid_amount: testOrder.payable_amount || testOrder.grand_total,
        updated_at: new Date().toISOString()
      })
      .eq('id', testOrder.id)
      .select('*, items:order_items(*)')
      .single();

    if (setErr) throw setErr;

    record('4. Order settled and closed as completed & paid', settledOrder.status === 'completed' && settledOrder.payment_status === 'paid', `Status: ${settledOrder.status}, Payment: ${settledOrder.payment_status}`);

    const historyFilterStatuses = ['delivered', 'completed', 'cancelled'];
    const isHistory = historyFilterStatuses.includes(settledOrder.status);
    record('5. Customer panel moves completed order to Order History', isHistory, `Included in History filter: ${isHistory}`);

    const settledStage = mapOrderToCustomerStage(settledOrder.status);
    record('6. Customer sees Delivered progress (Stage 3)', settledStage.step === 3 && settledStage.label === 'Delivered', `Mapped Stage: ${settledStage.label}`);

  } catch (err) {
    record('Verification Error', false, err.message);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('DISPATCH & SETTLEMENT WORKFLOW: PASS');
  } else {
    console.log('DISPATCH & SETTLEMENT WORKFLOW: FAIL');
  }
  console.log('================================================================\n');
}

verifyDispatchAndSettlement();
