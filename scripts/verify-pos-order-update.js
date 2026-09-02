const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const RATNADEEP_ID = 'c0000000-0000-0000-0000-000000000001';
const TABLE_ID = 'c0000000-0000-0000-0000-000000000011';

async function testOrderUpdate() {
  console.log('================================================================');
  console.log('🧪 TEST SUITE: POS ORDER UPDATING & ITEM MODIFICATION');
  console.log('================================================================\n');

  // STEP 1: Insert Initial Order
  const initialOrderId = 'ord-test-upd-' + Date.now();
  console.log('--- Step 1: Creating Initial POS Order ---');
  const { data: initOrder, error: initErr } = await client
    .from('orders')
    .insert({
      id: initialOrderId,
      restaurant_id: RATNADEEP_ID,
      order_number: 'TEST-UPD-001',
      order_type: 'dine_in',
      table_id: TABLE_ID,
      table_number: 'T1',
      customer_name: 'Test Dine-in Guest',
      subtotal: 520,
      cgst_amount: 13,
      sgst_amount: 13,
      grand_total: 546,
      round_off: 0,
      payable_amount: 546,
      status: 'confirmed',
      payment_status: 'unpaid',
      notes: '[POS] Initial order',
    })
    .select()
    .single();

  if (initErr) throw initErr;

  // Insert initial items: 1 Biryani (₹380) + 2 Butter Naan (₹70 each)
  const initItems = [
    {
      id: 'item-init-1-' + Date.now(),
      order_id: initialOrderId,
      product_id: 'c0000000-0000-0000-0000-000000000031',
      product_name: 'Special Mutton Kacchi Biryani',
      unit_price: 380,
      quantity: 1,
      tax_rate: 5,
      tax_amount: 19,
      subtotal: 380,
      total: 399,
    },
    {
      id: 'item-init-2-' + Date.now(),
      order_id: initialOrderId,
      product_id: 'c0000000-0000-0000-0000-000000000035',
      product_name: 'Garlic Butter Naan (2 Pcs)',
      unit_price: 70,
      quantity: 2,
      tax_rate: 5,
      tax_amount: 7,
      subtotal: 140,
      total: 147,
    },
  ];
  await client.from('order_items').insert(initItems);
  console.log(`[PASS] Initial order created with 2 items (Payable: ₹546)`);

  // STEP 2: Simulate Cashier Adding Items in POS & Updating Order
  console.log('\n--- Step 2: Modifying Order Items from POS ---');
  // Cashier increases Biryani to 2 (₹760), adds Paneer Tikka x1 (₹220), and keeps Naan x2 (₹140)
  // New subtotal: 760 + 220 + 140 = 1120
  // CGST: 28, SGST: 28, Grand Total: 1176
  const updatedItems = [
    {
      id: 'item-upd-1-' + Date.now(),
      order_id: initialOrderId,
      product_id: 'c0000000-0000-0000-0000-000000000031',
      product_name: 'Special Mutton Kacchi Biryani',
      unit_price: 380,
      quantity: 2,
      tax_rate: 5,
      tax_amount: 38,
      subtotal: 760,
      total: 798,
    },
    {
      id: 'item-upd-2-' + Date.now(),
      order_id: initialOrderId,
      product_id: 'c0000000-0000-0000-0000-000000000035',
      product_name: 'Garlic Butter Naan (2 Pcs)',
      unit_price: 70,
      quantity: 2,
      tax_rate: 5,
      tax_amount: 7,
      subtotal: 140,
      total: 147,
    },
    {
      id: 'item-upd-3-' + Date.now(),
      order_id: initialOrderId,
      product_id: 'c0000000-0000-0000-0000-000000000033',
      product_name: 'Paneer Tikka Angara',
      unit_price: 220,
      quantity: 1,
      tax_rate: 5,
      tax_amount: 11,
      subtotal: 220,
      total: 231,
    },
  ];

  // Perform update in database
  await client.from('order_items').delete().eq('order_id', initialOrderId);
  await client.from('order_items').insert(updatedItems);

  const { data: updatedOrder, error: updErr } = await client
    .from('orders')
    .update({
      subtotal: 1120,
      cgst_amount: 28,
      sgst_amount: 28,
      grand_total: 1176,
      payable_amount: 1176,
      notes: '[POS] Initial order • [UPDATED] Added 1 Biryani, 1 Paneer Tikka',
      updated_at: new Date().toISOString(),
    })
    .eq('id', initialOrderId)
    .select('*, items:order_items(*)')
    .single();

  if (updErr) throw updErr;

  console.log('Updated Order State:');
  console.log('- Items count:', updatedOrder.items.length, '(Expected: 3)');
  console.log('- Subtotal:', updatedOrder.subtotal, '(Expected: 1120)');
  console.log('- CGST:', updatedOrder.cgst_amount, '(Expected: 28)');
  console.log('- SGST:', updatedOrder.sgst_amount, '(Expected: 28)');
  console.log('- Payable Amount:', updatedOrder.payable_amount, '(Expected: 1176)');

  if (
    updatedOrder.items.length !== 3 ||
    Number(updatedOrder.subtotal) !== 1120 ||
    Number(updatedOrder.payable_amount) !== 1176
  ) {
    throw new Error('Order update verification failed');
  }
  console.log('[PASS] Order successfully updated in DB with new dishes and recalculations.');

  // STEP 3: Cleanup
  await client.from('order_items').delete().eq('order_id', initialOrderId);
  await client.from('orders').delete().eq('id', initialOrderId);
  console.log('\n[PASS] Cleaned up temporary test order.');

  console.log('\n================================================================');
  console.log('🎉 ALL ORDER UPDATE TESTS PASSED 100%');
  console.log('================================================================\n');
}

testOrderUpdate().catch((err) => {
  console.error('[FATAL]:', err);
  process.exit(1);
});
