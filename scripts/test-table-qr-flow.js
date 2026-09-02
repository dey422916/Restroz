const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function getExecutablePath() {
  if (fs.existsSync(EDGE_PATH)) return EDGE_PATH;
  if (fs.existsSync(CHROME_PATH)) return CHROME_PATH;
  throw new Error('Neither Edge nor Chrome was found on system.');
}

async function testFlow() {
  const executablePath = getExecutablePath();
  const outputDir = path.join(__dirname, '..', 'screenshots');

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Admin Login & Check Orders Feed
  console.log('1. Logging in as Admin...');
  await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));

  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    if (inputs.length >= 2) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(inputs[0], 'ratnadeepdey13@gmail.com');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[0].dispatchEvent(new Event('change', { bubbles: true }));

      nativeInputValueSetter.call(inputs[1], 'Qwerty1@');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => {
    const allElems = Array.from(document.querySelectorAll('div, button, a'));
    const loginBtn = allElems.find((el) => el.innerText && el.innerText.trim() === 'LOGIN');
    if (loginBtn) loginBtn.click();
  });

  await new Promise((r) => setTimeout(r, 4000));

  await page.goto('http://localhost:8081/(admin)/orders', { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise((r) => setTimeout(r, 3000));

  // Find all elements with role="button" or clickable
  const clickableElements = await page.$$('div[role="button"], button');
  for (const el of clickableElements) {
    const text = await page.evaluate((e) => e.innerText, el);
    if (text && text.includes('QR Digital Menu')) {
      console.log('Found QR Digital Menu tab, clicking via Puppeteer...');
      await el.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 2000));

  // Click Completed sub-tab
  const subTabs = await page.$$('div[role="button"], button');
  for (const el of subTabs) {
    const text = await page.evaluate((e) => e.innerText, el);
    if (text && text.includes('Completed')) {
      console.log('Clicking Completed sub-tab...');
      await el.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 3000));

  const adminQrOrdersPath = path.join(outputDir, 'admin-qr-digital-menu-orders.png');
  await page.screenshot({ path: adminQrOrdersPath, fullPage: true });
  console.log('Saved Admin QR Digital Menu Orders:', adminQrOrdersPath);

  await browser.close();
  console.log('Finished!');
}

testFlow().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});
