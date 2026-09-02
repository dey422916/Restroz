const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function checkUser() {
  const { data } = await adminClient.auth.admin.getUserById('d39a0fe1-6710-4eb8-87ac-12adafee1378');
  console.log('User d39a0fe1-6710-4eb8-87ac-12adafee1378 is:', data.user?.email);
}

checkUser();
