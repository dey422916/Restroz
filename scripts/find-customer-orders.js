const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function findCustomerOrders() {
  const { data: customerOrders, error } = await supabase
    .from('orders')
    .select('id, order_number, customer_id, restaurant_id, status, payable_amount, created_at')
    .not('customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Orders with non-null customer_id:', customerOrders, 'Error:', error);

  if (customerOrders && customerOrders.length > 0) {
    const custId = customerOrders[0].customer_id;
    const { data: ordersWithJoins, error: joinErr } = await supabase
      .from('orders')
      .select(`
        *,
        restaurant:restaurants(id, name, slug, logo_url, address, phone),
        items:order_items(*)
      `)
      .eq('customer_id', custId)
      .order('created_at', { ascending: false });

    console.log('Customer orders with joins for user', custId, ':', {
      count: ordersWithJoins?.length,
      error: joinErr,
      sample: ordersWithJoins?.[0],
    });
  }
}

findCustomerOrders().catch(console.error);
