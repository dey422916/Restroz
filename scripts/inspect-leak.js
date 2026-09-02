const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function inspect() {
  const { data: userList } = await adminClient.auth.admin.listUsers();
  const kalputraUser = userList.users.find(u => u.email === 'kalputra@yopmail.com');
  console.log('Kalputra User ID:', kalputraUser.id);

  const { data: profile } = await adminClient.from('profiles').select('*').eq('id', kalputraUser.id).single();
  console.log('Kalputra Profile:', profile);

  const { data: memberships } = await adminClient.from('restaurant_members').select('*, restaurants(name)').eq('user_id', kalputraUser.id);
  console.log('Kalputra Memberships:', memberships);

  const { data: order } = await adminClient.from('orders').select('*').eq('id', 'ord-1787041108389jjp9').single();
  console.log('Order ord-1787041108389jjp9:', {
    id: order.id,
    restaurant_id: order.restaurant_id,
    customer_id: order.customer_id,
    created_by: order.created_by
  });
}

inspect();
