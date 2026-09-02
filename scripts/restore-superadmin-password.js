const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

async function resetSuperAdmin() {
  const { data: prof } = await adminClient.from('profiles').select('id, email').eq('email', 'ratnadeepdey13@gmail.com').single();
  if (!prof) {
    console.error('Super admin profile not found');
    return;
  }

  console.log('Found super admin profile ID:', prof.id);
  const { data, error } = await adminClient.auth.admin.updateUserById(prof.id, {
    password: 'Ratnadeep1@',
    email_confirm: true,
  });

  if (error) {
    console.error('Failed to restore super admin password:', error);
  } else {
    console.log('Super admin password successfully restored to Ratnadeep1@!');
  }
}

resetSuperAdmin();
