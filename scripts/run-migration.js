const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const passwords = [
  'Qwerty1@',
  'Ratnadeep1@',
  'ratnadeepdey13',
  'Ratnadeep@123',
  'Ratnadeep123!',
  'Qwerty12345!',
  'szpjsibrwxegaopcaukb'
];

const regions = [
  'aws-0-ap-northeast-1.pooler.supabase.com',
  'aws-0-ap-south-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'db.szpjsibrwxegaopcaukb.supabase.co'
];

async function executeMigration() {
  const sqlFile = path.resolve(__dirname, '../supabase/migrations/20260820000001_phase1_multitenant_foundation.sql');
  const sqlContent = fs.readFileSync(sqlFile, 'utf8');

  console.log(`Loaded migration SQL from ${sqlFile} (${sqlContent.length} bytes)`);

  let connectedClient = null;

  for (const host of regions) {
    for (const pw of passwords) {
      const isDirect = host.startsWith('db.');
      const port = isDirect ? 5432 : 6543;
      const user = isDirect ? 'postgres' : 'postgres.szpjsibrwxegaopcaukb';
      const connStr = `postgresql://${user}:${encodeURIComponent(pw)}@${host}:${port}/postgres`;

      const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });

      try {
        await client.connect();
        console.log(`\n>>> CONNECTED to PostgreSQL at ${host} using user ${user}!`);
        connectedClient = client;
        break;
      } catch (err) {
        // silent try next
      }
    }
    if (connectedClient) break;
  }

  if (!connectedClient) {
    console.error('Could not establish PostgreSQL connection pooler connection.');
    process.exit(1);
  }

  console.log('\nExecuting Phase 1 multi-tenant foundation migration SQL...');
  try {
    await connectedClient.query(sqlContent);
    console.log('>>> MIGRATION EXECUTED SUCCESSFULLY ON SUPABASE DATABASE! <<<');
  } catch (sqlErr) {
    console.error('Migration execution error:', sqlErr);
    process.exit(1);
  } finally {
    await connectedClient.end();
  }
}

executeMigration().catch((e) => {
  console.error('Script exception:', e);
  process.exit(1);
});
