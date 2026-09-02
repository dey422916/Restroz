const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function inspect() {
  const { data: rests, error } = await client.from('restaurants').select('*');
  if (error) throw error;
  console.log('--- ALL RESTAURANTS ---');
  console.log(JSON.stringify(rests, null, 2));

  for (const r of rests) {
    const { count: prodCount } = await client.from('products').select('*', { count: 'exact', head: true }).eq('restaurant_id', r.id);
    const { count: catCount } = await client.from('categories').select('*', { count: 'exact', head: true }).eq('restaurant_id', r.id);
    const { count: tblCount } = await client.from('tables').select('*', { count: 'exact', head: true }).eq('restaurant_id', r.id);
    const { count: ordCount } = await client.from('orders').select('*', { count: 'exact', head: true }).eq('restaurant_id', r.id);
    const { data: profile } = await client.from('restaurant_public_profiles').select('*').eq('restaurant_id', r.id).maybeSingle();
    const { data: sub } = await client.from('restaurant_subscriptions').select('*, plan:subscription_plans(*)').eq('restaurant_id', r.id).maybeSingle();

    console.log(`\n=== RESTAURANT: ${r.name} (${r.id}) ===`);
    console.log(`Slug: ${r.slug} | Status: ${r.status}`);
    console.log(`Counts: Products: ${prodCount}, Categories: ${catCount}, Tables: ${tblCount}, Orders: ${ordCount}`);
    console.log(`Public Profile:`, profile ? 'EXISTS' : 'MISSING');
    console.log(`Subscription:`, sub ? `${sub.plan?.name} (${sub.status})` : 'MISSING');
  }
}

inspect().catch(console.error);
