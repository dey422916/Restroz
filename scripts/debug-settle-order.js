const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function testUserSettlement() {
  const client = createClient(SUPABASE_URL, ANON_KEY);

  // 1. Sign in as Kalputra admin
  const { data: auth, error: aErr } = await client.auth.signInWithPassword({
    email: 'kalputra@yopmail.com',
    password: 'Password123!',
  });
  if (aErr) throw aErr;
  console.log('Logged in as:', auth.user.email);

  const orderId = 'ord-1787292106837h22j';

  // 2. Perform settlement update
  const { data, error } = await client
    .from('orders')
    .update({
      status: 'completed',
      payment_status: 'paid',
      paid_amount: 126,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
    .single();

  console.log('Update result:', { data: data ? { id: data.id, status: data.status, payment_status: data.payment_status } : null, error });
}

testUserSettlement();
