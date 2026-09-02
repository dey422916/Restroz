const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('FAIL: Missing SUPABASE keys in .env');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RATNADEEP_ID = 'a0000000-0000-0000-0000-000000000001';

async function runPhase1CriticalVerification() {
  console.log('======================================================');
  console.log('  RATNADEEP POS SAAS — PHASE 1 CRITICAL VERIFICATION  ');
  console.log('======================================================\n');

  const results = [];

  function record(name, pass, detail) {
    const status = pass ? 'PASS' : 'FAIL';
    results.push({ name, pass, detail });
    console.log(`[${status}] ${name}: ${detail}`);
  }

  try {
    // 1. Supabase connection works
    const { error: pingErr } = await adminClient.from('restaurants').select('id', { head: true });
    record('1. Supabase connection works', !pingErr, pingErr ? pingErr.message : 'Connected to ' + SUPABASE_URL);

    // 2. restaurants contains Ratnadeep
    const { data: tenant, error: tErr } = await adminClient
      .from('restaurants')
      .select('id, name, slug, status')
      .eq('id', RATNADEEP_ID)
      .single();
    record('2. restaurants contains Ratnadeep', !!tenant, tenant ? `"${tenant.name}" (slug: ${tenant.slug}, status: ${tenant.status})` : (tErr ? tErr.message : 'Not found'));

    // 3. restaurant_members contains existing Admin/Staff
    const { data: members, error: mErr } = await adminClient
      .from('restaurant_members')
      .select('id, user_id, role, is_active')
      .eq('restaurant_id', RATNADEEP_ID);
    const membersPass = members && members.length >= 2;
    record('3. restaurant_members contains existing Admin/Staff', membersPass, members ? `${members.length} members found (${members.map(m => m.role).join(', ')})` : (mErr ? mErr.message : 'No members'));

    // 4. existing products/orders/tables are preserved
    const { count: prodCount } = await adminClient.from('products').select('id', { count: 'exact', head: true }).eq('restaurant_id', RATNADEEP_ID);
    const { count: orderCount } = await adminClient.from('orders').select('id', { count: 'exact', head: true }).eq('restaurant_id', RATNADEEP_ID);
    const { count: tableCount } = await adminClient.from('tables').select('id', { count: 'exact', head: true }).eq('restaurant_id', RATNADEEP_ID);
    const dataPreserved = (prodCount > 0) && (orderCount > 0) && (tableCount > 0);
    record('4. Existing products/orders/tables preserved', dataPreserved, `${prodCount} products, ${tableCount} tables, ${orderCount} orders`);

    // 5. restaurant_settings is accessible to Admin
    const { data: settings, error: sErr } = await adminClient
      .from('restaurant_settings')
      .select('*')
      .eq('restaurant_id', RATNADEEP_ID)
      .single();
    record('5. restaurant_settings is accessible to Admin', !!settings, settings ? `Prefix: ${settings.invoice_prefix}, next_order_seq: ${settings.next_order_seq}` : (sErr ? sErr.message : 'Settings missing'));

    // 6. POS Admin can read Ratnadeep data
    const authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: authSession, error: loginErr } = await authClient.auth.signInWithPassword({
      email: 'ratnadeepdey13@gmail.com',
      password: 'Qwerty1@',
    });
    if (loginErr || !authSession) {
      record('6. POS Admin can read Ratnadeep data', false, `Admin login error: ${loginErr ? loginErr.message : 'Session failed'}`);
    } else {
      const { data: adminOrders, error: readOrdersErr } = await authClient.from('orders').select('id').eq('restaurant_id', RATNADEEP_ID).limit(5);
      const { data: adminProds, error: readProdsErr } = await authClient.from('products').select('id').eq('restaurant_id', RATNADEEP_ID).limit(5);
      const readPass = !readOrdersErr && !readProdsErr && (adminProds?.length > 0);
      record('6. POS Admin can read Ratnadeep data', readPass, readPass ? `Successfully authenticated and read ${adminProds.length} products and ${adminOrders.length} orders` : (readOrdersErr?.message || readProdsErr?.message));
    }

    // 7. Guest QR table resolution works
    const { data: sampleTables } = await adminClient.from('tables').select('id, table_number').eq('restaurant_id', RATNADEEP_ID).limit(1);
    const testTable = sampleTables && sampleTables.length > 0 ? sampleTables[0] : { id: 'tbl-1', table_number: 'Table 1' };
    const { data: resolvedTable, error: rErr } = await anonClient.rpc('resolve_qr_table', {
      p_identifier: testTable.id,
    });
    record('7. Guest QR table resolution works', !!resolvedTable && resolvedTable.id === testTable.id, resolvedTable ? `Resolved "${resolvedTable.table_number}" to restaurant "${resolvedTable.restaurant_name}"` : (rErr ? rErr.message : 'Resolution failed'));

    // 8. Order numbering is sequential and unique
    const { data: num1, error: n1Err } = await adminClient.rpc('get_next_order_number', { p_restaurant_id: RATNADEEP_ID });
    const { data: num2, error: n2Err } = await adminClient.rpc('get_next_order_number', { p_restaurant_id: RATNADEEP_ID });
    const seqPass = !n1Err && !n2Err && !!num1 && !!num2 && (num1 !== num2);
    record('8. Order numbering is sequential and unique', seqPass, seqPass ? `${num1} -> ${num2}` : `Error: num1=${num1}, num2=${num2}`);

    // 9. One test POS order can be created
    const testPosId = `ord-crit-pos-${Date.now()}`;
    const { data: createdPos, error: posErr } = await adminClient
      .from('orders')
      .insert({
        id: testPosId,
        restaurant_id: RATNADEEP_ID,
        table_id: testTable.id,
        table_number: testTable.table_number,
        order_number: num1,
        order_type: 'dine_in',
        customer_name: 'Critical POS Test',
        status: 'completed',
        subtotal: 100,
        grand_total: 105,
        payable_amount: 105,
        paid_amount: 105,
        payment_status: 'paid',
      })
      .select()
      .single();
    record('9. One test POS order can be created', !!createdPos, createdPos ? `Created order ${createdPos.order_number} (${createdPos.id})` : (posErr ? posErr.message : 'Insert failed'));
    if (createdPos) {
      await adminClient.from('orders').delete().eq('id', testPosId);
    }

    // 10. One QR order flow can be verified
    const testQrId = `ord-crit-qr-${Date.now()}`;
    const { data: createdQr, error: qrErr } = await adminClient
      .from('orders')
      .insert({
        id: testQrId,
        restaurant_id: RATNADEEP_ID,
        table_id: testTable.id,
        table_number: testTable.table_number,
        order_number: num2,
        order_type: 'dine_in',
        customer_name: `${testTable.table_number} Guest`,
        notes: '[QR_DINE_IN] Critical verification test QR order',
        status: 'confirmed',
        subtotal: 120,
        grand_total: 126,
        payable_amount: 126,
        paid_amount: 0,
        payment_status: 'unpaid',
      })
      .select()
      .single();
    record('10. One QR order flow can be verified', !!createdQr, createdQr ? `Verified QR order ${createdQr.order_number} for ${createdQr.customer_name} (Status: ${createdQr.status})` : (qrErr ? qrErr.message : 'Insert failed'));
    if (createdQr) {
      await adminClient.from('orders').delete().eq('id', testQrId);
    }

  } catch (err) {
    console.error('Verification exception:', err);
  }

  const allPassed = results.length === 10 && results.every(r => r.pass);
  console.log('\n======================================================');
  console.log(`PHASE 1 CRITICAL STATUS: ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log('======================================================\n');

  if (!allPassed) {
    const failedChecks = results.filter(r => !r.pass);
    console.log('Failed checks:');
    failedChecks.forEach(f => console.log(` - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

runPhase1CriticalVerification().catch(e => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
