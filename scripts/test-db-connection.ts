import 'dotenv/config';
import { Client } from 'pg';

async function testPostgres() {
  console.log('Testing Postgres connectivity...');
  // Try standard supabase connection string patterns if password is known
  // e.g. postgresql://postgres:[password]@db.szpjsibrwxegaopcaukb.supabase.co:5432/postgres
  const passwordsToTry = ['Qwerty1@', 'postgres', 'password'];
  for (const pw of passwordsToTry) {
    try {
      const client = new Client({
        connectionString: `postgresql://postgres.szpjsibrwxegaopcaukb:${pw}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      console.log(`Connected with password: ${pw}`);
      await client.end();
      return;
    } catch (e: any) {
      console.log(`Password ${pw} failed:`, e.message);
    }
  }
}

testPostgres().catch(console.error);
