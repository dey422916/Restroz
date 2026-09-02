import 'dotenv/config';
import { supabase } from '../src/services/supabase';
import { tableService } from '../src/services/api/tableService';
import { productService } from '../src/services/api/productService';
import { categoryService } from '../src/services/api/categoryService';
import { orderService } from '../src/services/api/orderService';
import { kotService } from '../src/services/api/kotService';
import { auditService } from '../src/services/api/auditService';
import { numberToWords } from '../src/utils/currency';

async function runPart2LiveVerification() {
  console.log('================================================================');
  console.log('   RATNADEEP POS — PART 2 LIVE VERIFICATION SUITE');
  console.log('   (Dine-In, Takeaway, Delivery, KOT, Edit, Cancel, Bill, Settle)');
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

  // -------------------------------------------------------------
  // SETUP TEST DATA: Category, Products, Table
  // -------------------------------------------------------------
  console.log('\n--- SETUP TEST MASTER DATA ---');
  const uid = Date.now().toString().slice(-4);
  const cat = await categoryService.saveCategory({
    name: `Part 2 Gourmet Category ${uid}`,
    slug: `part-2-gourmet-cat-${uid}`,
    display_order: 99,
    is_active: true,
  });

  const prodA = await productService.saveProduct({
    name: `Hyderabadi Dum Biryani P2 ${uid}`,
    sku: `P2-BIR-${uid}`,
    category_id: cat.id,
    price: 300,
    stock_quantity: 20,
    food_type: 'non-veg',
    unit: 'portion',
  });

  const prodB = await productService.saveProduct({
    name: `Mango Lassi P2 ${uid}`,
    sku: `P2-LAS-${uid}`,
    category_id: cat.id,
    price: 100,
    stock_quantity: 20,
    food_type: 'veg',
    unit: 'glass',
  });

  const table20 = await tableService.saveTable({
    table_number: `Table 20-P2-${uid}`,
    section: 'Ground Floor',
    seating_capacity: 6,
    is_active: true,
  });
  console.log(`✓ Master data created: Table "${table20.table_number}" (ID: ${table20.id}), Products: "${prodA.name}" (Stock: 20), "${prodB.name}" (Stock: 20)`);

  // -------------------------------------------------------------
  // TEST 1: DINE-IN COMPLETE LIFECYCLE
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: DINE-IN LIFECYCLE (ORDER -> KOT -> EDIT -> CLOSE -> SETTLE -> RELEASE) ---');
  
  // 1a. Create Dine-In Order with 2x Biryani (Qty: 2)
  const dineInOrder = await orderService.createOrder({
    order_type: 'dine_in',
    table_id: table20.id,
    table_number: table20.table_number,
    customer_name: 'Mr. Roy',
    items: [
      {
        id: 'itm-1',
        order_id: '',
        product_id: prodA.id,
        product_name: prodA.name,
        unit_price: 300,
        quantity: 2,
        tax_rate: 5,
        tax_amount: 30,
        subtotal: 600,
        total: 600,
      },
    ],
    subtotal: 600,
    cgst_amount: 15,
    sgst_amount: 15,
    grand_total: 630,
    payable_amount: 630,
    payment_status: 'unpaid',
  });
  console.log(`✓ Dine-In Order created: #${dineInOrder.order_number} (Status: ${dineInOrder.status}, Payment: ${dineInOrder.payment_status})`);

  // Verify Table 20 is OCCUPIED
  const { data: tblOccupied } = await supabase.from('tables').select('status').eq('id', table20.id).single();
  console.log(`✓ Table 20 status in DB: "${tblOccupied?.status}" (Expected: occupied)`);
  if (tblOccupied?.status !== 'occupied') throw new Error('Table was not occupied upon Dine-in order creation.');

  // Verify initial stock deducted (20 - 2 = 18)
  const { data: stockA1 } = await supabase.from('products').select('stock_quantity').eq('id', prodA.id).single();
  console.log(`✓ Stock for Biryani after initial order: ${stockA1?.stock_quantity} (Expected: 18)`);
  if (stockA1?.stock_quantity !== 18) throw new Error('Initial stock deduction failed.');

  // 1b. Kitchen Status Progression
  const activeKots = await kotService.getKots();
  const orderKot = activeKots.find((k) => k.order_id === dineInOrder.id);
  if (!orderKot) throw new Error('Initial KOT not found.');
  console.log(`✓ Initial KOT found: #${orderKot.kot_number}`);

  // Kitchen marks Cooking (in_progress)
  await kotService.updateKotStatus(orderKot.id, 'in_progress');
  const { data: ordPreparing } = await supabase.from('orders').select('status').eq('id', dineInOrder.id).single();
  console.log(`✓ Order status synced to kitchen "in_progress": "${ordPreparing?.status}" (Expected: preparing)`);
  if (ordPreparing?.status !== 'preparing') throw new Error('Order status failed to sync with KOT.');

  // Kitchen marks Ready
  await kotService.updateKotStatus(orderKot.id, 'ready');
  const { data: ordReady } = await supabase.from('orders').select('status').eq('id', dineInOrder.id).single();
  console.log(`✓ Order status synced to kitchen "ready": "${ordReady?.status}" (Expected: ready)`);
  if (ordReady?.status !== 'ready') throw new Error('Order status failed to sync with KOT.');

  // 1c. Edit Active Order: Add 1x Mango Lassi & Reduce 1x Biryani
  console.log('\n--- 1c. EDITING ACTIVE ORDER (ADD 1x Mango Lassi, REDUCE 1x Biryani) ---');
  const updatedDineIn = await orderService.editActiveOrder({
    orderId: dineInOrder.id,
    updatedItems: [
      {
        id: 'itm-1',
        order_id: dineInOrder.id,
        product_id: prodA.id,
        product_name: prodA.name,
        unit_price: 300,
        quantity: 1, // reduced from 2 to 1
        tax_rate: 5,
        tax_amount: 15,
        subtotal: 300,
        total: 300,
      },
      {
        id: 'itm-2',
        order_id: dineInOrder.id,
        product_id: prodB.id,
        product_name: prodB.name,
        unit_price: 100,
        quantity: 1, // added 1x Mango Lassi
        tax_rate: 5,
        tax_amount: 5,
        subtotal: 100,
        total: 100,
      },
    ],
    reason: 'Guest reduced 1 Biryani and added 1 Mango Lassi',
  });
  console.log(`✓ Order #${updatedDineIn.order_number} edited. New Payable Amount: ₹${updatedDineIn.payable_amount}`);

  // Verify Supplementary KOT & Cancellation Ticket generated
  const allKotsAfterEdit = await kotService.getKots();
  const suppKot = allKotsAfterEdit.find((k) => k.order_id === dineInOrder.id && k.kot_number.includes('-SUP'));
  const cnlTicket = allKotsAfterEdit.find((k) => k.order_id === dineInOrder.id && k.kot_number.includes('-CNL'));
  console.log(`✓ Supplementary KOT created: ${suppKot ? suppKot.kot_number : 'NONE'} (Expected: Present)`);
  console.log(`✓ Kitchen Cancellation Ticket created: ${cnlTicket ? cnlTicket.kot_number : 'NONE'} (Expected: Present)`);
  if (!suppKot || !cnlTicket) throw new Error('Supplementary KOT or Cancellation Ticket was not created upon edit.');

  // Verify stock reconciliation:
  // Biryani: was 18, restored 1 -> 19
  // Mango Lassi: was 20, deducted 1 -> 19
  const { data: stockA2 } = await supabase.from('products').select('stock_quantity').eq('id', prodA.id).single();
  const { data: stockB1 } = await supabase.from('products').select('stock_quantity').eq('id', prodB.id).single();
  console.log(`✓ Stock Biryani after edit: ${stockA2?.stock_quantity} (Expected: 19)`);
  console.log(`✓ Stock Mango Lassi after edit: ${stockB1?.stock_quantity} (Expected: 19)`);
  if (stockA2?.stock_quantity !== 19 || stockB1?.stock_quantity !== 19) {
    throw new Error('Stock reconciliation after order edit failed.');
  }

  // 1d. Close & Settle Order (CASH Payment)
  console.log('\n--- 1d. CLOSE ORDER & SETTLE PAYMENT ---');
  const settledDineIn = await orderService.closeAndPayOrder({
    orderId: dineInOrder.id,
    paymentMethod: 'cash',
    paymentReceived: true,
  });
  console.log(`✓ Order #${settledDineIn.order_number} closed: Status = "${settledDineIn.status}", Payment Status = "${settledDineIn.payment_status}", Paid Amount = ₹${settledDineIn.paid_amount}`);
  if (settledDineIn.status !== 'completed' || settledDineIn.payment_status !== 'paid') {
    throw new Error('Order close and pay failed to complete/mark paid.');
  }

  // Verify Table 20 released back to AVAILABLE
  const { data: tblReleased } = await supabase.from('tables').select('status').eq('id', table20.id).single();
  console.log(`✓ Table 20 status in DB after completion: "${tblReleased?.status}" (Expected: available)`);
  if (tblReleased?.status !== 'available') throw new Error('Table was not released back to available after completion.');

  // Verify Completed Order is locked from edits
  let editCompletedBlocked = false;
  try {
    await orderService.editActiveOrder({
      orderId: dineInOrder.id,
      updatedItems: [],
    });
  } catch (e: any) {
    editCompletedBlocked = true;
    console.log(`✓ Edit on completed order correctly locked: "${e.message}"`);
  }
  if (!editCompletedBlocked) throw new Error('Completed order was not locked from editing!');

  // -------------------------------------------------------------
  // TEST 2: TAKEAWAY FLOW (ONLINE UPI PAYMENT)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: TAKEAWAY FLOW (ONLINE PAYMENT) ---');
  const takeawayOrder = await orderService.createOrder({
    order_type: 'takeaway',
    customer_name: 'Raj Customer',
    customer_phone: '9876543210',
    items: [
      {
        id: 'itm-t1',
        order_id: '',
        product_id: prodB.id,
        product_name: prodB.name,
        unit_price: 100,
        quantity: 2,
        tax_rate: 5,
        tax_amount: 10,
        subtotal: 200,
        total: 200,
      },
    ],
    payable_amount: 210,
    payment_status: 'unpaid',
  });
  console.log(`✓ Takeaway Order created: #${takeawayOrder.order_number} (Customer: ${takeawayOrder.customer_name})`);

  // Close & Pay with UPI
  const settledTakeaway = await orderService.closeAndPayOrder({
    orderId: takeawayOrder.id,
    paymentMethod: 'upi',
    paymentReceived: true,
    transactionReference: 'UPI-9876543210-REF',
  });
  console.log(`✓ Takeaway settled via UPI: Status = "${settledTakeaway.status}", Payment = "${settledTakeaway.payment_status}"`);
  if (settledTakeaway.payment_status !== 'paid') throw new Error('Takeaway payment recording failed.');

  // -------------------------------------------------------------
  // TEST 3: DELIVERY FLOW (COD UNPAID BEHAVIOR)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: DELIVERY FLOW (COD / UNPAID BILLING) ---');
  const deliveryOrder = await orderService.createOrder({
    order_type: 'delivery',
    customer_name: 'Souvik Delivery Guest',
    customer_phone: '9876543211',
    delivery_address: 'Flat 4B, Salt Lake Sector 5, Kolkata',
    delivery_landmark: 'Near Webel More',
    delivery_charge: 40,
    items: [
      {
        id: 'itm-d1',
        order_id: '',
        product_id: prodA.id,
        product_name: prodA.name,
        unit_price: 300,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 15,
        subtotal: 300,
        total: 300,
      },
    ],
    payable_amount: 355,
    payment_status: 'unpaid',
  });
  console.log(`✓ Delivery Order created: #${deliveryOrder.order_number} (Address: ${deliveryOrder.delivery_address})`);

  // Close Order as COD (Payment Received = NO)
  const settledDelivery = await orderService.closeAndPayOrder({
    orderId: deliveryOrder.id,
    paymentMethod: 'cash',
    paymentReceived: false, // COD UNPAID
  });
  console.log(`✓ Delivery closed as COD: Status = "${settledDelivery.status}", Payment Status = "${settledDelivery.payment_status}" (Expected: unpaid)`);
  if (settledDelivery.payment_status !== 'unpaid') {
    throw new Error('COD Delivery order was incorrectly marked as paid!');
  }

  // -------------------------------------------------------------
  // TEST 4: CANCELLATION FLOW, STOCK RESTORATION & TABLE RELEASE
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: ORDER CANCELLATION, STOCK RESTORATION & AUDIT ---');
  
  // Stock of Biryani before cancel test
  const { data: stockBeforeCancel } = await supabase.from('products').select('stock_quantity').eq('id', prodA.id).single();
  const initialStockCancelTest = stockBeforeCancel?.stock_quantity || 0;

  // Place a new active Dine-In order with 3x Biryani
  const cancelTestOrder = await orderService.createOrder({
    order_type: 'dine_in',
    table_id: table20.id,
    table_number: table20.table_number,
    customer_name: 'Cancel Test Guest',
    items: [
      {
        id: 'itm-c1',
        order_id: '',
        product_id: prodA.id,
        product_name: prodA.name,
        unit_price: 300,
        quantity: 3,
        tax_rate: 5,
        tax_amount: 45,
        subtotal: 900,
        total: 900,
      },
    ],
    payable_amount: 945,
    payment_status: 'unpaid',
  });
  console.log(`✓ Placed order to cancel: #${cancelTestOrder.order_number} (3x "${prodA.name}")`);

  // Verify stock was deducted by 3
  const { data: stockAfterOrderToCancel } = await supabase.from('products').select('stock_quantity').eq('id', prodA.id).single();
  console.log(`✓ Stock after order: ${stockAfterOrderToCancel?.stock_quantity} (Expected: ${initialStockCancelTest - 3})`);

  // Cancel order with mandatory reason
  const cancelledRes = await orderService.cancelActiveOrder(cancelTestOrder.id, 'Guest had sudden flight emergency');
  console.log(`✓ Order cancelled: #${cancelledRes.order_number}, Status = "${cancelledRes.status}", Notes: "${cancelledRes.notes}"`);

  // Verify stock is RESTORED
  const { data: stockAfterCancelRestored } = await supabase.from('products').select('stock_quantity').eq('id', prodA.id).single();
  console.log(`✓ Stock after cancellation: ${stockAfterCancelRestored?.stock_quantity} (Expected: ${initialStockCancelTest})`);
  if (stockAfterCancelRestored?.stock_quantity !== initialStockCancelTest) {
    throw new Error('Stock was not properly restored upon cancellation.');
  }

  // Verify Table 20 released
  const { data: tblReleasedAfterCancel } = await supabase.from('tables').select('status').eq('id', table20.id).single();
  console.log(`✓ Table 20 released after cancellation: "${tblReleasedAfterCancel?.status}" (Expected: available)`);
  if (tblReleasedAfterCancel?.status !== 'available') {
    throw new Error('Table was not released after order cancellation.');
  }

  // -------------------------------------------------------------
  // TEST 5: AUDIT LOG VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: AUDIT LOG PERSISTENCE ---');
  const recentLogs = await auditService.getLogs(10);
  console.log(`✓ Fetched ${recentLogs.length} recent audit log entries from Supabase:`);
  recentLogs.slice(0, 5).forEach((log) => {
    console.log(`  • [${log.action}] by ${log.user_name} (${new Date(log.created_at || '').toLocaleTimeString()})`);
  });

  // Clean up test records
  console.log('\n--- CLEANING UP TEST MASTER DATA ---');
  const testOrderIds = [dineInOrder.id, takeawayOrder.id, deliveryOrder.id, cancelTestOrder.id];
  await supabase.from('kot_items').delete().in('kot_id', (await supabase.from('kots').select('id').in('order_id', testOrderIds)).data?.map((k) => k.id) || []);
  await supabase.from('kots').delete().in('order_id', testOrderIds);
  await supabase.from('payments').delete().in('order_id', testOrderIds);
  await supabase.from('order_items').delete().in('order_id', testOrderIds);
  await supabase.from('orders').delete().in('id', testOrderIds);

  await supabase.from('products').delete().eq('id', prodA.id);
  await supabase.from('products').delete().eq('id', prodB.id);
  await categoryService.deleteCategory(cat.id);
  await tableService.deleteTable(table20.id);
  console.log('✓ Cleaned up test orders, products, category, and table.');

  console.log('\n================================================================');
  console.log('   ALL PART 2 TESTS EXECUTED AND PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

runPart2LiveVerification().catch((err) => {
  console.error('PART 2 VERIFICATION FAILED:', err);
  process.exit(1);
});
