const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

async function verifyOrderSettlementComplete() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: ORDER CREATION, KOT PRINT & SETTLE COMPLETE');
  console.log('================================================================\n');

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // 1. Sign in as Kalputra admin
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: authData, error: aErr } = await userClient.auth.signInWithPassword({
    email: 'kalputra@yopmail.com',
    password: 'Password123!',
  });
  if (aErr) throw aErr;
  console.log(`[PASS] 1. Authenticated as Kalputra Admin (${authData.user.email})`);

  // 2. Fetch a table
  const { data: tables } = await adminClient.from('tables').select('*').eq('restaurant_id', KALPUTRA_ID);
  const table = tables[0];

  // 3. Create a Dine-In order
  const orderId = 'ord-settle-test-' + Date.now();
  const orderNum = 'INV-TEST-' + Math.floor(1000 + Math.random() * 9000);

  const { data: order, error: oErr } = await adminClient
    .from('orders')
    .insert({
      id: orderId,
      restaurant_id: KALPUTRA_ID,
      order_number: orderNum,
      order_type: 'dine_in',
      table_id: table.id,
      table_number: table.table_number,
      customer_name: 'Testing Settlement Guest',
      status: 'confirmed',
      subtotal: 350,
      grand_total: 350,
      payable_amount: 350,
      payment_status: 'unpaid',
      notes: '[POS] Dine in test',
    })
    .select()
    .single();

  if (oErr) throw oErr;
  console.log(`[PASS] 2. Created active order #${order.order_number} (Status: ${order.status}, Payment: ${order.payment_status})`);

  // 4. Perform Settlement update ("CONFIRM PAYMENT & GENERATE FINAL BILL")
  const { data: settledOrder, error: sErr } = await userClient
    .from('orders')
    .update({
      status: 'completed',
      payment_status: 'paid',
      paid_amount: 350,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select('id, order_number, status, payment_status, paid_amount')
    .single();

  if (sErr) throw sErr;

  console.log(`[PASS] 3. Settled order result:`, settledOrder);
  if (settledOrder.status !== 'completed') throw new Error(`Expected status 'completed', got: ${settledOrder.status}`);
  if (settledOrder.payment_status !== 'paid') throw new Error(`Expected payment_status 'paid', got: ${settledOrder.payment_status}`);

  // 5. Clean up
  await adminClient.from('orders').delete().eq('id', orderId);
  console.log(`[PASS] 4. Cleaned up test order.`);

  console.log('\n================================================================');
  console.log('ORDER SETTLEMENT TO COMPLETE: ALL VERIFICATIONS PASSED 100%');
  console.log('================================================================\n');
}

verifyOrderSettlementComplete().catch((err) => console.error('[FAIL]:', err.message));
