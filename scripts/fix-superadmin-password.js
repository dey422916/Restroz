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
  console.log('--- Setting Super Admin Password ---');
  const userId = '521ab3be-bd64-4939-8e72-118421ea1734';
  const email = 'ratnadeepdey13@gmail.com';
  const newPassword = 'Ratnadeep1@';

  // Update password in Supabase Auth
  const { data: updateData, error: updateErr } = await adminClient.auth.admin.updateUserById(userId, {
    password: newPassword,
    email_confirm: true,
    user_metadata: { role: 'SUPER_ADMIN', full_name: 'Ratnadeep Dey' },
  });

  if (updateErr) {
    console.error('Failed to update user password:', updateErr);
    return;
  }
  console.log('✅ Supabase Auth user password updated successfully for:', updateData.user.email);

  // Ensure profile role is SUPER_ADMIN
  const { data: profData, error: profErr } = await adminClient
    .from('profiles')
    .update({ role: 'SUPER_ADMIN', full_name: 'Ratnadeep Dey' })
    .eq('id', userId)
    .select();

  if (profErr) {
    console.error('Failed to update profile:', profErr);
  } else {
    console.log('✅ Profile updated:', profData);
  }

  // Test sign in
  console.log('\n--- Verifying Sign In with updated credentials ---');
  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password: newPassword,
  });

  if (signInErr) {
    console.error('❌ Sign in failed:', signInErr.message);
  } else {
    console.log('🎉 Sign in SUCCESSFUL!');
    console.log('User ID:', signInData.user.id);
    console.log('Email:', signInData.user.email);
    console.log('Session access token exists:', !!signInData.session?.access_token);
  }
}

main().catch(console.error);
