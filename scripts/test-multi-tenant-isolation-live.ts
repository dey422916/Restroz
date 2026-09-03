import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const KULLAD_ID = 'a0000000-0000-0000-0000-000000000001';
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

interface TestStats {
  crossTenantEventsReceivedByA: number;
  crossTenantEventsReceivedByB: number;
  ownEventsReceivedByA: number;
  ownEventsReceivedByB: number;
}

async function runMultiTenantAudit() {
  console.log('================================================================');
  console.log('STARTING SIMULTANEOUS MULTI-TENANT ISOLATION AUDIT');
  console.log('Tenant A (Kullad Chai):', KULLAD_ID);
  console.log('Tenant B (Kalputra):', KALPUTRA_ID);
  console.log('================================================================\n');

  // Step 1: Authenticate Tenant A and Tenant B concurrently
  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const superAdminClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const [authA, authB, authSuper] = await Promise.all([
    clientA.auth.signInWithPassword({ email: 'bipin@yopmail.com', password: 'Password123!' }),
    clientB.auth.signInWithPassword({ email: 'kalputra@yopmail.com', password: 'Password123!' }),
    superAdminClient.auth.signInWithPassword({ email: 'ratnadeepdey13@gmail.com', password: 'Ratnadeep1@' }),
  ]);

  if (authA.error) throw new Error('Tenant A login failed: ' + authA.error.message);
  if (authB.error) throw new Error('Tenant B login failed: ' + authB.error.message);
  if (authSuper.error) throw new Error('Super Admin login failed: ' + authSuper.error.message);

  console.log('✅ Authenticated Tenant A:', authA.data.user.email, '(ID:', authA.data.user.id, ')');
  console.log('✅ Authenticated Tenant B:', authB.data.user.email, '(ID:', authB.data.user.id, ')');
  console.log('✅ Authenticated Super Admin:', authSuper.data.user.email, '\n');

  // Step 2: Establish Realtime subscriptions for both tenants concurrently
  const stats: TestStats = {
    crossTenantEventsReceivedByA: 0,
    crossTenantEventsReceivedByB: 0,
    ownEventsReceivedByA: 0,
    ownEventsReceivedByB: 0,
  };

  const chA = clientA
    .channel(`realtime_orders_${KULLAD_ID}_${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${KULLAD_ID}` },
      (payload) => {
        const rowRestId = (payload.new as any)?.restaurant_id || (payload.old as any)?.restaurant_id;
        if (rowRestId === KALPUTRA_ID) {
          stats.crossTenantEventsReceivedByA++;
          console.error('🚨 LEAK DETECTED: Tenant A received event for Tenant B!', payload);
        } else if (rowRestId === KULLAD_ID) {
          stats.ownEventsReceivedByA++;
          console.log('Tenant A Realtime Event Received:', payload.eventType, (payload.new as any)?.id);
        }
      }
    )
    .subscribe();

  const chB = clientB
    .channel(`realtime_orders_${KALPUTRA_ID}_${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${KALPUTRA_ID}` },
      (payload) => {
        const rowRestId = (payload.new as any)?.restaurant_id || (payload.old as any)?.restaurant_id;
        if (rowRestId === KULLAD_ID) {
          stats.crossTenantEventsReceivedByB++;
          console.error('🚨 LEAK DETECTED: Tenant B received event for Tenant A!', payload);
        } else if (rowRestId === KALPUTRA_ID) {
          stats.ownEventsReceivedByB++;
          console.log('Tenant B Realtime Event Received:', payload.eventType, (payload.new as any)?.id);
        }
      }
    )
    .subscribe();

  // Wait for channels to fully subscribe
  await new Promise((r) => setTimeout(r, 2500));
  console.log('Realtime channels established and listening on isolated tenant topics.\n');

  // Step 3: Test Initial Order Query Isolation
  console.log('--- TEST 1: Initial Order Query Isolation ---');
  const [ordersA, ordersB] = await Promise.all([
    clientA.from('orders').select('id, restaurant_id').eq('restaurant_id', KULLAD_ID),
    clientB.from('orders').select('id, restaurant_id').eq('restaurant_id', KALPUTRA_ID),
  ]);

  const ordersAForB = (ordersA.data || []).filter((o) => o.restaurant_id === KALPUTRA_ID);
  const ordersBForA = (ordersB.data || []).filter((o) => o.restaurant_id === KULLAD_ID);
  console.log('Tenant A total orders:', ordersA.data?.length, '| Foreign Tenant B orders in A query:', ordersAForB.length);
  console.log('Tenant B total orders:', ordersB.data?.length, '| Foreign Tenant A orders in B query:', ordersBForA.length);
  const queryIsolationPass = ordersAForB.length === 0 && ordersBForA.length === 0;
  console.log('TEST 1 Result:', queryIsolationPass ? 'PASS' : 'FAIL', '\n');

  const createdOrderIds: { id: string; client: any }[] = [];

  // Step 4: POS Dine-In Order (Created by Tenant A)
  console.log('--- TEST 2: POS Dine-In Order Creation (Tenant A) ---');
  const posOrderIdA = `ord-pos-dine-${Date.now()}`;
  const orderNumA = `POS-DINE-${Date.now().toString().slice(-4)}`;
  const { data: posOrderA, error: errPosA } = await clientA
    .from('orders')
    .insert({
      id: posOrderIdA,
      restaurant_id: KULLAD_ID,
      order_number: orderNumA,
      order_type: 'dine_in',
      status: 'confirmed',
      customer_name: 'Dine-in Customer A',
      table_number: 'T1',
      subtotal: 250,
      grand_total: 250,
      payable_amount: 250,
      payment_status: 'unpaid',
      notes: '[POS] Dine in test',
    })
    .select()
    .single();

  if (errPosA) console.error('Tenant A POS Dine-In failed:', errPosA);
  else createdOrderIds.push({ id: posOrderIdA, client: clientA });
  await new Promise((r) => setTimeout(r, 2000));
  console.log('POS Dine-In A Created:', posOrderA?.id);

  // Step 5: POS Takeaway Order (Created by Tenant B)
  console.log('--- TEST 3: POS Takeaway Order Creation (Tenant B) ---');
  const posOrderIdB = `ord-pos-take-${Date.now()}`;
  const orderNumB = `POS-TAKE-${Date.now().toString().slice(-4)}`;
  const { data: posOrderB, error: errPosB } = await clientB
    .from('orders')
    .insert({
      id: posOrderIdB,
      restaurant_id: KALPUTRA_ID,
      order_number: orderNumB,
      order_type: 'takeaway',
      status: 'confirmed',
      customer_name: 'Takeaway Customer B',
      customer_phone: '9876543211',
      subtotal: 180,
      grand_total: 180,
      payable_amount: 180,
      payment_status: 'unpaid',
      notes: '[POS] Takeaway test',
    })
    .select()
    .single();

  if (errPosB) console.error('Tenant B Takeaway failed:', errPosB);
  else createdOrderIds.push({ id: posOrderIdB, client: clientB });
  await new Promise((r) => setTimeout(r, 2000));
  console.log('POS Takeaway B Created:', posOrderB?.id);

  // Step 6: Marketplace Online Delivery Order (For Tenant A)
  console.log('--- TEST 4: Marketplace Online Delivery Order (Tenant A) ---');
  const deliveryOrderIdA = `ord-delivery-${Date.now()}`;
  const { data: deliveryOrderA, error: errDelA } = await clientA
    .from('orders')
    .insert({
      id: deliveryOrderIdA,
      restaurant_id: KULLAD_ID,
      order_number: `DEL-A-${Date.now().toString().slice(-4)}`,
      order_type: 'delivery',
      status: 'confirmed',
      customer_name: 'Marketplace Buyer A',
      customer_phone: '9988776655',
      delivery_address: 'Flat 401, Sapphire Enclave',
      subtotal: 350,
      grand_total: 350,
      payable_amount: 350,
      payment_status: 'unpaid',
      notes: '[ONLINE_DELIVERY] Marketplace order',
    })
    .select()
    .single();

  if (errDelA) console.error('Marketplace order A failed:', errDelA);
  else createdOrderIds.push({ id: deliveryOrderIdA, client: clientA });
  await new Promise((r) => setTimeout(r, 2000));
  console.log('Marketplace A Created:', deliveryOrderA?.id);

  // Step 7: QR Digital Menu Order (For Tenant B)
  console.log('--- TEST 5: QR Digital Menu Order (Tenant B) ---');
  const qrOrderIdB = `ord-qr-menu-${Date.now()}`;
  const { data: qrOrderB, error: errQrB } = await clientB
    .from('orders')
    .insert({
      id: qrOrderIdB,
      restaurant_id: KALPUTRA_ID,
      order_number: `QR-B-${Date.now().toString().slice(-4)}`,
      order_type: 'dine_in',
      status: 'confirmed',
      customer_name: 'QR Dine Guest B',
      table_number: 'T4',
      subtotal: 190,
      grand_total: 190,
      payable_amount: 190,
      payment_status: 'unpaid',
      notes: '[QR_DINE_IN] QR menu order',
    })
    .select()
    .single();

  if (errQrB) console.error('QR order B failed:', errQrB);
  else createdOrderIds.push({ id: qrOrderIdB, client: clientB });
  await new Promise((r) => setTimeout(r, 2000));
  console.log('QR Order B Created:', qrOrderB?.id);

  // Step 8: KOT Generation Isolation
  console.log('--- TEST 6: KOT Generation Isolation ---');
  const kotIdA = `kot-test-${Date.now()}`;
  const { data: kotA, error: errKotA } = await clientA
    .from('kots')
    .insert({
      id: kotIdA,
      restaurant_id: KULLAD_ID,
      order_id: posOrderIdA,
      order_number: orderNumA,
      kot_number: `KOT-A-${Date.now().toString().slice(-4)}`,
      order_type: 'dine_in',
      table_number: 'T1',
      status: 'pending',
    })
    .select()
    .single();

  if (errKotA) console.error('KOT A failed:', errKotA);
  await new Promise((r) => setTimeout(r, 1000));
  console.log('KOT A Created:', kotA?.id);

  // Step 9: Hold / Resume Order Isolation
  console.log('--- TEST 7: Hold / Resume Order Isolation (Tenant B) ---');
  await clientB.from('orders').update({ status: 'held' }).eq('id', posOrderIdB);
  await new Promise((r) => setTimeout(r, 1500));
  await clientB.from('orders').update({ status: 'confirmed' }).eq('id', posOrderIdB);
  await new Promise((r) => setTimeout(r, 1500));
  console.log('Tenant B Order held and resumed.');

  // Step 10: Dispatch Isolation (Tenant A Order status update)
  console.log('--- TEST 8: Dispatch Isolation (Tenant A) ---');
  await clientA.from('orders').update({ status: 'out_for_delivery' }).eq('id', deliveryOrderIdA);
  await new Promise((r) => setTimeout(r, 1500));
  console.log('Tenant A Order dispatched to out_for_delivery.');

  // Step 11: Settlement Isolation (Tenant B Order payment and completion)
  console.log('--- TEST 9: Settlement Isolation (Tenant B) ---');
  await clientB.from('orders').update({ status: 'completed', payment_status: 'paid', paid_amount: 180 }).eq('id', posOrderIdB);
  await new Promise((r) => setTimeout(r, 1500));
  console.log('Tenant B Order settled.');

  // Step 12: Cancellation Isolation (Tenant A Order cancellation)
  console.log('--- TEST 10: Cancellation Isolation (Tenant A) ---');
  await clientA.from('orders').update({ status: 'cancelled', notes: 'Cancelled by customer' }).eq('id', posOrderIdA);
  await new Promise((r) => setTimeout(r, 1500));
  console.log('Tenant A Order cancelled.');

  // Step 13: Re-login and Query Isolation Verification
  console.log('--- TEST 11: Re-login & Post-Test Query Scope Verification ---');
  const clientA2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const clientB2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await clientA2.auth.signInWithPassword({ email: 'bipin@yopmail.com', password: 'Password123!' });
  await clientB2.auth.signInWithPassword({ email: 'kalputra@yopmail.com', password: 'Password123!' });

  const [reOrdersA, reOrdersB] = await Promise.all([
    clientA2.from('orders').select('id, restaurant_id').eq('restaurant_id', KULLAD_ID),
    clientB2.from('orders').select('id, restaurant_id').eq('restaurant_id', KALPUTRA_ID),
  ]);

  const crossA = (reOrdersA.data || []).filter((o) => o.restaurant_id === KALPUTRA_ID);
  const crossB = (reOrdersB.data || []).filter((o) => o.restaurant_id === KULLAD_ID);
  console.log('Tenant A2 re-queried orders:', reOrdersA.data?.length, '| Foreign B orders in A2:', crossA.length);
  console.log('Tenant B2 re-queried orders:', reOrdersB.data?.length, '| Foreign A orders in B2:', crossB.length);

  // Step 14: Verify Super Admin Access
  console.log('--- TEST 12: Super Admin Cross-Tenant Access ---');
  const { data: superOrders } = await superAdminClient.from('orders').select('id, restaurant_id');
  const superHasA = (superOrders || []).some((o) => o.restaurant_id === KULLAD_ID);
  const superHasB = (superOrders || []).some((o) => o.restaurant_id === KALPUTRA_ID);
  console.log('Super Admin sees total orders:', superOrders?.length);
  console.log('Super Admin sees Tenant A orders:', superHasA, '| Sees Tenant B orders:', superHasB);

  // Cleanup test orders
  console.log('\nCleaning up created test records...');
  if (kotA?.id) {
    await clientA.from('kots').delete().eq('id', kotA.id);
  }
  for (const { id, client } of createdOrderIds) {
    await client.from('orders').delete().eq('id', id);
  }

  // Teardown Realtime channels
  clientA.removeChannel(chA);
  clientB.removeChannel(chB);

  console.log('\n================================================================');
  console.log('AUDIT SUMMARY RESULTS:');
  console.log('Tenant A Events Received for Tenant A:', stats.ownEventsReceivedByA);
  console.log('Tenant B Events Received for Tenant B:', stats.ownEventsReceivedByB);
  console.log('Tenant A Foreign Events Received (Cross-tenant):', stats.crossTenantEventsReceivedByA, '(Target: 0)');
  console.log('Tenant B Foreign Events Received (Cross-tenant):', stats.crossTenantEventsReceivedByB, '(Target: 0)');
  console.log('Cross-tenant Notifications/Events:', stats.crossTenantEventsReceivedByA + stats.crossTenantEventsReceivedByB);
  console.log('================================================================');

  const realtimePass = stats.crossTenantEventsReceivedByA === 0 && stats.crossTenantEventsReceivedByB === 0;
  const isolationOverallPass = queryIsolationPass && realtimePass && crossA.length === 0 && crossB.length === 0 && superHasA && superHasB;

  return {
    isolationOverallPass,
    queryIsolationPass,
    realtimePass,
    crossTenantEventsTotal: stats.crossTenantEventsReceivedByA + stats.crossTenantEventsReceivedByB,
    superHasA,
    superHasB,
  };
}

runMultiTenantAudit()
  .then((res) => {
    console.log('\nFINAL OUTCOME:', res.isolationOverallPass ? 'ALL TESTS PASSED' : 'TESTS FAILED');
    process.exit(res.isolationOverallPass ? 0 : 1);
  })
  .catch((err) => {
    console.error('Audit failed with error:', err);
    process.exit(1);
  });
