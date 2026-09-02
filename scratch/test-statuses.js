const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function findAllowedStatuses() {
  await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Qwerty1@',
  });

  const testStatuses = [
    'draft',
    'held',
    'confirmed',
    'kot_generated',
    'preparing',
    'in_progress',
    'ready',
    'served',
    'out_for_delivery',
    'out-for-delivery',
    'dispatched',
    'dispatch',
    'delivery',
    'on_the_way',
    'delivering',
    'delivered',
    'completed',
    'cancelled',
    'void',
    'refunded'
  ];

  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .limit(1);

  const orderId = orders[0].id;

  for (const st of testStatuses) {
    const { data, error } = await supabase
      .from('orders')
      .update({ status: st })
      .eq('id', orderId)
      .select('status');

    if (error) {
      console.log(`❌ "${st}": FAILED (${error.message})`);
    } else {
      console.log(`✅ "${st}": ALLOWED!`);
    }
  }

  // Restore to confirmed
  await supabase.from('orders').update({ status: 'confirmed' }).eq('id', orderId);
}

findAllowedStatuses().catch(console.error);
