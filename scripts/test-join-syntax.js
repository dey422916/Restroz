const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testJoinSyntax() {
  console.log('Testing PostgREST relationship syntax...');

  // Attempt A: restaurant:restaurants(...)
  console.time('restaurants_table');
  const { data: aData, error: aErr } = await supabase
    .from('orders')
    .select('id, restaurant:restaurants(id, name, slug, logo_url, address, phone)')
    .limit(2);
  console.timeEnd('restaurants_table');
  console.log('Attempt A (restaurant:restaurants):', {
    success: Boolean(aData),
    error: aErr ? { code: aErr.code, message: aErr.message, details: aErr.details, hint: aErr.hint } : null,
    sample: aData?.[0],
  });

  // Attempt B: separate fetch / mapping (100% resilient, no FK dependency)
  console.time('separate_fetch');
  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('*, items:order_items(*)')
    .limit(5);
  
  if (orders && orders.length > 0) {
    const restIds = [...new Set(orders.map(o => o.restaurant_id).filter(Boolean))];
    const { data: rests } = await supabase
      .from('restaurants')
      .select('id, name, slug, logo_url, address, phone')
      .in('id', restIds);
    
    const restMap = (rests || []).reduce((acc, r) => ({ ...acc, [r.id]: r }), {});
    const combined = orders.map(o => ({
      ...o,
      restaurant: restMap[o.restaurant_id] || null,
    }));
    console.timeEnd('separate_fetch');
    console.log('Attempt B (Safe separate queries):', {
      count: combined.length,
      firstOrder: {
        id: combined[0].id,
        order_number: combined[0].order_number,
        restaurant_name: combined[0].restaurant?.name,
        items_count: combined[0].items?.length,
      }
    });
  }
}

testJoinSyntax().catch(console.error);
