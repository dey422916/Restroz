const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAuthUpdate() {
  // Login as admin
  console.log('Logging in as admin...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
  });
  console.log('Admin Auth user:', authData?.user?.email, 'Error:', authError);

  // Fetch orders
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Orders found:', orders?.map(o => ({ id: o.id, num: o.order_number, status: o.status })));

  if (orders && orders.length > 0) {
    const target = orders[0];
    console.log('Admin updating order:', target.order_number, 'from:', target.status, 'to: out_for_delivery');
    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'out_for_delivery', updated_at: new Date().toISOString() })
      .eq('id', target.id)
      .select();
    console.log('Admin Update data:', updated, 'Update Error:', updateErr);
  }
}

testAuthUpdate().catch(console.error);
