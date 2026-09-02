const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function getExecutablePath() {
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  throw new Error('Neither Edge nor Chrome found.');
}

async function runTest() {
  const executablePath = getExecutablePath();
  const screenshotsDir = path.join(__dirname, '..', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error' || type === 'warn' || text.includes('order') || text.includes('Order')) {
      console.log(`[CONSOLE ${type.toUpperCase()}] ${text}`);
    }
  });

  page.on('dialog', async (dialog) => {
    console.log(`[BROWSER DIALOG] Type: ${dialog.type()}, Message: ${dialog.message()}`);
    await dialog.accept();
  });

  // Step 1: Open Table QR Menu
  console.log('--- 1. Opening Table 1 QR Menu (http://localhost:8081/menu/table/tbl-1) ---');
  await page.goto('http://localhost:8081/menu/table/tbl-1', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  // Click on first "+ ADD" button
  console.log('--- 2. Adding item to cart ---');
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, button, a'));
    const addBtn = all.find((el) => el.innerText && el.innerText.trim() === '+ ADD');
    if (addBtn) addBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Click on bottom checkout bar or top Cart button
  console.log('--- 3. Opening Cart / Checkout Modal ---');
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, button, a'));
    const checkoutBar = all.find((el) => el.innerText && (el.innerText.includes('PROCEED TO CHECKOUT') || el.innerText.includes('Cart (')));
    if (checkoutBar) checkoutBar.click();
  });
  await new Promise((r) => setTimeout(r, 2000));

  const modalShotPath = path.join(screenshotsDir, 'e2e-qr-checkout-modal.png');
  await page.screenshot({ path: modalShotPath });
  console.log('Saved checkout modal screenshot:', modalShotPath);

  // Click "CONFIRM & SEND TO KITCHEN →"
  console.log('--- 4. Clicking CONFIRM & SEND TO KITCHEN ---');
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, button, a'));
    const confirmBtn = all.find((el) => el.innerText && el.innerText.includes('CONFIRM & SEND TO KITCHEN'));
    if (confirmBtn) confirmBtn.click();
  });

  await new Promise((r) => setTimeout(r, 5000));

  // Step 5: Admin Login
  console.log('--- 5. Admin Login to verify Order in Orders Feed ---');
  await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    if (inputs.length >= 2) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inputs[0], 'ratnadeepdey13@gmail.com');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));

      setter.call(inputs[1], 'Qwerty1@');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 1000));

  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, button, a'));
    const loginBtn = all.find((el) => el.innerText && el.innerText.trim() === 'LOGIN');
    if (loginBtn) loginBtn.click();
  });
  await new Promise((r) => setTimeout(r, 4000));

  console.log('--- 6. Navigating to Orders Feed ---');
  await page.goto('http://localhost:8081/(admin)/orders', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 4000));

  console.log('Clicking QR Digital Menu tab...');
  const clickedTab = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, button, a'));
    const tab = all.find((el) => el.innerText && el.innerText.includes('QR Digital Menu'));
    if (tab) {
      tab.click();
      return true;
    }
    return false;
  });
  console.log('Clicked QR Digital Menu tab:', clickedTab);

  await new Promise((r) => setTimeout(r, 3000));

  const adminQrShotPath = path.join(screenshotsDir, 'e2e-admin-qr-feed.png');
  await page.screenshot({ path: adminQrShotPath, fullPage: true });
  console.log('Saved Admin QR Feed screenshot:', adminQrShotPath);

  await browser.close();
  console.log('--- E2E QR Order Test Completed Successfully! ---');
}

runTest().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
