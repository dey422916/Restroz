import { supabase } from '../src/services/supabase';

async function cleanupTestCoupons() {
  await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });

  const { data: coupons } = await supabase.from('coupons').select('id, code');
  console.log('All existing coupons in DB:', coupons);

  for (const c of coupons || []) {
    if (c.code !== 'KULAD30') {
      console.log('Deleting test coupon:', c.code);
      await supabase.from('coupons').delete().eq('id', c.id);
    }
  }

  console.log('Cleanup finished.');
}

cleanupTestCoupons();
