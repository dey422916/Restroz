const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function testSignOut() {
  console.log('================================================================');
  console.log('🚀 LIVE VERIFICATION: AUTH SIGN OUT FLOW & SESSION CLEAR');
  console.log('================================================================\n');

  try {
    const client = createClient(SUPABASE_URL, ANON_KEY);

    // 1. Sign in as Admin
    const { data: signinData, error: inErr } = await client.auth.signInWithPassword({
      email: 'kalputra@yopmail.com',
      password: 'Password123!',
    });
    if (inErr) throw inErr;

    console.log(`[PASS] 1. Signed in as: ${signinData.user.email} (${signinData.user.id})`);

    // 2. Sign out
    const { error: outErr } = await client.auth.signOut();
    if (outErr) throw outErr;

    console.log(`[PASS] 2. Signed out cleanly.`);

    // 3. Verify session is null
    const { data: sessionData } = await client.auth.getSession();
    console.log(`[PASS] 3. Active session after sign out: ${sessionData.session === null ? 'NULL (Cleared)' : 'ACTIVE'}`);

    if (sessionData.session !== null) throw new Error('Session was not cleared!');

    console.log('\n================================================================');
    console.log('AUTH SIGN OUT: ALL TESTS PASSED 100%');
    console.log('================================================================\n');
  } catch (err) {
    console.error('[FAIL] Test Error:', err.message);
  }
}

testSignOut();
