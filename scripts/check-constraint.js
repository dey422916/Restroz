const { Client } = require('pg');

async function checkConstraint() {
  const pg = new Client({
    connectionString: `postgresql://postgres.szpjsibrwxegaopcaukb:${encodeURIComponent('Ratnadeep@123')}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await pg.connect();
    const res = await pg.query("SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.orders'::regclass;");
    console.log('Constraints on public.orders:');
    res.rows.forEach(r => console.log(`- ${r.conname}: ${r.pg_get_constraintdef}`));
    await pg.end();
  } catch (e) {
    console.error('PG Error:', e.message);
  }
}

checkConstraint();
