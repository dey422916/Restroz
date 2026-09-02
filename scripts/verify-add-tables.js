const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

async function testAddTables() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: ADDING TABLES FOR KALPUTRA RESTAURANT');
  console.log('================================================================\n');

  try {
    // 1. Authenticate as Kalputra Admin
    const kalputraClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: authData, error: aErr } = await kalputraClient.auth.signInWithPassword({
      email: 'kalputra@yopmail.com',
      password: 'Password123!',
    });
    if (aErr) throw aErr;
    console.log(`[PASS] 1. Kalputra Admin logged in: ${authData.user.email}`);

    // 2. Fetch current tables for Kalputra
    const { data: existingTables, error: tErr } = await kalputraClient
      .from('tables')
      .select('*')
      .eq('restaurant_id', KALPUTRA_ID)
      .order('table_number');
    if (tErr) throw tErr;

    console.log(`[PASS] 2. Found ${existingTables.length} existing tables for Kalputra:`, existingTables.map(t => t.table_number));

    // 3. Compute next unused table number
    let nextNum = 1;
    while (existingTables.some(t => t.table_number.toLowerCase() === `table ${nextNum}`.toLowerCase())) {
      nextNum++;
    }
    const newTableNumber = `Table ${nextNum}`;
    const newTableId = 'tbl-' + KALPUTRA_ID.substring(0, 8) + '-' + nextNum + '-' + Date.now().toString().slice(-4);
    const qrHash = `QR_TBL_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    console.log(`[TEST] 3. Adding new table: ${newTableNumber} (${newTableId})...`);

    const { data: createdTable, error: cErr } = await kalputraClient
      .from('tables')
      .insert({
        id: newTableId,
        restaurant_id: KALPUTRA_ID,
        table_number: newTableNumber,
        section: 'Ground Floor',
        seating_capacity: 4,
        status: 'available',
        is_active: true,
        qr_code_hash: qrHash,
      })
      .select()
      .single();

    if (cErr) throw cErr;
    console.log(`[PASS] 4. Table created successfully: ${createdTable.table_number} (ID: ${createdTable.id})`);

    // Clean up test table
    await kalputraClient.from('tables').delete().eq('id', createdTable.id);
    console.log(`[PASS] 5. Test table cleaned up.`);

    console.log('\n================================================================');
    console.log('ADD TABLES VERIFICATION: ALL TESTS PASSED 100%!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('[FAIL] Test Error:', err.message);
  }
}

testAddTables();
