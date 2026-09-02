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

async function capture() {
  const executablePath = getExecutablePath();
  const outputDir = path.join(__dirname, '..', 'screenshots');

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Admin Login & Navigate to Orders Feed -> Online Delivery
  try {
    console.log('1. Admin Login...');
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
      if (loginBtn) {
        loginBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });

    await new Promise((r) => setTimeout(r, 4000));

    await page.goto('http://localhost:8081/(admin)/orders', { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise((r) => setTimeout(r, 3000));

    // Click Online Delivery Tab using pointer & mouse events
    console.log('Clicking Online Delivery tab with pointer events...');
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('div, button, a, p, span'));
      const tab = all.find((el) => el.innerText && el.innerText.includes('Online Delivery'));
      if (tab) {
        const target = tab.closest('div[role="button"]') || tab;
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 2000));

    // Click Completed Sub-filter
    console.log('Clicking Completed filter...');
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('div, button, a, p, span'));
      const filter = all.find((el) => el.innerText && el.innerText.includes('Completed ('));
      if (filter) {
        const target = filter.closest('div[role="button"]') || filter;
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 2000));

    const onlineOrdersPath = path.join(outputDir, 'admin-online-delivery-feed.png');
    await page.screenshot({ path: onlineOrdersPath, fullPage: true });
    console.log('Saved Admin Online Delivery Feed:', onlineOrdersPath);
  } catch (e) {
    console.warn('Capture failed:', e.message);
  }

  await browser.close();
  console.log('Finished captures!');
}

capture().catch((err) => {
  console.error('Error in capture:', err);
  process.exit(1);
});
