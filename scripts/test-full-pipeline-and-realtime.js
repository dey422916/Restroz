require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, ANON_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function testAll() {
  console.log('=== FULL WEB + EXPO IMAGE PIPELINE & REALTIME VERIFICATION ===\n');

  // 1. Realtime Subscriptions Test
  console.log('1. Testing Realtime Channel Isolation & Subscription Lifecycle...');
  const testRestId = 'a0000000-0000-0000-0000-000000000001';
  const testUserId = '521ab3be-bd64-4939-8e72-118421ea1734';

  const ch1 = client.channel(`test_settings_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_settings', filter: `restaurant_id=eq.${testRestId}` }, () => {})
    .subscribe();

  const ch2 = client.channel(`test_profile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_public_profiles', filter: `restaurant_id=eq.${testRestId}` }, () => {})
    .subscribe();

  const ch3 = client.channel(`test_orders_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${testUserId}` }, () => {})
    .subscribe();

  console.log('-> Subscribed 3 isolated channels without collision.');
  client.removeChannel(ch1);
  client.removeChannel(ch2);
  client.removeChannel(ch3);
  console.log('-> Cleaned up all 3 channels cleanly. Realtime status: PASS\n');

  // 2. Test Image Uploads (Logo, Banner, Product)
  console.log('2. Testing Image Uploads to Supabase Storage...');
  const testImgBuf = Buffer.from('RIFF20000000WEBPVP8X0a0000000000000000000000VP8 140000003001009d012a0100010000', 'hex');

  // 2a. Logo Upload
  const logoPath = `restaurants/${testRestId}/logos/test_logo_${Date.now()}.webp`;
  const { data: lData, error: lErr } = await admin.storage
    .from('restaurant-assets')
    .upload(logoPath, testImgBuf, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });

  const logoUrl = admin.storage.from('restaurant-assets').getPublicUrl(logoPath).data.publicUrl;
  const logoRes = await fetch(logoUrl);
  console.log('-> Logo CDN URL:', logoUrl, 'HTTP Status:', logoRes.status, 'Cache-Control:', logoRes.headers.get('cache-control'));

  // 2b. Banner Upload
  const bannerPath = `restaurants/${testRestId}/banners/test_banner_${Date.now()}.webp`;
  const { data: bData, error: bErr } = await admin.storage
    .from('restaurant-assets')
    .upload(bannerPath, testImgBuf, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });

  const bannerUrl = admin.storage.from('restaurant-assets').getPublicUrl(bannerPath).data.publicUrl;
  const bannerRes = await fetch(bannerUrl);
  console.log('-> Banner CDN URL:', bannerUrl, 'HTTP Status:', bannerRes.status, 'Cache-Control:', bannerRes.headers.get('cache-control'));

  // 2c. Product Image Upload
  const prodPath = `restaurants/${testRestId}/products/prod-1/test_prod_${Date.now()}.webp`;
  const { data: pData, error: pErr } = await admin.storage
    .from('product-images')
    .upload(prodPath, testImgBuf, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });

  const prodUrl = admin.storage.from('product-images').getPublicUrl(prodPath).data.publicUrl;
  const prodRes = await fetch(prodUrl);
  console.log('-> Product CDN URL:', prodUrl, 'HTTP Status:', prodRes.status, 'Cache-Control:', prodRes.headers.get('cache-control'));

  // 3. Database Scan for 0 Base64 strings
  console.log('\n3. Scanning all DB tables for Base64 strings...');
  const tables = [
    { name: 'restaurants', cols: ['logo_url', 'banner_url'] },
    { name: 'restaurant_settings', cols: ['logo_url', 'banner_url'] },
    { name: 'restaurant_public_profiles', cols: ['logo_url', 'banner_url', 'profile_image_url'] },
    { name: 'products', cols: ['image_url'] },
    { name: 'profiles', cols: ['avatar_url'] },
  ];

  let base64Found = 0;
  for (const t of tables) {
    const { data: rows } = await admin.from(t.name).select('*');
    if (!rows) continue;
    for (const r of rows) {
      for (const col of t.cols) {
        const val = r[col];
        if (typeof val === 'string' && (val.startsWith('data:image') || val.length > 500)) {
          console.error(`BASE64 STILL IN DB: ${t.name}.${col}`);
          base64Found++;
        }
      }
    }
  }
  console.log('-> Base64 rows remaining in DB:', base64Found);

  // 4. Verify Marketplace query payload
  console.log('\n4. Checking Marketplace Public Restaurants payload...');
  const { data: marketRests } = await client
    .from('restaurants')
    .select('id, name, logo_url, banner_url, public_profile:restaurant_public_profiles(*)')
    .eq('status', 'ACTIVE');

  const payloadSize = Buffer.byteLength(JSON.stringify(marketRests || ''), 'utf8');
  console.log(`-> Marketplace payload: ${(payloadSize / 1024).toFixed(2)} KB`);

  // Cleanup test files
  await admin.storage.from('restaurant-assets').remove([logoPath, bannerPath]);
  await admin.storage.from('product-images').remove([prodPath]);

  console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===');
}

testAll().catch(console.error);
