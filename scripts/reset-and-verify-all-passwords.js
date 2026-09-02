const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function resetAndVerifyAccounts() {
  console.log('Resetting and verifying passwords...');

  const accounts = [
    { email: 'ratnadeepdey13@gmail.com', pass: 'Ratnadeep1@' },
    { email: 'kalputra@yopmail.com', pass: 'Password123!' },
    { email: 'bipin@yopmail.com', pass: 'Password123!' },
    { email: 'souvik@yopmail.com', pass: 'Password123!' },
    { email: 'raj@yopmail.com', pass: 'Password123!' },
    { email: 'customer_kalputra_test@yopmail.com', pass: 'Password123!' },
  ];

  const { data: userList, error: listErr } = await adminClient.auth.admin.listUsers();
  if (listErr) {
    console.error('List users error:', listErr);
    return;
  }

  for (const acc of accounts) {
    const user = userList.users.find(u => u.email === acc.email);
    if (!user) {
      console.log(`❌ User not found: ${acc.email}`);
      continue;
    }

    // Update password and confirm email
    const { error: updErr } = await adminClient.auth.admin.updateUserById(user.id, {
      password: acc.pass,
      email_confirm: true,
    });

    if (updErr) {
      console.log(`❌ Failed to update ${acc.email}:`, updErr.message);
      continue;
    }

    // Verify login with anon client
    const testClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: signInData, error: signInErr } = await testClient.auth.signInWithPassword({
      email: acc.email,
      password: acc.pass,
    });

    if (signInErr) {
      console.log(`❌ Sign in verification failed for ${acc.email}:`, signInErr.message);
    } else {
      console.log(`✅ Verified login: ${acc.email} with password: ${acc.pass}`);
    }
  }
}

resetAndVerifyAccounts();
