/**
 * Server-Side Setup Script for Primary Administrator Bootstrap
 * Uses Supabase Service Role Key to create the primary admin account safely.
 *
 * Usage:
 * npx ts-node scripts/setup-primary-admin.ts
 */

import { createClient } from '@supabase/supabase-js';

const PRIMARY_ADMIN_EMAIL = 'ratnadeepdey13@gmail.com';
const PRIMARY_ADMIN_PASSWORD = 'Qwerty1@';
const PRIMARY_ADMIN_NAME = 'Ratnadeep Dey (Primary Admin)';

async function setupPrimaryAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.');
    console.log('Set SUPABASE_SERVICE_ROLE_KEY on your server/local env before running this script.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`Checking primary admin account (${PRIMARY_ADMIN_EMAIL})...`);

  // Check existing auth user list
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Failed to list auth users:', listError.message);
    process.exit(1);
  }

  let adminUser = usersData.users.find((u) => u.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase());

  if (!adminUser) {
    console.log('Creating primary admin auth user...');
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: PRIMARY_ADMIN_EMAIL,
      password: PRIMARY_ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: PRIMARY_ADMIN_NAME, role: 'ADMIN' },
    });

    if (createError) {
      console.error('Failed to create primary admin auth user:', createError.message);
      process.exit(1);
    }
    adminUser = created.user;
    console.log(`Primary admin auth user created successfully with ID: ${adminUser.id}`);
  } else {
    console.log(`Primary admin auth user already exists with ID: ${adminUser.id}`);
  }

  // Update or insert profile row with canonical role = 'ADMIN'
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: adminUser.id,
    email: PRIMARY_ADMIN_EMAIL,
    full_name: PRIMARY_ADMIN_NAME,
    role: 'ADMIN',
  });

  if (profileError) {
    console.error('Failed to update primary admin profile row:', profileError.message);
    process.exit(1);
  }

  console.log('✅ Primary admin profile configured with role = ADMIN.');
}

setupPrimaryAdmin().catch((err) => {
  console.error('Unexpected setup error:', err);
  process.exit(1);
});
