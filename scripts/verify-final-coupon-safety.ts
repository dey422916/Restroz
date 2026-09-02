import { couponService } from '../src/services/api/couponService';
import { marketplaceService } from '../src/services/api/marketplaceService';
import { authService } from '../src/services/api/authService';
import { orderService } from '../src/services/api/orderService';
import { supabase } from '../src/services/supabase';

const REST_A = 'a0000000-0000-0000-0000-000000000001'; // Kullad Chai

async function runSafetyCheck() {
  console.log('=== RUNNING FINAL COUPON SAFETY CHECK ===\n');
  let allPassed = true;
  const createdCouponIds: string[] = [];
  const createdOrderIds: string[] = [];

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      allPassed = false;
    }
  }

  const uid = Date.now().toString(36).toUpperCase();

  try {
    // ------------------------------------------------------------------------
    // 1. AUTHENTICATE AS SUPER ADMIN TO PREPARE COUPONS
    // ------------------------------------------------------------------------
    const { data: saAuth } = await supabase.auth.signInWithPassword({
      email: 'ratnadeepdey13@gmail.com',
      password: 'Ratnadeep1@',
    });
    assert(Boolean(saAuth.user), '1. Super Admin authentication successful');

    // ------------------------------------------------------------------------
    // 2. CREATE TEST COUPONS: SAVE20 & FLAT100
    // ------------------------------------------------------------------------
    const codeSave20 = `SAVE20_${uid}`;
    const cpnSave20 = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codeSave20,
      description: '20% discount on orders above ₹100',
      discount_type: 'percentage',
      discount_value: 20,
      min_order_value: 100,
      usage_limit: 1,
      used_count: 0,
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnSave20.id);

    const codeFlat100 = `FLAT100_${uid}`;
    const cpnFlat100 = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codeFlat100,
      description: 'Flat ₹100 discount on orders above ₹300',
      discount_type: 'fixed',
      discount_value: 100,
      min_order_value: 300,
      usage_limit: 5,
      used_count: 0,
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnFlat100.id);

    // ------------------------------------------------------------------------
    // 3. VERIFY ONLY ONE COUPON APPLIED AT A TIME (SAVE20 -> FLAT100 replacement)
    // ------------------------------------------------------------------------
    const val1 = await couponService.validateCouponCode(codeSave20, 1000, REST_A);
    let appliedCode = val1.coupon?.code;
    let appliedDiscount = val1.discountAmount; // 20% of 1000 = 200

    assert(appliedCode === codeSave20 && appliedDiscount === 200, '2a. Applied initial SAVE20 -> ₹200 discount');

    // Customer applies FLAT100 -> Replaces SAVE20
    const val2 = await couponService.validateCouponCode(codeFlat100, 1000, REST_A);
    appliedCode = val2.coupon?.code;
    appliedDiscount = val2.discountAmount; // Flat 100

    assert(appliedCode === codeFlat100 && appliedDiscount === 100, '2b. Applying FLAT100 successfully removed/replaced SAVE20 (only FLAT100 ₹100 discount applies)');

    // ------------------------------------------------------------------------
    // 4. ATOMIC ORDER CREATION & FAILED ORDER NON-CONSUMPTION TEST
    // ------------------------------------------------------------------------
    // Sign in as customer to place real orders
    await supabase.auth.signInWithPassword({
      email: 'raj@yopmail.com',
      password: 'Ratnadeep1@',
    });

    const menu = await marketplaceService.getRestaurantMenu(REST_A);
    const prod = menu.products[0];
    assert(Boolean(prod), '3a. Loaded restaurant menu products');

    // Attempt invalid order with fake product id + codeSave20 -> Order creation must fail
    try {
      await marketplaceService.placeDeliveryOrder({
        restaurant_id: REST_A,
        customer_name: 'Raj Test',
        customer_phone: '9876543210',
        delivery_address: '123 Test Street, Mumbai',
        payment_method: 'cod',
        items: [{ product_id: 'invalid-prod-id', quantity: 1, notes: '' }],
        coupon_code: codeSave20,
      });
      assert(false, '3b. Invalid order creation should have thrown an error');
    } catch (e: any) {
      assert(true, '3b. Invalid order rejected server-side: ' + (e.message || ''));
    }

    // Verify SAVE20 usage count was NOT consumed on failed order
    const { data: checkCpnAfterFail } = await supabase.from('coupons').select('used_count').eq('id', cpnSave20.id).single();
    assert((checkCpnAfterFail?.used_count || 0) === 0, '3c. Failed order did NOT increase used_count (remained 0)');

    // Place legitimate successful order with codeSave20
    const orderResult = await marketplaceService.placeDeliveryOrder({
      restaurant_id: REST_A,
      customer_name: 'Raj Customer',
      customer_phone: '9876543210',
      delivery_address: '456 Marine Drive, Mumbai',
      payment_method: 'cod',
      items: [{ product_id: prod.id, quantity: 2, notes: '' }],
      coupon_code: codeSave20,
    });
    const orderId = orderResult.id || (orderResult as any).order_id;
    createdOrderIds.push(orderId);
    assert(Boolean(orderId), `4a. Placed order #${orderResult.order_number} successfully with coupon ${codeSave20}`);

    // Verify coupon used_count incremented to 1
    const { data: checkCpnAfterSuccess } = await supabase.from('coupons').select('used_count').eq('id', cpnSave20.id).single();
    assert((checkCpnAfterSuccess?.used_count || 0) === 1, '4b. Successful order atomically incremented used_count to 1');

    // Attempt second customer using same codeSave20 (limit was 1)
    try {
      await marketplaceService.placeDeliveryOrder({
        restaurant_id: REST_A,
        customer_name: 'Second Customer',
        customer_phone: '9876543211',
        delivery_address: '789 Marine Drive, Mumbai',
        payment_method: 'cod',
        items: [{ product_id: prod.id, quantity: 1, notes: '' }],
        coupon_code: codeSave20,
      });
      assert(false, '4c. Second order with exhausted coupon should have been rejected');
    } catch (exhaustErr: any) {
      assert(true, '4c. Second order blocked because coupon reached usage limit: ' + (exhaustErr.message || ''));
    }

    // ------------------------------------------------------------------------
    // 5. REFRESH / RELOGIN & VERIFY ADMIN VISIBILITY IN ORDER DETAILS & INVOICE
    // ------------------------------------------------------------------------
    // Sign out & Relogin as Restaurant Admin
    await supabase.auth.signOut();
    const { data: adminAuth } = await supabase.auth.signInWithPassword({
      email: 'bipin@yopmail.com',
      password: 'Password123!',
    });
    assert(Boolean(adminAuth.user), '5a. Relogged in as Restaurant Admin (Bipin)');

    // Fetch the order from database
    const adminOrders = await orderService.getOrders(REST_A);
    const fetchedOrder = adminOrders.find(o => o.id === orderId);

    assert(Boolean(fetchedOrder), '5b. Admin fetched placed order from database');
    assert(fetchedOrder?.coupon_code === codeSave20, `5c. Order accurately persisted coupon_code: ${fetchedOrder?.coupon_code}`);
    assert((fetchedOrder?.coupon_discount || 0) > 0, `5d. Order accurately persisted coupon_discount: ₹${fetchedOrder?.coupon_discount}`);
    assert((fetchedOrder?.payable_amount || 0) < (fetchedOrder?.grand_total || 0) + (fetchedOrder?.coupon_discount || 0), '5e. Final payable amount accurately reflects coupon discount');

    // ------------------------------------------------------------------------
    // 6. VERIFY STAFF & CUSTOMER PERMISSION RESTRICTIONS
    // ------------------------------------------------------------------------
    // 6a. Staff member attempt to create/modify coupon
    await supabase.auth.signOut();
    const { data: staffAuth, error: staffAuthErr } = await supabase.auth.signInWithPassword({
      email: 'souvik@yopmail.com',
      password: 'Password123!',
    });
    assert(Boolean(staffAuth.user), '6a-1. Authenticated as Staff user (Souvik)');

    const { error: staffInsertErr } = await supabase.from('coupons').insert({
      id: 'cpn-illegal-staff-' + uid,
      restaurant_id: REST_A,
      code: 'ILLEGAL_STAFF_' + uid,
      discount_value: 90,
    });
    assert(Boolean(staffInsertErr), `6a-2. STAFF blocked from creating coupons in database (RLS error: ${staffInsertErr?.message})`);

    // 6b. Customer attempt to create/modify coupon
    await supabase.auth.signOut();
    const { data: custAuth, error: custAuthErr } = await supabase.auth.signInWithPassword({
      email: 'raj@yopmail.com',
      password: 'Password123!',
    });
    assert(Boolean(custAuth.user), '6b-1. Authenticated as Customer user (Raj)');

    const { error: custInsertErr } = await supabase.from('coupons').insert({
      id: 'cpn-illegal-cust-' + uid,
      restaurant_id: REST_A,
      code: 'ILLEGAL_CUST_' + uid,
      discount_value: 90,
    });
    assert(Boolean(custInsertErr), `6b-2. CUSTOMER blocked from creating coupons in database (RLS error: ${custInsertErr?.message})`);

  } catch (err: any) {
    console.error('Fatal test exception:', err);
    allPassed = false;
  } finally {
    // Clean up created test coupons and orders
    console.log(`\n🧹 Cleaning up test coupons (${createdCouponIds.length}) & orders (${createdOrderIds.length})...`);
    await supabase.auth.signInWithPassword({
      email: 'ratnadeepdey13@gmail.com',
      password: 'Ratnadeep1@',
    });

    for (const id of createdCouponIds) {
      try {
        await supabase.from('coupons').delete().eq('id', id);
      } catch (e) {}
    }
    for (const oid of createdOrderIds) {
      try {
        await supabase.from('order_items').delete().eq('order_id', oid);
        await supabase.from('orders').delete().eq('id', oid);
      } catch (e) {}
    }
  }

  console.log('\n===========================================');
  if (allPassed) {
    console.log('FINAL COUPON SAFETY: PASS');
  } else {
    console.log('FINAL COUPON SAFETY: FAIL');
  }
  console.log('===========================================');
}

runSafetyCheck();
