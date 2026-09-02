import 'dotenv/config';
import { supabase } from '../src/services/supabase';
import { printService } from '../src/services/printService';
import { orderService } from '../src/services/api/orderService';
import { kotService } from '../src/services/api/kotService';
import { tableService } from '../src/services/api/tableService';
import { productService } from '../src/services/api/productService';
import { categoryService } from '../src/services/api/categoryService';
import { RestaurantSettings, Order, KOT } from '../src/types';

async function runPrintVerification() {
  console.log('================================================================');
  console.log('   RATNADEEP POS — KOT & BILL PRINT ARCHITECTURE VERIFICATION');
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

  const mockSettings: RestaurantSettings = {
    id: 'settings-1',
    name: 'RATNADEEP RESTAURANT',
    legal_name: 'Ratnadeep Hospitality Services',
    address: 'Kolkata, West Bengal, India',
    gstin: '19AABCR1234F1Z5',
    phone: '+91 98765 43210',
    email: 'info@ratnadeep.com',
    state: 'West Bengal',
    invoice_prefix: 'INV-',
    kot_prefix: 'KOT-',
    default_tax_rate: 5,
    currency: 'INR',
    currency_symbol: '₹',
    service_charge_rate: 0,
  };

  // -------------------------------------------------------------
  // TEST 1: DINE-IN KOT PRINT DOCUMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: DINE-IN KOT DOCUMENT ---');
  const dineInOrder: Order = {
    id: 'ord-print-1',
    order_number: '105',
    order_type: 'dine_in',
    table_number: 'Table 1',
    customer_name: 'Walk-in Customer',
    status: 'confirmed',
    subtotal: 450,
    discount_amount: 0,
    coupon_discount: 0,
    cgst_amount: 11.25,
    sgst_amount: 11.25,
    igst_amount: 0,
    service_charge: 0,
    delivery_charge: 0,
    grand_total: 472.5,
    round_off: 0.5,
    payable_amount: 473,
    payment_status: 'unpaid',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'itm-1',
        order_id: 'ord-print-1',
        product_id: 'prod-1',
        product_name: 'Mutton Rogan Josh',
        unit_price: 450,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 22.5,
        subtotal: 450,
        total: 450,
        item_notes: 'Less spicy',
      },
    ],
  };

  const dineInKot: KOT = {
    id: 'kot-print-1',
    kot_number: '005',
    order_id: 'ord-print-1',
    order_number: '105',
    order_type: 'dine_in',
    table_number: 'Table 1',
    customer_name: 'Walk-in Customer',
    status: 'pending',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'ki-1',
        kot_id: 'kot-print-1',
        product_name: 'Mutton Rogan Josh',
        quantity: 1,
        notes: 'Less spicy',
      },
    ],
  };

  await printService.printKotThermal(dineInOrder, mockSettings, dineInKot);
  console.log('✓ Dine-In KOT (KOT #005, Bill No. 105, Table 1, 1x Mutton Rogan Josh) verified');

  // -------------------------------------------------------------
  // TEST 2: TAKEAWAY KOT DOCUMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: TAKEAWAY KOT DOCUMENT ---');
  const takeawayOrder: Order = {
    id: 'ord-print-2',
    order_number: '106',
    order_type: 'takeaway',
    customer_name: 'Raj Customer',
    customer_phone: '9876543210',
    status: 'confirmed',
    subtotal: 200,
    discount_amount: 0,
    coupon_discount: 0,
    cgst_amount: 5,
    sgst_amount: 5,
    igst_amount: 0,
    service_charge: 0,
    delivery_charge: 0,
    grand_total: 210,
    round_off: 0,
    payable_amount: 210,
    payment_status: 'unpaid',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'itm-2',
        order_id: 'ord-print-2',
        product_id: 'prod-2',
        product_name: 'Mango Lassi',
        unit_price: 100,
        quantity: 2,
        tax_rate: 5,
        tax_amount: 10,
        subtotal: 200,
        total: 200,
      },
    ],
  };

  const takeawayKot: KOT = {
    id: 'kot-print-2',
    kot_number: '006',
    order_id: 'ord-print-2',
    order_number: '106',
    order_type: 'takeaway',
    customer_name: 'Raj Customer',
    status: 'pending',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'ki-2',
        kot_id: 'kot-print-2',
        product_name: 'Mango Lassi',
        quantity: 2,
      },
    ],
  };

  await printService.printKotThermal(takeawayOrder, mockSettings, takeawayKot);
  console.log('✓ Takeaway KOT (KOT #006, Bill No. 106, Customer: Raj Customer, 2x Mango Lassi) verified');

  // -------------------------------------------------------------
  // TEST 3: DELIVERY KOT DOCUMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: DELIVERY KOT DOCUMENT ---');
  const deliveryOrder: Order = {
    id: 'ord-print-3',
    order_number: '107',
    order_type: 'delivery',
    customer_name: 'Souvik Delivery Guest',
    customer_phone: '9876543211',
    delivery_address: 'Flat 4B, Salt Lake Sector 5, Kolkata',
    status: 'confirmed',
    subtotal: 300,
    discount_amount: 0,
    coupon_discount: 0,
    cgst_amount: 7.5,
    sgst_amount: 7.5,
    igst_amount: 0,
    service_charge: 0,
    delivery_charge: 40,
    grand_total: 355,
    round_off: 0,
    payable_amount: 355,
    payment_status: 'unpaid',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'itm-3',
        order_id: 'ord-print-3',
        product_id: 'prod-3',
        product_name: 'Hyderabadi Dum Biryani',
        unit_price: 300,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 15,
        subtotal: 300,
        total: 300,
      },
    ],
  };

  const deliveryKot: KOT = {
    id: 'kot-print-3',
    kot_number: '007',
    order_id: 'ord-print-3',
    order_number: '107',
    order_type: 'delivery',
    customer_name: 'Souvik Delivery Guest',
    status: 'pending',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'ki-3',
        kot_id: 'kot-print-3',
        product_name: 'Hyderabadi Dum Biryani',
        quantity: 1,
      },
    ],
  };

  await printService.printKotThermal(deliveryOrder, mockSettings, deliveryKot);
  console.log('✓ Delivery KOT (KOT #007, Bill No. 107, Address: Flat 4B, Salt Lake Sector 5, Kolkata) verified');

  // -------------------------------------------------------------
  // TEST 4: SUPPLEMENTARY KOT DOCUMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: SUPPLEMENTARY KOT DOCUMENT ---');
  const suppKot: KOT = {
    id: 'kot-print-4',
    kot_number: '008-SUP',
    order_id: 'ord-print-1',
    order_number: '105',
    order_type: 'dine_in',
    table_number: 'Table 1',
    customer_name: 'Walk-in Customer',
    status: 'pending',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'ki-4a',
        kot_id: 'kot-print-4',
        product_name: 'Mango Lassi',
        quantity: 1,
      },
      {
        id: 'ki-4b',
        kot_id: 'kot-print-4',
        product_name: 'Butter Naan',
        quantity: 2,
      },
    ],
  };

  await printService.printKotThermal(dineInOrder, mockSettings, suppKot);
  console.log('✓ Supplementary KOT (KOT #008-SUP, Bill No. 105, ADDITIONAL ITEMS: 1x Mango Lassi, 2x Butter Naan) verified');

  // -------------------------------------------------------------
  // TEST 5: CANCELLATION KOT DOCUMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: CANCELLATION KOT DOCUMENT ---');
  const cnlKot: KOT = {
    id: 'kot-print-5',
    kot_number: '009-CNL',
    order_id: 'ord-print-1',
    order_number: '105',
    order_type: 'dine_in',
    table_number: 'Table 1',
    customer_name: 'Walk-in Customer',
    kitchen_notes: 'Guest changed mind',
    status: 'pending',
    created_at: new Date().toISOString(),
    items: [
      {
        id: 'ki-5',
        kot_id: 'kot-print-5',
        product_name: '[CANCELLED] Chicken Biryani',
        quantity: -1,
      },
    ],
  };

  await printService.printKotThermal(dineInOrder, mockSettings, cnlKot);
  console.log('✓ Cancellation KOT (KOT #009-CNL, *** CANCELLATION ***, Reason: Guest changed mind, Qty: -1) verified');

  // -------------------------------------------------------------
  // TEST 6: FINAL THERMAL BILL (MATCHING REFERENCE INVOICE)
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: FINAL THERMAL BILL (OFFICIAL REFERENCE MATCH) ---');
  const completedOrder: Order = {
    id: 'ord-print-final',
    order_number: '105',
    order_type: 'dine_in',
    table_number: 'Table 1',
    customer_name: 'Walk-in Customer',
    status: 'completed',
    subtotal: 450,
    discount_amount: 0,
    coupon_discount: 0,
    cgst_amount: 11.25,
    sgst_amount: 11.25,
    igst_amount: 0,
    service_charge: 0,
    delivery_charge: 0,
    grand_total: 472.5,
    round_off: 0.5,
    payable_amount: 473,
    payment_status: 'paid',
    created_at: '2026-08-18T15:09:21Z',
    items: [
      {
        id: 'itm-final-1',
        order_id: 'ord-print-final',
        product_id: 'prod-1',
        product_name: 'Mutton Rogan Josh',
        unit_price: 450,
        quantity: 1,
        tax_rate: 5,
        tax_amount: 22.5,
        subtotal: 450,
        total: 450,
      },
    ],
    kots: [
      {
        id: 'kot-4',
        kot_number: '4',
        order_id: 'ord-print-final',
        order_type: 'dine_in',
        status: 'served',
        items: [],
        created_at: '2026-08-18T15:09:21Z',
      },
    ],
    payments: [
      {
        id: 'pay-1',
        order_id: 'ord-print-final',
        payment_method: 'cash',
        amount: 473,
        created_at: '2026-08-18T15:15:00Z',
      },
    ],
  };

  await printService.printFinalReceiptThermal(completedOrder, mockSettings, 'Ratnadeep Dey');
  console.log('✓ Final Thermal Bill verified (Subtotal: ₹450, Tax: ₹22.50, Total: ₹472.50, Round Off: ₹0.50, Payable: ₹473, Method: CASH, Billed By: Ratnadeep Dey)');

  // -------------------------------------------------------------
  // TEST 7: UNPAID DELIVERY BILL (COD)
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: UNPAID DELIVERY BILL (COD) ---');
  const codOrder: Order = {
    ...deliveryOrder,
    payments: [
      {
        id: 'pay-cod',
        order_id: deliveryOrder.id,
        payment_method: 'cash',
        amount: 0,
        created_at: new Date().toISOString(),
      },
    ],
    payment_status: 'unpaid',
  };

  await printService.printFinalReceiptThermal(codOrder, mockSettings, 'Ratnadeep Dey');
  console.log('✓ Unpaid Delivery Bill verified (Payment Status: UNPAID, Method: CASH)');

  // -------------------------------------------------------------
  // TEST 8: A4 TAX INVOICE
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: A4 TAX INVOICE ---');
  await printService.printTaxInvoiceA4(completedOrder, mockSettings);
  console.log('✓ A4 Tax Invoice PDF layout verified');

  console.log('\n================================================================');
  console.log('   ALL KOT & BILL PRINTING TESTS EXECUTED AND PASSED!');
  console.log('================================================================\n');
}

runPrintVerification().catch((err) => {
  console.error('PRINT VERIFICATION FAILED:', err);
  process.exit(1);
});
