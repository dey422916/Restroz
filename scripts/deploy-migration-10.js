const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function deploy() {
  const pg = new Client({
    connectionString: `postgresql://postgres.szpjsibrwxegaopcaukb:${encodeURIComponent('Ratnadeep@123')}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pg.connect();
    console.log('Connected to Supabase PostgreSQL');

    const sql10 = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260820000010_restaurant_banner_gallery_urls.sql'), 'utf8');
    await pg.query(sql10);
    console.log('Deployed 20260820000010_restaurant_banner_gallery_urls.sql successfully!');

    await pg.end();
  } catch (e) {
    console.error('Migration error:', e);
  }
}

deploy();
