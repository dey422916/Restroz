import { settingsService } from '../src/services/api/settingsService';
import { supabase } from '../src/services/supabase';

async function testSave() {
  const restId = 'a0000000-0000-0000-0000-000000000001';
  await supabase.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });

  try {
    console.log('Attempting saveSettings with banner_urls...');
    await settingsService.saveSettings({
      banner_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
      banner_urls: ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4'],
    }, restId);
    console.log('SUCCESS');
  } catch (err: any) {
    console.error('FAILED WITH ERROR:', err.message);
  }
}

testSave();
