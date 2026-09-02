const puppeteer = require('puppeteer-core');
require('dotenv').config();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BASE_URL = 'https://restroz.shop';

async function testKotPrint() {
  console.log('🚀 Launching Chrome to inspect KOT Print on:', BASE_URL);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  page.on('console', (msg) => console.log('PAGE CONSOLE:', msg.type(), msg.text()));
  page.on('dialog', async (dialog) => {
    console.log('PAGE DIALOG (Alert/Confirm):', dialog.type(), dialog.message());
    await dialog.accept();
  });
  page.on('pageerror', (err) => console.log('PAGE UNCAUGHT ERROR:', err.message));

  // Expose print interceptor or check iframe
  await page.evaluateOnNewDocument(() => {
    window.__printCalls = [];
    const origPrint = window.print;
    window.print = function(...args) {
      window.__printCalls.push({ type: 'window.print', time: Date.now() });
      console.log('INTERCEPTED window.print() CALLED!');
    };
  });

  // 1. Login
  console.log('\n--- 1. Login ---');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="name@example.com"]');
  await page.type('input[placeholder="name@example.com"]', 'ratnadeepdey13@gmail.com');
  await page.type('input[placeholder="Enter your password"]', 'Ratnadeep1@');
  await page.click('[data-testid="login-submit-button"]');
  await page.waitForFunction(() => !window.location.pathname.includes('login'));

  // 2. Open Register if closed
  console.log('\n--- 2. Checking / Opening Register ---');
  // Query Day Register for Ratnadeep in Supabase
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const restId = 'c0000000-0000-0000-0000-000000000001';
  
  // Ensure an open register exists
  const { data: openRegs } = await sb.from('day_registers')
    .select('*')
    .eq('restaurant_id', restId)
    .eq('status', 'OPEN')
    .limit(1);

  if (!openRegs || openRegs.length === 0) {
    console.log('Opening register in Supabase...');
    await sb.from('day_registers').insert({
      restaurant_id: restId,
      opened_by: 'Ratnadeep Dey',
      opening_cash: 1000,
      status: 'OPEN',
      opened_at: new Date().toISOString()
    });
    console.log('Register opened!');
  } else {
    console.log('Active open register found:', openRegs[0].id);
  }

  // 3. Go to POS
  console.log('\n--- 3. Navigating to POS ---');
  await page.goto(`${BASE_URL}/pos`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  // Monitor iframe creation
  const hasIframeBefore = await page.evaluate(() => !!document.getElementById('ratnadeep-pos-print-frame'));
  console.log('Print iframe before:', hasIframeBefore);

  // 4. Select Dine In & Table
  console.log('\n--- 4. Checking POS workflow step ---');
  await sleep(1500);

  // Take screenshot of initial POS screen
  await page.screenshot({ path: 'screenshots/pos_initial.png' });

  // Check if Dine In button exists
  const btnTexts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0 && el.innerText)
      .map(el => el.innerText.trim())
      .filter(t => t.length > 0 && t.length < 50);
  });
  console.log('Visible text snippets:', btnTexts.slice(0, 30));

  // If on choose_type step, click Dine-In
  const clickedDineIn = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.includes('Dine-In') || e.innerText.includes('Dine In'));
    if (el) { el.click(); return true; }
    return false;
  });
  console.log('Clicked Dine In:', clickedDineIn);
  await sleep(1000);

  // Click a table (e.g. T1 or Table 1)
  const clickedTable = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText && (e.innerText === 'T1' || e.innerText.includes('Table 1') || e.innerText.includes('Table')));
    if (el) { el.click(); return true; }
    return false;
  });
  console.log('Clicked Table:', clickedTable);
  await sleep(1000);

  // Click an item to add to cart
  const clickedItem = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText && (e.innerText.includes('Butter Masala') || e.innerText.includes('Biryani') || e.innerText.includes('₹')));
    if (el) { el.click(); return true; }
    return false;
  });
  console.log('Clicked Product Card:', clickedItem);
  await sleep(1000);

  await page.screenshot({ path: 'screenshots/pos_cart.png' });

  // 5. Look for KOT Print button
  console.log('\n--- 5. Clicking KOT Print button ---');
  const kotBtnFound = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.includes('KOT Print'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('KOT Print button clicked:', kotBtnFound);

  // Wait 3 seconds and check what happened
  await sleep(3000);
  await page.screenshot({ path: 'screenshots/pos_after_kot.png' });

  // Check iframe & print calls
  const postClickInfo = await page.evaluate(() => {
    const iframe = document.getElementById('ratnadeep-pos-print-frame');
    return {
      hasIframe: !!iframe,
      iframeHtml: iframe ? (iframe.contentWindow?.document?.body?.innerHTML || iframe.contentDocument?.body?.innerHTML || 'empty') : null,
      printCalls: window.__printCalls || [],
      url: window.location.href,
    };
  });
  console.log('Post-click Info:', JSON.stringify(postClickInfo, null, 2));

  // Check Supabase for recent orders & kots
  const { data: recentOrders } = await sb.from('orders')
    .select('*, kots(*, items:kot_items(*))')
    .eq('restaurant_id', restId)
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('\n--- Recent Orders in Supabase ---');
  console.log(JSON.stringify(recentOrders?.map(o => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    kots: o.kots?.map(k => ({
      kot_number: k.kot_number,
      items: k.items
    }))
  })), null, 2));

  await browser.close();
}

testKotPrint().catch(console.error);
