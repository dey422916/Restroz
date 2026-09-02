const puppeteer = require('puppeteer-core');
require('dotenv').config();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const BASE_URL = 'https://restroz.shop';

async function testPress() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });

  page.on('console', (msg) => console.log('[LOG]', msg.text()));
  page.on('dialog', async (d) => {
    console.log('[ALERT]', d.message());
    await d.accept();
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

  // 3. Choose Dine In & T2
  await page.waitForSelector('[data-testid="pos-type-dine-in"]');
  await page.click('[data-testid="pos-type-dine-in"]');
  await sleep(1500);

  await page.waitForSelector('[data-testid="pos-table-select-t2"]');
  await page.click('[data-testid="pos-table-select-t2"]');
  await sleep(1500);

  // 4. Add product
  await page.waitForSelector('[data-testid^="pos-product-"]');
  await page.click('[data-testid^="pos-product-"]');
  await sleep(1500);

  // 5. Test pressing pos-send-kot-btn using native pointer events
  console.log('Sending pointerdown and pointerup to pos-send-kot-btn...');
  const res = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="pos-send-kot-btn"]');
    if (!btn) return 'not found';

    // Simulate complete touch/pointer sequence
    btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
    btn.click();
    return 'dispatched';
  });
  console.log('Dispatch result:', res);

  await sleep(5000);
  console.log('Final URL after press:', page.url());

  await browser.close();
}

testPress().catch(console.error);
