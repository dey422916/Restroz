const puppeteer = require('puppeteer-core');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log('🚀 Launching Chrome to test Web Login UI Error Feedback...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    console.log('🌐 Navigating to http://localhost:8081/(auth)/login ...');
    await page.goto('http://localhost:8081/(auth)/login', { waitUntil: 'networkidle0', timeout: 30000 });

    await page.waitForSelector('input[placeholder="name@example.com"]', { timeout: 15000 });
    console.log('✅ Login screen loaded successfully');

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

    const clearInputs = async () => {
      await setInputValue('name@example.com', '');
      await setInputValue('Enter your password', '');
      await sleep(100);
    };

    const getSubmitButton = () => page.$('[data-testid="login-submit-button"]');

    const getErrorText = async () => {
      const el = await page.$('[data-testid="login-error-text"]');
      if (!el) return null;
      return page.evaluate((node) => node.textContent?.trim(), el);
    };

    // TEST 1: Empty Email
    console.log('\n--- TEST 1: Empty email ---');
    await clearInputs();
    const btn1 = await getSubmitButton();
    await btn1.click();
    await sleep(300);
    const err1 = await getErrorText();
    console.log('Result:', err1);
    if (err1 !== 'Email is required.') throw new Error(`Test 1 Failed: Expected "Email is required.", got "${err1}"`);
    console.log('✅ TEST 1 PASS');

    // TEST 2: Invalid Email Format
    console.log('\n--- TEST 2: Invalid email format ---');
    await setInputValue('name@example.com', 'invalid-email-format');
    const btn2 = await getSubmitButton();
    await btn2.click();
    await sleep(300);
    const err2 = await getErrorText();
    console.log('Result:', err2);
    if (err2 !== 'Enter a valid email address.') throw new Error(`Test 2 Failed: Expected "Enter a valid email address.", got "${err2}"`);
    console.log('✅ TEST 2 PASS');

    // TEST 3: Empty Password
    console.log('\n--- TEST 3: Empty password ---');
    await clearInputs();
    await setInputValue('name@example.com', 'test@example.com');
    const btn3 = await getSubmitButton();
    await btn3.click();
    await sleep(300);
    const err3 = await getErrorText();
    console.log('Result:', err3);
    if (err3 !== 'Password is required.') throw new Error(`Test 3 Failed: Expected "Password is required.", got "${err3}"`);
    console.log('✅ TEST 3 PASS');

    // TEST 4: Typing clears error
    console.log('\n--- TEST 4: Typing clears error ---');
    await setInputValue('Enter your password', 'a');
    await sleep(200);
    const err4 = await getErrorText();
    console.log('Result after typing password:', err4);
    if (err4 !== null && err4 !== '') throw new Error(`Test 4 Failed: Expected error to clear, got "${err4}"`);
    console.log('✅ TEST 4 PASS: Error cleared upon typing');

    // TEST 5: Non-existing email
    console.log('\n--- TEST 5: Non-existing email ---');
    await clearInputs();
    await setInputValue('name@example.com', 'non_existent_user_9988@test.com');
    await setInputValue('Enter your password', 'WrongPassword123!');
    const btn5 = await getSubmitButton();
    await btn5.click();
    console.log('Waiting for Supabase response...');
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="login-error-text"]');
      return el && el.textContent.trim().length > 0;
    }, { timeout: 10000 });
    const err5 = await getErrorText();
    console.log('Result:', err5);
    if (err5 !== 'Incorrect email or password.') throw new Error(`Test 5 Failed: Expected "Incorrect email or password.", got "${err5}"`);
    console.log('✅ TEST 5 PASS');

    // TEST 6: Correct email + wrong password
    console.log('\n--- TEST 6: Correct email + wrong password ---');
    await clearInputs();
    await setInputValue('name@example.com', 'ratnadeepdey13@gmail.com');
    await setInputValue('Enter your password', 'DefinitelyWrongPassword999!');
    const btn6 = await getSubmitButton();
    await btn6.click();
    console.log('Waiting for Supabase response...');
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="login-error-text"]');
      return el && el.textContent.trim().length > 0;
    }, { timeout: 10000 });
    const err6 = await getErrorText();
    console.log('Result:', err6);
    if (err6 !== 'Incorrect email or password.') throw new Error(`Test 6 Failed: Expected "Incorrect email or password.", got "${err6}"`);
    console.log('✅ TEST 6 PASS');

    // Take screenshot of error feedback in UI
    await page.screenshot({ path: 'screenshots/login_error_feedback.png' });
    console.log('📸 Screenshot saved to screenshots/login_error_feedback.png');

    // TEST 7: Correct credentials
    console.log('\n--- TEST 7: Correct login credentials ---');
    await clearInputs();
    await setInputValue('name@example.com', 'ratnadeepdey13@gmail.com');
    await setInputValue('Enter your password', 'Ratnadeep1@');
    const btn7 = await getSubmitButton();
    await btn7.click();
    console.log('Logging in and waiting for role routing...');
    await sleep(4000);
    const currentUrl = page.url();
    console.log('Navigated URL after correct login:', currentUrl);
    if (!currentUrl.includes('super-admin')) {
      throw new Error(`Test 7 Failed: Expected to route to /super-admin, got "${currentUrl}"`);
    }
    console.log('✅ TEST 7 PASS: Correct login routed to /super-admin');

    console.log('\n🎉 ALL WEB LOGIN UI TESTS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
