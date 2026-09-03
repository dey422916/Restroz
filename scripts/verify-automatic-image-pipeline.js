require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, ANON_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function verifyPipeline() {
  console.log('=== AUTOMATIC IMAGE STORAGE PIPELINE VERIFICATION ===\n');

  // 1. Test Storage Upload & Cache-Control Header
  console.log('1. Testing Binary Upload & Cache-Control...');
  const testLogoBuf = Buffer.from('RIFF20000000WEBPVP8X0a0000000000000000000000VP8 140000003001009d012a0100010000', 'hex');
  const path = `restaurants/test/logos/pipeline_test_${Date.now()}.webp`;

  const { data: upData, error: upErr } = await admin.storage
    .from('restaurant-assets')
    .upload(path, testLogoBuf, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    });

  if (upErr) {
    console.error('Upload failed:', upErr);
    process.exit(1);
  }

  const { data: pubData } = admin.storage.from('restaurant-assets').getPublicUrl(path);
  const cdnUrl = pubData.publicUrl;
  console.log('-> Uploaded CDN URL:', cdnUrl);

  const fetchRes = await fetch(cdnUrl);
  const cacheControlHeader = fetchRes.headers.get('cache-control');
  console.log('-> CDN Status:', fetchRes.status, 'Cache-Control Header:', cacheControlHeader);

  const isCdnValid = cdnUrl.startsWith('https://') && fetchRes.status === 200;
  console.log('1. Storage Upload Test Result:', isCdnValid ? 'PASS' : 'FAIL');

  // 2. Scan entire Database for remaining Base64 strings
  console.log('\n2. Scanning Database for Base64 rows...');
  const tables = [
    { name: 'restaurants', cols: ['logo_url', 'banner_url'] },
    { name: 'restaurant_settings', cols: ['logo_url', 'banner_url'] },
    { name: 'restaurant_public_profiles', cols: ['logo_url', 'banner_url', 'profile_image_url'] },
    { name: 'products', cols: ['image_url'] },
    { name: 'profiles', cols: ['avatar_url'] },
  ];

  let base64Count = 0;
  for (const t of tables) {
    const { data: rows } = await admin.from(t.name).select('*');
    if (!rows) continue;
    for (const r of rows) {
      for (const col of t.cols) {
        const val = r[col];
        if (typeof val === 'string' && (val.startsWith('data:image') || val.length > 500)) {
          console.error(`FOUND BASE64: ${t.name}.${col} (ID: ${r.id || r.restaurant_id})`);
          base64Count++;
        }
      }
    }
  }
  console.log('2. Base64 rows remaining in DB:', base64Count);

  // 3. Measure Marketplace Public Restaurants payload size
  console.log('\n3. Measuring Marketplace Public Restaurants payload size...');
  const { data: marketData, error: marketErr } = await client
    .from('restaurants')
    .select('*, public_profile:restaurant_public_profiles(*)')
    .eq('status', 'ACTIVE');

  const payloadSize = Buffer.byteLength(JSON.stringify(marketData || ''), 'utf8');
  console.log(`3. Current Marketplace Payload: ${(payloadSize / 1024).toFixed(2)} KB (${payloadSize} bytes)`);

  // Clean up test file
  await admin.storage.from('restaurant-assets').remove([path]);

  console.log('\n=== PIPELINE VERIFICATION COMPLETE ===');
  return {
    isCdnValid,
    base64Count,
    payloadKb: (payloadSize / 1024).toFixed(2),
    cacheControlHeader,
  };
}

verifyPipeline().catch(console.error);
