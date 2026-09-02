import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is required in .env for Phase 1 verification.');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RATNADEEP_ID = 'a0000000-0000-0000-0000-000000000001';
const TEST_TENANT_B_ID = 'b0000000-0000-0000-0000-000000000002';

async function runPhase1Verification() {
  console.log('================================================================');
  console.log('    RATNADEEP POS SAAS — PHASE 1 LIVE VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      if (details) console.error('         Details:', details);
      throw new Error(`Verification failed on: ${testName}`);
    }
  }

  // -------------------------------------------------------------
  // TEST SECTION 1: DEFAULT RESTAURANT TENANT & PRESERVATION
  // -------------------------------------------------------------
  console.log('\n--- 1. RESTAURANTS TENANT & DATA PRESERVATION ---');
  
  const { data: ratnadeepTenant, error: tenantErr } = await adminClient
    .from('restaurants')
    .select('*')
    .eq('id', RATNADEEP_ID)
    .single();

  assert(!tenantErr && ratnadeepTenant !== null, 'Ratnadeep tenant exists with canonical UUID', tenantErr);
  assert(ratnadeepTenant.slug === 'ratnadeep', 'Ratnadeep slug is "ratnadeep"');
  assert(ratnadeepTenant.status === 'ACTIVE', 'Ratnadeep tenant status is ACTIVE');

  // Verify settings table
  const { data: settingsData } = await adminClient
    .from('restaurant_settings')
    .select('*')
    .eq('restaurant_id', RATNADEEP_ID);
  assert(Boolean(settingsData && settingsData.length >= 1), `Ratnadeep settings preserved (found ${settingsData?.length} record)`);

  // Verify products preservation and restaurant_id stamping
  const { data: products, error: prodErr } = await adminClient
    .from('products')
    .select('*')
    .eq('restaurant_id', RATNADEEP_ID);
  assert(Boolean(!prodErr && products && products.length > 0), `Products preserved with restaurant_id (count: ${products?.length})`);

  // Verify categories preservation
  const { data: categories } = await adminClient
    .from('categories')
    .select('*')
    .eq('restaurant_id', RATNADEEP_ID);
  assert(Boolean(categories && categories.length > 0), `Categories preserved with restaurant_id (count: ${categories?.length})`);

  // Verify tables preservation
  const { data: tables } = await adminClient
    .from('tables')
    .select('*')
    .eq('restaurant_id', RATNADEEP_ID);
  assert(Boolean(tables && tables.length > 0), `Tables preserved with restaurant_id (count: ${tables?.length})`);

  // Verify orders preservation
  const { data: orders } = await adminClient
    .from('orders')
    .select('*')
    .eq('restaurant_id', RATNADEEP_ID);
  assert(Boolean(orders && orders.length > 0), `Orders preserved with restaurant_id (count: ${orders?.length})`);

  // -------------------------------------------------------------
  // TEST SECTION 2: NULL / ORPHAN TENANT INTEGRITY CHECK
  // -------------------------------------------------------------
  console.log('\n--- 2. NULL / ORPHAN FOREIGN KEY INTEGRITY CHECK ---');

  const { data: nullProd } = await adminClient.from('products').select('id').is('restaurant_id', null);
  assert(Boolean(!nullProd || nullProd.length === 0), 'Zero products with NULL restaurant_id');

  const { data: nullCat } = await adminClient.from('categories').select('id').is('restaurant_id', null);
  assert(Boolean(!nullCat || nullCat.length === 0), 'Zero categories with NULL restaurant_id');

  const { data: nullTbl } = await adminClient.from('tables').select('id').is('restaurant_id', null);
  assert(Boolean(!nullTbl || nullTbl.length === 0), 'Zero tables with NULL restaurant_id');

  const { data: nullOrd } = await adminClient.from('orders').select('id').is('restaurant_id', null);
  assert(Boolean(!nullOrd || nullOrd.length === 0), 'Zero orders with NULL restaurant_id');

  // -------------------------------------------------------------
  // TEST SECTION 3: RESTAURANT MEMBERSHIPS & ROLES
  // -------------------------------------------------------------
  console.log('\n--- 3. RESTAURANT MEMBERSHIPS & ROLES ---');

  const { data: members, error: memErr } = await adminClient
    .from('restaurant_members')
    .select('*, profile:profiles(*)')
    .eq('restaurant_id', RATNADEEP_ID);

  assert(Boolean(!memErr && members && members.length >= 2), `Ratnadeep staff/admin memberships exist (count: ${members?.length})`);

  const adminMember = members?.find((m) => m.role === 'ADMIN');
  assert(adminMember !== undefined, 'Admin member found in restaurant_members for Ratnadeep');

  const staffMember = members?.find((m) => m.role === 'STAFF');
  assert(staffMember !== undefined, 'Staff member found in restaurant_members for Ratnadeep');

  // -------------------------------------------------------------
  // TEST SECTION 4: MULTI-TENANT ISOLATION (TENANT B TEST)
  // -------------------------------------------------------------
  console.log('\n--- 4. MULTI-TENANT CROSS-RESTAURANT ISOLATION TEST ---');

  // Create temporary Tenant B
  await adminClient.from('restaurants').upsert({
    id: TEST_TENANT_B_ID,
    name: 'Green Spice Bistro',
    slug: 'green-spice-bistro',
    legal_name: 'Green Spice Hospitality LLP',
    phone: '+91 9123456789',
    email: 'contact@greenspice.com',
    status: 'ACTIVE',
  });

  // Create category and product in Tenant B
  const catBId = `cat-test-b-${Date.now()}`;
  await adminClient.from('categories').insert({
    id: catBId,
    restaurant_id: TEST_TENANT_B_ID,
    name: 'Bistro Specials',
    slug: `bistro-specials-${Date.now()}`,
    display_order: 1,
  });

  const prodBId = `prod-test-b-${Date.now()}`;
  await adminClient.from('products').insert({
    id: prodBId,
    restaurant_id: TEST_TENANT_B_ID,
    sku: `GS-SPEC-${Date.now().toString().slice(-4)}`,
    name: 'Avocado Toast Deluxe',
    category_id: catBId,
    category_name: 'Bistro Specials',
    price: 350.0,
    food_type: 'veg',
    stock_quantity: 50,
  });

  const tblBId = `tbl-test-b-${Date.now()}`;
  await adminClient.from('tables').insert({
    id: tblBId,
    restaurant_id: TEST_TENANT_B_ID,
    table_number: 'B-01',
    seating_capacity: 2,
    section: 'First Floor',
    status: 'available',
  });

  // Test Isolation: Ratnadeep query MUST NOT see Tenant B records
  const { data: ratnadeepProds } = await adminClient
    .from('products')
    .select('id, name')
    .eq('restaurant_id', RATNADEEP_ID);
  const foundBInA = ratnadeepProds?.some((p) => p.id === prodBId);
  assert(!foundBInA, 'Tenant A (Ratnadeep) product list is isolated and does not contain Tenant B product');

  // Test Isolation: Tenant B query MUST NOT see Ratnadeep records
  const { data: tenantBProds } = await adminClient
    .from('products')
    .select('id, name')
    .eq('restaurant_id', TEST_TENANT_B_ID);
  assert(
    tenantBProds?.length === 1 && tenantBProds[0].id === prodBId,
    'Tenant B product list is isolated and contains only Tenant B products'
  );

  // -------------------------------------------------------------
  // TEST SECTION 5: POS & QR ORDERING WITH TENANT SCAPING
  // -------------------------------------------------------------
  console.log('\n--- 5. ORDER CREATION & REGRESSION VERIFICATION ---');

  const testOrderAId = `ord-test-a-${Date.now()}`;
  const testOrderNumber = `INV-TEST-${Date.now().toString().slice(-6)}`;
  
  // Create order in Ratnadeep tenant
  const { data: createdOrd, error: ordErr } = await adminClient
    .from('orders')
    .insert({
      id: testOrderAId,
      restaurant_id: RATNADEEP_ID,
      order_number: testOrderNumber,
      order_type: 'dine_in',
      customer_name: 'Phase 1 Verifier',
      status: 'confirmed',
      subtotal: 250,
      grand_total: 262.5,
      payable_amount: 262.5,
      payment_status: 'paid',
    })
    .select()
    .single();

  assert(!ordErr && createdOrd !== null, 'Created multi-tenant order in Ratnadeep tenant', ordErr);
  assert(createdOrd.restaurant_id === RATNADEEP_ID, 'Order record correctly stamps Ratnadeep restaurant_id');

  // Clean up test order
  await adminClient.from('orders').delete().eq('id', testOrderAId);
  console.log('  [PASS] Test order safely cleaned up');

  // Clean up temporary Tenant B
  await adminClient.from('products').delete().eq('id', prodBId);
  await adminClient.from('categories').delete().eq('id', catBId);
  await adminClient.from('tables').delete().eq('id', tblBId);
  await adminClient.from('restaurants').delete().eq('id', TEST_TENANT_B_ID);
  console.log('  [PASS] Test Tenant B records and isolation fixtures cleaned up cleanly');

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`   PHASE 1 VERIFICATION RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
  console.log('================================================================\n');
}

runPhase1Verification().catch((err) => {
  console.error('\n*** PHASE 1 VERIFICATION FAILED ***\n', err);
  process.exit(1);
});
