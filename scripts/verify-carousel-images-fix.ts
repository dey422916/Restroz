import { supabase } from '../src/services/supabase';
import { marketplaceService } from '../src/services/api/marketplaceService';
import { parseBannerUrls } from '../src/utils/mediaUtils';

async function verifyFix() {
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

  // Update DB with 3 images
  await Promise.all([
    supabase.from('restaurants').update({ banner_url: payload }).eq('id', restId),
    supabase.from('restaurant_public_profiles').update({ banner_url: payload }).eq('restaurant_id', restId),
  ]);

  console.log('Saved 3 images in DB.');

  // Fetch from marketplace service
  const rest = await marketplaceService.getRestaurantPublicDetails(restId);
  if (!rest) throw new Error('Restaurant not found');

  const list: string[] = [];
  list.push(...parseBannerUrls(rest.public_profile?.banner_url));
  list.push(...parseBannerUrls(rest.banner_url));
  const unique = Array.from(new Set(list));

  console.log('Extracted unique images count:', unique.length);
  console.log('Images list:', unique);

  if (unique.length === 3) {
    console.log('CAROUSEL IMAGES FIX: PASS');
  } else {
    console.error('CAROUSEL IMAGES FIX: FAIL');
    process.exit(1);
  }
}

verifyFix();
