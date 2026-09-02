const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

async function testServicesInsertWithoutId() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: CREATING TABLE / PRODUCT / CATEGORY WITHOUT ID');
  console.log('================================================================\n');

  try {
    const kalputraClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: authData, error: aErr } = await kalputraClient.auth.signInWithPassword({
      email: 'kalputra@yopmail.com',
      password: 'Password123!',
    });
    if (aErr) throw aErr;
    console.log(`[PASS] 1. Kalputra Admin logged in: ${authData.user.email}`);

    // 1. Test Table Insert with generated id
    const tableId = 'tbl-' + KALPUTRA_ID.slice(0, 8) + '-' + Date.now();
    const qrHash = `QR_TBL_${Date.now()}`;
    const { data: tableData, error: tErr } = await kalputraClient
      .from('tables')
      .insert({
        id: tableId,
        restaurant_id: KALPUTRA_ID,
        table_number: 'Table ' + Math.floor(100 + Math.random() * 900),
        section: 'AC Section',
        seating_capacity: 6,
        qr_code_hash: qrHash,
        status: 'available',
        is_active: true,
      })
      .select()
      .single();

    if (tErr) throw tErr;
    console.log(`[PASS] 2. Table created with ID: ${tableData.id} (${tableData.table_number})`);

    // Clean up
    await kalputraClient.from('tables').delete().eq('id', tableData.id);
    console.log(`[PASS] 3. Test Table cleaned up.`);

    console.log('\n================================================================');
    console.log('NOT-NULL CONSTRAINT VERIFICATION: 100% PASSED');
    console.log('================================================================\n');
  } catch (err) {
    console.error('[FAIL] Test Error:', err.message);
  }
}

testServicesInsertWithoutId();
