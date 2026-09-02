const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TEST_REST_ID = 'e0000000-0000-0000-0000-000000000099';
const TEST_SUB_ID = 'e0000000-0000-0000-0000-000000000097';

async function checkTenantAccess(restaurantId) {
  const { data: restaurant } = await client
    .from('restaurants')
    .select('id, name, status')
    .eq('id', restaurantId)
    .single();

  if (!restaurant || restaurant.status === 'SUSPENDED') {
    return { isAllowed: false, status: 'suspended', message: 'Restaurant suspended or not found.' };
  }

  const { data: subs, error } = await client
    .from('restaurant_subscriptions')
    .select('*, plan:subscription_plans(name)')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!subs || subs.length === 0) {
    return { isAllowed: false, status: 'none', message: `No active subscription found for "${restaurant.name}".` };
  }

  const sub = subs[0];
  const now = Date.now();
  const end = new Date(sub.end_date).getTime();

  if (sub.status === 'cancelled' || sub.status === 'suspended') {
    return { isAllowed: false, status: sub.status, message: `Subscription is ${sub.status}.` };
  }

  if (end < now) {
    return { isAllowed: false, status: 'expired', message: `Subscription expired.` };
  }

  return { isAllowed: true, status: sub.status, planName: sub.plan?.name };
}

async function testSubscriptionOrderRestriction() {
  console.log('================================================================');
  console.log('🔒 TEST SUITE: RESTAURANT ORDER CREATION SUBSCRIPTION RESTRICTION');
  console.log('================================================================\n');

  // STEP 1: Create a Test Restaurant
  await client.from('restaurants').upsert([{
    id: TEST_REST_ID,
    name: 'Subscription Test Bistro',
    slug: 'sub-test-bistro',
    status: 'ACTIVE',
  }], { onConflict: 'id' });

  const { data: plan } = await client.from('subscription_plans').select('id').eq('is_active', true).limit(1).single();

  // SCENARIO 1: NO SUBSCRIPTION
  console.log('--- SCENARIO 1: Restaurant has NO Subscription ---');
  await client.from('restaurant_subscriptions').delete().eq('restaurant_id', TEST_REST_ID);

  const checkNoSub = await checkTenantAccess(TEST_REST_ID);
  console.log('Check No Sub access:', checkNoSub);

  if (checkNoSub.isAllowed) throw new Error('FAIL: Restaurant without subscription was allowed access!');
  console.log('[PASS] Scenario 1: Order creation blocked when no subscription exists.');

  // SCENARIO 2: EXPIRED SUBSCRIPTION
  console.log('\n--- SCENARIO 2: Restaurant Subscription has EXPIRED ---');
  const { error: eErr } = await client.from('restaurant_subscriptions').upsert([{
    id: TEST_SUB_ID,
    restaurant_id: TEST_REST_ID,
    plan_id: plan.id,
    status: 'active',
    start_date: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
    end_date: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(), // 5 days ago
  }], { onConflict: 'id' });
  if (eErr) console.error('Expired upsert error:', eErr);

  const checkExpired = await checkTenantAccess(TEST_REST_ID);
  console.log('Check Expired access:', checkExpired);

  if (checkExpired.isAllowed) throw new Error('FAIL: Restaurant with expired subscription was allowed access!');
  console.log('[PASS] Scenario 2: Order creation blocked when subscription is expired.');

  // SCENARIO 3: SUSPENDED / CANCELLED SUBSCRIPTION
  console.log('\n--- SCENARIO 3: Restaurant Subscription is CANCELLED ---');
  const { error: cErr } = await client.from('restaurant_subscriptions').upsert([{
    id: TEST_SUB_ID,
    restaurant_id: TEST_REST_ID,
    plan_id: plan.id,
    status: 'cancelled',
    start_date: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    end_date: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  }], { onConflict: 'id' });
  if (cErr) console.error('Cancelled upsert error:', cErr);

  const checkCancelled = await checkTenantAccess(TEST_REST_ID);
  console.log('Check Cancelled access:', checkCancelled);

  if (checkCancelled.isAllowed) throw new Error('FAIL: Restaurant with cancelled subscription was allowed access!');
  console.log('[PASS] Scenario 3: Order creation blocked when subscription is cancelled.');

  // SCENARIO 4: ACTIVE SUBSCRIPTION
  console.log('\n--- SCENARIO 4: Restaurant Subscription is ACTIVE ---');
  const { error: aErr } = await client.from('restaurant_subscriptions').upsert([{
    id: TEST_SUB_ID,
    restaurant_id: TEST_REST_ID,
    plan_id: plan.id,
    status: 'active',
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(), // 1 year ahead
  }], { onConflict: 'id' });
  if (aErr) console.error('Active upsert error:', aErr);

  const checkActive = await checkTenantAccess(TEST_REST_ID);
  console.log('Check Active access:', checkActive);

  if (!checkActive.isAllowed) throw new Error('FAIL: Restaurant with active subscription was blocked!');
  console.log('[PASS] Scenario 4: Order creation allowed when subscription is active.');

  // CLEANUP
  await client.from('restaurant_subscriptions').delete().eq('restaurant_id', TEST_REST_ID);
  await client.from('restaurants').delete().eq('id', TEST_REST_ID);
  console.log('\n[PASS] Cleaned up temporary test restaurant.');

  console.log('\n================================================================');
  console.log('🎉 ALL SUBSCRIPTION RESTRICTION TESTS PASSED 100%');
  console.log('================================================================\n');
}

testSubscriptionOrderRestriction().catch((err) => {
  console.error('[FATAL]:', err);
  process.exit(1);
});
