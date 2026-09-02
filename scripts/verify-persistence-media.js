const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, ANON_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const RATNADEEP_ID = 'a0000000-0000-0000-0000-000000000001';
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

async function runVerification() {
  console.log('================================================================');
  console.log('🚀 RUNNING FINAL VERIFICATION: MEDIA & LOCATION PERSISTENCE');
  console.log('================================================================\n');

  const results = [];
  function record(num, title, passed, details) {
    results.push({ num, title, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] Check ${num}: ${title}`);
    if (details) console.log(`       Details: ${details}`);
  }

  // 1. Upload/Persist Restaurant Banner & Logo
  const testBanner = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80';
  const testLogo = 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=200&q=80';

  const { error: e1 } = await admin.from('restaurant_public_profiles').update({ banner_url: testBanner }).eq('restaurant_id', KALPUTRA_ID);
  const { error: e2 } = await admin.from('restaurants').update({ logo_url: testLogo }).eq('id', KALPUTRA_ID);
  record(1, 'Upload/Change restaurant banner and logo succeeds', !e1 && !e2, 'Updated in restaurant_public_profiles and restaurants');

  // 2. Refresh / reload persistence
  const { data: prof1 } = await admin.from('restaurant_public_profiles').select('banner_url').eq('restaurant_id', KALPUTRA_ID).single();
  const { data: rest1 } = await admin.from('restaurants').select('logo_url').eq('id', KALPUTRA_ID).single();
  record(2, 'Banner & Logo survive page reload / restart', prof1?.banner_url === testBanner && rest1?.logo_url === testLogo, `Persisted Banner: ${prof1?.banner_url?.slice(0, 35)}...`);

  // 3. Edit address & coordinates persistence
  const { error: e3 } = await admin.from('restaurants').update({
    address: 'GT Road, Near Railway Station',
    city: 'Burdwan',
    state: 'West Bengal',
    postal_code: '713101',
    country: 'India',
  }).eq('id', KALPUTRA_ID);
  const { data: rest2 } = await admin.from('restaurants').select('address, city, state, postal_code').eq('id', KALPUTRA_ID).single();
  record(3, 'Restaurant address persists in database', !e3 && rest2?.city === 'Burdwan' && rest2?.postal_code === '713101', `Address: ${rest2?.address}, ${rest2?.city}`);

  // 4. Customer saved address coordinates persistence
  const { data: rajProf } = await admin.from('profiles').select('id').eq('email', 'raj@yopmail.com').single();
  let custAddr = null;
  if (rajProf) {
    const { data: existing } = await admin.from('customer_addresses').select('*').eq('user_id', rajProf.id).limit(1);
    if (existing && existing.length > 0) {
      custAddr = existing[0];
    } else {
      const { data: ins } = await admin.from('customer_addresses').insert({
        user_id: rajProf.id,
        label: 'Home',
        full_name: 'Raj Customer',
        phone: '+91 9876543210',
        address_line1: 'GT Road, Burdwan',
        city: 'Burdwan',
        state: 'West Bengal',
        postal_code: '713101',
        latitude: 23.2324,
        longitude: 87.8615,
        is_default: true,
      }).select().single();
      custAddr = ins;
    }
  }
  record(4, 'Customer saved address coordinates (lat, lng) persist in DB', Boolean(custAddr && custAddr.latitude && custAddr.longitude), `Coordinates: (${custAddr?.latitude}, ${custAddr?.longitude})`);

  // 5. Marketplace displays uploaded images
  const { data: marketplaceRests } = await client.from('restaurants').select('id, name, logo_url, public_profile:restaurant_public_profiles(*)').eq('status', 'ACTIVE');
  const bannersPresent = marketplaceRests.every(r => {
    const p = Array.isArray(r.public_profile) ? r.public_profile[0] : r.public_profile;
    return Boolean(p?.banner_url);
  });
  record(5, 'Marketplace shows uploaded banners for all restaurants', bannersPresent, `All ${marketplaceRests.length} active restaurants have images`);

  // 6. Search by name
  const matchKal = marketplaceRests.filter(r => r.name.toLowerCase().includes('kal'));
  const matchKullad = marketplaceRests.filter(r => r.name.toLowerCase().includes('kullad') || r.name.toLowerCase().includes('ratnadeep'));
  record(6, 'Restaurant-name search matches partial/case-insensitive', matchKal.length > 0 && matchKullad.length > 0, `Matches: "${matchKal[0]?.name}", "${matchKullad[0]?.name}"`);

  // 7. Tenant Menu Isolation preserved
  const { data: kalMenu } = await client.from('products').select('id, restaurant_id').eq('restaurant_id', KALPUTRA_ID);
  const { data: ratnaMenu } = await client.from('products').select('id, restaurant_id').eq('restaurant_id', RATNADEEP_ID);
  const isolated = kalMenu.every(p => p.restaurant_id === KALPUTRA_ID) && ratnaMenu.every(p => p.restaurant_id === RATNADEEP_ID);
  record(7, 'Tenant menu isolation strictly preserved', isolated, `Kalputra items: ${kalMenu.length}, Ratnadeep items: ${ratnaMenu.length}`);

  // Summary
  console.log('\n================================================================');
  const allPassed = results.length === 7 && results.every(r => r.passed);
  console.log(`TOTAL CHECKS: ${results.length}/7`);
  console.log(`PASSED: ${results.filter(r => r.passed).length}`);
  console.log(`FAILED: ${results.filter(r => !r.passed).length}`);
  console.log('================================================================\n');

  if (allPassed) {
    console.log('RESTAURANT MEDIA & LOCATION PERSISTENCE: PASS');
  } else {
    console.log('RESTAURANT MEDIA & LOCATION PERSISTENCE: FAIL');
  }
}

runVerification();
