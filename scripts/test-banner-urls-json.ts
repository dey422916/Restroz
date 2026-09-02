import { supabase } from '../src/services/supabase';

async function testJsonBanner() {
  const restId = 'a0000000-0000-0000-0000-000000000001';
  await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });

  const testUrls = [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80',
  ];

  const payload = JSON.stringify(testUrls);

  console.log('Updating restaurant_public_profiles with JSON banner_url...');
  const res1 = await supabase.from('restaurant_public_profiles').update({ banner_url: payload }).eq('restaurant_id', restId);
  console.log('restaurant_public_profiles result:', res1.error ? res1.error.message : 'SUCCESS!');

  console.log('Updating restaurants with JSON banner_url...');
  const res2 = await supabase.from('restaurants').update({ banner_url: payload }).eq('id', restId);
  console.log('restaurants result:', res2.error ? res2.error.message : 'SUCCESS!');

  console.log('Fetching back from database:');
  const { data: rest } = await supabase.from('restaurants').select('banner_url').eq('id', restId).single();
  console.log('Stored banner_url in restaurants:', rest?.banner_url);
}

testJsonBanner();
