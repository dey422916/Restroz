const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function listAllAccounts() {
  const { data: users, error: uErr } = await adminClient.auth.admin.listUsers();
  if (uErr) {
    console.error('Error fetching auth users:', uErr);
    return;
  }

  const { data: profiles, error: pErr } = await adminClient.from('profiles').select('*');
  const { data: members, error: mErr } = await adminClient.from('restaurant_members').select('*, restaurants(name)');

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const memberMap = new Map();
  (members || []).forEach(m => {
    if (!memberMap.has(m.user_id)) memberMap.set(m.user_id, []);
    memberMap.get(m.user_id).push(m);
  });

  console.log('\n=== ACCOUNTS SUMMARY ===');
  for (const u of users.users) {
    const prof = profileMap.get(u.id);
    const mems = memberMap.get(u.id) || [];
    const memInfo = mems.map(m => `${m.role} @ ${m.restaurants?.name || m.restaurant_id}`).join(', ');
    console.log(`- Email: ${u.email} | Role: ${prof?.role || u.user_metadata?.role || 'CUSTOMER'} | Name: ${prof?.full_name || 'N/A'} | Memberships: [${memInfo}]`);
  }
}

listAllAccounts();
