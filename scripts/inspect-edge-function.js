const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkEdgeFunction() {
  console.log('--- Inspecting Edge Function admin-reset-password ---');

  // 1. Sign in as super admin
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });

  if (loginErr) {
    console.error('Super admin login failed:', loginErr);
    return;
  }

  const token = loginData.session.access_token;
  console.log('Super admin logged in:', loginData.user.id);

  // 2. Invoke Edge Function directly via fetch to see full HTTP response
  const url = `${SUPABASE_URL}/functions/v1/admin-reset-password`;
  console.log('Invoking URL:', url);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify({
        targetUserId: '53d94175-9a27-4cd9-a240-ebf1e7b44bee',
        newPassword: 'NewPassword123!',
      }),
    });

    const status = res.status;
    const text = await res.text();
    console.log('HTTP Status:', status);
    console.log('Response Body:', text);
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

checkEdgeFunction();
