const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('https://restroz.shop/login', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input[placeholder="name@example.com"]');
  await p.type('input[placeholder="name@example.com"]', 'ratnadeepdey13@gmail.com');
  await p.type('input[placeholder="Enter your password"]', 'Ratnadeep1@');
  await p.click('[data-testid="login-submit-button"]');
  await p.waitForFunction(() => !window.location.pathname.includes('login'));
  console.log('Logged in to:', p.url());
  
  await p.goto('https://restroz.shop/settings', { waitUntil: 'networkidle2' });
  console.log('Waiting 6s for React Native Web to render...');
  await sleep(6000);
  console.log('Path /settings URL:', p.url());
  const text = await p.evaluate(() => document.body.innerText);
  console.log('Contains Printer Settings:', text.includes('Printer Settings'));
  console.log('Contains KOT Paper Size:', text.includes('KOT Paper Size'));
  console.log('Body length:', text.length);
  console.log('Page snippet:\n', text.slice(0, 400));
  await b.close();
})();
