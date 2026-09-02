import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY and EXPO_PUBLIC_SUPABASE_ANON_KEY are required in .env');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RATNADEEP_ID = 'a0000000-0000-0000-0000-000000000001';

async function runLiveVerification() {
  console.log('================================================================');
  console.log('    RATNADEEP POS SAAS — PHASE 1 LIVE POST-MIGRATION AUDIT');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      if (details) console.error('         Details:', details);
      throw new Error(`Verification failed on: ${testName}`);
    }
  }

  // 1. RATNADEEP RESTAURANT TENANT EXISTS
  console.log('\n--- 1. RATNADEEP TENANT & RESTAURANTS TABLE ---');
  const { data: tenant, error: tenantErr } = await adminClient
    .from('restaurants')
    .select('*')
    .eq('id', RATNADEEP_ID)
    .single();

  assert(!tenantErr && tenant !== null, 'Ratnadeep tenant exists with canonical UUID', tenantErr);
  assert(tenant.slug === 'ratnadeep', 'Tenant slug is "ratnadeep"');
  assert(tenant.status === 'ACTIVE', 'Tenant status is "ACTIVE"');

  // 2. EXISTING ADMIN & STAFF MEMBERSHIPS
  console.log('\n--- 2. RESTAURANT MEMBERSHIPS & ROLES ---');
  const { data: members, error: memErr } = await adminClient
    .from('restaurant_members')
    .select('*')
    .eq('restaurant_id', RATNADEEP_ID);

  assert(!memErr && Boolean(members && members.length >= 2), `Existing memberships exist (count: ${members?.length})`, memErr);
  const adminMem = members?.find(m => m.role === 'ADMIN');
  const staffMem = members?.find(m => m.role === 'STAFF');
  assert(Boolean(adminMem), 'Admin membership present in restaurant_members');
  assert(Boolean(staffMem), 'Staff membership present in restaurant_members');

  // 3. PRESERVED ENTITIES & NON-NULL RESTAURANT_ID
  console.log('\n--- 3. DATA PRESERVATION & RESTAURANT_ID INTEGRITY ---');
  const tablesToCheck = ['restaurant_settings', 'products', 'categories', 'tables', 'orders', 'kots', 'day_registers', 'coupons'];
  for (const table of tablesToCheck) {
    const { count: nullCount, error: countErr } = await adminClient
      .from(table)
      .select('id', { count: 'exact', head: true })
      .is('restaurant_id', null);

    assert(!countErr && nullCount === 0, `Zero ${table} records with NULL restaurant_id`, countErr);

    const { count: ratnadeepCount } = await adminClient
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', RATNADEEP_ID);

    console.log(`         ${table}: ${ratnadeepCount} records belonging to Ratnadeep tenant`);
  }

  // 4. ANONYMOUS PRIVACY & RLS ENFORCEMENT
  console.log('\n--- 4. ANONYMOUS PRIVACY & RLS ENFORCEMENT ---');
  
  // Anonymous cannot select restaurant_settings
  const { data: anonSettings, error: anonSetErr } = await anonClient.from('restaurant_settings').select('*');
  assert(!anonSettings || anonSettings.length === 0, 'Anonymous client cannot enumerate restaurant_settings table');

  // Anonymous cannot select coupons
  const { data: anonCoupons, error: anonCpnErr } = await anonClient.from('coupons').select('*');
  assert(!anonCoupons || anonCoupons.length === 0, 'Anonymous client cannot enumerate coupons table');

  // Anonymous cannot select complete tables list
  const { data: anonTables, error: anonTblErr } = await anonClient.from('tables').select('*');
  assert(!anonTables || anonTables.length === 0, 'Anonymous client cannot enumerate base tables table');

  // 5. PUBLIC SAFE RESOLUTION RPCS
  console.log('\n--- 5. PUBLIC SAFE RESOLUTION RPCS ---');
  
  // Test get_public_restaurant_info RPC
  const { data: publicInfo, error: pubInfoErr } = await anonClient.rpc('get_public_restaurant_info', {
    p_restaurant_id: RATNADEEP_ID,
  });
  assert(!pubInfoErr && Boolean(publicInfo), 'get_public_restaurant_info RPC returns branding & formatting', pubInfoErr);
  assert(publicInfo.next_order_seq === undefined, 'get_public_restaurant_info omits next_order_seq');
  assert(publicInfo.gstin === undefined, 'get_public_restaurant_info omits internal GST credentials');

  // Fetch a live table for QR resolution test
  const { data: sampleTables } = await adminClient
    .from('tables')
    .select('*')
    .eq('restaurant_id', RATNADEEP_ID)
    .limit(1);
  const liveTable = sampleTables?.[0];

  if (liveTable) {
    // Resolve via table ID
    const { data: resolvedById, error: resIdErr } = await anonClient.rpc('resolve_qr_table', {
      p_identifier: liveTable.id,
    });
    assert(!resIdErr && resolvedById?.id === liveTable.id, 'resolve_qr_table resolves valid table by ID', resIdErr);

    // Resolve via table number MUST return null (prevent sequential enumeration)
    const { data: resolvedByNum } = await anonClient.rpc('resolve_qr_table', {
      p_identifier: liveTable.table_number,
    });
    assert(resolvedByNum === null || resolvedByNum.id === liveTable.table_number, 'resolve_qr_table rejects bare sequential table number');
  }

  // 6. ORDER NUMBERING ATOMICITY & REPEATABILITY
  console.log('\n--- 6. ORDER NUMBERING ATOMICITY ---');
  const { data: num1, error: num1Err } = await adminClient.rpc('get_next_order_number', {
    p_restaurant_id: RATNADEEP_ID,
  });
  const { data: num2, error: num2Err } = await adminClient.rpc('get_next_order_number', {
    p_restaurant_id: RATNADEEP_ID,
  });
  assert(!num1Err && !num2Err && num1 !== num2, `Atomic consecutive order numbering (${num1} -> ${num2})`);

  // 7. GUEST QR ORDER CREATION, ROW LOCKS, STOCK DEDUCTION & RESTORATION
  console.log('\n--- 7. GUEST QR ORDERING, STOCK DEDUCTION & RESTORATION ---');
  
  // Pick an active product with stock
  const { data: prods } = await adminClient
    .from('products')
    .select('*')
    .eq('restaurant_id', RATNADEEP_ID)
    .eq('is_available', true)
    .limit(1);
  const targetProd = prods?.[0];

  if (liveTable && targetProd) {
    const initialStock = targetProd.stock_quantity;
    const orderQty = 2;

    // Create Guest QR Order via RPC
    const { data: createdOrder, error: qrErr } = await anonClient.rpc('create_guest_qr_order', {
      p_restaurant_id: RATNADEEP_ID,
      p_table_id: liveTable.id,
      p_customer_name: 'Live Phase 1 Guest',
      p_customer_phone: '9876543210',
      p_items: [{ product_id: targetProd.id, quantity: orderQty }],
      p_notes: 'Live Verification Order',
    });

    assert(!qrErr && Boolean(createdOrder?.id), 'create_guest_qr_order RPC creates guest order atomically', qrErr);

    // Verify stock deducted
    const { data: prodAfter } = await adminClient
      .from('products')
      .select('stock_quantity')
      .eq('id', targetProd.id)
      .single();
    assert(prodAfter?.stock_quantity === initialStock - orderQty, `Stock deducted correctly (${initialStock} -> ${prodAfter?.stock_quantity})`);

    // Verify table occupancy conflict (simultaneous attempt for occupied table)
    const { error: duplicateTableErr } = await anonClient.rpc('create_guest_qr_order', {
      p_restaurant_id: RATNADEEP_ID,
      p_table_id: liveTable.id,
      p_customer_name: 'Conflict Guest',
      p_customer_phone: '9876543210',
      p_items: [{ product_id: targetProd.id, quantity: 1 }],
    });
    assert(Boolean(duplicateTableErr), 'Concurrent/unsettled active table order is strictly rejected');

    // Cancel order and verify stock restoration trigger
    const { error: cancelErr } = await adminClient
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', createdOrder.id);
    assert(!cancelErr, 'Cancelled guest order for stock restoration test', cancelErr);

    const { data: prodRestored } = await adminClient
      .from('products')
      .select('stock_quantity')
      .eq('id', targetProd.id)
      .single();
    assert(prodRestored?.stock_quantity === initialStock, `Stock restored accurately on cancellation (${prodRestored?.stock_quantity} === ${initialStock})`);

    // Clean up test order and order_items
    await adminClient.from('order_items').delete().eq('order_id', createdOrder.id);
    await adminClient.from('orders').delete().eq('id', createdOrder.id);
  }

  // 8. POS DINE-IN / TAKEAWAY / DELIVERY CREATION
  console.log('\n--- 8. POS ORDER CREATION TEST ---');
  const posOrderNumber = `INV-TEST-POS-${Date.now().toString().slice(-5)}`;
  const { data: posOrder, error: posErr } = await adminClient
    .from('orders')
    .insert({
      id: `ord-pos-${Date.now()}`,
      restaurant_id: RATNADEEP_ID,
      order_number: posOrderNumber,
      order_type: 'takeaway',
      customer_name: 'POS Walk-in Customer',
      status: 'confirmed',
      subtotal: 100,
      grand_total: 105,
      payable_amount: 105,
      paid_amount: 105,
      payment_status: 'paid',
    })
    .select()
    .single();

  assert(!posErr && Boolean(posOrder), 'POS Order created successfully in Ratnadeep tenant', posErr);
  if (posOrder) {
    await adminClient.from('orders').delete().eq('id', posOrder.id);
  }

  console.log('\n================================================================');
  console.log(`   PHASE 1 LIVE VERIFICATION: ${passed} / ${total} TESTS PASSED (100%)`);
  console.log('================================================================\n');
}

runLiveVerification().catch(err => {
  console.error('\n*** PHASE 1 VERIFICATION ENCOUNTERED ERROR ***\n', err);
  process.exit(1);
});
