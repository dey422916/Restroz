const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

async function testPosOrderAndKot() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: POS ORDER & KOT PLACEMENT');
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

    // 2. Fetch product & an available table for Kalputra
    const { data: prods } = await kalputraClient.from('products').select('*').eq('restaurant_id', KALPUTRA_ID).limit(1);
    const { data: tables } = await kalputraClient.from('tables').select('*').eq('restaurant_id', KALPUTRA_ID);
    const { data: activeOrders } = await kalputraClient.from('orders').select('table_id').eq('restaurant_id', KALPUTRA_ID).not('status', 'in', '("completed","cancelled")');

    const activeTableIds = new Set((activeOrders || []).map(o => o.table_id));
    const testTable = (tables || []).find(t => !activeTableIds.has(t.id)) || tables?.[0];
    const testProd = prods[0];
    console.log(`[PASS] 2. Found Product: ${testProd.name} (₹${testProd.price}) & Table: ${testTable?.table_number || testTable?.id}`);

    // 3. Test POS Dine-in Order placement with valid UUID created_by
    const orderId = 'ord-pos-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const orderNumber = 'INV-' + Math.floor(1000 + Math.random() * 9000);

    const { data: createdOrder, error: oErr } = await kalputraClient
      .from('orders')
      .insert({
        id: orderId,
        restaurant_id: KALPUTRA_ID,
        order_number: orderNumber,
        order_type: 'dine_in',
        table_id: testTable?.id,
        table_number: testTable?.table_number,
        customer_name: 'Floor Guest',
        status: 'confirmed',
        subtotal: testProd.price,
        grand_total: testProd.price,
        payable_amount: testProd.price,
        payment_status: 'unpaid',
        notes: '[POS] Dine in floor order',
        created_by: authData.user.id,
      })
      .select()
      .single();

    if (oErr) throw oErr;
    console.log(`[PASS] 3. POS Order created successfully: #${createdOrder.order_number} (${createdOrder.id})`);

    // 4. Test KOT generation
    const kotId = 'kot-' + Date.now();
    const kotNumber = 'KOT-' + Math.floor(1000 + Math.random() * 9000);

    const { data: createdKot, error: kErr } = await kalputraClient
      .from('kots')
      .insert({
        id: kotId,
        restaurant_id: KALPUTRA_ID,
        kot_number: kotNumber,
        order_id: createdOrder.id,
        order_number: createdOrder.order_number,
        order_type: 'dine_in',
        table_number: testTable?.table_number,
        status: 'pending',
        kitchen_notes: '[POS] KOT Kitchen Note',
      })
      .select()
      .single();

    if (kErr) throw kErr;
    console.log(`[PASS] 4. KOT generated successfully: #${createdKot.kot_number} (${createdKot.id})`);

    // 5. Test POS Takeaway Order
    const takeawayOrderId = 'ord-takeaway-' + Date.now();
    const takeawayOrderNum = 'INV-' + Math.floor(1000 + Math.random() * 9000);
    const { data: takeawayOrder, error: tErr } = await kalputraClient
      .from('orders')
      .insert({
        id: takeawayOrderId,
        restaurant_id: KALPUTRA_ID,
        order_number: takeawayOrderNum,
        order_type: 'takeaway',
        customer_name: 'Rahul Counter',
        customer_phone: '+91 99999 88888',
        status: 'confirmed',
        subtotal: testProd.price,
        grand_total: testProd.price,
        payable_amount: testProd.price,
        payment_status: 'unpaid',
        notes: '[POS] Counter Takeaway',
        created_by: authData.user.id,
      })
      .select()
      .single();

    if (tErr) throw tErr;
    console.log(`[PASS] 5. POS Takeaway Order created: #${takeawayOrder.order_number}`);

    // 6. Test POS Delivery Order
    const delOrderId = 'ord-pos-del-' + Date.now();
    const delOrderNum = 'DEL-' + Math.floor(1000 + Math.random() * 9000);
    const { data: delOrder, error: dErr } = await kalputraClient
      .from('orders')
      .insert({
        id: delOrderId,
        restaurant_id: KALPUTRA_ID,
        order_number: delOrderNum,
        order_type: 'delivery',
        customer_name: 'Anjali Home',
        customer_phone: '+91 98765 43210',
        delivery_address: 'Flat 402, Green Valley Apartments, Burdwan',
        status: 'confirmed',
        subtotal: testProd.price,
        grand_total: testProd.price,
        payable_amount: testProd.price,
        payment_status: 'unpaid',
        notes: '[POS] Doorstep Delivery from POS',
        created_by: authData.user.id,
      })
      .select()
      .single();

    if (dErr) throw dErr;
    console.log(`[PASS] 6. POS Delivery Order created: #${delOrder.order_number}`);

    console.log('\n================================================================');
    console.log('ALL POS & KOT ORDER PLACEMENT TESTS PASSED 100%!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('[FAIL] Test Error:', err.message);
  }
}

testPosOrderAndKot();
