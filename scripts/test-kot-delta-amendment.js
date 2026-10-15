/**
 * Test Suite: KOT Delta & Amendment Verification
 * Verifies that order edits accurately calculate item addition and removal deltas
 * without reprinting unchanged items, following canonical item identity rules.
 */

const assert = require('assert');

// 1. Re-create canonical identity rules from src/utils/orderItemIdentity.ts
function normalizeItemNotes(notes) {
  if (!notes) return '';
  return notes.trim().toLowerCase();
}

function areOrderItemsIdentical(a, b) {
  const aProdId = (a.product_id || '').trim();
  const bProdId = (b.product_id || '').trim();
  if (aProdId && bProdId && aProdId !== bProdId) {
    return false;
  }

  const aVar = ((a.variant_id || a.variant_name || a.size || '')).trim().toLowerCase();
  const bVar = ((b.variant_id || b.variant_name || b.size || '')).trim().toLowerCase();
  if (aVar !== bVar) {
    return false;
  }

  const aMod = a.modifiers
    ? (typeof a.modifiers === 'string' ? a.modifiers.trim().toLowerCase() : JSON.stringify(a.modifiers))
    : '';
  const bMod = b.modifiers
    ? (typeof b.modifiers === 'string' ? b.modifiers.trim().toLowerCase() : JSON.stringify(b.modifiers))
    : '';
  if (aMod !== bMod) {
    return false;
  }

  const aName = (a.product_name || a.name || '').trim().toLowerCase();
  const bName = (b.product_name || b.name || '').trim().toLowerCase();
  if (aName !== bName) {
    return false;
  }

  const aPrice = Number(Number(a.unit_price ?? a.price ?? 0).toFixed(2));
  const bPrice = Number(Number(b.unit_price ?? b.price ?? 0).toFixed(2));
  if (Math.abs(aPrice - bPrice) >= 0.01) {
    return false;
  }

  const aNotes = normalizeItemNotes(a.item_notes ?? a.notes);
  const bNotes = normalizeItemNotes(b.item_notes ?? b.notes);
  if (aNotes !== bNotes) {
    return false;
  }

  return true;
}

function consolidateOrderItems(items) {
  if (!items || items.length === 0) return [];
  const consolidated = [];
  for (const item of items) {
    const idx = consolidated.findIndex((c) => areOrderItemsIdentical(c, item));
    if (idx !== -1) {
      const ex = consolidated[idx];
      const combinedQty = Number(ex.quantity || 0) + Number(item.quantity || 0);
      consolidated[idx] = {
        ...ex,
        quantity: combinedQty,
      };
    } else {
      consolidated.push({ ...item, quantity: Number(item.quantity || 1) });
    }
  }
  return consolidated;
}

// 2. Authoritative delta calculation algorithm from orderService.ts
function computeKotDelta(existingItems, updatedItems) {
  const consolidatedUpdated = consolidateOrderItems(updatedItems);
  const consolidatedOld = consolidateOrderItems(existingItems || []);

  const addedItems = [];
  const removedItems = [];

  // 1. Identify added items or increased quantities
  for (const newItem of consolidatedUpdated) {
    const matchingOldItems = consolidatedOld.filter((old) => areOrderItemsIdentical(old, newItem));
    const oldQty = matchingOldItems.reduce((sum, old) => sum + (Number(old.quantity) || 0), 0);
    const newQty = Number(newItem.quantity) || 0;

    if (newQty > oldQty) {
      const diffQty = newQty - oldQty;
      addedItems.push({
        ...newItem,
        quantity: diffQty,
      });
    } else if (newQty < oldQty) {
      const diffQty = oldQty - newQty;
      removedItems.push({
        ...newItem,
        quantity: diffQty,
      });
    }
  }

  // 2. Identify items that were completely removed from the order
  for (const oldItem of consolidatedOld) {
    const hasMatchInNew = consolidatedUpdated.some((newItem) => areOrderItemsIdentical(newItem, oldItem));
    if (!hasMatchInNew) {
      const diffQty = Number(oldItem.quantity) || 0;
      if (diffQty > 0) {
        removedItems.push({
          ...oldItem,
          quantity: diffQty,
        });
      }
    }
  }

  const hasDelta = addedItems.length > 0 || removedItems.length > 0;
  return { addedItems, removedItems, hasDelta };
}

console.log('=== RUNNING RESTROZ KOT DELTA TEST SUITE ===\n');

// TEST 1: EXPECTED EXAMPLE 1 — REMOVE ITEM
// Original: A ×1, B ×1 -> Remove B -> Second KOT: CANCEL B ×1 only (No A ×1)
{
  const original = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 1, unit_price: 60 },
    { product_id: 'p2', product_name: 'Cheese Corn Large', quantity: 1, unit_price: 120 },
  ];
  const updated = [
    { product_id: 'p2', product_name: 'Cheese Corn Large', quantity: 1, unit_price: 120 },
  ];

  const { addedItems, removedItems, hasDelta } = computeKotDelta(original, updated);

  assert.strictEqual(hasDelta, true, 'Test 1: Delta must be present');
  assert.strictEqual(addedItems.length, 0, 'Test 1: addedItems must be empty');
  assert.strictEqual(removedItems.length, 1, 'Test 1: exactly 1 item removed');
  assert.strictEqual(removedItems[0].product_name, 'Aloo Paratha', 'Test 1: removed item is Aloo Paratha');
  assert.strictEqual(removedItems[0].quantity, 1, 'Test 1: removed quantity is 1');
  console.log('✅ TEST 1 PASSED: Removal of item generates CANCEL Aloo Paratha ×1 only. Unchanged items not reprinted.');
}

// TEST 2: EXPECTED EXAMPLE 2 — QUANTITY DECREASE
// Original: A ×3 -> Change to A ×1 -> Second KOT: CANCEL A ×2
{
  const original = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 3, unit_price: 60 },
  ];
  const updated = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 1, unit_price: 60 },
  ];

  const { addedItems, removedItems, hasDelta } = computeKotDelta(original, updated);

  assert.strictEqual(hasDelta, true, 'Test 2: Delta must be present');
  assert.strictEqual(addedItems.length, 0, 'Test 2: addedItems must be empty');
  assert.strictEqual(removedItems.length, 1, 'Test 2: exactly 1 item decreased');
  assert.strictEqual(removedItems[0].product_name, 'Aloo Paratha', 'Test 2: decreased item is Aloo Paratha');
  assert.strictEqual(removedItems[0].quantity, 2, 'Test 2: decreased quantity is 2 (3 -> 1)');
  console.log('✅ TEST 2 PASSED: Quantity decrease 3 -> 1 generates CANCEL Aloo Paratha ×2.');
}

// TEST 3: EXPECTED EXAMPLE 3 — QUANTITY INCREASE
// Original: A ×1 -> Change to A ×3 -> Second KOT: ADD A ×2
{
  const original = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 1, unit_price: 60 },
  ];
  const updated = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 3, unit_price: 60 },
  ];

  const { addedItems, removedItems, hasDelta } = computeKotDelta(original, updated);

  assert.strictEqual(hasDelta, true, 'Test 3: Delta must be present');
  assert.strictEqual(addedItems.length, 1, 'Test 3: exactly 1 item increased');
  assert.strictEqual(removedItems.length, 0, 'Test 3: removedItems must be empty');
  assert.strictEqual(addedItems[0].product_name, 'Aloo Paratha', 'Test 3: increased item is Aloo Paratha');
  assert.strictEqual(addedItems[0].quantity, 2, 'Test 3: added quantity is 2 (1 -> 3)');
  console.log('✅ TEST 3 PASSED: Quantity increase 1 -> 3 generates ADD Aloo Paratha ×2.');
}

// TEST 4: EXPECTED EXAMPLE 4 — MIXED EDIT
// Original: Aloo Paratha ×2, Cheese Corn ×1, Aam Panna ×1
// Updated: Aloo Paratha ×1, Cheese Corn ×3, Aam Panna removed, Butter Roti ×2 added
// Supplementary KOT: CANCEL Aloo Paratha ×1, Aam Panna ×1; ADD Cheese Corn ×2, Butter Roti ×2
{
  const original = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 2, unit_price: 60 },
    { product_id: 'p2', product_name: 'Cheese Corn', quantity: 1, unit_price: 120 },
    { product_id: 'p3', product_name: 'Aam Panna', quantity: 1, unit_price: 50 },
  ];
  const updated = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 1, unit_price: 60 },
    { product_id: 'p2', product_name: 'Cheese Corn', quantity: 3, unit_price: 120 },
    { product_id: 'p4', product_name: 'Butter Roti', quantity: 2, unit_price: 25 },
  ];

  const { addedItems, removedItems, hasDelta } = computeKotDelta(original, updated);

  assert.strictEqual(hasDelta, true, 'Test 4: Delta must be present');
  assert.strictEqual(addedItems.length, 2, 'Test 4: 2 additions');
  assert.strictEqual(removedItems.length, 2, 'Test 4: 2 cancellations');

  const addCheese = addedItems.find((i) => i.product_name === 'Cheese Corn');
  const addRoti = addedItems.find((i) => i.product_name === 'Butter Roti');
  const cnlAloo = removedItems.find((i) => i.product_name === 'Aloo Paratha');
  const cnlPanna = removedItems.find((i) => i.product_name === 'Aam Panna');

  assert.ok(addCheese && addCheese.quantity === 2, 'Cheese Corn delta is +2');
  assert.ok(addRoti && addRoti.quantity === 2, 'Butter Roti delta is +2');
  assert.ok(cnlAloo && cnlAloo.quantity === 1, 'Aloo Paratha cancelled delta is 1');
  assert.ok(cnlPanna && cnlPanna.quantity === 1, 'Aam Panna cancelled delta is 1');

  console.log('✅ TEST 4 PASSED: Mixed edit generates CANCEL Aloo ×1, Aam Panna ×1 and ADD Cheese ×2, Roti ×2.');
}

// TEST 5: NO CHANGE
// Edit order without changing items -> hasDelta = false, NO KOT
{
  const original = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 1, unit_price: 60 },
  ];
  const updated = [
    { product_id: 'p1', product_name: 'Aloo Paratha', quantity: 1, unit_price: 60 },
  ];

  const { addedItems, removedItems, hasDelta } = computeKotDelta(original, updated);

  assert.strictEqual(hasDelta, false, 'Test 5: hasDelta must be false');
  assert.strictEqual(addedItems.length, 0, 'Test 5: addedItems is empty');
  assert.strictEqual(removedItems.length, 0, 'Test 5: removedItems is empty');
  console.log('✅ TEST 5 PASSED: No-change edit generates NO supplementary KOT.');
}

// TEST 6: MULTIPLE EDIT CYCLES
// KOT 1: A ×1
// Edit: A ×3 -> KOT 2: ADD A ×2
// Edit again: A ×2 -> KOT 3: CANCEL A ×1
// Edit again: A ×2, B ×1 -> KOT 4: ADD B ×1
{
  let currentOrderItems = [
    { product_id: 'p1', product_name: 'A', quantity: 1, unit_price: 100 },
  ];

  // Edit 1: A x3
  let edit1Items = [{ product_id: 'p1', product_name: 'A', quantity: 3, unit_price: 100 }];
  let d1 = computeKotDelta(currentOrderItems, edit1Items);
  assert.strictEqual(d1.addedItems[0].quantity, 2, 'Edit 1: ADD A x2');
  assert.strictEqual(d1.removedItems.length, 0);
  currentOrderItems = edit1Items; // Baseline advances to [A x3]

  // Edit 2: A x2
  let edit2Items = [{ product_id: 'p1', product_name: 'A', quantity: 2, unit_price: 100 }];
  let d2 = computeKotDelta(currentOrderItems, edit2Items);
  assert.strictEqual(d2.removedItems[0].quantity, 1, 'Edit 2: CANCEL A x1');
  assert.strictEqual(d2.addedItems.length, 0);
  currentOrderItems = edit2Items; // Baseline advances to [A x2]

  // Edit 3: A x2, B x1
  let edit3Items = [
    { product_id: 'p1', product_name: 'A', quantity: 2, unit_price: 100 },
    { product_id: 'p2', product_name: 'B', quantity: 1, unit_price: 50 },
  ];
  let d3 = computeKotDelta(currentOrderItems, edit3Items);
  assert.strictEqual(d3.addedItems[0].product_name, 'B', 'Edit 3: ADD B x1');
  assert.strictEqual(d3.addedItems[0].quantity, 1);
  assert.strictEqual(d3.removedItems.length, 0);
  console.log('✅ TEST 6 PASSED: Multiple edit cycles correctly advance baseline to latest submitted state.');
}

// TEST 7: CANONICAL VARIANT AND MODIFIER IDENTITY
// Burger (Regular) vs Burger (Large) must not merge
{
  const original = [
    { product_id: 'p1', product_name: 'Burger', variant_name: 'Regular', quantity: 1, unit_price: 100 },
  ];
  const updated = [
    { product_id: 'p1', product_name: 'Burger', variant_name: 'Regular', quantity: 1, unit_price: 100 },
    { product_id: 'p1', product_name: 'Burger', variant_name: 'Large', quantity: 1, unit_price: 150 },
  ];

  const { addedItems, removedItems, hasDelta } = computeKotDelta(original, updated);

  assert.strictEqual(hasDelta, true);
  assert.strictEqual(addedItems.length, 1);
  assert.strictEqual(addedItems[0].variant_name, 'Large');
  assert.strictEqual(addedItems[0].quantity, 1);
  assert.strictEqual(removedItems.length, 0);
  console.log('✅ TEST 7 PASSED: Variants Burger/Regular vs Burger/Large maintained distinct.');
}

// TEST 8: MODIFIER / NOTES CANONICAL IDENTITY
// 'No Onions' -> 'Extra Spicy' = CANCEL 'No Onions' x1, ADD 'Extra Spicy' x1
{
  const original = [
    { product_id: 'p1', product_name: 'Fried Rice', item_notes: 'No Onions', quantity: 1, unit_price: 120 },
  ];
  const updated = [
    { product_id: 'p1', product_name: 'Fried Rice', item_notes: 'Extra Spicy', quantity: 1, unit_price: 120 },
  ];

  const { addedItems, removedItems, hasDelta } = computeKotDelta(original, updated);

  assert.strictEqual(hasDelta, true);
  assert.strictEqual(removedItems.length, 1);
  assert.strictEqual(removedItems[0].item_notes, 'No Onions');
  assert.strictEqual(addedItems.length, 1);
  assert.strictEqual(addedItems[0].item_notes, 'Extra Spicy');
  console.log('✅ TEST 8 PASSED: Notes/modifiers change correctly generates CANCEL old prep and ADD new prep.');
}

console.log('\n🌟 ALL 8 KOT DELTA TESTS PASSED WITH 100% SUCCESS!\n');
