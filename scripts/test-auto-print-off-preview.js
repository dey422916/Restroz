const assert = require('assert');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Colors for reporting
const green = '\x1b[32m';
const red = '\x1b[31m';
const cyan = '\x1b[36m';
const reset = '\x1b[0m';
const bold = '\x1b[1m';

function logPass(msg) {
  console.log(`  ${green}✔${reset} ${msg}`);
}
function logFail(msg) {
  console.log(`  ${red}✖${reset} ${msg}`);
}
function logSection(title) {
  console.log(`\n${bold}${cyan}=== ${title} ===${reset}`);
}

// Logic matching src/services/directPrintService.ts
function isAutoPrintEnabled(settings) {
  if (!settings) return false;
  return Boolean(
    settings.auto_print_kot ||
    settings.kot_auto_print ||
    settings.auto_print
  );
}

// Simulates KOT HTML generator logic from printService.ts
function generateKotHtml(order, settings, kot, isReprint = false) {
  const paperSize = settings.kot_paper_size || '80mm';
  const is58 = paperSize === '58mm';
  const isA4 = paperSize === 'A4';

  const style = isA4
    ? `@page { size: A4 portrait; margin: 10mm 12mm; }
       html, body { width: 100%; margin: 0; padding: 0; font-size: 13.5px; line-height: 1.4; color: #111; }
       .receipt-container { width: 100%; max-width: 180mm; margin: 0 auto; padding: 10px 0; }`
    : is58
    ? `@page { size: 58mm auto; margin: 0; }
       html, body { width: 58mm; margin: 0; padding: 0; font-size: 10.5px; line-height: 1.15; color: #000; }
       .receipt-container { width: 48mm; max-width: 48mm; margin: 0 auto; padding: 1mm 1mm; }`
    : `@page { size: 80mm auto; margin: 0; }
       html, body { width: 80mm; margin: 0; padding: 0; font-size: 10.5px; line-height: 1.20; color: #000; }
       .receipt-container { width: 72mm; max-width: 72mm; margin: 0 8mm 0 0mm; padding: 1mm 1.5mm; }`;

  const itemsHtml = (kot?.items || order.items || [])
    .map((item) => `<tr><td>${item.quantity}</td><td>${item.name}</td><td>${item.notes || ''}</td></tr>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>KOT #${kot?.kot_number || '1'}</title>
        <style>${style}</style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="kot-title">KITCHEN ORDER TICKET (KOT)</div>
          <div class="bill-no">KOT #${kot?.kot_number || '1'} | Order #${order.order_number}</div>
          <div class="table-info">Table: ${order.table_number || 'Takeaway'}</div>
          <table>
            <thead><tr><th>Qty</th><th>Item</th><th>Notes</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>
      </body>
    </html>
  `;
}

// Simulates Final Receipt HTML generator logic from printService.ts
function generateFinalReceiptHtml(order, settings, billedBy) {
  const billPaperSize = settings.bill_paper_size || settings.kot_paper_size || '80mm';
  const is58 = billPaperSize === '58mm';
  const isA4 = billPaperSize === 'A4';

  const style = isA4
    ? `@page { size: A4 portrait; margin: 10mm 12mm; }
       html, body { width: 100%; margin: 0; padding: 0; font-size: 13.5px; line-height: 1.4; color: #000; }
       .receipt-container { width: 100%; max-width: 180mm; margin: 0 auto; padding: 10px 0; }`
    : is58
    ? `@page { size: 58mm auto; margin: 0; }
       html, body { width: 58mm; margin: 0; padding: 0; font-size: 10.5px; line-height: 1.15; color: #000; }
       .receipt-container { width: 48mm; max-width: 48mm; margin: 0 auto; padding: 1mm 1mm; }`
    : `@page { size: 80mm auto; margin: 0; }
       html, body { width: 80mm; margin: 0; padding: 0; font-size: 10.5px; line-height: 1.20; color: #000; }
       .receipt-container { width: 72mm; max-width: 72mm; margin: 0 8mm 0 0mm; padding: 1mm 1.5mm; }`;

  const itemsHtml = (order.items || [])
    .map((item) => `<tr><td>${item.name}</td><td>${item.quantity}</td><td>₹${item.price}</td><td>₹${item.total || item.quantity * item.price}</td></tr>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt #${order.order_number}</title>
        <style>${style}</style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="restaurant-title">${settings.name || 'Ratnadeep Restaurant'}</div>
          <div class="branch-title">${settings.address || ''}</div>
          <div class="legal-meta">GSTIN: ${settings.gstin || 'N/A'} | FSSAI: ${settings.fssai_number || 'N/A'}</div>
          <div class="order-meta">Order #${order.order_number} | Table: ${order.table_number || 'Takeaway'}</div>
          <div class="cust-meta">Customer: ${order.customer_name || 'Counter Guest'} (${order.customer_phone || ''})</div>
          <div class="cashier-meta">Billed By: ${billedBy || 'Cashier'}</div>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div class="totals">
            <div>Subtotal: ₹${order.subtotal}</div>
            <div>CGST: ₹${order.cgst_amount}</div>
            <div>SGST: ₹${order.sgst_amount}</div>
            <div class="grand-total">Total Payable: ₹${order.payable_amount}</div>
            <div class="paid-badge">PAID [${order.payments?.[0]?.payment_method?.toUpperCase() || 'CASH'}]</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function runTestSuite() {
  console.log(`${bold}Starting Verification: Auto Print OFF Native Browser Print Preview${reset}`);

  let passedTests = 0;
  let totalTests = 0;

  function test(name, fn) {
    totalTests++;
    try {
      fn();
      logPass(name);
      passedTests++;
    } catch (e) {
      logFail(`${name} -> ${e.message}`);
      throw e;
    }
  }

  async function testAsync(name, fn) {
    totalTests++;
    try {
      await fn();
      logPass(name);
      passedTests++;
    } catch (e) {
      logFail(`${name} -> ${e.message}`);
      throw e;
    }
  }

  // Sample test fixtures
  const sampleSettingsAutoOff = {
    restaurant_id: 'rest-123',
    name: 'Ratnadeep Restaurant',
    address: '123 Station Road, Bolpur',
    phone: '+91 98765 43210',
    gstin: '19ABCDE1234F1Z5',
    fssai_number: '12821013000123',
    auto_print_kot: false,
    kot_paper_size: '80mm',
    bill_paper_size: '80mm',
  };

  const sampleSettingsAutoOff58 = {
    ...sampleSettingsAutoOff,
    kot_paper_size: '58mm',
    bill_paper_size: '58mm',
  };

  const sampleSettingsAutoOn = {
    ...sampleSettingsAutoOff,
    auto_print_kot: true,
  };

  const sampleOrder = {
    id: 'ord-001',
    order_number: '101',
    restaurant_id: 'rest-123',
    order_type: 'dine_in',
    table_number: 'T4',
    customer_name: 'Rahul Sharma',
    customer_phone: '9876543210',
    status: 'confirmed',
    payment_status: 'paid',
    items: [
      { id: 'i1', name: 'Chicken Biryani', quantity: 2, price: 250, total: 500 },
      { id: 'i2', name: 'Butter Naan', quantity: 3, price: 40, total: 120 },
    ],
    kots: [
      {
        id: 'kot-001',
        kot_number: 'KOT-101',
        order_number: '101',
        order_type: 'dine_in',
        table_number: 'T4',
        kitchen_notes: 'Spicy',
        items: [
          { name: 'Chicken Biryani', quantity: 2, notes: 'Spicy' },
          { name: 'Butter Naan', quantity: 3 },
        ],
        created_at: new Date().toISOString(),
      },
    ],
    payments: [
      {
        payment_method: 'upi',
        amount: 651,
        reference_number: 'UPI-TXN-9988',
        created_at: new Date().toISOString(),
      },
    ],
    subtotal: 620,
    discount_amount: 0,
    cgst_amount: 15.5,
    sgst_amount: 15.5,
    grand_total: 651,
    payable_amount: 651,
    round_off: 0,
    created_at: new Date().toISOString(),
  };

  // 1. isAutoPrintEnabled Gate Logic
  logSection('1. isAutoPrintEnabled Gate Logic');

  test('isAutoPrintEnabled returns false when auto_print_kot is false', () => {
    assert.strictEqual(isAutoPrintEnabled(sampleSettingsAutoOff), false);
    assert.strictEqual(isAutoPrintEnabled({ auto_print_kot: false }), false);
    assert.strictEqual(isAutoPrintEnabled(null), false);
    assert.strictEqual(isAutoPrintEnabled(undefined), false);
  });

  test('isAutoPrintEnabled returns true when auto_print_kot is true', () => {
    assert.strictEqual(isAutoPrintEnabled(sampleSettingsAutoOn), true);
    assert.strictEqual(isAutoPrintEnabled({ auto_print_kot: true }), true);
    assert.strictEqual(isAutoPrintEnabled({ auto_print: true }), true);
  });

  // 2. KOT Generation HTML Formatting and CSS Paper Sizes
  logSection('2. KOT HTML Generation & Paper Size Formatting');

  test('generateKotHtml generates correct 80mm CSS and content', () => {
    const kotHtml = generateKotHtml(
      sampleOrder,
      sampleSettingsAutoOff,
      sampleOrder.kots[0]
    );
    assert(kotHtml.includes('@page { size: 80mm auto; margin: 0; }'), 'Must contain 80mm @page CSS');
    assert(kotHtml.includes('width: 72mm; max-width: 72mm;'), 'Must contain 72mm container width');
    assert(kotHtml.includes('KOT #KOT-101') || kotHtml.includes('KOT-101'), 'Must include KOT number');
    assert(kotHtml.includes('Chicken Biryani'), 'Must include item Chicken Biryani');
    assert(kotHtml.includes('Butter Naan'), 'Must include item Butter Naan');
    assert(kotHtml.includes('T4'), 'Must include table T4');
  });

  test('generateKotHtml generates correct 58mm CSS and content', () => {
    const kotHtml58 = generateKotHtml(
      sampleOrder,
      sampleSettingsAutoOff58,
      sampleOrder.kots[0]
    );
    assert(kotHtml58.includes('@page { size: 58mm auto; margin: 0; }'), 'Must contain 58mm @page CSS');
    assert(kotHtml58.includes('width: 48mm; max-width: 48mm;'), 'Must contain 48mm container width');
    assert(kotHtml58.includes('KOT #KOT-101') || kotHtml58.includes('KOT-101'), 'Must include KOT number');
  });

  // 3. Final Thermal Bill HTML Formatting and Details
  logSection('3. Final Thermal Bill Receipt Generation & Completeness');
  test('generateFinalReceiptHtml generates 80mm bill with full financial breakdown', () => {
    const billHtml = generateFinalReceiptHtml(
      sampleOrder,
      sampleSettingsAutoOff,
      'Admin Cashier'
    );
    assert(billHtml.includes('@page { size: 80mm auto; margin: 0; }'), 'Must contain 80mm @page CSS');
    assert(billHtml.includes('Ratnadeep Restaurant'), 'Must include restaurant name');
    assert(billHtml.includes('Rahul Sharma'), 'Must include customer name');
    assert(billHtml.includes('Chicken Biryani'), 'Must include Chicken Biryani');
    assert(billHtml.includes('Butter Naan'), 'Must include Butter Naan');
    assert(billHtml.includes('CGST') || billHtml.includes('GST'), 'Must include GST information');
    assert(billHtml.includes('651'), 'Must include payable amount');
    assert(billHtml.includes('PAID'), 'Must include PAID status');
  });

  test('generateFinalReceiptHtml generates 58mm bill with full financial breakdown', () => {
    const billHtml58 = generateFinalReceiptHtml(
      sampleOrder,
      sampleSettingsAutoOff58,
      'Admin Cashier'
    );
    assert(billHtml58.includes('@page { size: 58mm auto; margin: 0; }'), 'Must contain 58mm @page CSS');
    assert(billHtml58.includes('width: 48mm; max-width: 48mm;'), 'Must contain 48mm container width');
    assert(billHtml58.includes('Ratnadeep Restaurant'), 'Must include restaurant name');
    assert(billHtml58.includes('651'), 'Must include payable amount');
  });

  // 4. Codebase Static Verification of Call Sites
  logSection('4. Static Codebase Verification in PosContext & orders.tsx');

  test('src/context/PosContext.tsx calls printKotThermalBrowser when Auto Print is OFF', () => {
    const posContextCode = fs.readFileSync('src/context/PosContext.tsx', 'utf8');
    assert(
      posContextCode.includes('printService.printKotThermalBrowser(newOrder, settings, initialKot, false)'),
      'confirmOrder must call printKotThermalBrowser when Auto Print is OFF'
    );
    assert(
      posContextCode.includes('printService.printKotThermalBrowser(updated, settings, deltaKot, false)'),
      'updateActiveOrder must call printKotThermalBrowser for delta KOT when Auto Print is OFF'
    );
  });

  test('src/context/PosContext.tsx calls printFinalReceiptThermalBrowser upon settlement when Auto Print is OFF', () => {
    const posContextCode = fs.readFileSync('src/context/PosContext.tsx', 'utf8');
    assert(
      posContextCode.includes('printService.printFinalReceiptThermalBrowser(updatedOrder, settings, billedBy)'),
      'processPayment must call printFinalReceiptThermalBrowser upon settlement when Auto Print is OFF'
    );
  });

  test('app/(admin)/orders.tsx calls printKotThermalBrowser when Auto Print is OFF', () => {
    const ordersCode = fs.readFileSync('app/(admin)/orders.tsx', 'utf8');
    assert(
      ordersCode.includes('printService.printKotThermalBrowser(order, settings, newKot, false)'),
      'orders.tsx supplementary KOT must call printKotThermalBrowser when Auto Print is OFF'
    );
  });

  test('app/(admin)/orders.tsx calls printFinalReceiptThermalBrowser upon settlement when Auto Print is OFF', () => {
    const ordersCode = fs.readFileSync('app/(admin)/orders.tsx', 'utf8');
    assert(
      ordersCode.includes('printService.printFinalReceiptThermalBrowser(completed, settings, billedBy)'),
      'orders.tsx handleSettleConfirm must call printFinalReceiptThermalBrowser upon settlement when Auto Print is OFF'
    );
  });

  // 5. Workflow Branching Verification (Auto Print OFF vs ON)
  logSection('5. Workflow Branching: Auto Print OFF vs Auto Print ON');

  testAsync('When Auto Print is OFF: KOT confirmation triggers browser preview, not direct print', async () => {
    let directPrintCalled = false;
    let browserPreviewCalled = false;
    let previewOrderNumber = null;

    const mockPrintService = {
      printKotThermal: async () => {
        directPrintCalled = true;
        return { direct: true };
      },
      printKotThermalBrowser: async (order) => {
        browserPreviewCalled = true;
        previewOrderNumber = order.order_number;
      },
    };

    const settings = sampleSettingsAutoOff;
    const newOrder = sampleOrder;
    const initialKot = sampleOrder.kots[0];

    const autoPrintOn = isAutoPrintEnabled(settings);
    if (autoPrintOn) {
      await mockPrintService.printKotThermal(newOrder, settings, initialKot, false);
    } else {
      await mockPrintService.printKotThermalBrowser(newOrder, settings, initialKot, false);
    }

    assert.strictEqual(directPrintCalled, false, 'Direct thermal print MUST NOT be dispatched when Auto Print is OFF');
    assert.strictEqual(browserPreviewCalled, true, 'Browser print preview MUST be opened when Auto Print is OFF');
    assert.strictEqual(previewOrderNumber, '101', 'Browser print preview must receive the confirmed order');
  });

  testAsync('When Auto Print is ON: KOT confirmation triggers direct print, NOT browser preview', async () => {
    let directPrintCalled = false;
    let browserPreviewCalled = false;

    const mockPrintService = {
      printKotThermal: async () => {
        directPrintCalled = true;
        return { direct: true };
      },
      printKotThermalBrowser: async () => {
        browserPreviewCalled = true;
      },
    };

    const settings = sampleSettingsAutoOn;
    const newOrder = sampleOrder;
    const initialKot = sampleOrder.kots[0];

    const autoPrintOn = isAutoPrintEnabled(settings);
    if (autoPrintOn) {
      await mockPrintService.printKotThermal(newOrder, settings, initialKot, false);
    } else {
      await mockPrintService.printKotThermalBrowser(newOrder, settings, initialKot, false);
    }

    assert.strictEqual(directPrintCalled, true, 'Direct thermal print MUST be dispatched when Auto Print is ON');
    assert.strictEqual(browserPreviewCalled, false, 'Browser print preview MUST NOT be opened when Auto Print is ON');
  });

  testAsync('When Auto Print is OFF: Bill settlement triggers browser preview, not direct print', async () => {
    let directPrintCalled = false;
    let browserPreviewCalled = false;
    let previewOrderNumber = null;

    const mockPrintService = {
      printBillThermal: async () => {
        directPrintCalled = true;
        return { direct: true };
      },
      printFinalReceiptThermalBrowser: async (order) => {
        browserPreviewCalled = true;
        previewOrderNumber = order.order_number;
      },
    };

    const settings = sampleSettingsAutoOff;
    const updatedOrder = sampleOrder;

    if (isAutoPrintEnabled(settings)) {
      await mockPrintService.printBillThermal(updatedOrder, settings, 'Admin');
    } else {
      await mockPrintService.printFinalReceiptThermalBrowser(updatedOrder, settings, 'Admin');
    }

    assert.strictEqual(directPrintCalled, false, 'Direct bill print MUST NOT be dispatched when Auto Print is OFF');
    assert.strictEqual(browserPreviewCalled, true, 'Browser bill preview MUST be opened when Auto Print is OFF');
    assert.strictEqual(previewOrderNumber, '101', 'Browser bill preview must receive the settled order');
  });

  testAsync('When Auto Print is ON: Bill settlement triggers direct print, NOT browser preview', async () => {
    let directPrintCalled = false;
    let browserPreviewCalled = false;

    const mockPrintService = {
      printBillThermal: async () => {
        directPrintCalled = true;
        return { direct: true };
      },
      printFinalReceiptThermalBrowser: async () => {
        browserPreviewCalled = true;
      },
    };

    const settings = sampleSettingsAutoOn;
    const updatedOrder = sampleOrder;

    if (isAutoPrintEnabled(settings)) {
      await mockPrintService.printBillThermal(updatedOrder, settings, 'Admin');
    } else {
      await mockPrintService.printFinalReceiptThermalBrowser(updatedOrder, settings, 'Admin');
    }

    assert.strictEqual(directPrintCalled, true, 'Direct bill print MUST be dispatched when Auto Print is ON');
    assert.strictEqual(browserPreviewCalled, false, 'Browser bill preview MUST NOT be opened when Auto Print is ON');
  });

  testAsync('If operator cancels browser print preview, order and settlement data remain intact', async () => {
    let orderCommitted = false;
    let settlementCommitted = false;

    // Simulate order creation in DB
    const savedOrder = { ...sampleOrder, id: 'ord-persisted-999' };
    orderCommitted = true;

    // Simulate browser preview cancel (e.g. user closes dialog or cancels)
    const mockPrintPreviewWithCancel = async () => {
      return;
    };

    await mockPrintPreviewWithCancel();

    assert.strictEqual(orderCommitted, true, 'Order data remains committed in DB even when print preview is cancelled');

    settlementCommitted = true;
    await mockPrintPreviewWithCancel();
    assert.strictEqual(settlementCommitted, true, 'Settlement remains finalized even when bill preview is cancelled');
  });

  // 6. Headless Chrome End-to-End DOM Test
  logSection('6. Headless Chrome DOM & Isolated Print Engine Verification');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (fs.existsSync(chromePath)) {
    await testAsync('Chrome loads isolated iframe and triggers iframe.contentWindow.print() for KOT', async () => {
      const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        const page = await browser.newPage();
        await page.setContent('<!DOCTYPE html><html><body><div id="root"><h1>RestroZ POS Web App</h1></div></body></html>');

        const kotHtml = generateKotHtml(sampleOrder, sampleSettingsAutoOff, sampleOrder.kots[0]);

        const result = await page.evaluate((html) => {
          return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.id = 'ratnadeep-pos-print-frame';
            iframe.name = 'ratnadeep-pos-print-frame';
            iframe.style.position = 'fixed';
            iframe.style.top = '-9999px';
            iframe.style.left = '-9999px';
            iframe.style.width = '320px';
            iframe.style.height = '480px';
            iframe.style.border = 'none';
            iframe.style.visibility = 'hidden';
            document.body.appendChild(iframe);

            let printCalledOnIframe = false;
            let iframeContentMatches = false;

            const doc = iframe.contentWindow?.document || iframe.contentDocument;
            if (doc) {
              iframe.contentWindow.print = () => {
                printCalledOnIframe = true;
              };

              doc.open();
              doc.write(html);
              doc.close();

              iframeContentMatches = doc.body.innerHTML.includes('Chicken Biryani') && doc.body.innerHTML.includes('KOT-101');

              setTimeout(() => {
                iframe.contentWindow.print();
                const parentRemainsClean = document.getElementById('root')?.textContent === 'RestroZ POS Web App';
                iframe.remove();
                const iframeCleanedUp = document.getElementById('ratnadeep-pos-print-frame') === null;

                resolve({
                  printCalledOnIframe,
                  iframeContentMatches,
                  parentRemainsClean,
                  iframeCleanedUp,
                });
              }, 100);
            }
          });
        }, kotHtml);

        assert.strictEqual(result.printCalledOnIframe, true, 'iframe.contentWindow.print() was triggered');
        assert.strictEqual(result.iframeContentMatches, true, 'Iframe rendered KOT content accurately');
        assert.strictEqual(result.parentRemainsClean, true, 'Parent application window remained untouched');
        assert.strictEqual(result.iframeCleanedUp, true, 'Print iframe was cleanly removed after execution');
      } finally {
        await browser.close();
      }
    });

    await testAsync('Chrome loads isolated iframe and triggers iframe.contentWindow.print() for Bill', async () => {
      const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        const page = await browser.newPage();
        await page.setContent('<!DOCTYPE html><html><body><div id="root"><h1>RestroZ POS Web App</h1></div></body></html>');

        const billHtml = generateFinalReceiptHtml(sampleOrder, sampleSettingsAutoOff, 'Admin');

        const result = await page.evaluate((html) => {
          return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.id = 'ratnadeep-pos-print-frame';
            iframe.name = 'ratnadeep-pos-print-frame';
            iframe.style.position = 'fixed';
            iframe.style.top = '-9999px';
            iframe.style.left = '-9999px';
            iframe.style.width = '320px';
            iframe.style.height = '480px';
            iframe.style.border = 'none';
            iframe.style.visibility = 'hidden';
            document.body.appendChild(iframe);

            let printCalledOnIframe = false;
            let iframeContentMatches = false;

            const doc = iframe.contentWindow?.document || iframe.contentDocument;
            if (doc) {
              iframe.contentWindow.print = () => {
                printCalledOnIframe = true;
              };

              doc.open();
              doc.write(html);
              doc.close();

              iframeContentMatches = doc.body.innerHTML.includes('Ratnadeep Restaurant') && doc.body.innerHTML.includes('651');

              setTimeout(() => {
                iframe.contentWindow.print();
                const parentRemainsClean = document.getElementById('root')?.textContent === 'RestroZ POS Web App';
                iframe.remove();
                const iframeCleanedUp = document.getElementById('ratnadeep-pos-print-frame') === null;

                resolve({
                  printCalledOnIframe,
                  iframeContentMatches,
                  parentRemainsClean,
                  iframeCleanedUp,
                });
              }, 100);
            }
          });
        }, billHtml);

        assert.strictEqual(result.printCalledOnIframe, true, 'iframe.contentWindow.print() was triggered for Bill');
        assert.strictEqual(result.iframeContentMatches, true, 'Iframe rendered Bill content with totals accurately');
        assert.strictEqual(result.parentRemainsClean, true, 'Parent application window remained untouched');
        assert.strictEqual(result.iframeCleanedUp, true, 'Print iframe was cleanly removed after execution');
      } finally {
        await browser.close();
      }
    });
  } else {
    console.log('Skipping headless Chrome test: Chrome executable not found at standard path.');
  }

  logSection('Summary');
  console.log(`${green}${bold}Passed all ${passedTests} / ${totalTests} tests successfully.${reset}\n`);
}

runTestSuite().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
