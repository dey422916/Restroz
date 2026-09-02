const { getClient } = require('./db-exec');
const fs = require('fs');
const path = require('path');

async function applyMigration9() {
  const sqlFile = path.resolve(__dirname, '../supabase/migrations/20260820000009_fix_order_validation_and_delivery_updates.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('Connecting to database...');
  const client = await getClient();
  if (!client) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    console.log('Executing Migration 9...');
    await client.query(sql);
    console.log('>>> MIGRATION 9 EXECUTED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error executing Migration 9:', err);
  } finally {
    await client.end();
  }
}

applyMigration9();
