const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const adminClient = SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

async function check() {
  console.log('--- SUPABASE INSPECTION ---');
  console.log('URL:', SUPABASE_URL);

  // 1. Fetch restaurants
  const { data: restaurants, error: rErr } = await (adminClient || anonClient)
    .from('restaurants')
    .select('id, name, slug');
  console.log('\nRestaurants in DB:', restaurants, 'Error:', rErr?.message);

  // 2. Fetch recent products
  const { data: prods, error: pErr } = await (adminClient || anonClient)
    .from('products')
    .select('id, name, sku, restaurant_id, is_active, is_available, category_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('\nRecent products in DB (last 10):', prods, 'Error:', pErr?.message);

  // 3. Check categories
  const { data: cats, error: cErr } = await (adminClient || anonClient)
    .from('categories')
    .select('id, name, restaurant_id');
  console.log('\nCategories in DB:', cats, 'Error:', cErr?.message);

  // 4. Test login as Bipin (Kullad Chai Admin)
  console.log('\nTesting Auth as Bipin (Kullad Chai Admin)...');
  const { data: authData, error: authErr } = await anonClient.auth.signInWithPassword({
    email: 'bipin@yopmail.com',
    password: 'Password123!',
  });

  if (authErr) {
    console.error('Bipin login error:', authErr.message);
  } else {
    console.log('Bipin logged in successfully. User ID:', authData.user.id);
    const bipinClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${authData.session.access_token}`,
        },
      },
    });

    // Check what restaurant Bipin belongs to
    const { data: memberData, error: memErr } = await bipinClient
      .from('restaurant_members')
      .select('*')
      .eq('user_id', authData.user.id);
    console.log('Bipin restaurant_members:', memberData, 'Error:', memErr?.message);

    const bipinRestId = memberData && memberData[0] ? memberData[0].restaurant_id : null;
    console.log('Bipin Active Restaurant ID:', bipinRestId);

    // Try selecting products as Bipin
    const { data: bipinProds, error: bpErr } = await bipinClient
      .from('products')
      .select('*')
      .eq('restaurant_id', bipinRestId);
    console.log(`Bipin can SELECT products for restaurant ${bipinRestId}:`, bipinProds?.length, 'Error:', bpErr?.message);

    // Test trying to insert a product with DEFAULT_RESTAURANT_ID as Bipin
    const testSkuFail = `TEST-FAIL-${Date.now().toString().slice(-4)}`;
    const { data: insertFail, error: ifErr } = await bipinClient
      .from('products')
      .insert([{
        name: 'Test Fail Product',
        sku: testSkuFail,
        restaurant_id: 'a0000000-0000-0000-0000-000000000001', // Ratnadeep ID
        price: 100,
        category_id: cats?.[0]?.id,
      }])
      .select();
    console.log('Bipin insert with wrong restaurant_id (Ratnadeep):', insertFail ? 'SUCCESS' : 'FAILED', ifErr?.message);

    // Test trying to insert a product with Bipin's real restaurant_id as Bipin
    const testSkuSuccess = `TEST-OK-${Date.now().toString().slice(-4)}`;
    const { data: insertOk, error: iOkErr } = await bipinClient
      .from('products')
      .insert([{
        name: 'Test OK Product',
        sku: testSkuSuccess,
        restaurant_id: bipinRestId,
        price: 100,
        category_id: cats?.find(c => c.restaurant_id === bipinRestId)?.id || cats?.[0]?.id,
      }])
      .select();
    console.log('Bipin insert with correct restaurant_id (Kullad Chai):', insertOk ? 'SUCCESS' : 'FAILED', iOkErr?.message, insertOk);

    // Clean up test product if inserted
    if (insertOk && insertOk[0]) {
      await adminClient?.from('products').delete().eq('id', insertOk[0].id);
      console.log('Cleaned up test row:', insertOk[0].id);
    }
  }
}

check().catch(console.error);
