require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findBase64() {
  console.log('=== SCANNING ALL DATABASE TABLES FOR BASE64 STRINGS ===\n');

  const tables = [
    { name: 'restaurants', cols: ['logo_url', 'banner_url', 'banner_urls'] },
    { name: 'restaurant_settings', cols: ['logo_url', 'banner_url'] },
    { name: 'restaurant_public_profiles', cols: ['logo_url', 'banner_url', 'banner_urls', 'profile_image_url'] },
    { name: 'products', cols: ['image_url'] },
    { name: 'profiles', cols: ['avatar_url'] },
  ];

  let totalBase64Found = 0;

  for (const t of tables) {
    const { data, error } = await admin.from(t.name).select('*');
    if (error) {
      console.warn(`Error reading ${t.name}:`, error.message);
      continue;
    }

    console.log(`Checking table: ${t.name} (${data.length} rows)`);

    for (const row of data) {
      for (const col of t.cols) {
        const val = row[col];
        if (!val) continue;

        if (typeof val === 'string' && (val.startsWith('data:image') || val.length > 500)) {
          console.log(`  -> FOUND BASE64 in [${t.name}] row ID: ${row.id || row.restaurant_id}, col: ${col}, length: ${val.length}`);
          totalBase64Found++;
        } else if (Array.isArray(val)) {
          for (let i = 0; i < val.length; i++) {
            if (typeof val[i] === 'string' && (val[i].startsWith('data:image') || val[i].length > 500)) {
              console.log(`  -> FOUND BASE64 in [${t.name}] row ID: ${row.id || row.restaurant_id}, col: ${col}[${i}], length: ${val[i].length}`);
              totalBase64Found++;
            }
          }
        }
      }
    }
  }

  console.log(`\nTotal Base64 instances found: ${totalBase64Found}`);
}

findBase64().catch(console.error);
