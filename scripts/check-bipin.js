const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function checkBipin() {
  const { data: userList } = await adminClient.auth.admin.listUsers();
  const bipin = userList.users.find(u => u.email === 'bipin@yopmail.com');
  console.log('Bipin Auth User:', { id: bipin.id, email: bipin.email, metadata: bipin.user_metadata });

  const { data: profile } = await adminClient.from('profiles').select('*').eq('id', bipin.id).single();
  console.log('Bipin Profile:', profile);

  const { data: members } = await adminClient.from('restaurant_members').select('*').eq('user_id', bipin.id);
  console.log('Bipin Memberships:', members);
}

checkBipin();
