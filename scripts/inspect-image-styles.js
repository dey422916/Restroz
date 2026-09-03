const puppeteer = require('puppeteer-core');

async function inspectStyles() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto('http://localhost:8081/restaurant/a0000000-0000-0000-0000-000000000001', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 3000));

  const details = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map((img) => {
      const rect = img.getBoundingClientRect();
      const style = window.getComputedStyle(img);
      let p = img.parentElement;
      const parents = [];
      while (p && parents.length < 5) {
        const pRect = p.getBoundingClientRect();
        const pStyle = window.getComputedStyle(p);
        parents.push({
          tag: p.tagName,
          className: p.className,
          rect: { width: pRect.width, height: pRect.height, top: pRect.top, left: pRect.left },
          display: pStyle.display,
          opacity: pStyle.opacity,
          visibility: pStyle.visibility,
          position: pStyle.position,
          overflow: pStyle.overflow,
          background: pStyle.backgroundColor,
        });
        p = p.parentElement;
      }
      return {
        src: img.src,
        rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left },
        display: style.display,
        opacity: style.opacity,
        visibility: style.visibility,
        position: style.position,
        zIndex: style.zIndex,
        parents,
      };
    });
  });

  console.log('STYLES INSPECTION:', JSON.stringify(details.slice(0, 3), null, 2));
  await browser.close();
}

inspectStyles().catch(console.error);
