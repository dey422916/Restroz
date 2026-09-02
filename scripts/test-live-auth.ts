import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jdfoxuewvkhvlyejzldm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZm94dWV3dmtodmx5ZWp6bGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwNDkxNTAsImV4cCI6MjA1NTYyNTE1MH0.2WqgQ_T9rU0t-z1kY8zZcMfZ4e5i_7x1O-y5V9x9w4Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CONTROLLED_USERS = [
  {
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
    expectedRole: 'ADMIN',
    fullName: 'Ratnadeep Dey (Admin)',
  },
  {
    email: 'raj@yopmail.com',
    password: 'Qwerty2@',
    expectedRole: 'CUSTOMER',
    fullName: 'Raj Customer',
  },
  {
    email: 'souvik@yopmail.com',
    password: 'Qwerty3@',
    expectedRole: 'STAFF',
    fullName: 'Souvik Staff',
  },
];

async function runLiveAuthTests() {
  console.log('================================================================');
  console.log('   RATNADEEP POS — LIVE SUPABASE AUTHENTICATION SUITE');
  console.log(`   Target Supabase URL: ${SUPABASE_URL}`);
  console.log('================================================================\n');

  // --- ENSURE CONTROLLED USERS EXIST IN SUPABASE ---
  console.log('--- 1. ENSURING CONTROLLED TEST ACCOUNTS EXIST IN SUPABASE ---');
  for (const u of CONTROLLED_USERS) {
    console.log(`\nChecking / Registering: ${u.email}...`);
    const { data: signInCheck, error: signInErr } = await supabase.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });

    if (signInCheck?.user) {
      console.log(`  ✓ User already exists in Supabase Auth (ID: ${signInCheck.user.id})`);
      // Ensure profile row exists
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', signInCheck.user.id).single();
      if (!profile) {
        await supabase.from('profiles').upsert({
          id: signInCheck.user.id,
          email: u.email,
          full_name: u.fullName,
          role: u.expectedRole,
        });
        console.log(`  ✓ Synced profile row: role = ${u.expectedRole}`);
      } else {
        console.log(`  ✓ Profile row confirmed: role = ${profile.role}`);
      }
      await supabase.auth.signOut();
    } else {
      console.log(`  Account not found with credentials (${signInErr?.message}). Registering via signUp...`);
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: u.email,
        password: u.password,
        options: {
          data: { full_name: u.fullName, role: u.expectedRole },
        },
      });
      if (signUpErr) {
        console.log(`  Registration response: ${signUpErr.message}`);
      } else if (signUpData.user) {
        console.log(`  ✓ Registered Supabase Auth User ID: ${signUpData.user.id}`);
        await supabase.from('profiles').upsert({
          id: signUpData.user.id,
          email: u.email,
          full_name: u.fullName,
          role: u.expectedRole,
        });
        console.log(`  ✓ Created profile row: role = ${u.expectedRole}`);
      }
    }
  }

  // --- NEGATIVE TESTS ---
  console.log('\n--- 2. NEGATIVE AUTHENTICATION TESTS (MUST ALL FAIL) ---');

  // Test N1: Empty credentials
  console.log('\n[TEST N1] Empty credentials (email: "", password: ""):');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: '', password: '' });
    if (error || !data.user) {
      console.log(`  🎯 RESULT: FAILED AS EXPECTED -> Error: "${error?.message || 'Empty credentials rejected'}"`);
    } else {
      console.log(`  ❌ CRITICAL FAILURE: Empty credentials logged in!`);
    }
  } catch (e: any) {
    console.log(`  🎯 RESULT: REJECTED AS EXPECTED -> ${e.message}`);
  }

  // Test N2: Random non-existent email + random password
  const randomEmail = `nonexistent_${Date.now()}@fakedomain123.com`;
  const randomPass = 'RandomWrongPass999!';
  console.log(`\n[TEST N2] Random arbitrary credentials (${randomEmail} / ${randomPass}):`);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: randomEmail, password: randomPass });
    if (error || !data.user) {
      console.log(`  🎯 RESULT: FAILED AS EXPECTED -> Error: "${error?.message}"`);
    } else {
      console.log(`  ❌ CRITICAL FAILURE: Random credentials logged in!`);
    }
  } catch (e: any) {
    console.log(`  🎯 RESULT: REJECTED AS EXPECTED -> ${e.message}`);
  }

  // Test N3: Existing email + wrong password
  console.log(`\n[TEST N3] Existing email with WRONG password (ratnadeepdey13@gmail.com / WrongPassword123):`);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: 'ratnadeepdey13@gmail.com', password: 'WrongPassword123' });
    if (error || !data.user) {
      console.log(`  🎯 RESULT: FAILED AS EXPECTED -> Error: "${error?.message}"`);
    } else {
      console.log(`  ❌ CRITICAL FAILURE: Wrong password logged in!`);
    }
  } catch (e: any) {
    console.log(`  🎯 RESULT: REJECTED AS EXPECTED -> ${e.message}`);
  }

  // --- POSITIVE TESTS ---
  console.log('\n--- 3. POSITIVE AUTHENTICATION TESTS (MUST SUCCEED & MATCH ROLES) ---');

  for (const u of CONTROLLED_USERS) {
    console.log(`\n[TEST POSITIVE] Signing in: ${u.email} / ${u.password}...`);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });

    if (error || !data.user) {
      console.log(`  ❌ FAILED to sign in: ${error?.message}`);
    } else {
      console.log(`  ✓ Auth Success! User ID: ${data.user.id}`);

      // Query database profile
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profile) {
        const matchesRole = profile.role === u.expectedRole;
        console.log(`  ✓ Database Profile Role: "${profile.role}" (Expected: "${u.expectedRole}") -> ${matchesRole ? '🎯 MATCHES' : '❌ MISMATCH'}`);
      } else {
        console.log(`  ⚠️ Profile query: ${profileErr?.message || 'No profile row'}`);
      }

      await supabase.auth.signOut();
    }
  }

  console.log('\n================================================================');
  console.log('   LIVE AUTHENTICATION TEST RUN FINISHED');
  console.log('================================================================\n');
}

runLiveAuthTests().catch(console.error);
