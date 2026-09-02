const puppeteer = require('puppeteer-core');
require('dotenv').config();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const BASE_URL = 'https://restroz.shop';

async function debugKotClick() {
  console.log('🔍 Debugging KOT click on:', BASE_URL);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });

  page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('dialog', async (d) => {
    console.log('[ALERT DIALOG]', d.type(), d.message());
    await d.accept();
  });
  page.on('pageerror', (err) => console.log('[PAGE ERROR]', err.message));
  page.on('response', async (res) => {
    if (res.status() >= 400) {
      try {
        const body = await res.text();
        console.log('[HTTP ERROR]', res.status(), res.url(), body);
      } catch (e) {}
    }
  });

  // 1. Login
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="name@example.com"]');
  await page.type('input[placeholder="name@example.com"]', 'ratnadeepdey13@gmail.com');
  await page.type('input[placeholder="Enter your password"]', 'Ratnadeep1@');
  await page.click('[data-testid="login-submit-button"]');
  await page.waitForFunction(() => !window.location.pathname.includes('login'));

  // 2. Go to POS
  await page.goto(`${BASE_URL}/pos`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);

  // 3. Choose Dine In
  await page.waitForSelector('[data-testid="pos-type-dine-in"]');
  await page.click('[data-testid="pos-type-dine-in"]');
  await sleep(1500);

  // 4. Choose Table T2 (which is clean and available)
  await page.waitForSelector('[data-testid="pos-table-select-t2"]');
  await page.click('[data-testid="pos-table-select-t2"]');
  await sleep(1500);

  // 5. Add product
  const prodSelector = await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="pos-product-"]');
    return el ? el.getAttribute('data-testid') : null;
  });
  console.log('Adding product:', prodSelector);
  await page.click(`[data-testid="${prodSelector}"]`);
  await sleep(1500);

  // 6. Check button state
  const btnInfo = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="pos-send-kot-btn"]');
    if (!btn) return { exists: false };
    return {
      exists: true,
      innerText: btn.innerText,
      disabled: btn.getAttribute('aria-disabled') || btn.disabled,
      className: btn.className,
      style: btn.getAttribute('style'),
      rect: btn.getBoundingClientRect()
    };
  });
  console.log('KOT Button State before click:', JSON.stringify(btnInfo, null, 2));

  // 7. Click KOT Print
  console.log('Triggering click on pos-send-kot-btn...');
  // Try both Puppeteer click and DOM click
  await page.click('[data-testid="pos-send-kot-btn"]');
  console.log('Puppeteer click executed. Waiting for navigation and print...');
  for (let i = 1; i <= 8; i++) {
    await sleep(1000);
    console.log(`[${i}s] Current URL:`, page.url());
  }

  // Take screenshot
  await page.screenshot({ path: 'screenshots/after_kot_click.png' });
  await browser.close();
}

debugKotClick().catch(console.error);
