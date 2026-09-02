const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkRLS() {
  console.log('--- Checking RLS Policies on products ---');
  const { data, error } = await adminClient.rpc('get_policies_for_table', { table_name: 'products' });
  if (error) {
    // If rpc doesn't exist, try querying pg_policies
    console.log('RPC error, querying information schema / pg_policies via pg query if possible...');
    // Test direct queries with anon and auth users
  } else {
    console.log('Policies on products:', data);
  }

  // Let's test INSERT as Ratnadeep Super Admin
  const anonClient = createClient(SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const { data: ratnaAuth, error: rAuthErr } = await anonClient.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });
  console.log('Ratnadeep auth:', ratnaAuth?.user?.id, rAuthErr?.message);

  const ratnaClient = createClient(SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${ratnaAuth.session.access_token}` } },
  });

  const testRatnaSku = `TEST-RATNA-${Date.now().toString().slice(-4)}`;
  const { data: ratnaInsert, error: ratnaInsErr } = await ratnaClient
    .from('products')
    .insert([{
      name: 'Ratnadeep Test Item',
      sku: testRatnaSku,
      restaurant_id: 'c0000000-0000-0000-0000-000000000001',
      category_id: 'c0000000-0000-0000-0000-000000000021',
      price: 150,
      stock_quantity: 50,
      is_active: true,
      is_available: true,
      food_type: 'veg',
    }])
    .select();

  console.log('Ratnadeep Super Admin insert into Ratnadeep Restaurant (c0000000...):', ratnaInsert ? 'SUCCESS' : 'FAILED', ratnaInsErr?.message, ratnaInsert);

  // Clean up
  if (ratnaInsert && ratnaInsert[0]) {
    const { error: delErr } = await ratnaClient.from('products').delete().eq('id', ratnaInsert[0].id);
    console.log('Cleaned up Ratnadeep test item. Error:', delErr?.message);
  }

  // Also test Kalputra Admin insert into Kalputra Restaurant
  const { data: kalAuth, error: kAuthErr } = await anonClient.auth.signInWithPassword({
    email: 'kalputra@yopmail.com',
    password: 'Password123!',
  });
  console.log('Kalputra auth:', kalAuth?.user?.id, kAuthErr?.message);

  const kalClient = createClient(SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${kalAuth.session.access_token}` } },
  });

  const testKalSku = `TEST-KAL-${Date.now().toString().slice(-4)}`;
  const { data: kalInsert, error: kalInsErr } = await kalClient
    .from('products')
    .insert([{
      name: 'Kalputra Test Item',
      sku: testKalSku,
      restaurant_id: 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863',
      category_id: 'cat-dba33a4a-starters',
      price: 180,
      stock_quantity: 30,
      is_active: true,
      is_available: true,
      food_type: 'non-veg',
    }])
    .select();

  console.log('Kalputra Admin insert into Kalputra Restaurant (dba33a4a...):', kalInsert ? 'SUCCESS' : 'FAILED', kalInsErr?.message, kalInsert);

  if (kalInsert && kalInsert[0]) {
    const { error: delErr } = await kalClient.from('products').delete().eq('id', kalInsert[0].id);
    console.log('Cleaned up Kalputra test item. Error:', delErr?.message);
  }
}

checkRLS().catch(console.error);
