const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check71() {
  await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
  });

  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, status, order_type')
    .eq('order_number', 'INV-2026-0071')
    .single();

  console.log('Order INV-2026-0071:', data, 'Error:', error);
}

check71().catch(console.error);
