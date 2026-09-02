const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkOrder() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Error:', error);
  console.log('Recent orders:', data?.map(o => ({ id: o.id, order_number: o.order_number, status: o.status, order_type: o.order_type })));

  if (data && data.length > 0) {
    const target = data[0];
    console.log('Testing update on order:', target.order_number, 'current status:', target.status);
    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({ status: 'out_for_delivery' })
      .eq('id', target.id)
      .select();
    console.log('Update result:', updated, 'Update Error:', updateErr);
  }
}

checkOrder().catch(console.error);
