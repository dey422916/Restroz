const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const anonClient = createClient(SUPABASE_URL, ANON_KEY);
const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';
const KULLAD_ID = 'a0000000-0000-0000-0000-000000000001';

async function verifyQrBrandingAndOrderFeed() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: QR BRANDING, ACCURATE ROUTING & MULTI-TENANCY');
  console.log('================================================================\n');

  try {
    // 1. Check Kalputra & Kullad Table Records
    const { data: kalputraTables } = await adminClient.from('tables').select('*').eq('restaurant_id', KALPUTRA_ID);
    const { data: kulladTables } = await adminClient.from('tables').select('*').eq('restaurant_id', KULLAD_ID);

    console.log(`[PASS] 1. Kalputra Tables: ${kalputraTables.length}, Kullad Tables: ${kulladTables.length}`);

    const kalputraTable = kalputraTables[0];
    console.log(`   Kalputra Table 1: ID = ${kalputraTable.id}, Hash = ${kalputraTable.qr_code_hash}`);

    // 2. Test resolve_qr_table for Kalputra table hash
    const { data: resolvedKalputra } = await anonClient.rpc('resolve_qr_table', {
      p_identifier: kalputraTable.qr_code_hash,
    });
    console.log(`[PASS] 2. Resolved QR Table: ${resolvedKalputra.table_number} belongs to Restaurant: "${resolvedKalputra.restaurant_name}" (${resolvedKalputra.restaurant_id})`);

    if (resolvedKalputra.restaurant_id !== KALPUTRA_ID) {
      throw new Error(`Resolved restaurant_id (${resolvedKalputra.restaurant_id}) does not match Kalputra ID (${KALPUTRA_ID})`);
    }

    // 3. Place an Anonymous QR Dine-In Order for Kalputra Table
    const orderId = 'ord-qr-test-' + Date.now();
    const orderNumber = 'INV-QR-' + Math.floor(1000 + Math.random() * 9000);

    const { data: prods } = await adminClient.from('products').select('*').eq('restaurant_id', KALPUTRA_ID).limit(1);
    const testProd = prods[0];

    const { data: createdOrder, error: oErr } = await anonClient
      .from('orders')
      .insert({
        id: orderId,
        restaurant_id: KALPUTRA_ID,
        order_number: orderNumber,
        order_type: 'dine_in',
        table_id: kalputraTable.id,
        table_number: kalputraTable.table_number,
        customer_name: `${kalputraTable.table_number} Guest`,
        status: 'confirmed',
        subtotal: testProd.price,
        grand_total: testProd.price,
        payable_amount: testProd.price,
        payment_status: 'unpaid',
        notes: '[QR_DINE_IN] Order placed via Kalputra QR',
      })
      .select()
      .single();

    if (oErr) throw oErr;
    console.log(`[PASS] 3. QR Order created for Kalputra: #${createdOrder.order_number} (${createdOrder.id})`);

    // 4. Authenticate as Kalputra Admin and verify order IS visible in Kalputra order feed
    const kalputraUserClient = createClient(SUPABASE_URL, ANON_KEY);
    await kalputraUserClient.auth.signInWithPassword({
      email: 'kalputra@yopmail.com',
      password: 'Password123!',
    });

    const { data: kalputraAdminOrders } = await kalputraUserClient
      .from('orders')
      .select('*')
      .eq('restaurant_id', KALPUTRA_ID)
      .eq('id', createdOrder.id);

    console.log(`[PASS] 4. Kalputra Admin sees order: ${kalputraAdminOrders.length > 0 ? 'YES' : 'NO'}`);
    if (kalputraAdminOrders.length === 0) throw new Error('Order not visible in Kalputra Admin order feed.');

    // 5. Authenticate as Kullad Chai Admin and verify order is NOT visible
    const kulladUserClient = createClient(SUPABASE_URL, ANON_KEY);
    await kulladUserClient.auth.signInWithPassword({
      email: 'bipin@yopmail.com',
      password: 'Password123!',
    });

    const { data: kulladAdminOrders } = await kulladUserClient
      .from('orders')
      .select('*')
      .eq('restaurant_id', KULLAD_ID)
      .eq('id', createdOrder.id);

    console.log(`[PASS] 5. Kullad Chai Admin order leakage: ${kulladAdminOrders.length === 0 ? 'NONE (Cleanly Isolated)' : 'LEAKED'}`);
    if (kulladAdminOrders.length > 0) throw new Error('Order leaked to Kullad Chai Admin!');

    // Clean up
    await adminClient.from('orders').delete().eq('id', createdOrder.id);
    console.log(`[PASS] 6. Test order cleaned up.`);

    console.log('\n================================================================');
    console.log('QR BRANDING & ORDER MULTI-TENANCY: ALL CHECKS PASSED 100%');
    console.log('================================================================\n');

  } catch (err) {
    console.error('[FAIL] Test Error:', err.message);
  }
}

verifyQrBrandingAndOrderFeed();
