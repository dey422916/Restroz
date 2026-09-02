const { Client } = require('pg');

async function test() {
  const client = new Client({
    connectionString: 'postgresql://postgres.szpjsibrwxegaopcaukb:Qwerty1%40@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Postgres Connected Successfully!');
  
  // Check RLS policies on orders table
  const res = await client.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename = 'orders';
  `);
  console.log('Orders policies:', res.rows);

  // Check recent orders in DB
  const ordersRes = await client.query(`
    SELECT id, order_number, status, order_type, customer_id, customer_name, delivery_address, created_at 
    FROM orders 
    ORDER BY created_at DESC 
    LIMIT 5;
  `);
  console.log('Recent DB orders:', ordersRes.rows);

  await client.end();
}

test().catch(console.error);
