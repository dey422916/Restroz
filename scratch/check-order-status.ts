import { supabase } from '../src/services/supabase';

async function checkOrder() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Error:', error);
  console.log('Recent orders:', data?.map(o => ({ id: o.id, order_number: o.order_number, status: o.status, order_type: o.order_type })));

  // Try updating to 'out_for_delivery'
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
