const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('🚀 Launching Chrome in mobile viewport (390 x 844)...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  // Mobile device viewport (iPhone 14 / modern Android dimension: 390 x 844)
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  try {
    // 1. Log in as Super Admin
    console.log('Logging in as super admin...');
    await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('input[placeholder="name@example.com"]', { timeout: 15000 });

    const setInputValue = async (placeholder, val) => {
      await page.evaluate((ph, v) => {
        const input = document.querySelector(`input[placeholder="${ph}"]`);
        if (!input) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeSetter.call(input, v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, placeholder, val);
    };

    await setInputValue('name@example.com', 'ratnadeepdey13@gmail.com');
    await setInputValue('Enter your password', 'Ratnadeep1@');
    const submitBtn = await page.$('[data-testid="login-submit-button"]');
    await submitBtn.click();
    console.log('Logging in and waiting for redirect...');
    await page.waitForFunction(() => !window.location.pathname.includes('login'), { timeout: 20000 });
    console.log('URL after login:', page.url());

    // 2. Navigate to /products
    console.log('Navigating to http://localhost:8081/products ...');
    await page.goto('http://localhost:8081/products', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for either Add button or Edit button
    console.log('Waiting for products catalog to load...');
    await page.waitForSelector('[data-testid="add-product-btn"], [data-testid="edit-product-btn"]', { timeout: 25000 });
    console.log('Products catalog loaded!');

    // 3. Click Edit on the first product (exactly reproducing user flow)
    const editBtn = await page.$('[data-testid="edit-product-btn"]');
    if (editBtn) {
      console.log('Clicking Edit Product button...');
      await editBtn.click();
    } else {
      console.log('Clicking Add Product button...');
      const addBtn = await page.$('[data-testid="add-product-btn"]');
      await addBtn.click();
    }

    // Wait for modal and Save button to be visible
    console.log('Waiting for modal to appear...');
    await page.waitForSelector('[data-testid="save-product-modal-btn"]', { timeout: 10000 });
    await sleep(1000);

    // 4. Verify Save button is visible within viewport
    const saveBtnInfo = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="save-product-modal-btn"]');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      return {
        text: btn.textContent.trim(),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 0 && rect.height > 0,
        windowHeight: window.innerHeight,
      };
    });

    console.log('\n📊 Save Button Metrics:', saveBtnInfo);

    if (!saveBtnInfo || !saveBtnInfo.inViewport) {
      throw new Error(`Save button is NOT visible in mobile viewport! ${JSON.stringify(saveBtnInfo)}`);
    }

    console.log('✅ SAVE BUTTON IS FULLY VISIBLE ON MOBILE SCREEN (Docked at bottom of card)');

    // 5. Test scrollability of modal body
    console.log('\n📜 Testing modal body scroll...');
    const scrollInfo = await page.evaluate(() => {
      const modal = document.querySelector('[data-testid="save-product-modal-btn"]')?.closest('div')?.parentElement;
      if (!modal) return { success: false, reason: 'Modal root not found' };

      // Find scrollable container inside modal
      const allDivs = Array.from(modal.querySelectorAll('div'));
      const scrollable = allDivs.find(d => {
        const style = window.getComputedStyle(d);
        return (style.overflowY === 'auto' || style.overflowY === 'scroll') && d.scrollHeight > d.clientHeight;
      });

      if (!scrollable) {
        return { success: false, reason: 'No scrollable container found with scrollHeight > clientHeight' };
      }

      const initialTop = scrollable.scrollTop;
      scrollable.scrollTop = 250;
      const newTop = scrollable.scrollTop;

      return {
        success: newTop > initialTop,
        initialTop,
        newTop,
        scrollHeight: scrollable.scrollHeight,
        clientHeight: scrollable.clientHeight,
      };
    });

    console.log('Scroll Test Result:', scrollInfo);
    if (!scrollInfo.success) {
      throw new Error(`Modal body scrolling failed: ${scrollInfo.reason}`);
    }
    console.log('✅ MODAL BODY SCROLLS SMOOTHLY AND FREELY!');

    // 6. Capture full screenshot showing the fixed modal with visible Save button
    await page.screenshot({ path: 'screenshots/mobile_product_modal_fixed.png' });
    console.log('📸 Screenshot saved to screenshots/mobile_product_modal_fixed.png');

    console.log('\n🎉 VERIFICATION COMPLETE: ALL TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
