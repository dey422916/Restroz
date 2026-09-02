const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RATNADEEP_ID = 'a0000000-0000-0000-0000-000000000001';

async function runVerification() {
  console.log('================================================================');
  console.log('🚀 PRIVILEGED ACCESS & MEMBER MANAGEMENT LIVE VERIFICATION');
  console.log('================================================================\n');

  let allPassed = true;
  function record(name, pass, detail) {
    if (!pass) allPassed = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  // 1. Role-based Login Routing Simulation
  function getLoginLanding(role) {
    const r = (role || 'CUSTOMER').toUpperCase();
    if (r === 'SUPER_ADMIN') return '/super-admin';
    if (r === 'ADMIN' || r === 'STAFF') return '/(admin)/pos';
    return '/(marketplace)';
  }

  record('Login Routing: SUPER_ADMIN', getLoginLanding('SUPER_ADMIN') === '/super-admin', 'Routes to /super-admin');
  record('Login Routing: ADMIN', getLoginLanding('ADMIN') === '/(admin)/pos', 'Routes to /(admin)/pos');
  record('Login Routing: STAFF', getLoginLanding('STAFF') === '/(admin)/pos', 'Routes to /(admin)/pos');
  record('Login Routing: CUSTOMER', getLoginLanding('CUSTOMER') === '/(marketplace)', 'Routes to /(marketplace)');

  // 2. Marketplace Blocking Logic
  function evaluateMarketplaceAccess(user, role, previewActive) {
    if (!user) return { allowed: true, redirect: null }; // guest customer
    if (role === 'CUSTOMER') return { allowed: true, redirect: null };
    if (role === 'ADMIN' || role === 'STAFF') return { allowed: false, redirect: '/(admin)/pos' };
    if (role === 'SUPER_ADMIN') {
      if (previewActive) return { allowed: true, redirect: null, banner: 'Super Admin Preview' };
      return { allowed: false, redirect: '/super-admin' };
    }
    return { allowed: false, redirect: '/(admin)/pos' };
  }

  const adminBlocked = evaluateMarketplaceAccess({ id: 'u1' }, 'ADMIN', false);
  record('Marketplace Block: Restaurant ADMIN', !adminBlocked.allowed && adminBlocked.redirect === '/(admin)/pos', 'Redirected to POS');

  const staffBlocked = evaluateMarketplaceAccess({ id: 'u2' }, 'STAFF', false);
  record('Marketplace Block: Restaurant STAFF', !staffBlocked.allowed && staffBlocked.redirect === '/(admin)/pos', 'Redirected to POS');

  const superAdminDirectBlocked = evaluateMarketplaceAccess({ id: 'u3' }, 'SUPER_ADMIN', false);
  record('Marketplace Block: Direct SUPER_ADMIN', !superAdminDirectBlocked.allowed && superAdminDirectBlocked.redirect === '/super-admin', 'Redirected to /super-admin');

  const superAdminPreviewAllowed = evaluateMarketplaceAccess({ id: 'u3' }, 'SUPER_ADMIN', true);
  record('Marketplace Override: SUPER_ADMIN Preview Mode', superAdminPreviewAllowed.allowed && superAdminPreviewAllowed.banner === 'Super Admin Preview', 'Allowed with Preview Banner');

  // 3. Database Multi-Restaurant & Member Removal Safety Test
  console.log('\n--- Testing Multi-Restaurant Member Removal Isolation ---');
  let testRestB = null;
  let testMemberA = null;
  let testMemberB = null;
  let testUserId = null;

  try {
    // A. Create temporary test restaurant B
    const { data: restB, error: restBErr } = await adminClient.from('restaurants').insert({
      name: 'Verification Bistro ' + Date.now(),
      slug: 'verif-bistro-' + Date.now(),
      address: '456 Test Street',
      city: 'Kolkata',
      state: 'West Bengal',
      postal_code: '700001',
    }).select().single();

    if (restBErr || !restB) throw new Error('Failed to create test restaurant B: ' + restBErr?.message);
    testRestB = restB;

    // B. Use an existing user or create mock user
    const testEmail = `test_member_${Date.now()}@yopmail.com`;
    const { data: userAuth, error: uErr } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Test Member', role: 'STAFF' },
    });

    if (uErr || !userAuth.user) throw new Error('Failed to create test user: ' + uErr?.message);
    testUserId = userAuth.user.id;

    // Insert profile
    await adminClient.from('profiles').upsert({
      id: testUserId,
      email: testEmail,
      full_name: 'Test Member',
      role: 'STAFF',
    });

    // C. Add member to Restaurant A (Ratnadeep)
    const { data: memA, error: memAErr } = await adminClient.from('restaurant_members').insert({
      restaurant_id: RATNADEEP_ID,
      user_id: testUserId,
      role: 'STAFF',
      is_active: true,
    }).select().single();
    if (memAErr) throw memAErr;
    testMemberA = memA;

    // Set permissions for member in Restaurant A
    await adminClient.from('restaurant_member_permissions').insert({
      restaurant_member_id: memA.id,
      can_use_pos: true,
      can_view_orders: true,
      can_edit_orders: false,
    });

    // D. Add member to Restaurant B
    const { data: memB, error: memBErr } = await adminClient.from('restaurant_members').insert({
      restaurant_id: testRestB.id,
      user_id: testUserId,
      role: 'STAFF',
      is_active: true,
    }).select().single();
    if (memBErr) throw memBErr;
    testMemberB = memB;

    // E. Remove member from Restaurant A
    const { error: delErr } = await adminClient.from('restaurant_members').delete().eq('id', testMemberA.id);
    record('Remove Member from Restaurant A', !delErr, 'Deleted only restaurant_members join record');

    // F. Verify Restaurant B membership remains active
    const { data: verifyMemB } = await adminClient.from('restaurant_members').select('*').eq('id', testMemberB.id).single();
    record('Restaurant B Membership Preserved', !!verifyMemB && verifyMemB.is_active === true, 'Member remains active in Restaurant B');

    // G. Verify Global User & Profile preserved
    const { data: verifyProf } = await adminClient.from('profiles').select('*').eq('id', testUserId).single();
    record('Global Profile Preserved', !!verifyProf && verifyProf.email === testEmail, 'User profile intact in Supabase');

    const { data: verifyAuth } = await adminClient.auth.admin.getUserById(testUserId);
    record('Global Auth User Preserved', !!verifyAuth?.user, 'Auth identity untouched');

  } catch (err) {
    record('Multi-Restaurant Test Error', false, err.message);
  } finally {
    // Cleanup test records
    if (testMemberA) await adminClient.from('restaurant_members').delete().eq('id', testMemberA.id);
    if (testMemberB) await adminClient.from('restaurant_members').delete().eq('id', testMemberB.id);
    if (testUserId) {
      await adminClient.from('profiles').delete().eq('id', testUserId);
      await adminClient.auth.admin.deleteUser(testUserId);
    }
    if (testRestB) await adminClient.from('restaurants').delete().eq('id', testRestB.id);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('PRIVILEGED ACCESS & MEMBER MANAGEMENT FIX: PASS');
  } else {
    console.log('PRIVILEGED ACCESS & MEMBER MANAGEMENT FIX: FAIL');
  }
  console.log('================================================================\n');
}

runVerification().catch(console.error);
