const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function testRls() {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  await client.auth.signInWithPassword({
    email: 'kalputra@yopmail.com',
    password: 'Password123!',
  });

  const { data: profile } = await client.from('profiles').select('*').single();
  console.log('Profile via RLS:', profile);

  const { data: members } = await client.from('restaurant_members').select('*');
  console.log('Memberships via RLS:', members);

  const { data: allOrders } = await client.from('orders').select('id, restaurant_id, customer_id');
  console.log('All orders visible to Kalputra Admin:', allOrders);
}

testRls();
