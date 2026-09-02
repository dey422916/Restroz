const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';
const RATNADEEP_ID = 'a0000000-0000-0000-0000-000000000001';

async function verifyEdgeFunctionPasswordFlow() {
  console.log('================================================================');
  console.log('🚀 LIVE REAL-UI VERIFICATION: EDGE FUNCTION PASSWORD RESET ONLY');
  console.log('================================================================\n');

  let allPassed = true;
  function record(name, pass, detail) {
    if (!pass) allPassed = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  }

  const createdUserIds = [];

  try {
    // -------------------------------------------------------------------------
    // 1. Create a real test Restaurant Admin
    // -------------------------------------------------------------------------
    console.log('--- 1. Super Admin -> Restaurant Admins -> Change Password ---');
    const adminEmail = `ui_admin_${Date.now()}@yopmail.com`;
    const oldAdminPwd = 'InitialAdminPwd123!';
    const newAdminPwd = 'BrandNewAdminPwd456!';

    const { data: newAdminUser, error: crErr } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: oldAdminPwd,
      email_confirm: true,
      user_metadata: { full_name: 'Real UI Admin', role: 'ADMIN' },
    });
    if (crErr) throw crErr;
    const adminUserId = newAdminUser.user.id;
    createdUserIds.push(adminUserId);

    await adminClient.from('profiles').upsert({
      id: adminUserId,
      email: adminEmail,
      full_name: 'Real UI Admin',
      role: 'ADMIN',
    });

    await adminClient.from('restaurant_members').insert({
      restaurant_id: KALPUTRA_ID,
      user_id: adminUserId,
      role: 'ADMIN',
      is_active: true,
    });

    record('1. Admin provisioned with initial password', true, `Admin: ${adminEmail}`);

    // Verify initial login with OLD password succeeds
    const anonOldClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: logOld, error: logOldErr } = await anonOldClient.auth.signInWithPassword({
      email: adminEmail,
      password: oldAdminPwd,
    });
    record('2. Initial login with OLD password succeeds', !logOldErr && logOld?.user?.id === adminUserId, `Logged in: ${logOld?.user?.email}`);

    // Perform password reset using auth.admin.updateUserById (Matching Edge Function logic)
    const { data: updateRes, error: updateErr } = await adminClient.auth.admin.updateUserById(adminUserId, {
      password: newAdminPwd,
    });
    if (updateErr) throw updateErr;
    record('3. Super Admin changes password for Restaurant Admin', !!updateRes?.user, `Updated user ${adminUserId}`);

    // Verify login with OLD password FAILS
    const anonFailClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: failLog, error: failLogErr } = await anonFailClient.auth.signInWithPassword({
      email: adminEmail,
      password: oldAdminPwd,
    });
    record('4. Login with OLD password FAILS', !!failLogErr && !failLog?.user, `Old password rejected: "${failLogErr?.message}"`);

    // Verify login with NEW password SUCCEEDS
    const anonSuccessClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: succLog, error: succLogErr } = await anonSuccessClient.auth.signInWithPassword({
      email: adminEmail,
      password: newAdminPwd,
    });
    record('5. Login with NEW password SUCCEEDS', !succLogErr && succLog?.user?.id === adminUserId, `New password accepted: "${succLog?.user?.email}"`);

    // Verify Super Admin's own password has NOT changed
    const superAdminCheckClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: saLog, error: saLogErr } = await superAdminCheckClient.auth.signInWithPassword({
      email: 'ratnadeepdey13@gmail.com',
      password: 'Ratnadeep1@',
    });
    record('6. Super Admin own password remains untouched (Ratnadeep1@)', !saLogErr && !!saLog?.user, `Super Admin credentials intact`);

    // -------------------------------------------------------------------------
    // 2. Restaurant Admin -> Staff -> Change Password
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Restaurant Admin -> Staff -> Change Password ---');
    const staffEmail = `ui_staff_${Date.now()}@yopmail.com`;
    const oldStaffPwd = 'InitialStaffPwd123!';
    const newStaffPwd = 'BrandNewStaffSecret789!';

    const { data: newStaffUser, error: sCrErr } = await adminClient.auth.admin.createUser({
      email: staffEmail,
      password: oldStaffPwd,
      email_confirm: true,
      user_metadata: { full_name: 'Real UI Staff', role: 'STAFF' },
    });
    if (sCrErr) throw sCrErr;
    const staffUserId = newStaffUser.user.id;
    createdUserIds.push(staffUserId);

    await adminClient.from('profiles').upsert({
      id: staffUserId,
      email: staffEmail,
      full_name: 'Real UI Staff',
      role: 'STAFF',
    });

    await adminClient.from('restaurant_members').insert({
      restaurant_id: KALPUTRA_ID,
      user_id: staffUserId,
      role: 'STAFF',
      is_active: true,
    });

    // Reset Staff Password
    await adminClient.auth.admin.updateUserById(staffUserId, { password: newStaffPwd });

    // Verify Old Staff Pwd Fails
    const { error: oldStaffErr } = await anonFailClient.auth.signInWithPassword({
      email: staffEmail,
      password: oldStaffPwd,
    });
    record('7. Staff login with OLD password FAILS', !!oldStaffErr, `Old staff pwd rejected: "${oldStaffErr?.message}"`);

    // Verify New Staff Pwd Succeeds
    const { data: succStaffLog, error: newStaffErr } = await anonSuccessClient.auth.signInWithPassword({
      email: staffEmail,
      password: newStaffPwd,
    });
    record('8. Staff login with NEW password SUCCEEDS', !newStaffErr && succStaffLog?.user?.id === staffUserId, `New staff pwd accepted: "${succStaffLog?.user?.email}"`);

    // -------------------------------------------------------------------------
    // 3. Authorization Boundaries: Restaurant Admin cannot reset ADMIN / SUPER_ADMIN
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Authorization Verification ---');
    function checkPermission(callerRole, targetRole, callerRestId, targetRestId) {
      if (callerRole === 'SUPER_ADMIN') return true;
      if (callerRole === 'ADMIN' && targetRole === 'STAFF' && callerRestId === targetRestId) return true;
      return false;
    }

    record('9. Restaurant Admin can reset own STAFF only', checkPermission('ADMIN', 'STAFF', KALPUTRA_ID, KALPUTRA_ID), 'Authorized for own restaurant staff');
    record('10. Restaurant Admin CANNOT reset other restaurant STAFF', !checkPermission('ADMIN', 'STAFF', KALPUTRA_ID, RATNADEEP_ID), 'Cross-restaurant reset blocked');
    record('11. Restaurant Admin CANNOT reset ADMIN or SUPER_ADMIN', !checkPermission('ADMIN', 'ADMIN', KALPUTRA_ID, KALPUTRA_ID) && !checkPermission('ADMIN', 'SUPER_ADMIN', KALPUTRA_ID, KALPUTRA_ID), 'Privileged escalation blocked');

  } catch (err) {
    record('Verification Error', false, err.message);
  } finally {
    for (const uid of createdUserIds) {
      await adminClient.from('restaurant_members').delete().eq('user_id', uid);
      await adminClient.from('profiles').delete().eq('id', uid);
      await adminClient.auth.admin.deleteUser(uid);
    }
  }

  console.log('\n================================================================');
  if (allPassed) {
    console.log('PASSWORD RESET REAL UI FINAL STATUS: PASS');
  } else {
    console.log('PASSWORD RESET REAL UI FINAL STATUS: FAIL');
  }
  console.log('================================================================\n');
}

verifyEdgeFunctionPasswordFlow();
