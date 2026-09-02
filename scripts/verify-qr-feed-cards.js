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

async function verifyQrFeedCards() {
  const executablePath = getExecutablePath();
  const screenshotsDir = path.join(__dirname, '..', 'screenshots');

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // Admin login
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

  // Find all clickable buttons and click QR Digital Menu tab
  const buttons = await page.$$('div[role="button"], button');
  for (const b of buttons) {
    const text = await page.evaluate((el) => el.innerText, b);
    if (text && text.includes('QR Digital Menu')) {
      console.log('Clicking QR Digital Menu tab button...');
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 2000));

  // Click "All" sub tab to see all QR orders
  const subBtns = await page.$$('div[role="button"], button');
  for (const b of subBtns) {
    const text = await page.evaluate((el) => el.innerText, b);
    if (text && text.includes('All (')) {
      console.log('Clicking All subtab:', text);
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 2000));

  const shotPath = path.join(screenshotsDir, 'verified-qr-orders-list.png');
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log('Saved screenshot of QR orders list:', shotPath);

  await browser.close();
}

verifyQrFeedCards().catch(console.error);
