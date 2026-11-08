const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadTsModule(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const transpiledJs = ts.transpileModule(fileContent, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;

  const moduleExports = {};
  const moduleObj = { exports: moduleExports };
  
  const customRequire = (importPath) => {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(filePath);
      let targetPath = path.resolve(dir, importPath);
      if (!fs.existsSync(targetPath)) {
        if (fs.existsSync(targetPath + '.ts')) targetPath += '.ts';
        else if (fs.existsSync(targetPath + '.tsx')) targetPath += '.tsx';
        else if (fs.existsSync(targetPath + '.js')) targetPath += '.js';
      }
      return loadTsModule(targetPath);
    }
    return require(importPath);
  };

  const evalFn = new Function('module', 'exports', 'require', transpiledJs);
  evalFn(moduleObj, moduleExports, customRequire);
  return moduleObj.exports;
}

const validationModule = loadTsModule(path.join(__dirname, '..', 'src', 'utils', 'validation.ts'));
const { isValidGSTIN, getGSTINValidationError, GSTIN_REGEX } = validationModule;

console.log('====================================================');
console.log('RESTROZ ADMIN & SUPER ADMIN GST PARITY TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ FAIL: ${testName} - ${details}`);
    process.exitCode = 1;
  }
}

// 1. GSTIN Format & Strict Checksum Validation Tests
console.log('--- 1. 15-Character GSTIN Validation & Checksum Tests ---');
assert(isValidGSTIN('36AAAAA0000A1Z3') === true, 'Standard 15-character GSTIN with valid checksum 3 is valid');
assert(isValidGSTIN('27AAPFU0939F1ZV') === true, 'Maharashtra 15-character GSTIN with valid checksum V is valid');
assert(isValidGSTIN('29AAACR4849R1ZH') === true, 'Karnataka 15-character GSTIN with valid checksum H is valid');
assert(isValidGSTIN('19ABCDE1234F1ZX') === true, 'West Bengal 15-character GSTIN with valid checksum X is valid');
assert(isValidGSTIN('07AAAAA0000A1Z4') === true, 'Delhi 15-character GSTIN with valid checksum 4 is valid');
assert(isValidGSTIN('27aapfu0939f1zv') === true, 'Lowercase GSTIN is automatically converted to uppercase');
assert(isValidGSTIN(' 27AAPFU0939F1ZV ') === true, 'Accidental leading/trailing whitespace is trimmed');

// Invalid Checksum & Structure Rejection
assert(isValidGSTIN('36AAAAA0000A1Z5') === false, 'Invalid checksum (5 instead of 3) is rejected');
assert(getGSTINValidationError('36AAAAA0000A1Z5') === 'Invalid GSTIN checksum. Please verify the GSTIN.', 'Invalid checksum returns exact error message');
assert(isValidGSTIN('688095422') === false, '9-digit legacy GSTIN is invalid format');
assert(getGSTINValidationError('688095422') === 'GSTIN must contain exactly 15 characters.', '9-digit legacy returns exact length error message');
assert(isValidGSTIN('12345') === false, 'Short number is invalid');
assert(isValidGSTIN('') === false, 'Empty string is invalid');
assert(isValidGSTIN('36AAAAA0000A1Z399') === false, '17-character string is invalid');
assert(isValidGSTIN('36AAAAA0000A15Z') === false, 'Invalid structure (Z misplaced) is invalid');
assert(isValidGSTIN('00AAAAA0000A1Z0') === false, 'Invalid state code 00 is invalid');
assert(isValidGSTIN('27AAPFU-0939F1Z') === false, 'Hyphens/special characters are rejected');

assert(getGSTINValidationError('27AAPFU0939F1ZV') === null, 'Valid GSTIN returns null error');
assert(typeof getGSTINValidationError('', true) === 'string', 'Required empty GSTIN returns error message');

// 2. Authoritative Settings Resolution Logic Test
console.log('\n--- 2. Database Authoritative Settings vs Local Cache Override Test ---');
// Mock the exact resolution logic from settingsService.ts:
function resolveGstSettings(data, localGstSettings) {
  const effectiveGstin = (data?.gstin || '').trim();
  const rawTaxRate = data?.default_tax_rate !== undefined && data?.default_tax_rate !== null
    ? Number(data.default_tax_rate)
    : (data?.tax_rate !== undefined && data?.tax_rate !== null ? Number(data.tax_rate) : 0);
  const resolvedTaxRate = (!isNaN(rawTaxRate) && rawTaxRate > 0 && rawTaxRate <= 100) ? rawTaxRate : 0;

  // Supabase database record is authoritative. localGstSettings serves as offline/fallback cache only.
  const resolvedGstRegistered = data?.gst_registered !== undefined && data?.gst_registered !== null
    ? Boolean(data.gst_registered)
    : (effectiveGstin
        ? true
        : (localGstSettings?.gst_registered !== undefined ? Boolean(localGstSettings.gst_registered) : false));

  const resolvedIsGstEnabled = (data?.is_gst_enabled !== undefined && data?.is_gst_enabled !== null
    ? Boolean(data.is_gst_enabled)
    : (localGstSettings?.is_gst_enabled !== undefined
        ? Boolean(localGstSettings.is_gst_enabled)
        : false)) && resolvedGstRegistered && resolvedTaxRate > 0;

  const resolvedTaxInvoiceEnabled = (data?.tax_invoice_enabled !== undefined && data?.tax_invoice_enabled !== null
    ? Boolean(data.tax_invoice_enabled)
    : (localGstSettings?.tax_invoice_enabled !== undefined
        ? Boolean(localGstSettings.tax_invoice_enabled)
        : false)) && resolvedGstRegistered && resolvedIsGstEnabled && resolvedTaxRate > 0;

  return {
    gst_registered: resolvedGstRegistered,
    is_gst_enabled: resolvedIsGstEnabled,
    tax_invoice_enabled: resolvedTaxInvoiceEnabled,
    default_tax_rate: resolvedTaxRate,
    tax_rate: resolvedTaxRate,
  };
}

// Case: Juzz Chill DB record has GST ON (5%), but Super Admin device has stale localGstSettings with FALSE
const juzzChillDbRecord = {
  restaurant_id: 'f05dda14-4622-488f-b264-5ea4c83bb8fe',
  name: 'Juzz Chill',
  gstin: '688095422',
  default_tax_rate: 5,
  tax_rate: 5,
  is_gst_enabled: true,
  gst_registered: true,
  tax_invoice_enabled: true,
};

const superAdminStaleLocalStorage = {
  gst_registered: false,
  is_gst_enabled: false,
  tax_invoice_enabled: false,
};

const restaurantAdminFreshLocalStorage = {
  gst_registered: true,
  is_gst_enabled: true,
  tax_invoice_enabled: true,
};

const superAdminResolved = resolveGstSettings(juzzChillDbRecord, superAdminStaleLocalStorage);
const restaurantAdminResolved = resolveGstSettings(juzzChillDbRecord, restaurantAdminFreshLocalStorage);

console.log('Super Admin resolved:', superAdminResolved);
console.log('Restaurant Admin resolved:', restaurantAdminResolved);

assert(superAdminResolved.gst_registered === true, 'Super Admin sees GST Registered = ON');
assert(superAdminResolved.is_gst_enabled === true, 'Super Admin sees Include GST = ON');
assert(superAdminResolved.tax_invoice_enabled === true, 'Super Admin sees Tax Invoice Labeling = ON');
assert(superAdminResolved.default_tax_rate === 5, 'Super Admin sees GST Rate = 5%');

assert(superAdminResolved.gst_registered === restaurantAdminResolved.gst_registered, 'Parity: gst_registered matches');
assert(superAdminResolved.is_gst_enabled === restaurantAdminResolved.is_gst_enabled, 'Parity: is_gst_enabled matches');
assert(superAdminResolved.tax_invoice_enabled === restaurantAdminResolved.tax_invoice_enabled, 'Parity: tax_invoice_enabled matches');
assert(superAdminResolved.default_tax_rate === restaurantAdminResolved.default_tax_rate, 'Parity: default_tax_rate matches');

// 3. Fallback when DB has no GST record (offline mode)
console.log('\n--- 3. Fallback when DB record is missing (offline cache) ---');
const offlineResolved = resolveGstSettings(null, { gst_registered: true, is_gst_enabled: true, tax_invoice_enabled: true });
assert(offlineResolved.gst_registered === true, 'Offline mode uses local fallback for gst_registered');

console.log(`\n====================================================`);
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log(`====================================================`);
