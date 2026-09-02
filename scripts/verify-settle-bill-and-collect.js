const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

async function testSettleBillAndCollect() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: SETTLE BILL & COLLECT WORKFLOW');
  console.log('================================================================\n');

  try {
    // 1. Authenticate as Kalputra Admin
    const kalputraClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: authData, error: aErr } = await kalputraClient.auth.signInWithPassword({
      email: 'kalputra@yopmail.com',
      password: 'Password123!',
    });
    if (aErr) throw aErr;
    console.log(`[PASS] 1. Kalputra Admin logged in: ${authData.user.email} (${authData.user.id})`);

    // 2. Fetch product & table for Kalputra
    const { data: prods } = await kalputraClient.from('products').select('*').eq('restaurant_id', KALPUTRA_ID).limit(1);
    const { data: tables } = await kalputraClient.from('tables').select('*').eq('restaurant_id', KALPUTRA_ID);
    const { data: activeOrders } = await kalputraClient.from('orders').select('table_id').eq('restaurant_id', KALPUTRA_ID).not('status', 'in', '("completed","cancelled")');

    const activeTableIds = new Set((activeOrders || []).map(o => o.table_id));
    const testTable = (tables || []).find(t => !activeTableIds.has(t.id)) || tables?.[0];
    const testProd = prods[0];

    // 3. Create POS Dine-in Order
    const orderId = 'ord-settle-' + Date.now();
    const orderNumber = 'INV-' + Math.floor(1000 + Math.random() * 9000);
    const subtotal = testProd.price;
    const cgst = (subtotal * 2.5) / 100;
    const sgst = (subtotal * 2.5) / 100;
    const grandTotal = Math.round(subtotal + cgst + sgst);

    const { data: newOrder, error: oErr } = await kalputraClient
      .from('orders')
      .insert({
        id: orderId,
        restaurant_id: KALPUTRA_ID,
        order_number: orderNumber,
        order_type: 'dine_in',
        table_id: testTable?.id,
        table_number: testTable?.table_number,
        customer_name: 'Settle Bill Test Guest',
        status: 'confirmed',
        subtotal: subtotal,
        cgst_amount: cgst,
        sgst_amount: sgst,
        grand_total: grandTotal,
        payable_amount: grandTotal,
        payment_status: 'unpaid',
        notes: '[POS] Settle Bill Test',
        created_by: authData.user.id,
      })
      .select()
      .single();

    if (oErr) throw oErr;
    console.log(`[PASS] 2. Order created: #${newOrder.order_number} (${newOrder.id})`);

    // 4. Generate KOT
    const kotId = 'kot-' + Date.now();
    const { data: kotData, error: kErr } = await kalputraClient
      .from('kots')
      .insert({
        id: kotId,
        restaurant_id: KALPUTRA_ID,
        kot_number: 'KOT-' + Math.floor(1000 + Math.random() * 9000),
        order_id: newOrder.id,
        order_number: newOrder.order_number,
        order_type: 'dine_in',
        table_number: testTable?.table_number,
        status: 'pending',
        kitchen_notes: 'Rush order',
      })
      .select()
      .single();

    if (kErr) throw kErr;
    console.log(`[PASS] 3. KOT generated: #${kotData.kot_number}`);

    // 5. Test "Settle Bill & Collect" via closeAndSettleOrder simulation
    const payRecord = {
      id: 'pay-' + Date.now(),
      order_id: newOrder.id,
      payment_method: 'cash',
      amount: newOrder.payable_amount,
      reference_number: `TXN-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    const { error: payErr } = await kalputraClient.from('payments').insert([payRecord]);
    if (payErr) throw payErr;

    const { data: settledOrder, error: setErr } = await kalputraClient
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        paid_amount: newOrder.payable_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', newOrder.id)
      .eq('restaurant_id', KALPUTRA_ID)
      .select('*, payments(*)')
      .single();

    if (setErr) throw setErr;
    console.log(`[PASS] 4. Order Settled & Collected: #${settledOrder.order_number}`);
    console.log(`   Status: ${settledOrder.status}, Payment: ${settledOrder.payment_status}, Paid: ₹${settledOrder.paid_amount}`);
    console.log(`   Recorded Payments: ${settledOrder.payments?.length}`);

    console.log('\n================================================================');
    console.log('SETTLE BILL & COLLECT WORKFLOW: PASS');
    console.log('================================================================\n');

  } catch (err) {
    console.error('[FAIL] Settle Bill Error:', err.message);
  }
}

testSettleBillAndCollect();
