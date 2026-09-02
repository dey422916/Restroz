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

    const sql8 = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260820000008_atomic_coupon_increment.sql'), 'utf8');
    await pg.query(sql8);
    console.log('Deployed 20260820000008_atomic_coupon_increment.sql');

    const sql9 = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260820000009_atomic_delivery_order_with_coupon.sql'), 'utf8');
    await pg.query(sql9);
    console.log('Deployed 20260820000009_atomic_delivery_order_with_coupon.sql');

    await pg.end();
    console.log('All migrations applied successfully!');
  } catch (e) {
    console.error('Migration error:', e);
  }
}

deploy();
