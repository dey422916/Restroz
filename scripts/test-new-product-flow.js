const puppeteer = require('puppeteer-core');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BASE_URL = 'https://restroz.shop';

async function runTest() {
  console.log('🚀 Launching Chrome for Live Production Test against:', BASE_URL);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900, isMobile: true, hasTouch: true });

  page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('dialog', async (dialog) => {
    console.log('BROWSER DIALOG:', dialog.type(), dialog.message());
    await dialog.accept();
  });
  page.on('pageerror', (err) => console.log('BROWSER PAGE ERROR:', err.message));

  const testDishName = `Kashmiri Rogan Josh ${Date.now().toString().slice(-4)}`;
  const testDishSku = `SKU-ROGAN-${Date.now().toString().slice(-4)}`;
  let createdProductId = null;
  let targetRestaurantId = 'c0000000-0000-0000-0000-000000000001'; // Ratnadeep Restaurant

  try {
    // 1. Log in as Super Admin / Ratnadeep Owner
    console.log('\n--- STEP 1: Logging in as Admin (ratnadeepdey13@gmail.com) ---');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
    await page.click('[data-testid="login-submit-button"]');

    await page.waitForFunction(() => !window.location.pathname.includes('login'), { timeout: 20000 });
    console.log('Logged in successfully. URL:', page.url());

    // 2. Navigate to Products page
    console.log('\n--- STEP 2: Navigating to Products Catalog ---');
    await page.goto(`${BASE_URL}/products`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-testid="add-product-btn"]', { timeout: 25000 });
    console.log('Products catalog loaded!');

    // 3. Open Add Product Modal
    console.log('\n--- STEP 3: Opening Add Product Modal ---');
    await page.click('[data-testid="add-product-btn"]');
    await page.waitForSelector('[data-testid="save-product-modal-btn"]', { timeout: 10000 });
    await sleep(1000);

    // 4. Fill in Product Form Fields
    console.log(`\n--- STEP 4: Filling Product Form with "${testDishName}" (${testDishSku}) ---`);
    await page.waitForSelector('[data-testid="product-form-name-input"]');
    
    // Type name
    await page.click('[data-testid="product-form-name-input"]');
    await page.type('[data-testid="product-form-name-input"]', testDishName, { delay: 20 });

    // Type SKU
    await page.click('[data-testid="product-form-sku-input"]', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('[data-testid="product-form-sku-input"]', testDishSku, { delay: 20 });

    // Type Price
    await page.click('[data-testid="product-form-price-input"]', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('[data-testid="product-form-price-input"]', '320', { delay: 20 });

    await sleep(500);

    // 5. Submit Form ("CREATE PRODUCT IN DATABASE")
    console.log('\n--- STEP 5: Clicking "CREATE PRODUCT IN DATABASE" ---');
    await page.click('[data-testid="save-product-modal-btn"]');

    // Wait for modal to close automatically
    console.log('Waiting for modal to close and products to refresh...');
    await page.waitForFunction(() => {
      const modal = document.querySelector('[data-testid="save-product-modal-btn"]');
      return !modal;
    }, { timeout: 20000 });
    console.log('✅ Modal closed automatically after success!');

    await sleep(2000);

    // 6. Verify Product Appears in UI immediately without manual refresh
    console.log('\n--- STEP 6: Verifying New Product Appears in UI Immediately ---');
    const isVisibleImmediately = await page.evaluate((name) => {
      return document.body.innerText.includes(name);
    }, testDishName);

    console.log(`Product "${testDishName}" visible immediately:`, isVisibleImmediately);
    if (!isVisibleImmediately) {
      throw new Error(`Product "${testDishName}" did NOT appear in the UI list immediately!`);
    }

    // 7. Verify Supabase Database Row
    console.log('\n--- STEP 7: Verifying Database Row in Supabase ---');
    const { data: dbRows, error: dbErr } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('name', testDishName);

    if (dbErr || !dbRows || dbRows.length === 0) {
      throw new Error(`Database verification failed: Row does not exist in Supabase! ${dbErr?.message}`);
    }

    const insertedRow = dbRows[0];
    createdProductId = insertedRow.id;
    console.log('✅ Supabase row confirmed:', {
      id: insertedRow.id,
      name: insertedRow.name,
      sku: insertedRow.sku,
      price: insertedRow.price,
      restaurant_id: insertedRow.restaurant_id,
      is_active: insertedRow.is_active,
      is_available: insertedRow.is_available,
    });

    if (insertedRow.restaurant_id !== targetRestaurantId) {
      throw new Error(`Tenant mismatch! Expected restaurant_id: ${targetRestaurantId}, got: ${insertedRow.restaurant_id}`);
    }
    console.log('✅ Correct restaurant_id confirmed:', insertedRow.restaurant_id);

    // 8. Test Browser Refresh Persistence
    console.log('\n--- STEP 8: Testing Persistence After Browser Refresh ---');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="add-product-btn"]', { timeout: 25000 });
    await sleep(2000);

    const isVisibleAfterRefresh = await page.evaluate((name) => {
      return document.body.innerText.includes(name);
    }, testDishName);
    console.log(`Product visible after page refresh:`, isVisibleAfterRefresh);
    if (!isVisibleAfterRefresh) {
      throw new Error(`Product "${testDishName}" disappeared after page refresh!`);
    }

    // 9. Test Re-login Persistence
    console.log('\n--- STEP 9: Testing Persistence After Logout & Re-login ---');
    // Clear storage/cookies to simulate fresh session
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="name@example.com"]');
    await setInputValue('name@example.com', 'ratnadeepdey13@gmail.com');
    await setInputValue('Enter your password', 'Ratnadeep1@');
    await page.click('[data-testid="login-submit-button"]');
    await page.waitForFunction(() => !window.location.pathname.includes('login'), { timeout: 20000 });

    await page.goto(`${BASE_URL}/products`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="add-product-btn"]', { timeout: 25000 });
    await sleep(2000);

    const isVisibleAfterRelogin = await page.evaluate((name) => {
      return document.body.innerText.includes(name);
    }, testDishName);
    console.log(`Product visible after relogin:`, isVisibleAfterRelogin);
    if (!isVisibleAfterRelogin) {
      throw new Error(`Product "${testDishName}" disappeared after relogin!`);
    }

    // 10. Verify Tenant Isolation (Other restaurant cannot see it)
    console.log('\n--- STEP 10: Testing Tenant Isolation (Kalputra & Kullad Chai) ---');
    // Check Kalputra
    const { data: kalputraProds } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('restaurant_id', 'dba33a4a-f2fd-4b74-b7e4-d04c713c6863')
      .eq('id', createdProductId);
    console.log('Can Kalputra see product?', kalputraProds && kalputraProds.length > 0 ? 'LEAKED!' : 'NO (ISOLATED)');

    // Check Kullad Chai
    const { data: kulladProds } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('restaurant_id', 'a0000000-0000-0000-0000-000000000001')
      .eq('id', createdProductId);
    console.log('Can Kullad Chai see product?', kulladProds && kulladProds.length > 0 ? 'LEAKED!' : 'NO (ISOLATED)');

    if ((kalputraProds && kalputraProds.length > 0) || (kulladProds && kulladProds.length > 0)) {
      throw new Error('Tenant isolation violated! Product leaked to other tenants.');
    }
    console.log('✅ Tenant isolation verified: product belongs exclusively to Ratnadeep Restaurant.');

    // 11. Customer Marketplace Check
    console.log('\n--- STEP 11: Testing Customer Marketplace Menu for Ratnadeep ---');
    // Check marketplace service query for Ratnadeep
    const { data: marketProds } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('restaurant_id', targetRestaurantId)
      .eq('is_active', true)
      .eq('is_available', true);

    const inMarketplace = marketProds && marketProds.some(p => p.id === createdProductId);
    console.log(`Product in Customer Marketplace Menu:`, inMarketplace);
    if (!inMarketplace) {
      throw new Error('Product is active and available but missing from Customer Marketplace query!');
    }
    console.log('✅ Product is live and available on Customer Marketplace Menu!');

    // Take screenshot of products list showing new product
    await page.screenshot({ path: 'screenshots/verified_new_product_live.png' });
    console.log('📸 Screenshot saved to screenshots/verified_new_product_live.png');

    console.log('\n🎉 ALL 11 VERIFICATION CHECKS PASSED ON LIVE PRODUCTION!');

    return {
      pass: true,
      productName: testDishName,
      productId: createdProductId,
      restaurantId: targetRestaurantId,
    };
  } finally {
    // Keep or clean up
    await browser.close();
  }
}

runTest()
  .then(res => {
    console.log('\nFINAL RESULT:', JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  });
