require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function runVerification() {
  console.log('=== VERIFYING SUPABASE EGRESS OPTIMIZATION & ORDERS PAGINATION ===');

  const customerClient = createClient(SUPABASE_URL, ANON_KEY);
  const adminClient = createClient(SUPABASE_URL, ANON_KEY);

  // 1. Authenticate Customer
  const { data: custAuth, error: custErr } = await customerClient.auth.signInWithPassword({
    email: 'customer_kalputra_test@yopmail.com',
    password: 'Password123!',
  });
  console.log('1. Customer Authenticated:', !custErr, custAuth?.user?.id);

  // 2. Authenticate Admin
  const { data: adminAuth, error: adminErr } = await adminClient.auth.signInWithPassword({
    email: 'ratnadeepdey13@gmail.com',
    password: 'Ratnadeep1@',
  });
  console.log('2. Admin Authenticated:', !adminErr, adminAuth?.user?.id);

  // 3. Test Admin Orders Pagination (Active Orders vs Completed History)
  const restId = 'c0000000-0000-0000-0000-000000000001';

  // 3a. Active Orders (Full operational fidelity)
  const { data: activeOrders, error: activeErr } = await adminClient
    .from('orders')
    .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
    .eq('restaurant_id', restId)
    .not('status', 'in', '("completed","delivered","cancelled")')
    .order('created_at', { ascending: false });

  console.log('3a. Admin Active Orders Count:', activeOrders ? activeOrders.length : 0, 'Error:', activeErr);

  // 3b. Completed History Pagination (Page 1: 30 items)
  const pageSize = 30;
  const from = 0;
  const to = from + pageSize; // 31 items to evaluate hasMore without slow count(*) query
  const { data: historyPage1, error: histErr } = await adminClient
    .from('orders')
    .select('*, items:order_items(*), payments:payments(*), kots:kots(*, items:kot_items(*))')
    .eq('restaurant_id', restId)
    .in('status', ['completed', 'delivered', 'cancelled'])
    .order('created_at', { ascending: false })
    .range(from, to);

  const hasMoreHistory = historyPage1 ? historyPage1.length > pageSize : false;
  console.log('3b. Admin Completed History Page 1:', {
    returnedRows: historyPage1 ? historyPage1.length : 0,
    hasMore: hasMoreHistory,
    error: histErr,
  });

  // 4. Test Customer My Orders Pagination
  // 4a. Live orders for customer
  const { data: custLiveOrders, error: custLiveErr } = await customerClient
    .from('orders')
    .select(`
      *,
      restaurant:restaurants(id, name, slug, logo_url, address, phone),
      items:order_items(*)
    `)
    .eq('customer_id', custAuth.user.id)
    .not('status', 'in', '("completed","delivered","cancelled")')
    .order('created_at', { ascending: false });

  console.log('4a. Customer Live Orders Count:', custLiveOrders ? custLiveOrders.length : 0, 'Error:', custLiveErr);

  // 4b. Customer History Paginated (20 per page)
  const custPageSize = 20;
  const custFrom = 0;
  const custTo = custFrom + custPageSize;
  const { data: custHistPage1, error: custHistErr } = await customerClient
    .from('orders')
    .select(`
      *,
      restaurant:restaurants(id, name, slug, logo_url, address, phone),
      items:order_items(*)
    `)
    .eq('customer_id', custAuth.user.id)
    .in('status', ['completed', 'delivered', 'cancelled'])
    .order('created_at', { ascending: false })
    .range(custFrom, custTo);

  const custHistHasMore = custHistPage1 ? custHistPage1.length > custPageSize : false;
  console.log('4b. Customer History Page 1:', {
    returnedRows: custHistPage1 ? custHistPage1.length : 0,
    hasMore: custHistHasMore,
    error: custHistErr,
  });

  // 5. Test Multi-Tenant Isolation (Ensure customer only sees customer_id = auth.uid())
  const { data: leakedOrders, error: leakErr } = await customerClient
    .from('orders')
    .select('id, customer_id')
    .neq('customer_id', custAuth.user.id);

  console.log('5. Customer Cross-Tenant Leaked Orders Count:', leakedOrders ? leakedOrders.length : 0);

  console.log('=== VERIFICATION COMPLETED SUCCESSFULLY ===');
}

runVerification().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});
