const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';
const KULLAD_ID = 'a0000000-0000-0000-0000-000000000001';

async function checkAndSeedTenantSettings() {
  const { data: restaurants } = await adminClient.from('restaurants').select('*');
  console.log('Registered Restaurants:', restaurants);

  for (const rest of restaurants) {
    const { data: existingSettings } = await adminClient
      .from('restaurant_settings')
      .select('*')
      .eq('restaurant_id', rest.id)
      .maybeSingle();

    if (!existingSettings) {
      console.log(`Creating restaurant_settings for ${rest.name} (${rest.id})...`);
      const { data: newSet, error: setErr } = await adminClient
        .from('restaurant_settings')
        .insert({
          restaurant_id: rest.id,
          name: rest.name,
          legal_name: `${rest.name} Pvt Ltd`,
          address: rest.address || 'Main Road',
          phone: rest.phone || '+91 9876543210',
          email: rest.email || 'contact@restaurant.com',
          gstin: '19AAAAA0000A1Z5',
          state: 'West Bengal',
          logo_url: rest.logo_url || '',
          invoice_prefix: 'INV-',
          kot_prefix: 'KOT-',
          default_tax_rate: 5.0,
          currency: 'INR',
          currency_symbol: '₹',
          service_charge_rate: 0.0,
        })
        .select()
        .single();

      console.log(`Created settings for ${rest.name}:`, { success: !!newSet, error: setErr });
    } else {
      console.log(`Existing settings for ${rest.name}:`, { name: existingSettings.name, logo: existingSettings.logo_url });
      // Ensure name and logo match restaurant profile if missing
      if (!existingSettings.name || existingSettings.name === 'Ratnadeep Restaurant' || existingSettings.name === 'Kullad Chai') {
        if (rest.name !== existingSettings.name) {
          await adminClient
            .from('restaurant_settings')
            .update({ name: rest.name, logo_url: rest.logo_url || existingSettings.logo_url })
            .eq('id', existingSettings.id);
          console.log(`Updated settings name to ${rest.name}`);
        }
      }
    }
  }
}

checkAndSeedTenantSettings();
