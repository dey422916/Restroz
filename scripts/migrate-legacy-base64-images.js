require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function decodeBase64Image(dataString) {
  let mimeType = 'image/jpeg';
  let rawBase64 = dataString;

  const matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    mimeType = matches[1];
    rawBase64 = matches[2];
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  let ext = 'jpg';
  if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('webp')) ext = 'webp';
  else if (mimeType.includes('gif')) ext = 'gif';

  return { buffer, mimeType, ext };
}

async function uploadBinaryToStorage(bucket, path, buffer, contentType) {
  console.log(`Uploading ${buffer.length} bytes to ${bucket}/${path}...`);
  const { data, error } = await admin.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      cacheControl: '31536000',
      upsert: true,
    });

  if (error) {
    console.error('Storage upload error:', error);
    throw error;
  }

  const { data: pubData } = admin.storage.from(bucket).getPublicUrl(path);
  return pubData.publicUrl;
}

async function migrateAll() {
  console.log('=== COMPREHENSIVE AUTOMATIC BASE64 MIGRATION ===\n');

  const targets = [
    { table: 'restaurants', idCol: 'id', cols: ['logo_url', 'banner_url'] },
    { table: 'restaurant_settings', idCol: 'restaurant_id', cols: ['logo_url'] },
    { table: 'restaurant_public_profiles', idCol: 'restaurant_id', cols: ['banner_url'] },
    { table: 'products', idCol: 'id', cols: ['image_url'] },
    { table: 'profiles', idCol: 'id', cols: ['avatar_url'] },
  ];

  for (const t of targets) {
    const { data: rows, error } = await admin.from(t.table).select('*');
    if (error || !rows) continue;

    for (const row of rows) {
      const rowId = row[t.idCol] || row.id || row.restaurant_id;
      for (const col of t.cols) {
        const val = row[col];
        if (typeof val === 'string' && (val.startsWith('data:image') || val.length > 500)) {
          console.log(`Processing [${t.table}] row ${rowId}, column ${col} (${val.length} bytes)...`);
          const decoded = decodeBase64Image(val);
          const bucket = t.table === 'products' ? 'product-images' : 'restaurant-assets';
          const folder = col.includes('logo') ? 'logos' : col.includes('banner') ? 'banners' : 'general';
          const path = `restaurants/${rowId}/${folder}/migrated_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${decoded.ext}`;

          const cdnUrl = await uploadBinaryToStorage(bucket, path, decoded.buffer, decoded.mimeType);
          console.log(`-> Saved to Supabase CDN: ${cdnUrl}`);

          const { error: upErr } = await admin
            .from(t.table)
            .update({ [col]: cdnUrl })
            .eq(t.idCol, rowId);

          if (upErr) {
            console.error(`Failed to update ${t.table}.${col}:`, upErr);
          } else {
            console.log(`-> Successfully updated ${t.table}.${col} with CDN URL!`);
          }
        }
      }
    }
  }

  // Verification Scan
  console.log('\n--- VERIFICATION SCAN ACROSS ALL TABLES ---');
  let remainingCount = 0;
  for (const t of targets) {
    const { data: rows } = await admin.from(t.table).select('*');
    if (!rows) continue;
    for (const row of rows) {
      for (const col of t.cols) {
        const val = row[col];
        if (typeof val === 'string' && (val.startsWith('data:image') || val.length > 500)) {
          console.error(`STILL BASE64: ${t.table}.${col} row ${row[t.idCol]}`);
          remainingCount++;
        }
      }
    }
  }

  console.log(`\n=== FINAL RESULT: ${remainingCount} Base64 strings remaining in database. ===`);
}

migrateAll().catch(console.error);
