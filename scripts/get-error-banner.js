const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getError() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
  });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('dialog', async (d) => {
    console.log('DIALOG:', d.type(), d.message());
    await d.accept();
  });

  await page.goto('https://restroz.shop/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="name@example.com"]');
  await page.type('input[placeholder="name@example.com"]', 'ratnadeepdey13@gmail.com');
  await page.type('input[placeholder="Enter your password"]', 'Ratnadeep1@');
  await page.click('[data-testid="login-submit-button"]');
  await page.waitForFunction(() => !window.location.pathname.includes('login'));

  await page.goto('https://restroz.shop/products', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="add-product-btn"]');
  await page.click('[data-testid="add-product-btn"]');
  await page.waitForSelector('[data-testid="product-form-name-input"]');
  await page.type('[data-testid="product-form-name-input"]', 'Debug Rogan Josh');
  await page.click('[data-testid="save-product-modal-btn"]');

  await sleep(3000);
  const info = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('*'))
      .map(el => el.innerText)
      .filter(t => t && (t.includes('⚠️') || t.includes('Failed') || t.includes('Please select') || t.includes('Missing')));
    return texts;
  });
  console.log('Detected error texts:', JSON.stringify(info, null, 2));

  await browser.close();
}
getError().catch(console.error);
