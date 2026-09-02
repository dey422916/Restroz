const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function checkOrdersRLS() {
  // Let's test with anon key without signing in
  const anonClient = createClient(SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const { data: anonOrders, error: aErr } = await anonClient.from('orders').select('id, restaurant_id').limit(5);
  console.log('Unauthenticated anon select orders:', { count: anonOrders?.length, error: aErr });
}

checkOrdersRLS();
