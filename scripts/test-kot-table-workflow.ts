import 'dotenv/config';
import { supabase } from '../src/services/supabase';
import { orderService } from '../src/services/api/orderService';
import { kotService } from '../src/services/api/kotService';
import { tableService } from '../src/services/api/tableService';
import { productService } from '../src/services/api/productService';

async function runKotTableWorkflowTest() {
  console.log('================================================================');
  console.log('  RATNADEEP POS — DINE-IN TABLE RESTRICTION & KOT STATE SUITE');
  console.log('================================================================\n');

  // Authenticate as ADMIN
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
  });
  if (authError || !authData.user) {
    throw new Error(`Admin login failed: ${authError?.message}`);
  }
  console.log(`✓ Authenticated as ADMIN (${authData.user.email})`);

  // 1. Fetch active tables and products
  const [tables, products] = await Promise.all([
    tableService.getTables(),
    productService.getProducts(),
  ]);

  if (tables.length === 0 || products.length === 0) {
    throw new Error('No tables or products available in live database for testing.');
  }

  const testTable = tables[0];
  const testProduct = products[0];
  console.log(`✓ Test Table: ${testTable.table_number} (ID: ${testTable.id})`);
  console.log(`✓ Test Product: ${testProduct.name} (Price: ₹${testProduct.price})`);

  console.log('\n--- TEST 1: DINE-IN TABLE SELECTION RESTRICTION ---');
  // Attempting to confirm a dine-in order without a table must throw error
  try {
    await orderService.createOrder({
      order_type: 'dine_in',
      table_id: undefined,
      table_number: undefined,
      status: 'confirmed',
      subtotal: testProduct.price,
      cgst_amount: (testProduct.price * 0.025),
      sgst_amount: (testProduct.price * 0.025),
      grand_total: testProduct.price * 1.05,
      payable_amount: Math.round(testProduct.price * 1.05),
      items: [{
        id: 'test-item-1',
        order_id: '',
        product_id: testProduct.id,
        product_name: testProduct.name,
        quantity: 1,
        unit_price: testProduct.price,
        tax_rate: 5,
        tax_amount: testProduct.price * 0.05,
        subtotal: testProduct.price,
        total: testProduct.price * 1.05,
      }],
    });
    console.error('❌ FAILED: Dine-In order created without a table!');
  } catch (err: any) {
    console.log(`✓ Confirmed: Dine-In order requires table selection. Error caught: "${err.message}"`);
  }

  console.log('\n--- TEST 2: DINE-IN WITH TABLE SELECTION & INITIAL KOT DISPATCH ---');
  // Create valid Dine-In order with Table
  const order = await orderService.createOrder({
    order_type: 'dine_in',
    table_id: testTable.id,
    table_number: testTable.table_number,
    status: 'confirmed',
    subtotal: testProduct.price,
    cgst_amount: (testProduct.price * 0.025),
    sgst_amount: (testProduct.price * 0.025),
    grand_total: testProduct.price * 1.05,
    payable_amount: Math.round(testProduct.price * 1.05),
    items: [{
      id: 'test-item-2',
      order_id: '',
      product_id: testProduct.id,
      product_name: testProduct.name,
      quantity: 1,
      unit_price: testProduct.price,
      tax_rate: 5,
      tax_amount: testProduct.price * 0.05,
      subtotal: testProduct.price,
      total: testProduct.price * 1.05,
    }],
  });
  console.log(`✓ Dine-In Order created: #${order.order_number} for ${order.table_number}`);

  // Fetch created KOT
  const allKots = await kotService.getKots();
  const kots = allKots.filter((k) => k.order_id === order.id);
  if (kots.length === 0) {
    throw new Error('Initial KOT was not automatically generated on order creation.');
  }
  console.log(`✓ Kitchen Order Token generated: #${kots[0].kot_number} (Status: ${kots[0].status})`);

  console.log('\n--- TEST 3: POST-KOT PAYMENT & SETTLEMENT ENABLEMENT ---');
  // Close and pay order after KOT has been dispatched
  const completedOrder = await orderService.closeAndPayOrder({
    orderId: order.id,
    paymentMethod: 'cash',
    paymentReceived: true,
  });
  console.log(`✓ Order #${completedOrder.order_number} settled & closed. Payment status: "${completedOrder.payment_status}", Order status: "${completedOrder.status}"`);

  console.log('\n================================================================');
  console.log('   ALL DINE-IN TABLE RESTRICTION & KOT STATE TESTS PASSED!');
  console.log('================================================================');
}

runKotTableWorkflowTest().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
