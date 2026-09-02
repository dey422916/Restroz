const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const passwords = [
  'Ratnadeep1@',
  'Qwerty1@',
  'ratnadeepdey13',
  'Ratnadeep@123',
  'Ratnadeep123!',
  'Qwerty12345!',
  'szpjsibrwxegaopcaukb'
];

const regions = [
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com',
  'aws-0-ap-northeast-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'db.szpjsibrwxegaopcaukb.supabase.co'
];

async function run() {
  const sqlFile = path.resolve(__dirname, '../supabase/migrations/20260820000007_fix_admin_provisioning_and_order_uuid.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log(`Executing migration from ${sqlFile}...`);

  let client = null;
  for (const host of regions) {
    for (const pw of passwords) {
      const isDirect = host.startsWith('db.');
      const port = isDirect ? 5432 : 6543;
      const user = isDirect ? 'postgres' : 'postgres.szpjsibrwxegaopcaukb';
      const connStr = `postgresql://${user}:${encodeURIComponent(pw)}@${host}:${port}/postgres`;
      const testClient = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 4000,
      });

      try {
        await testClient.connect();
        console.log(`Connected to PostgreSQL on ${host}`);
        client = testClient;
        break;
      } catch (e) {
        // try next
      }
    }
    if (client) break;
  }

  if (!client) {
    console.error('Could not connect to PostgreSQL directly.');
    process.exit(1);
  }

  try {
    await client.query(sql);
    console.log('>>> MIGRATION 20260820000007 EXECUTED SUCCESSFULLY IN DATABASE!');
  } catch (err) {
    console.error('Migration execution failed:', err);
  } finally {
    await client.end();
  }
}

run();
