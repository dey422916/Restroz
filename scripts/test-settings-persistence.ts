import { settingsService } from '../src/services/api/settingsService';
import { marketplaceService } from '../src/services/api/marketplaceService';
import { supabase } from '../src/services/supabase';

async function testPersistence() {
  const restId = 'a0000000-0000-0000-0000-000000000001';
  await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });

  const testImages = [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80',
  ];

  console.log('1. Saving 3 banner images via settingsService.saveSettings...');
  const saved = await settingsService.saveSettings({
    banner_urls: testImages,
  }, restId);

  console.log('Saved settings result banner_urls:', saved.banner_urls);

  console.log('2. Simulating browser refresh by calling settingsService.getSettings...');
  const refreshed = await settingsService.getSettings(restId);
  console.log('Refreshed settings banner_urls:', refreshed.banner_urls);

  console.log('3. Simulating Customer Marketplace restaurant fetch...');
  const marketplaceRest = await marketplaceService.getRestaurantPublicDetails(restId);
  console.log('Customer marketplace banner_url from DB:', marketplaceRest?.banner_url);
  console.log('Customer marketplace profile banner_url:', marketplaceRest?.public_profile?.banner_url);

  const pass1 = refreshed.banner_urls && refreshed.banner_urls.length === 3;
  const pass2 = marketplaceRest?.banner_url && marketplaceRest.banner_url.includes('1555396273');
  const pass3 = marketplaceRest?.public_profile?.banner_url && marketplaceRest.public_profile.banner_url.includes('1555396273');

  if (pass1 && pass2 && pass3) {
    console.log('\n>>> PERSISTENCE TEST: PASS! Both Admin Panel and Customer Marketplace retain images across refreshes.');
  } else {
    console.error('\n>>> PERSISTENCE TEST: FAIL!', { pass1, pass2, pass3 });
    process.exit(1);
  }
}

testPersistence();
