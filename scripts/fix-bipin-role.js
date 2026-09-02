const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function fixBipinRole() {
  const { data: userList } = await adminClient.auth.admin.listUsers();
  const bipin = userList.users.find(u => u.email === 'bipin@yopmail.com');

  if (bipin) {
    const { error: pErr } = await adminClient
      .from('profiles')
      .update({ role: 'ADMIN' })
      .eq('id', bipin.id);
    console.log('Update profile result:', { error: pErr });

    const { data: updatedProfile } = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', bipin.id)
      .single();
    console.log('Updated Bipin Profile:', updatedProfile);
  }
}

fixBipinRole();
