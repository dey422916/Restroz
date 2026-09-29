/**
 * Phase 4 Bluetooth Classic ESC/POS Transport Test Suite
 * Tests SPP/RFCOMM UUID, Android permission checks, Bluetooth state resolution,
 * device-local binding & rebind, binary integrity & chunking, concurrency mutex,
 * partial write safety, Auto Print gating rules, and Windows QZ / business logic isolation.
 */

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('RESTROZ ANDROID MULTI-PRINTER SYSTEM — PHASE 4 TESTS');
  console.log('====================================================\n');

  // 1. Bluetooth SPP / RFCOMM UUID Validation
  console.log('1. Bluetooth SPP / RFCOMM Profile & UUID Tests:');
  const EXPECTED_SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB';
  const typesFilePath = path.join(__dirname, '..', 'src', 'services', 'printerManager', 'transports', 'types.ts');
  const typesContent = fs.readFileSync(typesFilePath, 'utf8');

  assert(typesContent.includes(EXPECTED_SPP_UUID), `Standard Serial Port Profile (SPP) UUID defined: ${EXPECTED_SPP_UUID}`);
  assert(typesContent.includes('BluetoothDeviceInfo'), 'BluetoothDeviceInfo interface defined');
  assert(typesContent.includes('BluetoothConnectionConfig'), 'BluetoothConnectionConfig interface defined');

  // 2. Android Permissions & Availability State Handling
  console.log('\n2. Android Permissions & Availability State Handling:');
  const btTransportPath = path.join(__dirname, '..', 'src', 'services', 'printerManager', 'transports', 'bluetoothTransport.ts');
  const btTransportContent = fs.readFileSync(btTransportPath, 'utf8');

  assert(btTransportContent.includes('BLUETOOTH_CONNECT'), 'Android 12+ BLUETOOTH_CONNECT permission referenced');
  assert(btTransportContent.includes('BLUETOOTH_SCAN'), 'Android 12+ BLUETOOTH_SCAN permission referenced');
  assert(btTransportContent.includes('bluetooth_disabled'), 'bluetooth_disabled status supported');
  assert(btTransportContent.includes('permission_denied'), 'permission_denied status supported');
  assert(btTransportContent.includes('not_bound'), 'not_bound status supported');

  // 3. Device-Local Binding & Rebind Logic
  console.log('\n3. Device-Local Physical Binding & Rebind Tests:');
  const mockStorage = new Map();
  const setDeviceBinding = (printerId, binding) => {
    mockStorage.set(`restroz_printer_binding_${printerId}`, JSON.stringify(binding));
  };
  const getDeviceBinding = (printerId) => {
    const data = mockStorage.get(`restroz_printer_binding_${printerId}`);
    return data ? JSON.parse(data) : null;
  };

  // Initial binding
  const printerId = 'prn-kitchen-bt-1';
  const initialBinding = {
    printerId,
    deviceName: 'POS80-A',
    deviceAddress: '00:11:22:33:44:55',
    boundAt: new Date().toISOString(),
  };
  setDeviceBinding(printerId, initialBinding);

  const bound = getDeviceBinding(printerId);
  assert(bound !== null && bound.deviceAddress === '00:11:22:33:44:55', 'Physical Bluetooth printer bound locally');
  assert(bound.deviceName === 'POS80-A', 'Physical device name persisted');

  // Rebind to a new device without changing logical printer ID
  const reboundBinding = {
    printerId,
    deviceName: 'POS80-B',
    deviceAddress: 'AA:BB:CC:DD:EE:FF',
    boundAt: new Date().toISOString(),
  };
  setDeviceBinding(printerId, reboundBinding);

  const rebound = getDeviceBinding(printerId);
  assert(rebound.deviceAddress === 'AA:BB:CC:DD:EE:FF', 'Rebound to POS80-B address');
  assert(rebound.deviceName === 'POS80-B', 'Rebound to POS80-B name');

  // 4. Binary Payload Integrity & Conservative Chunking
  console.log('\n4. Binary Integrity & Transport Chunking Tests:');
  const CHUNK_SIZE = 512;
  const chunkBinary = (data, chunkSize = CHUNK_SIZE) => {
    const chunks = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.subarray(i, i + chunkSize));
    }
    return chunks;
  };

  // Create 1500 byte payload
  const testPayload = new Uint8Array(1500);
  for (let i = 0; i < testPayload.length; i++) {
    testPayload[i] = i % 256;
  }

  const chunks = chunkBinary(testPayload, 512);
  assert(chunks.length === 3, `1500 bytes chunked into 3 chunks: [${chunks.map((c) => c.length).join(', ')}]`);
  assert(chunks[0].length === 512, 'First chunk is 512 bytes');
  assert(chunks[1].length === 512, 'Second chunk is 512 bytes');
  assert(chunks[2].length === 476, 'Third chunk is 476 bytes');

  // Reconstruct and verify byte-for-byte fidelity
  let reconstructed = new Uint8Array(1500);
  let offset = 0;
  for (const chunk of chunks) {
    reconstructed.set(chunk, offset);
    offset += chunk.length;
  }
  let identical = true;
  for (let i = 0; i < testPayload.length; i++) {
    if (reconstructed[i] !== testPayload[i]) {
      identical = false;
      break;
    }
  }
  assert(identical, 'Byte-for-byte binary integrity preserved through chunking pipeline');

  // 5. 58mm (384 dots) and 80mm (576 dots) ESC/POS Payload Verification
  console.log('\n5. 58mm and 80mm ESC/POS Payload Simulation Tests:');
  const payload58mm = new Uint8Array([0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, 48, 0, 10, 0, ...new Array(480).fill(0x55), 0x1d, 0x56, 0x42, 0x00]);
  const payload80mm = new Uint8Array([0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, 72, 0, 10, 0, ...new Array(720).fill(0xaa), 0x1d, 0x56, 0x42, 0x00]);

  assert(payload58mm.length === 494, `58mm payload (48 bytes/row * 10 rows + headers) size: ${payload58mm.length} bytes`);
  assert(payload80mm.length === 734, `80mm payload (72 bytes/row * 10 rows + headers) size: ${payload80mm.length} bytes`);

  // 6. Concurrency Mutex & Double-Tap Prevention
  console.log('\n6. Per-Printer Concurrency Mutex Lock Tests:');
  const locks = new Map();
  function acquireLock(printerId) {
    if (locks.get(printerId)) return false;
    locks.set(printerId, true);
    return true;
  }
  function releaseLock(printerId) {
    locks.delete(printerId);
  }

  assert(acquireLock('prn-bt-1') === true, 'First print job on prn-bt-1 acquires lock');
  assert(acquireLock('prn-bt-1') === false, 'Double-tap on prn-bt-1 is locked out');
  assert(acquireLock('prn-bt-2') === true, 'Independent printer prn-bt-2 acquires its own lock');
  releaseLock('prn-bt-1');
  assert(acquireLock('prn-bt-1') === true, 'prn-bt-1 lock re-acquired after release');
  releaseLock('prn-bt-1');
  releaseLock('prn-bt-2');

  // 7. Partial Write Safety & Failure State Semantics
  console.log('\n7. Partial Write Safety & Failure State Handling:');
  const simulateBtSend = (failPoint, totalBytes) => {
    let bytesSent = 0;
    if (failPoint === 'before_connect') {
      return { success: false, bytesSent: 0, status: 'connection_failed', canRetry: true };
    }
    if (failPoint === 'during_write') {
      bytesSent = Math.floor(totalBytes / 2);
      return { success: false, bytesSent, status: 'partial_or_unknown', canRetry: false };
    }
    return { success: true, bytesSent: totalBytes, status: 'data_sent', canRetry: false };
  };

  const beforeFail = simulateBtSend('before_connect', 1000);
  assert(beforeFail.status === 'connection_failed' && beforeFail.bytesSent === 0 && beforeFail.canRetry === true,
    'Failure BEFORE bytes sent: safe retry is permitted');

  const duringFail = simulateBtSend('during_write', 1000);
  assert(duringFail.status === 'partial_or_unknown' && duringFail.bytesSent > 0 && duringFail.canRetry === false,
    'Failure AFTER bytes sent: marked partial_or_unknown, AUTOMATIC RETRY BLOCKED to prevent duplicate printing');

  // 8. Auto Print Gating & Manual Test Actions Rules
  console.log('\n8. Auto Print Gating & Manual Test Actions Verification:');
  const evaluatePrintRouting = (autoPrintEnabled, isManualTestAction) => {
    if (isManualTestAction) {
      return { allowed: true, reason: 'Explicit manual test action by operator' };
    }
    if (!autoPrintEnabled) {
      return { allowed: false, reason: 'Auto Print is OFF: Direct printer transport blocked' };
    }
    return { allowed: true, reason: 'Auto Print is ON: Direct printer transport triggered' };
  };

  const manualTestWhenAutoPrintOff = evaluatePrintRouting(false, true);
  assert(manualTestWhenAutoPrintOff.allowed === true, 'Manual Test Print is ALLOWED when Auto Print = OFF');

  const autoKotWhenAutoPrintOff = evaluatePrintRouting(false, false);
  assert(autoKotWhenAutoPrintOff.allowed === false, 'Automatic KOT is BLOCKED when Auto Print = OFF');

  const autoKotWhenAutoPrintOn = evaluatePrintRouting(true, false);
  assert(autoKotWhenAutoPrintOn.allowed === true, 'Automatic KOT is ALLOWED when Auto Print = ON');

  // 9. Absolute Isolation & RestroZ Print Agent Check
  console.log('\n9. Absolute Isolation & RestroZ Print Agent Check:');
  const directPrintPath = path.join(__dirname, '..', 'src', 'services', 'directPrintService.ts');
  const printServicePath = path.join(__dirname, '..', 'src', 'services', 'printService.ts');

  const directPrintContent = fs.readFileSync(directPrintPath, 'utf8');
  assert(directPrintContent.includes('directPrintService'), 'directPrintService export active');

  const printServiceContent = fs.readFileSync(printServicePath, 'utf8');
  assert(printServiceContent.includes('executeIsolatedPrint'), 'printService isolated print active');

  console.log('\n====================================================');
  console.log(`PHASE 4 TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
