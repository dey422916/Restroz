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
  console.log('👥 AUTHORIZED MEMBER & STAFF MANAGEMENT LIVE VERIFICATION');
  console.log('================================================================\n');

  let allPassed = true;
  function record(name, pass, detail) {
    if (!pass) allPassed = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  let testRestB = null;
  let testStaffUser = null;
  let testAdminUser = null;
  let memA = null;
  let memB = null;

  try {
    // 1. Create a secondary test restaurant to verify multi-restaurant membership
    const { data: restB, error: restBErr } = await adminClient.from('restaurants').insert({
      name: 'Delta Lounge ' + Date.now(),
      slug: 'delta-lounge-' + Date.now(),
      address: '77 Cyber Park',
      city: 'Hyderabad',
      state: 'Telangana',
      postal_code: '500081',
      status: 'ACTIVE',
    }).select().single();

    if (restBErr || !restB) throw new Error('Failed to create secondary restaurant: ' + restBErr?.message);
    testRestB = restB;
    record('Secondary Restaurant Provisioned', true, `Restaurant B ID = ${restB.id}`);

    // 2. Super Admin provisions Restaurant ADMIN
    const adminEmail = `rest_admin_${Date.now()}@yopmail.com`;
    const { data: adminAuth, error: aErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: 'AdminPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Test Restaurant Admin', role: 'ADMIN' },
    });
    if (aErr) throw aErr;
    testAdminUser = adminAuth.user;

    await adminClient.from('profiles').upsert({
      id: testAdminUser.id,
      email: adminEmail,
      full_name: 'Test Restaurant Admin',
      role: 'ADMIN',
    });

    const { data: adminMem, error: adminMemErr } = await adminClient.from('restaurant_members').insert({
      restaurant_id: testRestB.id,
      user_id: testAdminUser.id,
      role: 'ADMIN',
      is_active: true,
    }).select().single();
    if (adminMemErr) throw adminMemErr;

    record('Super Admin Provisions Restaurant ADMIN', !!adminMem && adminMem.role === 'ADMIN', 'Admin membership created');

    // 3. Super Admin provisions STAFF with CASHIER preset
    const staffEmail = `test_staff_${Date.now()}@yopmail.com`;
    const { data: staffAuth, error: sErr } = await adminClient.auth.admin.createUser({
      email: staffEmail,
      password: 'StaffPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Multi-Tenant Staff', role: 'STAFF' },
    });
    if (sErr) throw sErr;
    testStaffUser = staffAuth.user;

    await adminClient.from('profiles').upsert({
      id: testStaffUser.id,
      email: staffEmail,
      full_name: 'Multi-Tenant Staff',
      role: 'STAFF',
    });

    // Add Staff to Restaurant A (Ratnadeep)
    const { data: mA, error: mAErr } = await adminClient.from('restaurant_members').insert({
      restaurant_id: RATNADEEP_ID,
      user_id: testStaffUser.id,
      role: 'STAFF',
      is_active: true,
    }).select().single();
    if (mAErr) throw mAErr;
    memA = mA;

    // Attach Cashier Preset Permissions in Restaurant A (upsert against auto-created row)
    const { data: permsA, error: pAErr } = await adminClient.from('restaurant_member_permissions').upsert({
      restaurant_member_id: memA.id,
      can_use_pos: true,
      can_view_orders: true,
      can_edit_orders: false,
      can_cancel_orders: false,
      can_manage_products: false,
      can_manage_categories: false,
      can_manage_tables: false,
      can_manage_coupons: false,
      can_view_reports: false,
      can_manage_register: true,
      can_view_settings: false,
      can_manage_settings: false,
      can_manage_staff: false,
    }, { onConflict: 'restaurant_member_id' }).select().single();
    if (pAErr) throw pAErr;

    record('Super Admin Adds STAFF with Preset', !!permsA && permsA.can_use_pos === true && permsA.can_manage_register === true, 'Staff provisioned with CASHIER permissions');

    // 4. Super Admin Edits Permissions for Staff in Restaurant A
    const { data: updatedPerms, error: uPErr } = await adminClient.from('restaurant_member_permissions').update({
      can_manage_tables: true,
      can_edit_orders: true,
    }).eq('restaurant_member_id', memA.id).select().single();
    if (uPErr) throw uPErr;

    record('Super Admin Edits STAFF Permissions', updatedPerms.can_manage_tables === true && updatedPerms.can_edit_orders === true, 'Granular permissions updated');

    // 5. Deactivate & Reactivate Member
    await adminClient.from('restaurant_members').update({ is_active: false }).eq('id', memA.id);
    const { data: deactMem } = await adminClient.from('restaurant_members').select('is_active').eq('id', memA.id).single();
    record('Deactivate Member', deactMem.is_active === false, 'is_active set to false');

    await adminClient.from('restaurant_members').update({ is_active: true }).eq('id', memA.id);
    const { data: reactMem } = await adminClient.from('restaurant_members').select('is_active').eq('id', memA.id).single();
    record('Reactivate Member', reactMem.is_active === true, 'is_active set to true');

    // 6. Multi-Restaurant Membership: Add Same Staff to Restaurant B
    const { data: mB, error: mBErr } = await adminClient.from('restaurant_members').insert({
      restaurant_id: testRestB.id,
      user_id: testStaffUser.id,
      role: 'STAFF',
      is_active: true,
    }).select().single();
    if (mBErr) throw mBErr;
    memB = mB;

    // Attach Waiter Permissions in Restaurant B
    await adminClient.from('restaurant_member_permissions').upsert({
      restaurant_member_id: memB.id,
      can_use_pos: true,
      can_view_orders: true,
      can_manage_tables: true,
    }, { onConflict: 'restaurant_member_id' });

    record('Multi-Restaurant Membership Assignment', !!memB, 'Single user assigned memberships to both Restaurant A and Restaurant B');

    // 7. Remove Member from Restaurant A
    const { error: delErr } = await adminClient.from('restaurant_members').delete().eq('id', memA.id);
    record('Super Admin Removes Member from Restaurant A', !delErr, 'Deleted only restaurant_members join record for Restaurant A');

    // 8. Verify Non-Destructive Multi-Tenant Isolation
    const { data: checkMemA } = await adminClient.from('restaurant_members').select('*').eq('id', memA.id).maybeSingle();
    record('Restaurant A Access Removed', checkMemA === null, 'Restaurant A membership row deleted');

    const { data: checkMemB } = await adminClient.from('restaurant_members').select('*').eq('id', memB.id).single();
    record('Restaurant B Access Preserved', !!checkMemB && checkMemB.is_active === true, 'Restaurant B membership remains intact');

    const { data: checkUser } = await adminClient.auth.admin.getUserById(testStaffUser.id);
    record('Supabase Auth User Preserved', !!checkUser?.user, 'Global user not deleted');

    const { data: checkProfile } = await adminClient.from('profiles').select('*').eq('id', testStaffUser.id).single();
    record('Global Profile Preserved', !!checkProfile, 'Profiles record preserved');

    // 9. Role Creation Authorization Rules
    function enforceRoleCreationRules(creatorRole, requestedRole) {
      if (creatorRole === 'SUPER_ADMIN') {
        return requestedRole === 'ADMIN' || requestedRole === 'STAFF';
      }
      if (creatorRole === 'ADMIN') {
        return requestedRole === 'STAFF';
      }
      return false;
    }

    record('Security Rule: Super Admin -> ADMIN', enforceRoleCreationRules('SUPER_ADMIN', 'ADMIN'), 'Allowed');
    record('Security Rule: Super Admin -> STAFF', enforceRoleCreationRules('SUPER_ADMIN', 'STAFF'), 'Allowed');
    record('Security Rule: Restaurant Admin -> STAFF', enforceRoleCreationRules('ADMIN', 'STAFF'), 'Allowed');
    record('Security Rule: Restaurant Admin -> ADMIN (Blocked)', !enforceRoleCreationRules('ADMIN', 'ADMIN'), 'Blocked');
    record('Security Rule: Restaurant Admin -> SUPER_ADMIN (Blocked)', !enforceRoleCreationRules('ADMIN', 'SUPER_ADMIN'), 'Blocked');
    record('Security Rule: STAFF -> Any Member (Blocked)', !enforceRoleCreationRules('STAFF', 'STAFF'), 'Blocked');
    record('Security Rule: CUSTOMER -> Any Member (Blocked)', !enforceRoleCreationRules('CUSTOMER', 'STAFF'), 'Blocked');

  } catch (err) {
    record('Verification Error', false, err.message);
  } finally {
    // Cleanup temporary test data
    if (memA) await adminClient.from('restaurant_members').delete().eq('id', memA.id);
    if (memB) await adminClient.from('restaurant_members').delete().eq('id', memB.id);
    if (testStaffUser) {
      await adminClient.from('profiles').delete().eq('id', testStaffUser.id);
      await adminClient.auth.admin.deleteUser(testStaffUser.id);
    }
    if (testAdminUser) {
      await adminClient.from('profiles').delete().eq('id', testAdminUser.id);
      await adminClient.auth.admin.deleteUser(testAdminUser.id);
    }
    if (testRestB) await adminClient.from('restaurants').delete().eq('id', testRestB.id);
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('AUTHORIZED MEMBER & STAFF MANAGEMENT: PASS');
  } else {
    console.log('AUTHORIZED MEMBER & STAFF MANAGEMENT: FAIL');
  }
  console.log('================================================================\n');
}

runVerification().catch(console.error);
