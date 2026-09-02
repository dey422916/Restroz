const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function testLimits() {
  const restIds = [
    'c0000000-0000-0000-0000-000000000001', // Ratnadeep
    'a0000000-0000-0000-0000-000000000001', // Kullad Chai
    'dba33a4a-f2fd-4b74-b7e4-d04c713c6863', // Kalputra
  ];

  for (const rid of restIds) {
    const { data: subData } = await adminClient
      .from('restaurant_subscriptions')
      .select('*, plan:subscription_plans(*)')
      .eq('restaurant_id', rid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: prodsCount } = await adminClient
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', rid)
      .eq('is_active', true);

    console.log(`\nRestaurant ${rid}:`);
    console.log('Plan:', subData?.plan?.name, 'Max Products:', subData?.plan?.max_products, 'Current Products Count:', prodsCount);
  }
}

testLimits().catch(console.error);
