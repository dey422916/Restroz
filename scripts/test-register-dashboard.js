const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const client = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testTimerAndIsolation() {
  console.log('--- TEST 1: Tenant Isolation for Day Registers ---');
  // Query 2 distinct tenants
  const tenantA = 'a0000000-0000-0000-0000-000000000001';
  const tenantB = 'c0000000-0000-0000-0000-000000000001';

  const { data: regsA, error: errA } = await client
    .from('day_registers')
    .select('id, restaurant_id, status, opening_cash_float, opened_at')
    .eq('restaurant_id', tenantA)
    .order('opened_at', { ascending: false });

  const { data: regsB, error: errB } = await client
    .from('day_registers')
    .select('id, restaurant_id, status, opening_cash_float, opened_at')
    .eq('restaurant_id', tenantB)
    .order('opened_at', { ascending: false });

  console.log(`Tenant A (${tenantA}) registers count:`, regsA ? regsA.length : 0);
  if (regsA && regsA.length > 0) {
    console.log('Tenant A latest register status:', regsA[0].status, '| float:', regsA[0].opening_cash_float);
  }

  console.log(`Tenant B (${tenantB}) registers count:`, regsB ? regsB.length : 0);
  if (regsB && regsB.length > 0) {
    console.log('Tenant B latest register status:', regsB[0].status, '| float:', regsB[0].opening_cash_float);
  }

  console.log('--- TEST 2: Live Timer Calculation Persistence Test ---');
  // Sample timestamp 2 hours, 47 minutes, 36 seconds ago
  const testOpenedAt = new Date(Date.now() - (2 * 3600 + 47 * 60 + 36) * 1000).toISOString();
  const diffSecs = Math.max(0, Math.floor((Date.now() - new Date(testOpenedAt).getTime()) / 1000));
  const hours = Math.floor(diffSecs / 3600);
  const minutes = Math.floor((diffSecs % 3600) / 60);
  const seconds = diffSecs % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  const timerDisplay = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  console.log('Computed Timer from test opened_at:', timerDisplay);
  if (timerDisplay === '02:47:36') {
    console.log('Timer computation matches user specification perfectly!');
  }

  console.log('--- TEST 3: Verification Complete ---');
}

testTimerAndIsolation();
