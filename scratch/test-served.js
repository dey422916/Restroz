const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testDispatchUpdate() {
  await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
  });

  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, status')
    .eq('order_number', 'INV-2026-0070')
    .single();

  console.log('Order INV-2026-0070 current DB status:', order?.status);

  // Update to 'served' (Dispatch)
  const { data: updated, error } = await supabase
    .from('orders')
    .update({ status: 'served', updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .select();

  console.log('Update to served error:', error);
  console.log('Updated order in DB:', updated);
}

testDispatchUpdate().catch(console.error);
