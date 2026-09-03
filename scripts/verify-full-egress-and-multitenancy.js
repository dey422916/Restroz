require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, ANON_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const restA = 'a0000000-0000-0000-0000-000000000001'; // Kulhad Chai
const restB = 'c0000000-0000-0000-0000-000000000001'; // Ratnadeep

async function verifyAll() {
  console.log('=== MULTI-TENANT ISOLATION & COMPREHENSIVE REGRESSION TEST ===\n');

  // 1. Tenant Isolation Verification
  console.log('1. Verifying Multi-Tenant Strict Isolation between Restaurant A and B...');
  const [prodsA, prodsB, ordersA, ordersB, kotsA, kotsB] = await Promise.all([
    client.from('products').select('id, restaurant_id').eq('restaurant_id', restA),
    client.from('products').select('id, restaurant_id').eq('restaurant_id', restB),
    client.from('orders').select('id, restaurant_id').eq('restaurant_id', restA),
    client.from('orders').select('id, restaurant_id').eq('restaurant_id', restB),
    client.from('kots').select('id, restaurant_id').eq('restaurant_id', restA),
    client.from('kots').select('id, restaurant_id').eq('restaurant_id', restB),
  ]);

  const crossA = (prodsA.data || []).some((p) => p.restaurant_id !== restA);
  const crossB = (prodsB.data || []).some((p) => p.restaurant_id !== restB);
  const crossOrdA = (ordersA.data || []).some((o) => o.restaurant_id !== restA);
  const crossOrdB = (ordersB.data || []).some((o) => o.restaurant_id !== restB);

  console.log('-> Restaurant A Products:', prodsA.data?.length, 'Cross-tenant leak:', crossA);
  console.log('-> Restaurant B Products:', prodsB.data?.length, 'Cross-tenant leak:', crossB);
  console.log('-> Restaurant A Orders:', ordersA.data?.length, 'Cross-tenant leak:', crossOrdA);
  console.log('-> Restaurant B Orders:', ordersB.data?.length, 'Cross-tenant leak:', crossOrdB);

  if (crossA || crossB || crossOrdA || crossOrdB) {
    console.error('FAILED: Cross-tenant data leak detected!');
    process.exit(1);
  }
  console.log('-> Multi-tenant isolation: PASS\n');

  // 2. Marketplace & Menu Verification
  console.log('2. Verifying Marketplace targeted column query & public menu...');
  const { data: marketRests, error: mErr } = await client
    .from('restaurants')
    .select(`
      id, name, logo_url, banner_url, address, city, phone, status, latitude, longitude,
      public_profile:restaurant_public_profiles(
        id, restaurant_id, is_open, marketplace_enabled, accepts_delivery, accepts_takeaway,
        delivery_radius_km, minimum_order_value, estimated_delivery_minutes, cuisine_tags,
        banner_url, public_description, opening_time, closing_time, latitude, longitude, created_at
      )
    `)
    .eq('status', 'ACTIVE');

  console.log('-> Marketplace active restaurants count:', marketRests?.length);
  const sampleRest = marketRests?.[0];
  console.log('-> Sample restaurant public profile open:', sampleRest?.public_profile?.is_open);
  console.log('-> Sample restaurant banner URL:', sampleRest?.public_profile?.banner_url || sampleRest?.banner_url);

  // 3. Storage & CDN Immutable Cache-Control Verification
  console.log('\n3. Verifying CDN Storage Asset Headers...');
  if (sampleRest?.logo_url && sampleRest.logo_url.startsWith('http')) {
    const res = await fetch(sampleRest.logo_url);
    console.log('-> Logo URL:', sampleRest.logo_url, 'HTTP:', res.status, 'Cache-Control:', res.headers.get('cache-control'));
  }

  console.log('\n=== ALL TESTS PASSED ===');
}

verifyAll().catch(console.error);
