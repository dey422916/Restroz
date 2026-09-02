import { supabase } from '../src/services/supabase';

async function checkDb() {
  const restId = 'a0000000-0000-0000-0000-000000000001';

  console.log('--- 1. RESTAURANTS table ---');
  const { data: rest, error: restErr } = await supabase.from('restaurants').select('*').eq('id', restId);
  console.log(rest, restErr);

  console.log('--- 2. RESTAURANT_PUBLIC_PROFILES table ---');
  const { data: pub, error: pubErr } = await supabase.from('restaurant_public_profiles').select('*').eq('restaurant_id', restId);
  console.log(pub, pubErr);

  console.log('--- 3. RESTAURANT_SETTINGS table ---');
  const { data: sett, error: settErr } = await supabase.from('restaurant_settings').select('*').eq('restaurant_id', restId);
  console.log(sett, settErr);
}

checkDb();
