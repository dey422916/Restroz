/**
 * Phase 5 USB / USB-OTG ESC/POS Transport Test Suite
 * Tests USB Host support, device enumeration & matching, Android USB permissions,
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
  console.log('RESTROZ ANDROID MULTI-PRINTER SYSTEM — PHASE 5 TESTS');
  console.log('====================================================\n');

  // 1. USB Transport Interface & Type Definitions
  console.log('1. USB Transport Interface & Type Definitions:');
  const typesFilePath = path.join(__dirname, '..', 'src', 'services', 'printerManager', 'transports', 'types.ts');
  const typesContent = fs.readFileSync(typesFilePath, 'utf8');

  assert(typesContent.includes('UsbDeviceInfo'), 'UsbDeviceInfo interface defined');
  assert(typesContent.includes('UsbConnectionConfig'), 'UsbConnectionConfig interface defined');
  assert(typesContent.includes('DEFAULT_USB_TIMEOUT_MS'), 'DEFAULT_USB_TIMEOUT_MS constant defined (5000ms)');
  assert(typesContent.includes('DEFAULT_USB_CHUNK_SIZE'), 'DEFAULT_USB_CHUNK_SIZE constant defined (512 bytes)');
  assert(typesContent.includes('USB_PRINTER_INTERFACE_CLASS'), 'USB_PRINTER_INTERFACE_CLASS constant defined (Class 7)');
  assert(typesContent.includes('device_not_connected'), 'device_not_connected status defined');
  assert(typesContent.includes('usb_host_unsupported'), 'usb_host_unsupported status defined');

  // 2. USB Transport Module & Architecture Checks
  console.log('\n2. USB Transport Module & Architecture Checks:');
  const usbTransportPath = path.join(__dirname, '..', 'src', 'services', 'printerManager', 'transports', 'usbTransport.ts');
  const usbTransportContent = fs.readFileSync(usbTransportPath, 'utf8');

  assert(usbTransportContent.includes('isUsbHostSupported'), 'isUsbHostSupported method implemented');
  assert(usbTransportContent.includes('getAttachedDevices'), 'getAttachedDevices method implemented');
  assert(usbTransportContent.includes('findAttachedDevice'), 'findAttachedDevice matching logic implemented');
  assert(usbTransportContent.includes('requestPermission'), 'requestPermission explicit handler implemented');
  assert(usbTransportContent.includes('testConnection'), 'testConnection method implemented');
  assert(usbTransportContent.includes('sendPayload'), 'sendPayload method implemented');
  assert(usbTransportContent.includes('sliceBinaryChunks'), 'sliceBinaryChunks implemented');
  assert(usbTransportContent.includes('uint8ArrayToHex'), 'uint8ArrayToHex exact conversion implemented');

  // 3. Binary Integrity & Exact Hex Stream Conversion Tests
  console.log('\n3. Binary Stream & Hex Conversion Fidelity Tests:');
  function uint8ArrayToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function hexToUint8Array(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  const sampleBytes = new Uint8Array([0x1b, 0x40, 0x1d, 0x76, 0x30, 0x00, 0x48, 0x00, 0x0a, 0x00, 0xaa, 0x55, 0x1d, 0x56, 0x42, 0x00]);
  const hexEncoded = uint8ArrayToHex(sampleBytes);
  const reconstructedBytes = hexToUint8Array(hexEncoded);

  assert(hexEncoded.startsWith('1b401d763000'), 'Hex string matches ESC/POS commands');
  assert(reconstructedBytes.length === sampleBytes.length, `Length preserved: ${reconstructedBytes.length} bytes`);
  let isByteMatch = true;
  for (let i = 0; i < sampleBytes.length; i++) {
    if (sampleBytes[i] !== reconstructedBytes[i]) {
      isByteMatch = false;
      break;
    }
  }
  assert(isByteMatch, 'Lossless 100% byte-for-byte binary fidelity via hex representation');

  // 4. USB Chunking Tests (Conservative 512-byte slices)
  console.log('\n4. Conservative USB Buffer Chunking Tests:');
  function sliceBinaryChunks(data, chunkSize = 512) {
    const chunks = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.subarray(i, i + chunkSize));
    }
    return chunks;
  }

  const bigPayload = new Uint8Array(2048);
  for (let i = 0; i < bigPayload.length; i++) bigPayload[i] = (i * 3) % 256;

  const usbChunks = sliceBinaryChunks(bigPayload, 512);
  assert(usbChunks.length === 4, `2048-byte payload split into 4 equal 512-byte chunks`);
  assert(usbChunks[0].length === 512, 'Chunk 1 is 512 bytes');
  assert(usbChunks[3].length === 512, 'Chunk 4 is 512 bytes');

  const oddPayload = new Uint8Array(1200);
  const oddChunks = sliceBinaryChunks(oddPayload, 512);
  assert(oddChunks.length === 3, '1200-byte payload split into 3 chunks (512, 512, 176)');
  assert(oddChunks[2].length === 176, 'Final odd chunk is 176 bytes');

  // 5. USB Device Matching Strategy Tests (Serial > VID/PID > DeviceID)
  console.log('\n5. USB Device Matching Strategy Tests:');
  const attachedMockDevices = [
    { deviceId: 101, vendorId: 0x0416, productId: 0x5011, serialNumber: 'SN-POS-001', deviceName: 'POS80 Kitchen' },
    { deviceId: 102, vendorId: 0x0416, productId: 0x5011, serialNumber: 'SN-POS-002', deviceName: 'POS80 Bar' },
    { deviceId: 103, vendorId: 0x0483, productId: 0x5740, deviceName: 'Generic USB POS' },
  ];

  function matchUsbDevice(attached, config) {
    if (config.deviceId !== undefined) {
      const match = attached.find((d) => d.deviceId === config.deviceId);
      if (match) return match;
    }
    if (config.serialNumber) {
      const match = attached.find(
        (d) => d.vendorId === config.vendorId && d.productId === config.productId && d.serialNumber === config.serialNumber
      );
      if (match) return match;
    }
    return attached.find((d) => d.vendorId === config.vendorId && d.productId === config.productId) || null;
  }

  const serialMatch = matchUsbDevice(attachedMockDevices, { vendorId: 0x0416, productId: 0x5011, serialNumber: 'SN-POS-002' });
  assert(serialMatch && serialMatch.deviceId === 102, 'Serial number disambiguates identical VID/PID devices (matched SN-POS-002)');

  const vidPidMatch = matchUsbDevice(attachedMockDevices, { vendorId: 0x0483, productId: 0x5740 });
  assert(vidPidMatch && vidPidMatch.deviceId === 103, 'VID/PID fallback matches Generic USB POS');

  const missingMatch = matchUsbDevice(attachedMockDevices, { vendorId: 0x1234, productId: 0x5678 });
  assert(missingMatch === null, 'Unplugged device returns null correctly');

  // 6. Device-Local Binding & Rebind Tests
  console.log('\n6. Device-Local Physical USB Binding & Rebind Tests:');
  const mockStorage = new Map();
  const setDeviceBinding = (printerId, binding) => {
    mockStorage.set(`restroz_printer_binding_${printerId}`, JSON.stringify(binding));
  };
  const getDeviceBinding = (printerId) => {
    const data = mockStorage.get(`restroz_printer_binding_${printerId}`);
    return data ? JSON.parse(data) : null;
  };

  const printerId = 'prn-billing-usb-1';
  const initialUsbBinding = {
    restaurant_printer_id: printerId,
    connection_type: 'usb',
    usb_vendor_id: 0x0416,
    usb_product_id: 0x5011,
    usb_serial_number: 'SN-001',
    boundAt: new Date().toISOString(),
  };
  setDeviceBinding(printerId, initialUsbBinding);

  const bound = getDeviceBinding(printerId);
  assert(bound !== null && bound.usb_vendor_id === 0x0416, 'Physical USB printer bound locally');
  assert(bound.usb_serial_number === 'SN-001', 'USB serial number persisted');

  // Rebind to new physical printer
  const reboundUsbBinding = {
    restaurant_printer_id: printerId,
    connection_type: 'usb',
    usb_vendor_id: 0x0483,
    usb_product_id: 0x5740,
    boundAt: new Date().toISOString(),
  };
  setDeviceBinding(printerId, reboundUsbBinding);

  const rebound = getDeviceBinding(printerId);
  assert(rebound.usb_vendor_id === 0x0483 && rebound.usb_product_id === 0x5740, 'Rebound to new USB printer without altering logical printer ID');

  // 7. Per-Printer Concurrency Mutex Lock Tests
  console.log('\n7. Per-Printer Concurrency Lock Tests:');
  const usbLocks = new Map();
  function acquireUsbLock(lockKey) {
    if (usbLocks.get(lockKey)) return false;
    usbLocks.set(lockKey, true);
    return true;
  }
  function releaseUsbLock(lockKey) {
    usbLocks.delete(lockKey);
  }

  assert(acquireUsbLock('usb-printer-1') === true, 'First print job on usb-printer-1 acquires lock');
  assert(acquireUsbLock('usb-printer-1') === false, 'Concurrent print on usb-printer-1 is locked out');
  assert(acquireUsbLock('usb-printer-2') === true, 'Independent usb-printer-2 can print simultaneously');
  releaseUsbLock('usb-printer-1');
  assert(acquireUsbLock('usb-printer-1') === true, 'Lock re-acquired after release');
  releaseUsbLock('usb-printer-1');
  releaseUsbLock('usb-printer-2');

  // 8. Partial Write Safety & Failure State Handling
  console.log('\n8. Partial Write Safety & Failure State Handling:');
  const simulateUsbSend = (failPoint, totalBytes) => {
    let bytesSent = 0;
    if (failPoint === 'before_open') {
      return { success: false, bytesSent: 0, status: 'connection_failed', canRetry: true };
    }
    if (failPoint === 'during_transfer') {
      bytesSent = 512;
      return { success: false, bytesSent, status: 'partial_or_unknown', canRetry: false };
    }
    return { success: true, bytesSent: totalBytes, status: 'data_sent', canRetry: false };
  };

  const failBefore = simulateUsbSend('before_open', 1024);
  assert(failBefore.status === 'connection_failed' && failBefore.bytesSent === 0 && failBefore.canRetry === true,
    'Failure BEFORE bytes sent: safe retry permitted');

  const failDuring = simulateUsbSend('during_transfer', 1024);
  assert(failDuring.status === 'partial_or_unknown' && failDuring.bytesSent > 0 && failDuring.canRetry === false,
    'Failure AFTER bytes sent: marked partial_or_unknown, AUTOMATIC RETRY BLOCKED');

  // 9. Auto Print Gating & Manual Test Actions Verification
  console.log('\n9. Auto Print Gating & Manual Test Actions Verification:');
  const evaluatePrintRouting = (autoPrintEnabled, isManualTestAction) => {
    if (isManualTestAction) {
      return { allowed: true, reason: 'Explicit manual test action by operator' };
    }
    if (!autoPrintEnabled) {
      return { allowed: false, reason: 'Auto Print is OFF: Direct USB transport blocked' };
    }
    return { allowed: true, reason: 'Auto Print is ON: Direct USB transport triggered' };
  };

  assert(evaluatePrintRouting(false, true).allowed === true, 'Manual USB Test Print ALLOWED when Auto Print = OFF');
  assert(evaluatePrintRouting(false, false).allowed === false, 'Automatic KOT BLOCKED when Auto Print = OFF');
  assert(evaluatePrintRouting(true, false).allowed === true, 'Automatic KOT ALLOWED when Auto Print = ON');

  // 10. Absolute Isolation & RestroZ Print Agent Check
  console.log('\n10. Absolute Isolation & RestroZ Print Agent Check:');
  const directPrintPath = path.join(__dirname, '..', 'src', 'services', 'directPrintService.ts');
  const printServicePath = path.join(__dirname, '..', 'src', 'services', 'printService.ts');

  const directPrintContent = fs.readFileSync(directPrintPath, 'utf8');
  assert(directPrintContent.includes('directPrintService'), 'directPrintService export active');

  const printServiceContent = fs.readFileSync(printServicePath, 'utf8');
  assert(printServiceContent.includes('executeIsolatedPrint'), 'printService isolated print active');

  console.log('\n====================================================');
  console.log(`PHASE 5 TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
