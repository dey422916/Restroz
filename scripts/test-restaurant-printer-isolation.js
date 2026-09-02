const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const KULLAD_CHAI_ID = 'a0000000-0000-0000-0000-000000000001';
const KALPUTRA_ID = 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863';

function embedPrinterConfig(baseLogoUrl, printerSettings) {
  const clean = (baseLogoUrl || '').split('#printer=')[0];
  const payload = JSON.stringify({
    kot_paper_size: printerSettings.kot_paper_size || '80mm',
    bill_paper_size: printerSettings.bill_paper_size || '80mm',
    auto_print_kot: Boolean(printerSettings.auto_print_kot),
  });
  return `${clean}#printer=${encodeURIComponent(payload)}`;
}

function extractPrinterConfig(rawLogoUrl) {
  if (!rawLogoUrl) return {};
  const hashIdx = rawLogoUrl.indexOf('#printer=');
  if (hashIdx === -1) return { cleanLogoUrl: rawLogoUrl };
  const cleanLogoUrl = rawLogoUrl.substring(0, hashIdx);
  const jsonStr = decodeURIComponent(rawLogoUrl.substring(hashIdx + 9));
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      kot_paper_size: parsed.kot_paper_size,
      bill_paper_size: parsed.bill_paper_size,
      auto_print_kot: parsed.auto_print_kot,
      cleanLogoUrl: cleanLogoUrl || undefined,
    };
  } catch (e) {
    return { cleanLogoUrl: cleanLogoUrl || undefined };
  }
}

async function testIsolation() {
  console.log('Testing per-restaurant printer settings persistence in Supabase...');

  // 1. Get existing logos
  const { data: rowA } = await sb.from('restaurant_settings').select('*').eq('restaurant_id', KULLAD_CHAI_ID).single();
  const { data: rowB } = await sb.from('restaurant_settings').select('*').eq('restaurant_id', KALPUTRA_ID).single();

  // 2. Set Kullad Chai -> 80mm + Auto Print ON
  const logoA = embedPrinterConfig(rowA.logo_url, { kot_paper_size: '80mm', bill_paper_size: '80mm', auto_print_kot: true });
  await sb.from('restaurant_settings').update({ logo_url: logoA }).eq('restaurant_id', KULLAD_CHAI_ID);

  // 3. Set Kalputra -> 58mm + Auto Print OFF
  const logoB = embedPrinterConfig(rowB.logo_url, { kot_paper_size: '58mm', bill_paper_size: '58mm', auto_print_kot: false });
  await sb.from('restaurant_settings').update({ logo_url: logoB }).eq('restaurant_id', KALPUTRA_ID);

  // 4. Reload from Supabase
  const { data: fetchA } = await sb.from('restaurant_settings').select('*').eq('restaurant_id', KULLAD_CHAI_ID).single();
  const { data: fetchB } = await sb.from('restaurant_settings').select('*').eq('restaurant_id', KALPUTRA_ID).single();

  const cfgA = extractPrinterConfig(fetchA.logo_url);
  const cfgB = extractPrinterConfig(fetchB.logo_url);

  console.log('Kullad Chai in Supabase:', cfgA);
  console.log('Kalputra in Supabase:', cfgB);

  if (cfgA.kot_paper_size === '80mm' && cfgA.auto_print_kot === true &&
      cfgB.kot_paper_size === '58mm' && cfgB.auto_print_kot === false) {
    console.log('✅ PER-RESTAURANT PERSISTENCE IN SUPABASE VERIFIED 100%!');
  } else {
    throw new Error('Mismatch in saved configurations');
  }
}

testIsolation().catch(console.error);
