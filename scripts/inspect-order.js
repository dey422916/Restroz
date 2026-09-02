const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function inspectOrder() {
  const { data: order, error } = await adminClient
    .from('orders')
    .select('*')
    .eq('id', 'ord-1787249328637-t2f9e')
    .single();

  console.log('Order data:', order);
  console.log('Error:', error);
}

inspectOrder();
