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

async function testTable10() {
  const executablePath = getExecutablePath();
  const screenshotsDir = path.join(__dirname, '..', 'screenshots');

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('dialog', async (dialog) => {
    console.log(`[DIALOG] ${dialog.message()}`);
    await dialog.accept();
  });

  // 1. Open Table 10 QR Menu
  console.log('--- 1. Opening Table 10 QR Menu (http://localhost:8081/menu/table/tbl-10) ---');
  await page.goto('http://localhost:8081/menu/table/tbl-10', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  // Add Butter Chicken Gravy or first available dish
  console.log('--- 2. Adding dish to cart ---');
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, button, a'));
    const addBtn = all.find((el) => el.innerText && el.innerText.trim() === '+ ADD');
    if (addBtn) addBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Open checkout modal
  console.log('--- 3. Opening Checkout Modal ---');
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, button, a'));
    const checkoutBar = all.find((el) => el.innerText && (el.innerText.includes('PROCEED TO CHECKOUT') || el.innerText.includes('Cart (')));
    if (checkoutBar) checkoutBar.click();
  });
  await new Promise((r) => setTimeout(r, 2000));

  // Click CONFIRM & SEND TO KITCHEN
  console.log('--- 4. Clicking CONFIRM & SEND TO KITCHEN ---');
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, button, a'));
    const confirmBtn = all.find((el) => el.innerText && el.innerText.includes('CONFIRM & SEND TO KITCHEN'));
    if (confirmBtn) confirmBtn.click();
  });
  await new Promise((r) => setTimeout(r, 4000));

  // Step 5: Verify in Admin Feed
  console.log('--- 5. Admin Login & Check Orders Feed ---');
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

  await page.goto('http://localhost:8081/(admin)/orders', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 3000));

  const adminShot = path.join(screenshotsDir, 'table10-qr-verified.png');
  await page.screenshot({ path: adminShot, fullPage: true });
  console.log('Saved Admin Orders screenshot:', adminShot);

  await browser.close();
  console.log('--- Table 10 QR Order Flow Completed! ---');
}

testTable10().catch(console.error);
