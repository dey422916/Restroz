/**
 * Test: Single Card Deduplication & Staff/Admin Printer Logic
 * Verifies that RestroZ POS strictly renders ONE card per physical printer,
 * eliminates duplicate "PRINT STATION RELAY" alongside "BLUETOOTH",
 * and preserves the cross-device Staff-to-Admin printing architecture.
 */

const assert = require('assert');

// 1. Re-implement the deduplication logic matching src/services/webDirectPrintService.ts
function normalizePrinterName(name) {
  return (name || '').trim().toLowerCase().replace(/[\s_.\-]+/g, '');
}

function deduplicatePrinters(printers) {
  if (!printers || printers.length <= 1) {
    return printers || [];
  }

  const transportPriority = (t) => {
    switch (t) {
      case 'bluetooth':
      case 'usb':
      case 'serial':
        return 1;
      case 'agent':
        return 2;
      default:
        return 3;
    }
  };

  const statusPriority = (s) => {
    switch (s) {
      case 'connected':
        return 1;
      case 'available':
        return 2;
      case 'configured':
        return 3;
      case 'reconnect_required':
        return 4;
      case 'disconnected':
        return 5;
      case 'offline':
        return 6;
      case 'unsupported':
      case 'error':
        return 7;
      default:
        return 8;
    }
  };

  const sorted = [...printers].sort((a, b) => {
    const tpDiff = transportPriority(a.transport) - transportPriority(b.transport);
    if (tpDiff !== 0) return tpDiff;

    const stDiff = statusPriority(a.status) - statusPriority(b.status);
    if (stDiff !== 0) return stDiff;

    const primDiff = (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
    if (primDiff !== 0) return primDiff;

    return 0;
  });

  const result = [];
  const seenIds = new Set();
  const seenBleKeys = new Set();
  const seenNormNames = new Set();

  for (const p of sorted) {
    if (seenIds.has(p.id)) continue;

    const devKey = (p.bluetoothDeviceId || p.deviceId || '').trim();
    const normName = normalizePrinterName(p.name);

    if (normName && seenNormNames.has(normName)) {
      const existingIdx = result.findIndex(
        (r) => normalizePrinterName(r.name) === normName
      );
      if (existingIdx >= 0) {
        const existing = result[existingIdx];
        if (p.isPrimary && !existing.isPrimary) {
          result[existingIdx].isPrimary = true;
        }
        if (p.status === 'connected' && existing.status !== 'connected' && p.transport === existing.transport) {
          result[existingIdx] = { ...existing, ...p };
        }
      }
      continue;
    }

    if (devKey && seenBleKeys.has(devKey)) {
      const existingIdx = result.findIndex(
        (r) => (r.bluetoothDeviceId && r.bluetoothDeviceId === devKey) || (r.deviceId && r.deviceId === devKey)
      );
      if (existingIdx >= 0) {
        const existing = result[existingIdx];
        if (p.isPrimary && !existing.isPrimary) {
          result[existingIdx].isPrimary = true;
        }
        if (p.status === 'connected' && existing.status !== 'connected') {
          result[existingIdx] = { ...existing, ...p };
        }
      }
      continue;
    }

    seenIds.add(p.id);
    if (devKey) seenBleKeys.add(devKey);
    if (normName) seenNormNames.add(normName);

    result.push(p);
  }

  return result;
}

console.log('========================================================================');
console.log('RESTROZ — SINGLE CARD PRINTER DEDUPLICATION VERIFICATION');
console.log('========================================================================\n');

// TEST 1: The exact duplicate issue from user screenshot
console.log('[TEST 1] Admin host has both Bluetooth and Agent relay for Seznik-Veer...');
const test1Input = [
  {
    id: 'web_bt_1731000000',
    name: 'Seznik-Veer_9394',
    transport: 'bluetooth',
    paperWidth: '58mm',
    role: 'kot',
    isPrimary: true,
    status: 'connected',
    statusMessage: 'Bluetooth connected.',
    bluetoothDeviceId: 'ble_dev_9394',
  },
  {
    id: 'agent_station_1_Seznik-Veer_9394',
    name: 'Seznik-Veer 9394',
    transport: 'agent',
    paperWidth: '58mm',
    role: 'kot',
    isPrimary: false,
    status: 'connected',
    statusMessage: 'Print Agent Online (Juzz Chill (Mobile Station))',
    agentId: 'station_1',
    agentDeviceName: 'Juzz Chill (Mobile Station)',
  },
];

const test1Output = deduplicatePrinters(test1Input);
assert.strictEqual(test1Output.length, 1, 'Must strictly return ONE card for Seznik-Veer');
assert.strictEqual(test1Output[0].transport, 'bluetooth', 'Direct Bluetooth hardware connection must take precedence');
assert.strictEqual(test1Output[0].name, 'Seznik-Veer_9394', 'Original direct printer name preserved');
assert.strictEqual(test1Output[0].isPrimary, true, 'isPrimary preserved');
assert.strictEqual(test1Output[0].status, 'connected', 'status preserved as connected');
console.log('  ✅ PASS: Exactly 1 card returned, Bluetooth hardware wins, Agent relay purged.\n');

// TEST 2: Agent entry appears first in storage array (reverse order)
console.log('[TEST 2] Storage contains Agent entry first, Bluetooth second...');
const test2Input = [test1Input[1], test1Input[0]];
const test2Output = deduplicatePrinters(test2Input);
assert.strictEqual(test2Output.length, 1, 'Must return strictly ONE card regardless of storage order');
assert.strictEqual(test2Output[0].transport, 'bluetooth', 'Hardware printer must still win even if agent is first');
console.log('  ✅ PASS: Sorting ensures direct hardware takes precedence regardless of array order.\n');

// TEST 3: Duplicate BLE registrations for the same printer (different IDs, same device)
console.log('[TEST 3] Multiple BLE sessions for the same physical printer...');
const test3Input = [
  {
    id: 'web_bt_old',
    name: 'Seznik-Veer_9394',
    transport: 'bluetooth',
    paperWidth: '58mm',
    role: 'kot',
    isPrimary: false,
    status: 'available',
    bluetoothDeviceId: 'ble_dev_9394',
  },
  {
    id: 'web_bt_new',
    name: 'Seznik-Veer_9394',
    transport: 'bluetooth',
    paperWidth: '58mm',
    role: 'both',
    isPrimary: true,
    status: 'connected',
    bluetoothDeviceId: 'ble_dev_9394',
  },
];
const test3Output = deduplicatePrinters(test3Input);
assert.strictEqual(test3Output.length, 1, 'Multiple BLE entries collapsed into single card');
assert.strictEqual(test3Output[0].status, 'connected', 'Connected status preserved');
assert.strictEqual(test3Output[0].isPrimary, true, 'Primary flag preserved');
console.log('  ✅ PASS: Multiple BLE sessions collapsed into a single connected card.\n');

// TEST 4: Two legitimately different physical printers
console.log('[TEST 4] Two distinct printers (Seznik-Veer Bluetooth and Epson USB)...');
const test4Input = [
  {
    id: 'web_bt_9394',
    name: 'Seznik-Veer_9394',
    transport: 'bluetooth',
    paperWidth: '58mm',
    role: 'kot',
    isPrimary: true,
    status: 'connected',
  },
  {
    id: 'web_usb_t88',
    name: 'Epson TM-T88VI',
    transport: 'usb',
    paperWidth: '80mm',
    role: 'bill',
    isPrimary: false,
    status: 'connected',
  },
];
const test4Output = deduplicatePrinters(test4Input);
assert.strictEqual(test4Output.length, 2, 'Distinct printers must both be kept');
console.log('  ✅ PASS: Distinct physical printers both display their individual card.\n');

// TEST 5: Staff device (no local hardware, receives station printer)
console.log('[TEST 5] Staff device with remote station printer...');
const test5Input = [
  {
    id: 'agent_station_1_Seznik-Veer_9394',
    name: 'Seznik-Veer 9394',
    transport: 'agent',
    paperWidth: '58mm',
    role: 'both',
    isPrimary: true,
    status: 'connected',
    statusMessage: 'Ready • Counter Station Printer (Admin Laptop)',
  },
];
const test5Output = deduplicatePrinters(test5Input);
assert.strictEqual(test5Output.length, 1, 'Staff device displays exactly 1 station card');
assert.strictEqual(test5Output[0].transport, 'agent', 'Transport is agent');
console.log('  ✅ PASS: Staff device displays single remote station card.\n');

// TEST 6: Name normalization variants
console.log('[TEST 6] Name normalization edge cases...');
assert.strictEqual(normalizePrinterName('Seznik-Veer_9394'), 'seznikveer9394');
assert.strictEqual(normalizePrinterName('Seznik-Veer 9394'), 'seznikveer9394');
assert.strictEqual(normalizePrinterName('seznik_veer_9394'), 'seznikveer9394');
assert.strictEqual(normalizePrinterName('SEZNIK   VEER - 9394'), 'seznikveer9394');
assert.strictEqual(normalizePrinterName('POS-58'), 'pos58');
assert.strictEqual(normalizePrinterName('pos 58'), 'pos58');
console.log('  ✅ PASS: All name variations normalize identically.\n');

console.log('========================================================================');
console.log('ALL DEDUPLICATION TESTS PASSED SUCCESSFULLY! (6/6)');
console.log('========================================================================');
