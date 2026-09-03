const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

async function debugWeb() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  console.log('Navigating to http://localhost:8081...');
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle2' });

  // Wait 3 seconds for Expo React hydration
  await new Promise((r) => setTimeout(r, 3000));

  const imgInfo = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map((img) => ({
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      alt: img.alt,
      className: img.className,
      parentElement: img.parentElement ? img.parentElement.tagName + '.' + img.parentElement.className : null,
    }));
  });

  console.log('Found', imgInfo.length, 'images on Marketplace Home:');
  console.log(JSON.stringify(imgInfo, null, 2));

  const restCards = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('*')).filter(el => el.textContent && el.textContent.includes('Kulhad Chai')).map(el => el.tagName + ' | ' + el.textContent.slice(0, 100));
  });
  console.log('Kulhad Chai matches on page:', restCards.slice(0, 5));

  await page.screenshot({ path: 'C:/Users/ratna/.gemini/antigravity-ide/brain/d84d9cac-a69d-4421-a362-3c2125265184/marketplace_debug.png' });
  console.log('Saved screenshot to marketplace_debug.png');

  // Also navigate to restaurant detail page
  console.log('Navigating to Kulhad Chai detail page...');
  await page.goto('http://localhost:8081/restaurant/a0000000-0000-0000-0000-000000000001', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 3000));

  const detailImgs = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map((img) => ({
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }));
  });
  console.log('Detail page images:', JSON.stringify(detailImgs, null, 2));

  await page.screenshot({ path: 'C:/Users/ratna/.gemini/antigravity-ide/brain/d84d9cac-a69d-4421-a362-3c2125265184/detail_debug.png' });
  console.log('Saved screenshot to detail_debug.png');

  await browser.close();
}

debugWeb().catch(console.error);
