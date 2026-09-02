import { supabase } from '../src/services/supabase';

async function testUpdate() {
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

  console.log('Testing update on restaurants with gallery_urls...');
  const res1 = await supabase.from('restaurants').update({ gallery_urls: testUrls }).eq('id', restId);
  console.log('restaurants update result:', res1.error ? res1.error.message : 'SUCCESS!');

  console.log('Testing update on restaurant_public_profiles with gallery_urls...');
  const res2 = await supabase.from('restaurant_public_profiles').update({ gallery_urls: testUrls }).eq('restaurant_id', restId);
  console.log('restaurant_public_profiles update result:', res2.error ? res2.error.message : 'SUCCESS!');

  console.log('Testing update on restaurant_settings with gallery_urls...');
  const res3 = await supabase.from('restaurant_settings').update({ gallery_urls: testUrls }).eq('restaurant_id', restId);
  console.log('restaurant_settings update result:', res3.error ? res3.error.message : 'SUCCESS!');
}

testUpdate();
