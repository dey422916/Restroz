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

async function main() {
  console.log('--- Checking Users in Supabase Auth & Profiles ---');
  
  // 1. List auth users
  const { data: authUsers, error: authErr } = await adminClient.auth.admin.listUsers();
  if (authErr) {
    console.error('Error listing auth users:', authErr);
    return;
  }
  
  console.log(`Found ${authUsers.users.length} auth users:`);
  for (const u of authUsers.users) {
    console.log(`- ID: ${u.id}, Email: ${u.email}, Email Confirmed: ${u.email_confirmed_at ? 'YES' : 'NO'}`);
  }

  // 2. List profiles
  const { data: profiles, error: profErr } = await adminClient.from('profiles').select('*');
  if (profErr) {
    console.error('Error listing profiles:', profErr);
  } else {
    console.log(`\nFound ${profiles.length} profiles:`);
    for (const p of profiles) {
      console.log(`- ID: ${p.id}, Email: ${p.email}, Role: ${p.role}, RestaurantId: ${p.restaurant_id}`);
    }
  }

  // 3. Test sign in for ratnadeepdey13@gmail.com
  console.log('\n--- Testing Sign In with Ratnadeep1@ ---');
  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });
  if (signInErr) {
    console.log('Sign in error:', signInErr.message, signInErr.status);
  } else {
    console.log('Sign in SUCCESS! User ID:', signInData.user.id);
  }
}

main().catch(console.error);
