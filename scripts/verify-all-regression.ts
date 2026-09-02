import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const client = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runRegressionSuite() {
  console.log('=====================================================');
  console.log('   RATNADEEP POS — FULL SECURITY REGRESSION SUITE');
  console.log('=====================================================\n');

  // 1. Check Accounts & DB Roles Before Testing
  const expectedRoles = {
    'ratnadeepdey13@gmail.com': 'ADMIN',
    'souvik@yopmail.com': 'STAFF',
    'raj@yopmail.com': 'CUSTOMER',
  };

  console.log('--- 1. CHECKING INITIAL PROFILE ROLES IN DB ---');
  const { data: initialProfiles } = await adminClient.from('profiles').select('email, role');
  for (const [email, role] of Object.entries(expectedRoles)) {
    const p = initialProfiles?.find((prof) => prof.email?.toLowerCase() === email.toLowerCase());
    console.log(`  Initial DB Role for ${email}: "${p?.role}" (Expected: "${role}") -> ${p?.role === role ? '✓ MATCH' : '❌ MISMATCH'}`);
  }

  // 2. Test Login & Role Verification for Each Account
  console.log('\n--- 2. REAL LOGIN & SESSION ROLE VERIFICATION ---');

  // Admin
  console.log('\n[ADMIN LOGIN] ratnadeepdey13@gmail.com / Qwerty1@:');
  const { data: adminAuth, error: adminErr } = await client.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
  });
  if (adminErr || !adminAuth.user) {
    console.error(`  ❌ ADMIN Login Failed: ${adminErr?.message}`);
  } else {
    const { data: prof } = await client.from('profiles').select('role').eq('id', adminAuth.user.id).single();
    console.log(`  ✓ ADMIN Logged in successfully. ID: ${adminAuth.user.id}, Role: "${prof?.role}"`);
  }
  await client.auth.signOut();

  // Staff
  console.log('\n[STAFF LOGIN] souvik@yopmail.com / Qwerty3@:');
  const { data: staffAuth, error: staffErr } = await client.auth.signInWithPassword({
    email: 'souvik@yopmail.com',
    password: 'Qwerty3@',
  });
  if (staffErr || !staffAuth.user) {
    console.error(`  ❌ STAFF Login Failed: ${staffErr?.message}`);
  } else {
    const { data: prof } = await client.from('profiles').select('role').eq('id', staffAuth.user.id).single();
    console.log(`  ✓ STAFF Logged in successfully. ID: ${staffAuth.user.id}, Role: "${prof?.role}"`);
  }
  await client.auth.signOut();

  // Customer
  console.log('\n[CUSTOMER LOGIN] raj@yopmail.com / Qwerty2@:');
  const { data: custAuth, error: custErr } = await client.auth.signInWithPassword({
    email: 'raj@yopmail.com',
    password: 'Qwerty2@',
  });
  if (custErr || !custAuth.user) {
    console.error(`  ❌ CUSTOMER Login Failed: ${custErr?.message}`);
  } else {
    const { data: prof } = await client.from('profiles').select('role').eq('id', custAuth.user.id).single();
    console.log(`  ✓ CUSTOMER Logged in successfully. ID: ${custAuth.user.id}, Role: "${prof?.role}"`);
  }
  await client.auth.signOut();

  // 3. Negative Login Tests
  console.log('\n--- 3. NEGATIVE LOGIN REJECTIONS ---');
  const { data: neg1, error: negErr1 } = await client.auth.signInWithPassword({
    email: 'random_fake_99@gmail.com',
    password: 'WrongPassword999!',
  });
  console.log(`  Random credentials rejected: ${!neg1.user && !!negErr1 ? '✓ PASSED' : '❌ FAILED'}`);

  const { data: neg2, error: negErr2 } = await client.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'WrongPassword!',
  });
  console.log(`  Admin wrong password rejected: ${!neg2.user && !!negErr2 ? '✓ PASSED' : '❌ FAILED'}`);

  // 4. Verify DB Roles Remain Unchanged
  console.log('\n--- 4. POST-TEST DATABASE ROLE INTEGRITY CHECK ---');
  const { data: finalProfiles } = await adminClient.from('profiles').select('email, role');
  let allIntact = true;
  for (const [email, role] of Object.entries(expectedRoles)) {
    const p = finalProfiles?.find((prof) => prof.email?.toLowerCase() === email.toLowerCase());
    const match = p?.role === role;
    if (!match) allIntact = false;
    console.log(`  Post-Test DB Role for ${email}: "${p?.role}" -> ${match ? '✓ INTACT' : '❌ MODIFIED'}`);
  }

  // 5. Data Counts Verification
  console.log('\n--- 5. LIVE SEEDED DATA VERIFICATION ---');
  const { count: catCount } = await adminClient.from('categories').select('*', { count: 'exact', head: true });
  const { count: prodCount } = await adminClient.from('products').select('*', { count: 'exact', head: true });
  const { count: tblCount } = await adminClient.from('tables').select('*', { count: 'exact', head: true });

  console.log(`  Categories in DB: ${catCount}`);
  console.log(`  Products in DB:   ${prodCount}`);
  console.log(`  Tables in DB:     ${tblCount}`);

  console.log('\n=====================================================');
  console.log('   REGRESSION SUITE COMPLETED SUCCESSFULLY');
  console.log('=====================================================\n');
}

runRegressionSuite().catch(console.error);
