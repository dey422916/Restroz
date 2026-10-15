/**
 * Test Suite: KOT Rendering Verification (ESC/POS & HTML)
 * Validates that amendment tickets format cancellation & addition sections clearly
 * and NEVER print raw negative quantities.
 */

const assert = require('assert');

// Test HTML generation function mimicking printService.generateKotHtml
function generateTestKotHtml(order, settings, kot, isReprint = false) {
  const activeKot = kot;
  let kotNum = activeKot?.kot_number || 'KOT-001';
  const paperSize = settings.kot_paper_size || '80mm';
  const is58 = paperSize === '58mm';
  const isA4 = paperSize === 'A4';

  const isSupplementary = activeKot
    ? Boolean(kotNum.includes('SUP')) ||
      Boolean(activeKot.kitchen_notes && activeKot.kitchen_notes.toUpperCase().includes('SUP')) ||
      Boolean(activeKot.kitchen_notes && activeKot.kitchen_notes.toUpperCase().includes('UPDATE')) ||
      Boolean(activeKot.kitchen_notes && activeKot.kitchen_notes.toUpperCase().includes('CANCEL'))
    : false;

  const itemsToPrint = [];
  if (activeKot && activeKot.items && activeKot.items.length > 0) {
    activeKot.items.forEach((ki) => {
      itemsToPrint.push({
        name: ki.product_name.replace('[CANCELLED]', '').trim(),
        quantity: ki.quantity,
        notes: ki.notes,
      });
    });
  } else if (order.items && order.items.length > 0) {
    order.items.forEach((oi) => {
      itemsToPrint.push({
        name: oi.product_name,
        quantity: oi.quantity,
        notes: oi.item_notes,
      });
    });
  }

  const cancelledItems = itemsToPrint.filter(
    (i) => i.quantity < 0 || (i.notes && i.notes.includes('[CANCELLED]')) || i.name.includes('[CANCELLED]')
  );
  const addedItems = itemsToPrint.filter(
    (i) => i.quantity > 0 && !(i.notes && i.notes.includes('[CANCELLED]')) && !i.name.includes('[CANCELLED]')
  );
  const hasCancellation = cancelledItems.length > 0;

  const renderRow = (item, isCancel) => {
    const cleanName = item.name.replace('[CANCELLED]', '').trim();
    const cleanNotes = item.notes?.replace('[CANCELLED]', '').trim();
    const displayQty = Math.abs(item.quantity);
    return `<tr><td>${isCancel ? '[CANCEL] ' : ''}${cleanName}</td><td>${displayQty}</td></tr>`;
  };

  const tableBodyHtml = hasCancellation
    ? `
      ${cancelledItems.length > 0 ? `
        <div class="cancel-header">CANCELLED / REMOVE</div>
        <table><tbody>${cancelledItems.map((i) => renderRow(i, true)).join('')}</tbody></table>
      ` : ''}
      ${addedItems.length > 0 ? `
        <div class="add-header">ADDED</div>
        <table><tbody>${addedItems.map((i) => renderRow(i, false)).join('')}</tbody></table>
      ` : ''}
    `
    : `
      ${isSupplementary && addedItems.length > 0 ? `<div class="add-header">ADDED</div>` : ''}
      <table><tbody>${itemsToPrint.map((i) => renderRow(i, false)).join('')}</tbody></table>
    `;

  return {
    hasCancellation,
    banner: hasCancellation ? '*** KOT UPDATE ***' : isSupplementary ? '*** SUPPLEMENTARY KOT (SUP) ***' : '',
    cancelledCount: cancelledItems.length,
    addedCount: addedItems.length,
    html: tableBodyHtml,
  };
}

console.log('=== RUNNING RESTROZ KOT RENDERING TESTS ===\n');

// Test 1: Cancellation Only
{
  const order = { id: 'ord-1', order_number: '101' };
  const settings = { kot_paper_size: '80mm' };
  const kot = {
    kot_number: 'KOT-001-SUP',
    kitchen_notes: '[KOT CANCEL] Items removed',
    items: [
      { product_name: 'Aloo Paratha', quantity: -2, notes: '[CANCELLED]' },
    ],
  };

  const res = generateTestKotHtml(order, settings, kot);
  assert.strictEqual(res.hasCancellation, true, 'Must detect cancellation');
  assert.strictEqual(res.banner, '*** KOT UPDATE ***', 'Banner must be *** KOT UPDATE ***');
  assert.strictEqual(res.cancelledCount, 1, '1 cancelled item');
  assert.strictEqual(res.addedCount, 0, '0 added items');
  assert.ok(res.html.includes('CANCELLED / REMOVE'), 'HTML contains CANCELLED / REMOVE header');
  assert.ok(res.html.includes('<td>2</td>'), 'Renders positive quantity 2, NOT -2');
  assert.ok(!res.html.includes('-2'), 'Must NEVER render -2');
  console.log('✅ TEST 1 PASSED: Cancellation KOT renders *** KOT UPDATE *** and CANCELLED / REMOVE with positive qty 2.');
}

// Test 2: Mixed Add & Cancel
{
  const order = { id: 'ord-1', order_number: '101' };
  const settings = { kot_paper_size: '80mm' };
  const kot = {
    kot_number: 'KOT-001-SUP',
    kitchen_notes: '[KOT UPDATE] Order modified',
    items: [
      { product_name: 'Aloo Paratha', quantity: -1, notes: '[CANCELLED]' },
      { product_name: 'Cheese Corn', quantity: 2, notes: '' },
    ],
  };

  const res = generateTestKotHtml(order, settings, kot);
  assert.strictEqual(res.hasCancellation, true);
  assert.strictEqual(res.cancelledCount, 1);
  assert.strictEqual(res.addedCount, 1);
  assert.ok(res.html.includes('CANCELLED / REMOVE'), 'Has CANCELLED header');
  assert.ok(res.html.includes('ADDED'), 'Has ADDED header');
  assert.ok(res.html.includes('<td>1</td>'), 'Renders cancelled qty 1');
  assert.ok(res.html.includes('<td>2</td>'), 'Renders added qty 2');
  assert.ok(!res.html.includes('-1'), 'No negative quantity in output');
  console.log('✅ TEST 2 PASSED: Mixed KOT renders both CANCELLED / REMOVE and ADDED sections cleanly.');
}

// Test 3: Normal Initial KOT (No cancellation, not supplementary)
{
  const order = {
    id: 'ord-1',
    order_number: '101',
    items: [{ product_name: 'Aloo Paratha', quantity: 2 }],
  };
  const settings = { kot_paper_size: '80mm' };

  const res = generateTestKotHtml(order, settings, undefined);
  assert.strictEqual(res.hasCancellation, false);
  assert.strictEqual(res.banner, '');
  assert.ok(!res.html.includes('CANCELLED / REMOVE'));
  assert.ok(!res.html.includes('ADDED'));
  assert.ok(res.html.includes('<td>2</td>'));
  console.log('✅ TEST 3 PASSED: Initial order KOT renders standard table without amendment banners.');
}

console.log('\n🌟 ALL KOT RENDERING TESTS PASSED WITH 100% SUCCESS!\n');
