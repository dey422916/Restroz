import { couponService } from '../src/services/api/couponService';
import { authService } from '../src/services/api/authService';
import { supabase } from '../src/services/supabase';

const REST_A = 'a0000000-0000-0000-0000-000000000001'; // Kullad Chai
const REST_B = 'b0000000-0000-0000-0000-000000000002'; // Other Restaurant

async function runVerification() {
  console.log('=== STARTING RESTAURANT COUPON SYSTEM VALIDATION ===\n');
  let allPassed = true;
  const createdCouponIds: string[] = [];

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
    // 0. AUTHENTICATE AS SUPER ADMIN
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: 'ratnadeepdey13@gmail.com',
      password: 'Ratnadeep1@',
    });
    if (authErr) {
      console.warn('Super Admin auth notice:', authErr.message);
    } else {
      console.log(`✅ Authenticated as: ${authData.user?.email}`);
    }

    // 1. FLAT COUPON VALIDATION
    const codeFlat = `FLAT50_${uid}`;
    const cpnFlat = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codeFlat,
      description: 'Flat ₹50 off on orders above ₹200',
      discount_type: 'fixed',
      discount_value: 50,
      min_order_value: 200,
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnFlat.id);

    const valFlat = await couponService.validateCouponCode(codeFlat, 300, REST_A);
    assert(valFlat.isValid === true && valFlat.discountAmount === 50, '1. Flat coupon calculated exact ₹50 discount');

    // 2. PERCENTAGE COUPON VALIDATION
    const codePct = `PCT20_${uid}`;
    const cpnPct = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codePct,
      description: '20% off',
      discount_type: 'percentage',
      discount_value: 20,
      min_order_value: 100,
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnPct.id);

    const valPct = await couponService.validateCouponCode(codePct, 1000, REST_A);
    assert(valPct.isValid === true && valPct.discountAmount === 200, '2. Percentage coupon calculated exact 20% on ₹1000 -> ₹200');

    // 3. MAX DISCOUNT CAP VALIDATION
    const codeCapped = `CAP100_${uid}`;
    const cpnCapped = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codeCapped,
      description: '20% off capped at ₹100',
      discount_type: 'percentage',
      discount_value: 20,
      max_discount: 100,
      min_order_value: 100,
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnCapped.id);

    const valCapped = await couponService.validateCouponCode(codeCapped, 1000, REST_A); // 20% of 1000 is 200, capped at 100
    assert(valCapped.isValid === true && valCapped.discountAmount === 100, '3. Max discount cap correctly limited 20% of ₹1000 (₹200) to ₹100');

    // 4. MINIMUM ORDER VALUE REQUIREMENT
    const valUnderMin = await couponService.validateCouponCode(codeFlat, 150, REST_A); // Min is 200
    assert(valUnderMin.isValid === false && valUnderMin.message.includes('Minimum order value'), '4. Minimum order value prevented application when subtotal is below ₹200');

    // 5. START / EXPIRY DATES VALIDATION
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();

    const codeExp = `EXPIRED_${uid}`;
    const cpnExpired = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codeExp,
      discount_type: 'fixed',
      discount_value: 30,
      expiry_date: yesterday,
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnExpired.id);

    const valExpired = await couponService.validateCouponCode(codeExp, 500, REST_A);
    assert(valExpired.isValid === false && valExpired.message.includes('expired'), '5a. Expired coupon rejected on validation');

    const codeFuture = `FUTURE_${uid}`;
    const cpnScheduled = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codeFuture,
      discount_type: 'fixed',
      discount_value: 30,
      start_date: tomorrow,
      expiry_date: nextWeek,
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnScheduled.id);

    const valScheduled = await couponService.validateCouponCode(codeFuture, 500, REST_A);
    assert(valScheduled.isValid === false && valScheduled.message.includes('starts on'), '5b. Future/unstarted coupon rejected before start date');

    // 6. USAGE LIMIT / ALLOTMENT EXHAUSTION
    const codeLimit = `LIMIT1_${uid}`;
    const cpnLimited = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codeLimit,
      discount_type: 'fixed',
      discount_value: 40,
      usage_limit: 1,
      used_count: 1, // Reached limit
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnLimited.id);

    const valLimited = await couponService.validateCouponCode(codeLimit, 500, REST_A);
    assert(valLimited.isValid === false && valLimited.message.includes('maximum usage limit'), '6. Exhausted coupon rejected when used_count >= usage_limit');

    // 7. RESTAURANT A COUPON CANNOT WORK AT RESTAURANT B
    const valCrossRest = await couponService.validateCouponCode(codeFlat, 500, REST_B);
    assert(valCrossRest.isValid === false && valCrossRest.message.includes('Invalid coupon code for this restaurant'), '7. Restaurant A coupon cannot be applied at Restaurant B');

    // 8. MARKETPLACE CAROUSEL FILTERING (Expired/Exhausted/Unstarted hidden)
    const marketCouponsA = await couponService.getValidMarketplaceCoupons(REST_A);
    const codesInMarket = marketCouponsA.map(c => c.code);
    assert(
      codesInMarket.includes(codeFlat) &&
      codesInMarket.includes(codePct) &&
      !codesInMarket.includes(codeExp) &&
      !codesInMarket.includes(codeFuture) &&
      !codesInMarket.includes(codeLimit),
      '8. Marketplace Carousel returns ONLY active, started, non-expired, and non-exhausted coupons for Restaurant A'
    );

    // 9. CONCURRENT FINAL COUPON ATOMIC REDEMPTION TEST
    const codeAtomic = `ATOMIC1_${uid}`;
    const cpnAtomic = await couponService.saveCoupon({
      restaurant_id: REST_A,
      code: codeAtomic,
      discount_type: 'fixed',
      discount_value: 25,
      usage_limit: 1,
      used_count: 0,
      is_active: true,
    }, REST_A);
    createdCouponIds.push(cpnAtomic.id);

    // Attempt 2 concurrent redemptions for 1 available slot
    const [redemption1, redemption2] = await Promise.all([
      couponService.incrementCouponUsage(cpnAtomic.id, REST_A),
      couponService.incrementCouponUsage(cpnAtomic.id, REST_A),
    ]);

    const atomicSuccessCount = (redemption1 ? 1 : 0) + (redemption2 ? 1 : 0);
    assert(atomicSuccessCount === 1, '9. Atomic increment prevented double redemption beyond usage_limit (exactly 1 succeeded)');

  } catch (err) {
    console.error('Validation test error:', err);
    allPassed = false;
  } finally {
    // Clean up created test coupons
    console.log(`🧹 Cleaning up ${createdCouponIds.length} test coupon(s)...`);
    for (const id of createdCouponIds) {
      try {
        await couponService.deleteCoupon(id);
      } catch (e) {
        // ignore cleanup error
      }
    }
  }

  console.log('\n===========================================');
  if (allPassed) {
    console.log('RESTAURANT COUPON SYSTEM: PASS');
  } else {
    console.log('RESTAURANT COUPON SYSTEM: FAIL');
  }
  console.log('===========================================');
}

runVerification();
