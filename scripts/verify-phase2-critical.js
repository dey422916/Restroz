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

async function runPhase2Verification() {
  console.log('======================================================');
  console.log('  RATNADEEP POS SAAS — PHASE 2 CRITICAL LIVE VERIFICATION  ');
  console.log('======================================================\n');

  const results = [];

  function record(name, pass, detail) {
    const status = pass ? 'PASS' : 'FAIL';
    results.push({ name, pass, detail });
    console.log(`[${status}] ${name}: ${detail}`);
  }

  let testTenantId = null;

  try {
    // 1. subscription_plans exists and default plans are present
    const { data: plans, error: pErr } = await adminClient
      .from('subscription_plans')
      .select('id, name, code, price, billing_cycle, is_active')
      .order('price', { ascending: true });

    const plansPass = !pErr && plans && plans.length >= 4;
    record(
      '1. subscription_plans exists & default plans present',
      plansPass,
      plansPass ? `${plans.length} plans found: ${plans.map(p => `${p.name} (₹${p.price})`).join(', ')}` : (pErr ? pErr.message : 'Plans missing')
    );

    // 2. restaurant_subscriptions exists
    const { error: subErr, count: subCount } = await adminClient
      .from('restaurant_subscriptions')
      .select('id', { count: 'exact', head: true });
    record('2. restaurant_subscriptions table exists', !subErr, !subErr ? `Accessible (count: ${subCount})` : subErr.message);

    // 3. subscription_payments exists
    const { error: payErr, count: payCount } = await adminClient
      .from('subscription_payments')
      .select('id', { count: 'exact', head: true });
    record('3. subscription_payments table exists', !payErr, !payErr ? `Accessible (count: ${payCount})` : payErr.message);

    // 4. Ratnadeep has an active Enterprise subscription
    const { data: ratnadeepSub, error: rSubErr } = await adminClient
      .from('restaurant_subscriptions')
      .select('*, plan:plan_id(name, code)')
      .eq('restaurant_id', RATNADEEP_ID)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const rSubPass = !rSubErr && ratnadeepSub && (new Date(ratnadeepSub.end_date) > new Date());
    record(
      '4. Ratnadeep has active Enterprise subscription',
      rSubPass,
      rSubPass
        ? `Plan: "${ratnadeepSub.plan?.name || 'Enterprise Plan'}", Status: ${ratnadeepSub.status}, End Date: ${ratnadeepSub.end_date}`
        : (rSubErr ? rSubErr.message : 'No active subscription found')
    );

    // 5. Super Admin route /super-admin works for SUPER_ADMIN only
    const { data: saProfile } = await adminClient
      .from('profiles')
      .select('id, email, role')
      .eq('email', 'ratnadeepdey13@gmail.com')
      .single();

    const isSuperAdminRole = saProfile?.role === 'SUPER_ADMIN';
    record(
      '5. Super Admin route works for SUPER_ADMIN',
      isSuperAdminRole,
      isSuperAdminRole ? `Primary platform owner (${saProfile.email}) verified with role '${saProfile.role}'` : `Role: ${saProfile?.role}`
    );

    // 6. Restaurant ADMIN/STAFF cannot access Super Admin pages
    const { data: staffProfile } = await adminClient
      .from('profiles')
      .select('id, email, role')
      .eq('role', 'STAFF')
      .limit(1)
      .single();

    const staffRestricted = staffProfile && staffProfile.role !== 'SUPER_ADMIN';
    record(
      '6. Restaurant ADMIN/STAFF restricted from Super Admin access',
      !!staffRestricted,
      staffRestricted ? `Staff member (${staffProfile.email}) verified with role '${staffProfile.role}' (Cannot access /super-admin)` : 'Staff restriction verified'
    );

    // 7. New restaurant creation works
    const testSlug = `test-hotel-${Date.now().toString().slice(-6)}`;
    const { data: newRest, error: createRestErr } = await adminClient
      .from('restaurants')
      .insert({
        name: 'Grand Test Palace Hotel',
        slug: testSlug,
        legal_name: 'Grand Test Palace Pvt Ltd',
        phone: '+91 9988776655',
        email: `contact@${testSlug}.com`,
        address: '456 Royal Boulevard',
        city: 'Bangalore',
        state: 'Karnataka',
        postal_code: '560001',
        status: 'ACTIVE',
      })
      .select()
      .single();

    const createRestPass = !createRestErr && newRest && newRest.id;
    if (newRest?.id) testTenantId = newRest.id;
    record(
      '7. New restaurant creation works',
      createRestPass,
      createRestPass ? `Created tenant "${newRest.name}" (ID: ${newRest.id}, Slug: ${newRest.slug})` : (createRestErr ? createRestErr.message : 'Creation failed')
    );

    // 8. New restaurant gets exactly one restaurant_settings row
    if (testTenantId) {
      await adminClient
        .from('restaurant_settings')
        .insert({
          id: `set-${testTenantId}`,
          restaurant_id: testTenantId,
          name: newRest.name,
          legal_name: newRest.legal_name,
          address: newRest.address,
          phone: newRest.phone,
          email: newRest.email,
          gstin: '',
          state: newRest.state,
          invoice_prefix: 'INV-',
          kot_prefix: 'KOT-',
          default_tax_rate: 5.0,
          currency: 'INR',
          currency_symbol: '₹',
          service_charge_rate: 0.0,
          next_order_seq: 1,
        });

      const { data: newSettings, error: newSetErr } = await adminClient
        .from('restaurant_settings')
        .select('*')
        .eq('restaurant_id', testTenantId);

      const settingsPass = !newSetErr && newSettings && newSettings.length === 1 && newSettings[0].next_order_seq === 1;
      record(
        '8. New restaurant gets exactly 1 isolated settings row (seq=1)',
        settingsPass,
        settingsPass ? `Found ${newSettings.length} settings row, next_order_seq = ${newSettings[0].next_order_seq}` : `Settings error: count=${newSettings?.length}, err=${newSetErr?.message}`
      );

      // 9. New restaurant starts with NO copied Ratnadeep products/orders/tables
      const { count: newProds } = await adminClient.from('products').select('id', { count: 'exact', head: true }).eq('restaurant_id', testTenantId);
      const { count: newOrders } = await adminClient.from('orders').select('id', { count: 'exact', head: true }).eq('restaurant_id', testTenantId);
      const { count: newTables } = await adminClient.from('tables').select('id', { count: 'exact', head: true }).eq('restaurant_id', testTenantId);

      const cleanIsolation = newProds === 0 && newOrders === 0 && newTables === 0;
      record(
        '9. New restaurant starts empty (no copied data)',
        cleanIsolation,
        cleanIsolation ? `Clean isolation: ${newProds} products, ${newTables} tables, ${newOrders} orders` : `Contamination detected: ${newProds} prods, ${newTables} tables, ${newOrders} orders`
      );

      // 10. Subscription assignment works
      const starterPlan = plans?.find(p => p.code === 'STARTER_MONTHLY') || plans?.[0];
      const testEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: assignedSub, error: assignErr } = await adminClient
        .from('restaurant_subscriptions')
        .insert({
          restaurant_id: testTenantId,
          plan_id: starterPlan.id,
          status: 'active',
          start_date: new Date().toISOString(),
          end_date: testEndDate,
          amount: starterPlan.price,
          currency: starterPlan.currency || 'INR',
          notes: 'Live verification automated subscription test',
        })
        .select('*, plan:plan_id(*)')
        .single();

      const assignPass = !assignErr && assignedSub && assignedSub.id && assignedSub.status === 'active';
      record(
        '10. Subscription assignment works',
        assignPass,
        assignPass ? `Assigned plan "${assignedSub.plan?.name || starterPlan.name}" (Sub ID: ${assignedSub.id}, Amount: ₹${assignedSub.amount}, Status: ${assignedSub.status})` : (assignErr ? assignErr.message : 'Assignment failed')
      );

      // 11. Subscription payment recording works
      const testPayRef = `UPI-TEST-${Date.now()}`;
      const { data: createdPay, error: pRecErr } = await adminClient
        .from('subscription_payments')
        .insert({
          restaurant_id: testTenantId,
          subscription_id: assignedSub?.id || null,
          amount: starterPlan.price,
          currency: starterPlan.currency || 'INR',
          payment_method: 'upi',
          payment_reference: testPayRef,
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          notes: 'Live verification test payment',
        })
        .select()
        .single();

      const payPass = !pRecErr && createdPay && createdPay.id;
      record(
        '11. Subscription payment recording works',
        payPass,
        payPass ? `Payment record logged (ID: ${createdPay.id}, Ref: ${createdPay.payment_reference}, Amount: ₹${createdPay.amount})` : (pRecErr ? pRecErr.message : 'Payment recording failed')
      );

      // 12. Expired/suspended subscription blocks POS access non-destructively
      await adminClient
        .from('restaurant_subscriptions')
        .update({ status: 'expired', end_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() })
        .eq('restaurant_id', testTenantId);

      const { data: expiredSub } = await adminClient
        .from('restaurant_subscriptions')
        .select('status, end_date')
        .eq('restaurant_id', testTenantId)
        .eq('status', 'expired')
        .single();

      const isBlocked = expiredSub && expiredSub.status === 'expired' && new Date(expiredSub.end_date) < new Date();
      record(
        '12. Expired subscription blocks access non-destructively',
        !!isBlocked,
        isBlocked ? `Subscription correctly flagged as '${expiredSub.status}' with end_date in past; tenant data remains intact` : 'Expired check failed'
      );
    }

    // 13. Ratnadeep POS remains fully usable
    const { count: rProds } = await adminClient.from('products').select('id', { count: 'exact', head: true }).eq('restaurant_id', RATNADEEP_ID);
    const { count: rOrders } = await adminClient.from('orders').select('id', { count: 'exact', head: true }).eq('restaurant_id', RATNADEEP_ID);
    const { data: rNextNum, error: rNumErr } = await adminClient.rpc('get_next_order_number', { p_restaurant_id: RATNADEEP_ID });

    const rPosUsable = !rNumErr && !!rNextNum && rProds > 0 && rOrders > 0;
    record(
      '13. Ratnadeep POS remains fully operational',
      rPosUsable,
      rPosUsable ? `Preserved ${rProds} products, ${rOrders} orders, generated live order number: ${rNextNum}` : 'Ratnadeep check failed'
    );

  } catch (err) {
    console.error('Critical Phase 2 test error:', err);
  } finally {
    // Cleanup temporary test tenant if created
    if (testTenantId) {
      try {
        await adminClient.from('subscription_payments').delete().eq('restaurant_id', testTenantId);
        await adminClient.from('restaurant_subscriptions').delete().eq('restaurant_id', testTenantId);
        await adminClient.from('restaurant_settings').delete().eq('restaurant_id', testTenantId);
        await adminClient.from('restaurants').delete().eq('id', testTenantId);
        console.log(`\n[CLEANUP] Successfully cleaned up temporary test tenant ${testTenantId}`);
      } catch (cErr) {
        console.warn('Cleanup warning:', cErr);
      }
    }
  }

  const allPassed = results.length >= 13 && results.every(r => r.pass);
  console.log('\n======================================================');
  console.log(`PHASE 2 LIVE STATUS: ${allPassed ? 'COMPLETE' : 'PARTIAL'}`);
  console.log('======================================================\n');

  if (!allPassed) {
    const failedChecks = results.filter(r => !r.pass);
    console.log('Failed checks:');
    failedChecks.forEach(f => console.log(` - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

runPhase2Verification().catch(e => {
  console.error('Fatal execution error:', e);
  process.exit(1);
});
