const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function testBipinLogin() {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({
    email: 'bipin@yopmail.com',
    password: 'Password123!',
  });

  if (error) {
    console.error('Sign in error:', error);
    return;
  }

  const { data: profile } = await client.from('profiles').select('*').eq('id', data.user.id).single();
  const { data: memberships } = await client.from('restaurant_members').select('*').eq('user_id', data.user.id);

  console.log('✅ Sign in successful!');
  console.log('User Role in Profile:', profile.role);
  console.log('Restaurant Memberships:', memberships);

  const effectiveRole = profile.role === 'ADMIN' || memberships.some(m => m.role === 'ADMIN') ? 'ADMIN' : profile.role;
  console.log('Effective Role:', effectiveRole);
  console.log('Target Route:', effectiveRole === 'ADMIN' ? '/(admin)/pos' : '/(marketplace)');
}

testBipinLogin();
