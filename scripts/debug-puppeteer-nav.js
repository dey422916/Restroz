const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('https://restroz.shop/(auth)/login', { waitUntil: 'networkidle2' });
  const inputs = await p.$$('input');
  await inputs[0].type('ratnadeepdey13@gmail.com');
  await inputs[1].type('Ratnadeep1@');
  
  const btns = await p.$$('div[role="button"]');
  for (const btn of btns) {
    const txt = await p.evaluate(el => el.innerText, btn);
    if (txt && (txt.includes('LOGIN') || txt.includes('SIGN IN'))) {
      await btn.click();
      break;
    }
  }
  await sleep(4000);
  console.log('Current URL after login:', p.url());
  await p.goto('https://restroz.shop/(admin)/settings', { waitUntil: 'networkidle2' });
  await sleep(3000);
  console.log('Current URL on settings:', p.url());
  const text = await p.evaluate(() => document.body.innerText);
  console.log('Body snippet:\n', text.slice(0, 400));
  await b.close();
})();
