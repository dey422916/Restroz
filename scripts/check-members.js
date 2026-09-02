const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkMembers() {
  const { data: profiles } = await adminClient.from('profiles').select('*');
  console.log('Profiles:', profiles);

  const { data: members } = await adminClient.from('restaurant_members').select('*, restaurant:restaurants(name, slug)');
  console.log('Restaurant Members:', members);
}

checkMembers().catch(console.error);
