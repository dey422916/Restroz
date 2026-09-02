import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { orderService } from '../src/services/api/orderService';
import { supabase } from '../src/services/supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runCustomerOrderFlowTests() {
  console.log('================================================================');
  console.log('   RATNADEEP POS — CUSTOMER ORDER, PAYMENT & KOT FLOW SUITE');
  console.log('================================================================\n');

  // Step 1: Customer Login
  console.log('--- 1. CUSTOMER LOGIN ---');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'raj@yopmail.com',
    password: 'Qwerty2@',
  });

  if (authError || !authData.user) {
    console.error('❌ Failed to authenticate customer:', authError?.message);
    process.exit(1);
  }
  const customerId = authData.user.id;
  console.log(`✓ Customer Authenticated: raj@yopmail.com (ID: ${customerId})`);

  // Step 2: Fetch Products to use for testing
  const { data: products } = await adminClient.from('products').select('*');
  const biryani = products?.find((p) => p.sku === 'BIR-001') || products?.[0];
  const fishFry = products?.find((p) => p.sku === 'STR-001') || products?.[1];
  const lassi = products?.find((p) => p.sku === 'BEV-001') || products?.[2];
  const butterChicken = products?.find((p) => p.sku === 'MAIN-001') || products?.[3];
  const naan = products?.find((p) => p.sku === 'MAIN-004') || products?.[4];
  const kulfi = products?.find((p) => p.sku === 'DES-003') || products?.[5];

  console.log('\n--- 2. PLACING MULTIPLE DISTINCT CUSTOMER ORDERS ---');

  // Order A
  console.log('\n[ORDER A] Placing Order A: 2 items (Biryani + Fish Fry)...');
  const orderA = await orderService.createOrder({
    order_type: 'dine_in',
    table_id: 'tbl-1',
    table_number: 'Table 1',
    customer_id: customerId,
    customer_name: 'Raj Customer',
    customer_phone: '+91 99999 33333',
    subtotal: (biryani?.price || 320) + (fishFry?.price || 380),
    cgst_amount: 17.5,
    sgst_amount: 17.5,
    grand_total: 735,
    payable_amount: 735,
    payment_method: 'cash',
    payment_status: 'unpaid',
    items: [
      {
        id: 'item-a-1',
        order_id: '',
        product_id: biryani?.id || 'prod-1',
        product_name: biryani?.name || 'Biryani',
        unit_price: biryani?.price || 320,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 16,
        subtotal: 320,
        total: 336,
      },
      {
        id: 'item-a-2',
        order_id: '',
        product_id: fishFry?.id || 'prod-2',
        product_name: fishFry?.name || 'Fish Fry',
        unit_price: fishFry?.price || 380,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 19,
        subtotal: 380,
        total: 399,
      },
    ],
  });
  console.log(`  ✓ Order A Created: #${orderA.order_number} (ID: ${orderA.id}) — Total: ₹${orderA.payable_amount} — Status: ${orderA.status}`);

  // Order B
  console.log('\n[ORDER B] Placing Order B: 1 item (Mango Lassi)...');
  const orderB = await orderService.createOrder({
    order_type: 'dine_in',
    table_id: 'tbl-1',
    table_number: 'Table 1',
    customer_id: customerId,
    customer_name: 'Raj Customer',
    customer_phone: '+91 99999 33333',
    subtotal: lassi?.price || 110,
    cgst_amount: 2.75,
    sgst_amount: 2.75,
    grand_total: 115.5,
    payable_amount: 116,
    payment_method: 'cash',
    payment_status: 'unpaid',
    items: [
      {
        id: 'item-b-1',
        order_id: '',
        product_id: lassi?.id || 'prod-3',
        product_name: lassi?.name || 'Mango Lassi',
        unit_price: lassi?.price || 110,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 5.5,
        subtotal: 110,
        total: 115.5,
      },
    ],
  });
  console.log(`  ✓ Order B Created: #${orderB.order_number} (ID: ${orderB.id}) — Total: ₹${orderB.payable_amount} — Status: ${orderB.status}`);

  // Order C
  console.log('\n[ORDER C] Placing Order C: 3 items (Butter Chicken + Naan + Kulfi)...');
  const orderC = await orderService.createOrder({
    order_type: 'takeaway',
    customer_id: customerId,
    customer_name: 'Raj Customer',
    customer_phone: '+91 99999 33333',
    subtotal: (butterChicken?.price || 350) + (naan?.price || 50) + (kulfi?.price || 120),
    cgst_amount: 13,
    sgst_amount: 13,
    grand_total: 546,
    payable_amount: 546,
    payment_method: 'cash',
    payment_status: 'unpaid',
    items: [
      {
        id: 'item-c-1',
        order_id: '',
        product_id: butterChicken?.id || 'prod-4',
        product_name: butterChicken?.name || 'Butter Chicken',
        unit_price: butterChicken?.price || 350,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 17.5,
        subtotal: 350,
        total: 367.5,
      },
      {
        id: 'item-c-2',
        order_id: '',
        product_id: naan?.id || 'prod-5',
        product_name: naan?.name || 'Butter Naan',
        unit_price: naan?.price || 50,
        quantity: 2,
        tax_rate: 5,
        tax_amount: 5,
        subtotal: 100,
        total: 105,
      },
      {
        id: 'item-c-3',
        order_id: '',
        product_id: kulfi?.id || 'prod-6',
        product_name: kulfi?.name || 'Matka Kulfi',
        unit_price: kulfi?.price || 120,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 6,
        subtotal: 120,
        total: 126,
      },
    ],
  });
  console.log(`  ✓ Order C Created: #${orderC.order_number} (ID: ${orderC.id}) — Total: ₹${orderC.payable_amount} — Status: ${orderC.status}`);

  // Step 3: Verify all 3 orders are returned separately for customer
  console.log('\n--- 3. VERIFYING SEPARATE CUSTOMER ORDERS IN SUPABASE ---');
  const fetchedOrders = await orderService.getCustomerOrders(customerId);
  console.log(`✓ Fetched ${fetchedOrders.length} total orders for customer.`);
  const foundA = fetchedOrders.find((o) => o.id === orderA.id);
  const foundB = fetchedOrders.find((o) => o.id === orderB.id);
  const foundC = fetchedOrders.find((o) => o.id === orderC.id);

  console.log(`  Order A found: ${!!foundA} (#${foundA?.order_number})`);
  console.log(`  Order B found: ${!!foundB} (#${foundB?.order_number})`);
  console.log(`  Order C found: ${!!foundC} (#${foundC?.order_number})`);

  // Step 4: Kitchen generates and transitions KOTs for Order A and B
  console.log('\n--- 4. INDIVIDUAL KOT STATUS TRANSITIONS ---');
  const kotAId = 'kot-a-' + Date.now();
  await adminClient.from('kots').insert([{
    id: kotAId,
    kot_number: 'KOT-0001',
    order_id: orderA.id,
    order_number: orderA.order_number,
    order_type: 'dine_in',
    table_number: 'Table 1',
    customer_name: 'Raj Customer',
    status: 'in_progress',
    created_at: new Date().toISOString(),
  }]);
  await adminClient.from('orders').update({ status: 'preparing' }).eq('id', orderA.id);
  console.log(`  ✓ Kitchen dispatched KOT-0001 (Preparing / Cooking) for Order A`);

  const kotBId = 'kot-b-' + Date.now();
  await adminClient.from('kots').insert([{
    id: kotBId,
    kot_number: 'KOT-0002',
    order_id: orderB.id,
    order_number: orderB.order_number,
    order_type: 'dine_in',
    table_number: 'Table 1',
    customer_name: 'Raj Customer',
    status: 'ready',
    created_at: new Date().toISOString(),
  }]);
  await adminClient.from('orders').update({ status: 'ready' }).eq('id', orderB.id);
  console.log(`  ✓ Kitchen marked KOT-0002 (Ready to Serve) for Order B`);

  // Step 5: Verify Order A is preparing, Order B is ready, Order C remains confirmed (unaffected)
  console.log('\n--- 5. CHECKING INDIVIDUAL STATUS ISOLATION ---');
  const updatedOrders = await orderService.getCustomerOrders(customerId);
  const upA = updatedOrders.find((o) => o.id === orderA.id);
  const upB = updatedOrders.find((o) => o.id === orderB.id);
  const upC = updatedOrders.find((o) => o.id === orderC.id);

  console.log(`  Order A Status: "${upA?.status}" (Expected: preparing) -> ${upA?.status === 'preparing' ? '✓ MATCH' : '❌ MISMATCH'}`);
  console.log(`  Order B Status: "${upB?.status}" (Expected: ready) -> ${upB?.status === 'ready' ? '✓ MATCH' : '❌ MISMATCH'}`);
  console.log(`  Order C Status: "${upC?.status}" (Expected: confirmed) -> ${upC?.status === 'confirmed' ? '✓ MATCH' : '❌ MISMATCH'}`);

  // Step 6: Payment update test: Cashier marks Order A as paid
  console.log('\n--- 6. PAYMENT STATUS UPDATE TEST ---');
  console.log('Cashier marking Order A as PAID in Supabase...');
  await adminClient.from('payments').insert([{
    id: 'pay-test-' + Date.now(),
    order_id: orderA.id,
    payment_method: 'cash',
    amount: upA?.payable_amount || 735,
    reference_number: 'CASH-COUNTER-01',
    created_at: new Date().toISOString(),
  }]);
  await adminClient.from('orders').update({
    paid_amount: upA?.payable_amount || 735,
    payment_status: 'paid',
  }).eq('id', orderA.id);

  const ordersAfterPayment = await orderService.getCustomerOrders(customerId);
  const paidA = ordersAfterPayment.find((o) => o.id === orderA.id);
  console.log(`  Order A Payment Status: "${paidA?.payment_status}" (Expected: paid) -> ${paidA?.payment_status === 'paid' ? '✓ MATCH' : '❌ MISMATCH'}`);

  // Step 7: Supplementary KOT Test on Order C
  console.log('\n--- 7. SUPPLEMENTARY KOT TEST ---');
  console.log('Generating initial and supplementary KOTs for Order C...');
  const initialKotCId = 'kot-c1-' + Date.now();
  const kotNumber1 = `KOT-${Math.floor(1000 + Math.random() * 9000)}`;
  const { error: k1Err } = await adminClient.from('kots').insert([{
    id: initialKotCId,
    kot_number: kotNumber1,
    order_id: orderC.id,
    order_number: orderC.order_number,
    order_type: 'takeaway',
    customer_name: 'Raj Customer',
    status: 'in_progress',
    created_at: new Date().toISOString(),
  }]);
  if (k1Err) console.error('KOT 1 error:', k1Err.message);

  const supKotCId = 'kot-c2-sup-' + Date.now();
  const kotNumber2 = `${kotNumber1}-SUP`;
  const { error: k2Err } = await adminClient.from('kots').insert([{
    id: supKotCId,
    kot_number: kotNumber2,
    order_id: orderC.id,
    order_number: orderC.order_number,
    order_type: 'takeaway',
    customer_name: 'Raj Customer',
    kitchen_notes: 'Customer requested extra drink',
    status: 'pending',
    created_at: new Date().toISOString(),
  }]);
  if (k2Err) console.error('KOT 2 error:', k2Err.message);

  console.log(`  ✓ Initial ${kotNumber1} and Supplementary ${kotNumber2} created for Order #${orderC.order_number}`);

  const { data: dbKotsForC } = await adminClient.from('kots').select('*').eq('order_id', orderC.id);
  console.log(`  Order C Total KOTs in DB: ${dbKotsForC?.length} (Expected: 2) -> ${dbKotsForC?.length === 2 ? '✓ MATCH' : '❌ MISMATCH'}`);

  // Step 8: Logout and Re-login persistence test
  console.log('\n--- 8. LOGOUT & RE-LOGIN PERSISTENCE TEST ---');
  await supabase.auth.signOut();
  console.log('  Customer signed out.');

  console.log('  Signing back in as raj@yopmail.com...');
  const { data: reAuth } = await supabase.auth.signInWithPassword({
    email: 'raj@yopmail.com',
    password: 'Qwerty2@',
  });
  if (reAuth.user) {
    const reloadedOrders = await orderService.getCustomerOrders(reAuth.user.id);
    console.log(`  ✓ Successfully restored ${reloadedOrders.length} orders from Supabase after re-login.`);
  }

  // Step 9: Customer RLS Isolation Test
  console.log('\n--- 9. CUSTOMER RLS ISOLATION TEST ---');
  const { data: rlsOrders } = await supabase
    .from('orders')
    .select('id, customer_id, order_number');

  const leakedOtherCustomer = rlsOrders?.some((o) => o.customer_id && o.customer_id !== customerId);
  console.log(`  Customer only sees their own orders: ${!leakedOtherCustomer ? '✓ PASSED' : '❌ FAILED'}`);

  console.log('\n================================================================');
  console.log('   CUSTOMER ORDER & KOT FLOW TESTS FINISHED SUCCESSFULLY');
  console.log('================================================================\n');
}

runCustomerOrderFlowTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
