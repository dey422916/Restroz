import { couponService } from '../src/services/api/couponService';
import { supabase } from '../src/services/supabase';

const REST_A = 'a0000000-0000-0000-0000-000000000001';
const REST_B = 'b0000000-0000-0000-0000-000000000002';

async function verifyMessages() {
  console.log('=== VERIFYING SHORT USER-FRIENDLY VALIDATION MESSAGES ===\n');
  let passed = true;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ [PASS] ${msg}`);
    } else {
      console.error(`❌ [FAIL] ${msg}`);
      passed = false;
    }
  }

  const uid = Date.now().toString(36).toUpperCase();

  await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });

  // 1. Min order required
  const cpnMin = await couponService.saveCoupon({
    restaurant_id: REST_A,
    code: `MIN500_${uid}`,
    discount_value: 50,
    min_order_value: 500,
    is_active: true,
  }, REST_A);

  const resMin = await couponService.validateCouponCode(`MIN500_${uid}`, 300, REST_A);
  assert(resMin.message === 'Minimum order ₹500 required', `1. Minimum order message: "${resMin.message}"`);

  // 2. Coupon expired
  const cpnExp = await couponService.saveCoupon({
    restaurant_id: REST_A,
    code: `EXP_${uid}`,
    discount_value: 50,
    expiry_date: new Date(Date.now() - 86400000).toISOString(),
    is_active: true,
  }, REST_A);

  const resExp = await couponService.validateCouponCode(`EXP_${uid}`, 600, REST_A);
  assert(resExp.message === 'Coupon expired', `2. Expired message: "${resExp.message}"`);

  // 3. Coupon not active yet
  const cpnFuture = await couponService.saveCoupon({
    restaurant_id: REST_A,
    code: `FUT_${uid}`,
    discount_value: 50,
    start_date: new Date(Date.now() + 86400000).toISOString(),
    is_active: true,
  }, REST_A);

  const resFut = await couponService.validateCouponCode(`FUT_${uid}`, 600, REST_A);
  assert(resFut.message === 'Coupon not active yet', `3. Not active yet message: "${resFut.message}"`);

  // 4. Coupon usage limit reached
  const cpnLimit = await couponService.saveCoupon({
    restaurant_id: REST_A,
    code: `LIM_${uid}`,
    discount_value: 50,
    usage_limit: 1,
    used_count: 1,
    is_active: true,
  }, REST_A);

  const resLim = await couponService.validateCouponCode(`LIM_${uid}`, 600, REST_A);
  assert(resLim.message === 'Coupon usage limit reached', `4. Usage limit reached message: "${resLim.message}"`);

  // 5. Coupon not valid for this restaurant
  const resCross = await couponService.validateCouponCode(`MIN500_${uid}`, 600, REST_B);
  assert(resCross.message === 'Coupon not valid for this restaurant', `5. Cross restaurant message: "${resCross.message}"`);

  // 6. Invalid coupon code
  const resInvalid = await couponService.validateCouponCode('TOTALLY_RANDOM_CODE_999', 600, REST_A);
  assert(resInvalid.message === 'Invalid coupon code', `6. Invalid code message: "${resInvalid.message}"`);

  // 7. Coupon inactive
  const cpnInactive = await couponService.saveCoupon({
    restaurant_id: REST_A,
    code: `INACT_${uid}`,
    discount_value: 50,
    is_active: false,
  }, REST_A);

  const resInact = await couponService.validateCouponCode(`INACT_${uid}`, 600, REST_A);
  assert(resInact.message === 'Coupon inactive', `7. Inactive message: "${resInact.message}"`);

  // Cleanup
  for (const c of [cpnMin, cpnExp, cpnFuture, cpnLimit, cpnInactive]) {
    await couponService.deleteCoupon(c.id);
  }

  console.log('\n===========================================');
  console.log(passed ? 'COUPON VALIDATION MESSAGES: PASS' : 'COUPON VALIDATION MESSAGES: FAIL');
  console.log('===========================================');
}

verifyMessages();
