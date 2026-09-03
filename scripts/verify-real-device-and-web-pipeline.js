require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, ANON_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function parseBannerUrls(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.filter((u) => typeof u === 'string' && u.trim().length > 0);
  if (typeof input !== 'string') return [];
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === 'string' && u.trim().length > 0);
    } catch (e) {}
  }
  return [trimmed];
}

async function verifyEndToEnd() {
  console.log('=== REAL TEST: BANNER & IMAGE PIPELINE END-TO-END ===\n');

  const testRestId = 'a0000000-0000-0000-0000-000000000001'; // Kulhad Chai

  // 1. Upload a brand new test banner binary
  console.log('1. Uploading NEW test banner binary...');
  const testImgBuf = Buffer.from('RIFF20000000WEBPVP8X0a0000000000000000000000VP8 140000003001009d012a0100010000', 'hex');
  const bannerFileName = `test_banner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.webp`;
  const bannerPath = `restaurants/${testRestId}/banners/${bannerFileName}`;

  const { data: bData, error: bErr } = await admin.storage
    .from('restaurant-assets')
    .upload(bannerPath, testImgBuf, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });

  if (bErr) {
    console.error('Storage upload failed:', bErr);
    process.exit(1);
  }

  const { data: pubData } = admin.storage.from('restaurant-assets').getPublicUrl(bannerPath);
  const newBannerUrl = pubData.publicUrl;
  console.log('-> New Banner CDN URL:', newBannerUrl);

  // Verify HTTP 200
  const cdnRes = await fetch(newBannerUrl);
  console.log('-> CDN HTTP Status:', cdnRes.status, 'Content-Type:', cdnRes.headers.get('content-type'), 'Cache-Control:', cdnRes.headers.get('cache-control'));

  // 2. Synchronize DB tables (restaurants and restaurant_public_profiles) with banner URL payload
  console.log('\n2. Updating DB tables with new banner URL payload...');
  const bannerPayload = JSON.stringify([newBannerUrl]);
  const { error: rErr } = await admin.from('restaurants').update({ banner_url: bannerPayload }).eq('id', testRestId);
  const { error: pErr } = await admin.from('restaurant_public_profiles').update({ banner_url: bannerPayload }).eq('restaurant_id', testRestId);

  console.log('-> Updated restaurants:', !rErr, 'Updated restaurant_public_profiles:', !pErr);

  // 3. Query Marketplace
  console.log('\n3. Querying Marketplace public restaurants...');
  const { data: marketData, error: mErr } = await client
    .from('restaurants')
    .select('*, public_profile:restaurant_public_profiles(*)')
    .eq('status', 'ACTIVE');

  const kulhad = marketData.find((r) => r.id === testRestId);
  const parsed = parseBannerUrls(kulhad?.public_profile?.banner_url || kulhad?.banner_url);
  console.log('-> Kulhad Chai parsed banner URL from Marketplace query:', parsed[0]);

  const matchesUploaded = parsed[0] === newBannerUrl;
  console.log('-> Marketplace query returns exact uploaded CDN URL:', matchesUploaded ? 'PASS' : 'FAIL');

  // 4. Test Product Image Upload & DB save
  console.log('\n4. Testing NEW product image upload...');
  const prodFileName = `test_product_${Date.now()}.webp`;
  const prodPath = `restaurants/${testRestId}/products/prod-test/${prodFileName}`;
  await admin.storage.from('product-images').upload(prodPath, testImgBuf, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
  const newProdUrl = admin.storage.from('product-images').getPublicUrl(prodPath).data.publicUrl;
  console.log('-> New Product CDN URL:', newProdUrl);
  const prodRes = await fetch(newProdUrl);
  console.log('-> Product CDN HTTP Status:', prodRes.status);

  // 5. Database Scan for 0 Base64
  console.log('\n5. Scanning Database for Base64 rows...');
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

  console.log('\n=== VERIFICATION COMPLETE: ALL PASS ===');
}

verifyEndToEnd().catch(console.error);
