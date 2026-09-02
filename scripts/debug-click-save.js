const puppeteer = require('puppeteer-core');
require('dotenv').config();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BASE_URL = 'https://restroz.shop';

async function debugSave() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900, isMobile: true, hasTouch: true });

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('dialog', async (dialog) => {
    console.log('PAGE DIALOG:', dialog.type(), dialog.message());
    await dialog.accept();
  });
  page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

  // 1. Log in
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="name@example.com"]');
  await page.type('input[placeholder="name@example.com"]', 'ratnadeepdey13@gmail.com');
  await page.type('input[placeholder="Enter your password"]', 'Ratnadeep1@');
  await page.click('[data-testid="login-submit-button"]');
  await page.waitForFunction(() => !window.location.pathname.includes('login'));

  // 2. Go to products
  await page.goto(`${BASE_URL}/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="add-product-btn"]');

  // 3. Open modal
  await page.click('[data-testid="add-product-btn"]');
  await page.waitForSelector('[data-testid="save-product-modal-btn"]');
  await sleep(1000);

  // Check inputs present
  const inputInfo = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      placeholder: i.placeholder,
      value: i.value,
      testId: i.getAttribute('data-testid'),
    }));
  });
  console.log('Inputs in modal:', JSON.stringify(inputInfo, null, 2));

  // Type name
  const testName = 'Test Rogan Josh ' + Date.now().toString().slice(-4);
  const nameEl = await page.$('[data-testid="product-form-name-input"]');
  console.log('Name element found:', !!nameEl);
  if (nameEl) {
    await nameEl.click();
    await page.keyboard.type(testName);
  }

  // Type price
  const priceEl = await page.$('[data-testid="product-form-price-input"]');
  console.log('Price element found:', !!priceEl);
  if (priceEl) {
    await priceEl.click({ clickCount: 3 });
    await page.keyboard.type('350');
  }

  const valuesBeforeClick = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      placeholder: i.placeholder,
      value: i.value,
      testId: i.getAttribute('data-testid'),
    }));
  });
  console.log('Values before click:', JSON.stringify(valuesBeforeClick, null, 2));

  // Click save
  console.log('Clicking Save...');
  const saveBtn = await page.$('[data-testid="save-product-modal-btn"]');
  console.log('Save button found:', !!saveBtn);
  await saveBtn.click();

  await sleep(3000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Has test product in body?', bodyText.includes(testName));
  console.log('Any error banners in body?', bodyText.includes('⚠️') || bodyText.includes('Failed'));

  await page.screenshot({ path: 'screenshots/debug_save.png' });
  await browser.close();
}

debugSave().catch(console.error);
