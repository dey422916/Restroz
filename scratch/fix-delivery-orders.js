const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) env[k.trim()] = v.join('=').trim();
});

const supabaseUrl = env['EXPO_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['EXPO_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectAndFix() {
  const { data: allOrders } = await supabase.from('orders').select('*');
  console.log(`Total orders in DB: ${allOrders.length}`);

  let fixedCount = 0;
  for (const o of allOrders) {
    const isDelivery = o.order_type === 'delivery' || Boolean(o.delivery_address && o.delivery_address.trim());
    if (isDelivery) {
      console.log(`Delivery order found: ${o.order_number} | type: ${o.order_type} | addr: ${o.delivery_address} | notes: ${o.notes} | created_by: ${o.created_by}`);
      let newNotes = o.notes || '';
      if (!newNotes.includes('[ONLINE_DELIVERY]')) {
        newNotes = `[ONLINE_DELIVERY] ${newNotes.replace('[QR_DINE_IN]', '')}`.trim();
        await supabase.from('orders').update({
          notes: newNotes,
          order_type: 'delivery',
          created_by: o.created_by || 'CUSTOMER_APP'
        }).eq('id', o.id);
        fixedCount++;
      }
    }
  }

  console.log(`Fixed ${fixedCount} delivery orders in Supabase.`);
}

inspectAndFix();
