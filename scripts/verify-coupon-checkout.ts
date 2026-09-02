import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { calculateOrderTotals, getOrderSubtotal } from '../src/utils/gst';
dotenv.config();

import { supabase } from '../src/services/supabase';

const sbUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const sbAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const sbService = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sbCustomer = supabase;
const sbAdmin = createClient(sbUrl, sbService);

async function runTests() {
  console.log('--- STARTING PRODUCTION VERIFICATION SUITE ---');
  
  // 1. Authenticate Customer Raj
  const { data: authData } = await sbCustomer.auth.signInWithPassword({
    email: 'raj@yopmail.com',
    password: 'Password123!'
  });
  const userId = authData.user!.id;
  const restId = 'a0000000-0000-0000-0000-000000000001';

  // Check product prod-bir-002 initial stock
  const { data: initProd } = await sbAdmin.from('products').select('id, name, price, stock_quantity').eq('id', 'prod-bir-002').single();
  console.log('Initial Product prod-bir-002 stock:', initProd?.stock_quantity);

  // =========================================================================
  // TEST A: No Coupon Order
  // =========================================================================
  console.log('\n--- TEST A: No Coupon Order ---');
  const resA = await sbCustomer.rpc('create_customer_delivery_order', {
    p_restaurant_id: restId,
    p_items: [{ product_id: 'prod-bir-002', quantity: 1, notes: 'Test A' }],
    p_delivery_address: '123 Test Street, Kolkata',
    p_customer_name: 'Raj Customer',
    p_customer_phone: '+91 98888 11111',
    p_payment_method: 'cod',
    p_coupon_code: null,
    p_delivery_notes: 'Test A No Coupon'
  });
  if (resA.error) throw new Error('Test A Error: ' + resA.error.message);
  const orderA = resA.data;
  console.log('Order A Created:', orderA.order_number, 'Subtotal:', orderA.subtotal, 'CpnDisc:', orderA.coupon_discount, 'GrandTotal:', orderA.grand_total, 'Payable:', orderA.payable_amount);
  
  // Verify items
  const { data: itemsA } = await sbAdmin.from('order_items').select('*').eq('order_id', orderA.id);
  console.log('Order A Items in DB:', itemsA?.length);

  // =========================================================================
  // TEST B: Valid Flat Coupon (KULAD30)
  // =========================================================================
  console.log('\n--- TEST B: Valid Flat Coupon Order (KULAD30) ---');
  await sbAdmin.from('coupons').update({ used_count: 0 }).eq('code', 'KULAD30');
  const resB = await sbCustomer.rpc('create_customer_delivery_order', {
    p_restaurant_id: restId,
    p_items: [{ product_id: 'prod-bir-002', quantity: 1, notes: 'Test B' }],
    p_delivery_address: '123 Test Street, Kolkata',
    p_customer_name: 'Raj Customer',
    p_customer_phone: '+91 98888 11111',
    p_payment_method: 'cod',
    p_coupon_code: 'KULAD30',
    p_delivery_notes: 'Test B Flat Coupon'
  });
  if (resB.error) throw new Error('Test B Error: ' + resB.error.message);
  const orderB = resB.data;
  console.log('Order B Created:', orderB.order_number, 'Subtotal:', orderB.subtotal, 'CpnDisc:', orderB.coupon_discount, 'GrandTotal:', orderB.grand_total, 'Payable:', orderB.payable_amount);
  
  const { data: itemsB } = await sbAdmin.from('order_items').select('*').eq('order_id', orderB.id);
  console.log('Order B Items in DB:', itemsB?.length);

  // Test Admin Settlement calculation on Order B
  const orderBFull = { ...orderB, items: itemsB };
  const payTotalsB = calculateOrderTotals({
    items: orderBFull.items,
    subtotal: getOrderSubtotal(orderBFull),
    couponDiscount: orderBFull.coupon_discount,
    deliveryCharge: orderBFull.delivery_charge || 0
  });
  console.log('Admin Settlement Totals for Order B:', {
    subtotal: payTotalsB.subtotal,
    couponDiscount: payTotalsB.couponDiscount,
    taxable: payTotalsB.taxableSubtotal,
    cgst: payTotalsB.cgstAmount,
    sgst: payTotalsB.sgstAmount,
    grandTotal: payTotalsB.rawTotal,
    payable: payTotalsB.payableAmount
  });

  // Verify coupon used count incremented to 1
  const { data: cpnB } = await sbAdmin.from('coupons').select('used_count').eq('code', 'KULAD30').single();
  console.log('KULAD30 used_count in DB:', cpnB?.used_count);

  // =========================================================================
  // TEST C: Valid Percentage Coupon (TEA20: 20% capped at 50)
  // =========================================================================
  console.log('\n--- TEST C: Valid Percentage Coupon Order (TEA20) ---');
  await sbAdmin.from('coupons').update({ used_count: 0 }).eq('code', 'TEA20');
  const resC = await sbCustomer.rpc('create_customer_delivery_order', {
    p_restaurant_id: restId,
    p_items: [{ product_id: 'prod-bir-002', quantity: 1, notes: 'Test C' }],
    p_delivery_address: '123 Test Street, Kolkata',
    p_customer_name: 'Raj Customer',
    p_customer_phone: '+91 98888 11111',
    p_payment_method: 'cod',
    p_coupon_code: 'TEA20',
    p_delivery_notes: 'Test C Percentage Coupon'
  });
  if (resC.error) throw new Error('Test C Error: ' + resC.error.message);
  const orderC = resC.data;
  console.log('Order C Created:', orderC.order_number, 'Subtotal:', orderC.subtotal, 'CpnDisc:', orderC.coupon_discount, 'GrandTotal:', orderC.grand_total, 'Payable:', orderC.payable_amount);
  
  const { data: itemsC } = await sbAdmin.from('order_items').select('*').eq('order_id', orderC.id);
  const orderCFull = { ...orderC, items: itemsC };
  const payTotalsC = calculateOrderTotals({
    items: orderCFull.items,
    subtotal: getOrderSubtotal(orderCFull),
    couponDiscount: orderCFull.coupon_discount,
    deliveryCharge: orderCFull.delivery_charge || 0
  });
  console.log('Admin Settlement Totals for Order C:', {
    subtotal: payTotalsC.subtotal,
    couponDiscount: payTotalsC.couponDiscount,
    grandTotal: payTotalsC.rawTotal,
    payable: payTotalsC.payableAmount
  });

  // =========================================================================
  // TEST D: Rapid Double-Click Protection
  // =========================================================================
  console.log('\n--- TEST D: Rapid Double-Click Protection ---');
  const countBeforeD = (await sbAdmin.from('orders').select('id', { count: 'exact', head: true })).count;
  
  // Using marketplaceService placeDeliveryOrder with idempotency protection
  const { marketplaceService } = await import('../src/services/api/marketplaceService');
  const testIdemKey = 'idem-double-click-test-' + Date.now();
  const payloadD = {
    restaurant_id: restId,
    items: [{ product_id: 'prod-bir-002', quantity: 1 }],
    delivery_address: '123 Test Street, Kolkata',
    customer_name: 'Raj Customer',
    customer_phone: '+91 98888 11111',
    payment_method: 'cod' as const,
    coupon_code: 'KULAD30',
    idempotency_key: testIdemKey
  };

  const [tap1, tap2] = await Promise.all([
    marketplaceService.placeDeliveryOrder(payloadD),
    marketplaceService.placeDeliveryOrder(payloadD)
  ]);

  const countAfterD = (await sbAdmin.from('orders').select('id', { count: 'exact', head: true })).count;
  console.log('Tap 1 order:', tap1?.order_number, 'ID:', tap1?.id);
  console.log('Tap 2 order:', tap2?.order_number, 'ID:', tap2?.id);
  console.log('Orders Count Before:', countBeforeD, '| After concurrent taps:', countAfterD, '| Net Created:', countAfterD! - countBeforeD!);

  // =========================================================================
  // TEST E: Exhausted Coupon
  // =========================================================================
  console.log('\n--- TEST E: Exhausted Coupon Enforcement ---');
  await sbAdmin.from('coupons').update({ used_count: 5, usage_limit: 5 }).eq('code', 'KULAD30');
  const countBeforeE = (await sbAdmin.from('orders').select('id', { count: 'exact', head: true })).count;
  const { data: prodBeforeE } = await sbAdmin.from('products').select('stock_quantity').eq('id', 'prod-bir-002').single();

  let errorE: any = null;
  try {
    await sbCustomer.rpc('create_customer_delivery_order', {
      p_restaurant_id: restId,
      p_items: [{ product_id: 'prod-bir-002', quantity: 1, notes: 'Exhausted attempt' }],
      p_delivery_address: '123 Test Street, Kolkata',
      p_customer_name: 'Raj Customer',
      p_customer_phone: '+91 98888 11111',
      p_payment_method: 'cod',
      p_coupon_code: 'KULAD30',
      p_delivery_notes: 'Exhausted coupon test'
    }).then(res => { if (res.error) throw new Error(res.error.message); return res.data; });
  } catch (err: any) {
    errorE = err;
  }

  const countAfterE = (await sbAdmin.from('orders').select('id', { count: 'exact', head: true })).count;
  const { data: prodAfterE } = await sbAdmin.from('products').select('stock_quantity').eq('id', 'prod-bir-002').single();
  const { data: cpnAfterE } = await sbAdmin.from('coupons').select('used_count').eq('code', 'KULAD30').single();

  console.log('Exhausted Coupon Error Caught:', errorE?.message);
  console.log('Orders created (should be 0):', countAfterE! - countBeforeE!);
  console.log('Stock change (should be 0):', (prodBeforeE?.stock_quantity ?? 0) - (prodAfterE?.stock_quantity ?? 0));
  console.log('Coupon used_count (should remain 5):', cpnAfterE?.used_count);

  // Cleanup Test Orders
  console.log('\n--- CLEANING UP TEST ORDERS ---');
  const testIds = [orderA.id, orderB.id, orderC.id, tap1?.id, tap2?.id].filter(Boolean);
  for (const tid of testIds) {
    await sbAdmin.from('order_items').delete().eq('order_id', tid);
    await sbAdmin.from('orders').delete().eq('id', tid);
  }
  // Restore coupon & product stock
  await sbAdmin.from('coupons').update({ used_count: 0, usage_limit: 5 }).eq('code', 'KULAD30');
  await sbAdmin.from('coupons').update({ used_count: 0, usage_limit: 10 }).eq('code', 'TEA20');
  if (initProd?.stock_quantity !== undefined) {
    await sbAdmin.from('products').update({ stock_quantity: initProd.stock_quantity }).eq('id', 'prod-bir-002');
  }
  console.log('Cleaned up test orders and restored inventory.');
}

runTests().catch(console.error);
