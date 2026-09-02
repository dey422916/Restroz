const puppeteer = require('puppeteer-core');
require('dotenv').config();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BASE_URL = 'https://restroz.shop';

async function main() {
  console.log('🚀 Running POS Interactive Diagnostic on', BASE_URL);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });

  page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('dialog', async (dialog) => {
    console.log('PAGE DIALOG:', dialog.type(), dialog.message());
    await dialog.accept();
  });
  page.on('pageerror', (err) => console.log('PAGE UNCAUGHT ERROR:', err.message));

  // Intercept window.print and iframe.contentWindow.print
  await page.evaluateOnNewDocument(() => {
    window.__printEvents = [];
    const origPrint = window.print;
    window.print = function(...args) {
      window.__printEvents.push({ target: 'window', time: Date.now() });
      console.log('>>> CALLED window.print() <<<');
    };

    // Monitor createElement for iframe
    const origCreate = document.createElement.bind(document);
    document.createElement = function(tagName, options) {
      const el = origCreate(tagName, options);
      if (tagName.toLowerCase() === 'iframe') {
        console.log('>>> CREATED IFRAME <<<', el.id);
        setTimeout(() => {
          try {
            if (el.contentWindow) {
              el.contentWindow.print = function(...args) {
                window.__printEvents.push({ target: 'iframe', id: el.id, time: Date.now() });
                console.log('>>> CALLED iframe.contentWindow.print() for', el.id, '<<<');
              };
            }
          } catch(e) {}
        }, 50);
      }
      return el;
    };
  });

  // 1. Login
  console.log('\n--- 1. Logging in as Super Admin ---');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="name@example.com"]');
  await page.type('input[placeholder="name@example.com"]', 'ratnadeepdey13@gmail.com');
  await page.type('input[placeholder="Enter your password"]', 'Ratnadeep1@');
  await page.click('[data-testid="login-submit-button"]');
  await page.waitForFunction(() => !window.location.pathname.includes('login'));

  // 2. Ensure Register is open in Supabase
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const restId = 'c0000000-0000-0000-0000-000000000001';

  // 3. Navigate to POS
  console.log('\n--- 2. Navigating to /pos ---');
  await page.goto(`${BASE_URL}/pos`, { waitUntil: 'domcontentloaded' });
  await sleep(3000);

  // Check what step we are on
  const stepText = await page.evaluate(() => document.body.innerText);
  console.log('Initial page text includes "Select Order Type":', stepText.includes('Select Order Type to Begin'));

  // Click Dine In
  console.log('\n--- 3. Clicking DINE IN card ---');
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText === 'DINE IN' || e.innerText === 'Select Dining Table →');
    if (el) el.click();
  });
  await sleep(1500);

  // Now we should be on Table Selection Floor screen
  const isTableScreen = await page.evaluate(() => document.body.innerText.includes('Select Dining Table'));
  console.log('On Table Selection screen:', isTableScreen);

  // Find an available table button (e.g., "🪑 Select Table")
  console.log('\n--- 4. Selecting Table ---');
  const tableSelected = await page.evaluate(() => {
    // Find button containing "Select Table"
    const btns = Array.from(document.querySelectorAll('*')).filter(e => e.innerText && e.innerText.trim() === '🪑 Select Table');
    if (btns.length > 0) {
      btns[0].click();
      return true;
    }
    return false;
  });
  console.log('Clicked "🪑 Select Table":', tableSelected);
  await sleep(1500);

  // Now we should be in the Catalog step!
  const isCatalog = await page.evaluate(() => document.body.innerText.includes('Grand Total') || document.body.innerText.includes('Search dishes'));
  console.log('On Catalog screen:', isCatalog);

  // Find a product card to add to cart
  console.log('\n--- 5. Adding Product to Cart ---');
  const addedItem = await page.evaluate(() => {
    // Look for product card titles or prices
    const cards = Array.from(document.querySelectorAll('div')).filter(e => {
      return e.innerText && e.innerText.includes('₹') && !e.innerText.includes('Grand Total') && e.children.length > 1;
    });
    console.log('Found product card candidates:', cards.length);
    if (cards.length > 0) {
      cards[0].click();
      return true;
    }
    return false;
  });
  console.log('Clicked product card:', addedItem);
  await sleep(1500);

  // Check cart items
  const cartInfo = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasGrandTotal: text.includes('Grand Total'),
      hasKotBtn: text.includes('KOT Print'),
      kotBtnText: Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.includes('KOT Print'))?.innerText || null
    };
  });
  console.log('Cart & KOT Button Info:', cartInfo);

  // 6. Click KOT Print
  console.log('\n--- 6. Clicking KOT Print Button ---');
  const clickedKot = await page.evaluate(() => {
    const kotBtn = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.includes('KOT Print'));
    if (kotBtn) {
      kotBtn.click();
      return true;
    }
    return false;
  });
  console.log('KOT Print Clicked:', clickedKot);

  // Wait 4 seconds to observe network, print calls, redirect
  console.log('Waiting 4s for execution...');
  await sleep(4000);

  // Check post-click state
  const postClick = await page.evaluate(() => {
    return {
      url: window.location.href,
      printEvents: window.__printEvents || [],
      iframeFound: !!document.getElementById('ratnadeep-pos-print-frame'),
    };
  });
  console.log('Post-Click Result:', JSON.stringify(postClick, null, 2));

  // Check Supabase for the created order and KOT
  console.log('\n--- 7. Supabase Database Check ---');
  const { data: latestOrders } = await sb.from('orders')
    .select('id, order_number, order_type, table_number, status, payment_status, payable_amount, kots(*, items:kot_items(*))')
    .eq('restaurant_id', restId)
    .order('created_at', { ascending: false })
    .limit(2);

  console.log('Latest Supabase Orders:', JSON.stringify(latestOrders, null, 2));

  await browser.close();
}

main().catch(console.error);
