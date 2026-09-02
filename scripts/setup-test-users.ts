import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log('=====================================================');
console.log('   ENVIRONMENT LOADING DIAGNOSTICS');
console.log('=====================================================');
console.log('URL loaded:', !!process.env.EXPO_PUBLIC_SUPABASE_URL);
console.log('Anon key loaded:', !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
console.log('Service key loaded:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error('\n❌ ERROR: Required environment variables are missing from .env:');
  if (!supabaseUrl) console.error('  - EXPO_PUBLIC_SUPABASE_URL is missing');
  if (!anonKey) console.error('  - EXPO_PUBLIC_SUPABASE_ANON_KEY is missing');
  if (!serviceRoleKey) console.error('  - SUPABASE_SERVICE_ROLE_KEY is missing');
  console.error('\nAborting setup. Mock/offline fallbacks are disabled.');
  process.exit(1);
}

export const TEST_ACCOUNTS = [
  {
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
    role: 'ADMIN' as const,
    fullName: 'Ratnadeep Dey (Admin)',
    phone: '+91 99999 11111',
  },
  {
    email: 'raj@yopmail.com',
    password: 'Qwerty2@',
    role: 'CUSTOMER' as const,
    fullName: 'Raj Customer',
    phone: '+91 99999 33333',
  },
  {
    email: 'souvik@yopmail.com',
    password: 'Qwerty3@',
    role: 'STAFF' as const,
    fullName: 'Souvik Staff',
    phone: '+91 99999 22222',
  },
];

async function setupAndVerifyUsers() {
  console.log('\n=====================================================');
  console.log('   1. SERVER-SIDE SUPABASE ADMIN SETUP');
  console.log('=====================================================');

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. List existing users
  const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();
  if (listError) {
    console.error('❌ Failed to list users:', listError.message);
    process.exit(1);
  }

  const existingUsers = usersData?.users || [];
  console.log(`📋 Found ${existingUsers.length} existing users in Supabase Auth.`);

  // 2. Setup / Reset the 3 required accounts
  for (const account of TEST_ACCOUNTS) {
    console.log(`\n⚙️ Processing account: ${account.email} (${account.role})...`);
    const existing = existingUsers.find((u) => u.email?.toLowerCase() === account.email.toLowerCase());

    let userId: string;
    if (existing) {
      console.log(`  Updating existing user ID: ${existing.id}`);
      const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, {
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.fullName, phone: account.phone, role: account.role },
      });
      if (updateError) {
        console.error(`  ❌ Update failed: ${updateError.message}`);
        continue;
      }
      userId = updated.user.id;
      console.log(`  ✓ Password & email_confirm updated successfully.`);
    } else {
      console.log(`  Creating new user in Supabase Auth...`);
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.fullName, phone: account.phone, role: account.role },
      });
      if (createError) {
        console.error(`  ❌ Create failed: ${createError.message}`);
        continue;
      }
      userId = created.user.id;
      console.log(`  ✓ Created user with ID: ${userId}`);
    }

    // Upsert into public.profiles
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: userId,
      email: account.email,
      full_name: account.fullName,
      phone: account.phone,
      role: account.role,
    });

    if (profileError) {
      console.error(`  ❌ Profile sync failed: ${profileError.message}`);
    } else {
      console.log(`  ✓ Profile row synchronized: auth.users.id (${userId}) = public.profiles.id, role = ${account.role}`);
    }
  }

  // 3. Clean up obsolete demo/test users
  console.log('\n=====================================================');
  console.log('   2. CLEANING UP OBSOLETE DEMO ACCOUNTS');
  console.log('=====================================================');
  const allowedEmails = new Set(TEST_ACCOUNTS.map((a) => a.email.toLowerCase()));
  for (const user of existingUsers) {
    const userEmail = user.email?.toLowerCase() || '';
    const isObsoleteDemo =
      userEmail.includes('malicious_test_') ||
      userEmail.includes('demo_') ||
      userEmail.includes('hacker') ||
      userEmail === 'admin@ratnadeep.com' ||
      userEmail === 'staff@ratnadeep.com' ||
      userEmail === 'customer@ratnadeep.com';

    if (isObsoleteDemo && !allowedEmails.has(userEmail)) {
      console.log(`  🗑️ Removing obsolete demo user: ${userEmail} (${user.id})`);
      await adminClient.auth.admin.deleteUser(user.id);
    }
  }

  // 4. Real Login Tests via Public Client
  console.log('\n=====================================================');
  console.log('   3. REAL SUPABASE AUTHENTICATION TESTS');
  console.log('=====================================================');

  const client = createClient(supabaseUrl, anonKey);

  // Positive Tests
  console.log('\n--- POSITIVE TESTS (MUST SUCCEED) ---');
  for (const account of TEST_ACCOUNTS) {
    console.log(`Testing Login: ${account.email} / ${account.password}...`);
    const { data, error } = await client.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });

    if (error || !data.user) {
      console.error(`  ❌ FAILED: ${error?.message}`);
    } else {
      console.log(`  ✅ AUTH SUCCESS! User ID: ${data.user.id}`);
      const { data: profile, error: pErr } = await client
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profile) {
        const matches = profile.role === account.role;
        console.log(`  ✅ Profile Role in DB: "${profile.role}" (Expected: "${account.role}") -> ${matches ? 'MATCHES' : 'MISMATCH'}`);
      } else {
        console.error(`  ⚠️ Profile row error: ${pErr?.message}`);
      }
      await client.auth.signOut();
    }
  }

  // Negative Tests
  console.log('\n--- NEGATIVE TESTS (MUST FAIL) ---');
  const NEGATIVE_CASES = [
    { email: 'random@test.com', password: 'WrongPassword', desc: 'Random non-existent account' },
    { email: 'ratnadeepdey13@gmail.com', password: 'WrongPassword', desc: 'ADMIN with wrong password' },
    { email: 'raj@yopmail.com', password: 'WrongPassword', desc: 'CUSTOMER with wrong password' },
    { email: 'souvik@yopmail.com', password: 'WrongPassword', desc: 'STAFF with wrong password' },
  ];

  for (const neg of NEGATIVE_CASES) {
    console.log(`Testing: ${neg.desc} (${neg.email})...`);
    const { data, error } = await client.auth.signInWithPassword({
      email: neg.email,
      password: neg.password,
    });

    if (error || !data.user) {
      console.log(`  ✅ REJECTED AS EXPECTED -> "${error?.message || 'Access Denied'}"`);
    } else {
      console.error(`  ❌ CRITICAL BUG: Invalid credentials allowed!`);
      await client.auth.signOut();
    }
  }

  console.log('\n=====================================================');
  console.log('   SETUP & VERIFICATION SUITE FINISHED');
  console.log('=====================================================\n');
}

setupAndVerifyUsers().catch((err) => {
  console.error('Fatal setup error:', err);
  process.exit(1);
});
