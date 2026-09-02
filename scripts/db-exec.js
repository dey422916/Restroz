const { Client } = require('pg');
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

async function getClient() {
  for (const host of regions) {
    for (const pw of passwords) {
      const isDirect = host.startsWith('db.');
      const port = isDirect ? 5432 : 6543;
      const user = isDirect ? 'postgres' : 'postgres.szpjsibrwxegaopcaukb';
      const connStr = `postgresql://${user}:${encodeURIComponent(pw)}@${host}:${port}/postgres`;
      const client = new Client({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 4000,
      });

      try {
        await client.connect();
        return client;
      } catch (e) {
        // try next
      }
    }
  }
  return null;
}

module.exports = { getClient };

if (require.main === module) {
  getClient().then(async (client) => {
    if (!client) {
      console.error('Could not connect to PostgreSQL');
      process.exit(1);
    }
    const res = await client.query('SELECT current_database(), current_user, version()');
    console.log('Connected successfully:', res.rows[0]);
    await client.end();
  }).catch(console.error);
}
