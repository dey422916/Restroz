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

const validatorsModule = loadTsModule(path.join(__dirname, '..', 'src', 'utils', 'validators.ts'));
const validationModule = loadTsModule(path.join(__dirname, '..', 'src', 'utils', 'validation.ts'));

const {
  validateGSTIN,
  isValidGSTIN,
  getGSTINValidationError,
  calculateGSTINChecksum,
  INDIAN_GST_STATE_CODES,
  GSTIN_CHARSET,
} = validatorsModule;

console.log('====================================================');
console.log('RESTROZ STRICT GSTIN VALIDATION & CHECKSUM TEST SUITE');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;

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

// ----------------------------------------------------
// 1. OFFICIAL CHECKSUM CALCULATION VERIFICATION
// ----------------------------------------------------
console.log('--- 1. Official Luhn Mod 36 Checksum Calculation ---');
const knownGstins = [
  { input14: '27AAPFU0939F1Z', expectedChecksum: 'V', state: 'Maharashtra' },
  { input14: '29AAACR4849R1Z', expectedChecksum: 'H', state: 'Karnataka' },
  { input14: '27AAACT2727Q1Z', expectedChecksum: 'W', state: 'Maharashtra' },
  { input14: '36AAAAA0000A1Z', expectedChecksum: '3', state: 'Telangana' },
  { input14: '19ABCDE1234F1Z', expectedChecksum: 'X', state: 'West Bengal' },
  { input14: '07AAAAA0000A1Z', expectedChecksum: '4', state: 'Delhi' },
  { input14: '24AAACA1234A1Z', expectedChecksum: 'Q', state: 'Gujarat' },
];

for (const item of knownGstins) {
  const calc = calculateGSTINChecksum(item.input14);
  assert(calc === item.expectedChecksum, `Checksum for ${item.input14} is ${item.expectedChecksum} (${item.state})`, `Got ${calc}`);
}

// ----------------------------------------------------
// 2. STRUCTURAL GSTIN VALIDATION (REQUIREMENTS 1 & 2)
// ----------------------------------------------------
console.log('\n--- 2. Structural & Checksum Validation Requirements ---');

// 2.1 Valid GSTINs
for (const item of knownGstins) {
  const full = item.input14 + item.expectedChecksum;
  const res = validateGSTIN(full);
  assert(res.isValid === true && res.error === null, `Valid GSTIN accepted: ${full}`);
  assert(res.stateName === item.state, `Correct state resolved for ${full}: ${item.state}`);
  assert(isValidGSTIN(full) === true, `isValidGSTIN returns true for ${full}`);
  assert(getGSTINValidationError(full) === null, `getGSTINValidationError returns null for ${full}`);
}

// 2.2 Lowercase conversion
const lowerGstin = '27aapfu0939f1zv';
const resLower = validateGSTIN(lowerGstin);
assert(resLower.isValid === true, 'Lowercase GSTIN automatically converted to uppercase');

// 2.3 Leading / Trailing Spaces Trimming
const spacedGstin = '   27AAPFU0939F1ZV   ';
const resSpaced = validateGSTIN(spacedGstin);
assert(resSpaced.isValid === true, 'Accidental leading and trailing spaces trimmed');

// 2.4 Length checks (<15 and >15)
const shortLegacy = '688095422'; // 9 chars
const resShort = validateGSTIN(shortLegacy);
assert(resShort.isValid === false, '9-digit legacy GSTIN rejected');
assert(resShort.error === 'GSTIN must contain exactly 15 characters.', 'Fewer than 15 chars returns exact error message', `Got: ${resShort.error}`);

const longGstin = '27AAPFU0939F1ZV99'; // 17 chars
const resLong = validateGSTIN(longGstin);
assert(resLong.isValid === false, '17-character GSTIN rejected');
assert(resLong.error === 'GSTIN must contain exactly 15 characters.', 'More than 15 chars returns exact error message', `Got: ${resLong.error}`);

// 2.5 Invalid State Code
const badState = '00AAPFU0939F1ZV';
const resBadState = validateGSTIN(badState);
assert(resBadState.isValid === false, 'Invalid state code 00 rejected');
assert(resBadState.error === 'Invalid GSTIN format. Please check the number.', 'Invalid state code returns format error', `Got: ${resBadState.error}`);

const badState98 = '98AAPFU0939F1ZV';
const resBadState98 = validateGSTIN(badState98);
assert(resBadState98.isValid === false, 'Non-existent state code 98 rejected');
assert(resBadState98.error === 'Invalid GSTIN format. Please check the number.', 'Non-existent state code returns format error', `Got: ${resBadState98.error}`);

// 2.6 Invalid PAN Structure
// 4th char of PAN should be letter, numbers in middle
const badPan1 = '27123450939F1ZV'; // digits in first 5 letters
const resBadPan1 = validateGSTIN(badPan1);
assert(resBadPan1.isValid === false, 'Digits in first 5 PAN positions rejected');
assert(resBadPan1.error === 'Invalid GSTIN format. Please check the number.', 'Invalid PAN returns format error', `Got: ${resBadPan1.error}`);

const badPan2 = '27AAPFUAAAAF1ZV'; // letters in 4 PAN digits
const resBadPan2 = validateGSTIN(badPan2);
assert(resBadPan2.isValid === false, 'Letters in 4 PAN digits rejected');
assert(resBadPan2.error === 'Invalid GSTIN format. Please check the number.', 'Invalid PAN returns format error', `Got: ${resBadPan2.error}`);

// 2.7 Invalid Entity Code (Position 13: 0 is invalid, must be 1-9 or A-Z)
const badEntity = '27AAPFU0939F0ZV';
const resBadEntity = validateGSTIN(badEntity);
assert(resBadEntity.isValid === false, 'Position 13 entity code 0 rejected');
assert(resBadEntity.error === 'Invalid GSTIN format. Please check the number.', 'Position 13 entity code 0 returns format error', `Got: ${resBadEntity.error}`);

// 2.8 Invalid Position 14 (Must be 'Z')
const badZ = '27AAPFU0939F1AV';
const resBadZ = validateGSTIN(badZ);
assert(resBadZ.isValid === false, 'Position 14 other than Z rejected');
assert(resBadZ.error === 'Invalid GSTIN format. Please check the number.', 'Position 14 other than Z returns format error', `Got: ${resBadZ.error}`);

// 2.9 Invalid Checksum
// Correct checksum for 27AAPFU0939F1Z is V. Pass 0, 1, A, etc.
const badChecksum = '27AAPFU0939F1Z0';
const resBadChecksum = validateGSTIN(badChecksum);
assert(resBadChecksum.isValid === false, 'Invalid checksum character rejected');
assert(resBadChecksum.error === 'Invalid GSTIN checksum. Please verify the GSTIN.', 'Invalid checksum returns exact error message', `Got: ${resBadChecksum.error}`);

const badChecksumDummy = '36AAAAA0000A1Z5'; // Expected is 3, passed 5
const resBadChecksumDummy = validateGSTIN(badChecksumDummy);
assert(resBadChecksumDummy.isValid === false, 'Legacy dummy 36AAAAA0000A1Z5 rejected for invalid checksum');
assert(resBadChecksumDummy.error === 'Invalid GSTIN checksum. Please verify the GSTIN.', 'Legacy dummy returns exact checksum error message', `Got: ${resBadChecksumDummy.error}`);

// 2.10 Disallowed Special Characters & Internal Spaces
const hyphenGstin = '27-AAPFU-0939F1';
assert(validateGSTIN(hyphenGstin).isValid === false, 'Hyphens rejected');
assert(validateGSTIN(hyphenGstin).error === 'Invalid GSTIN format. Please check the number.', 'Hyphens return format error');

const internalSpaceGstin = '27 AAPFU 0939 F';
assert(validateGSTIN(internalSpaceGstin).isValid === false, 'Internal spaces rejected');
assert(validateGSTIN(internalSpaceGstin).error === 'Invalid GSTIN format. Please check the number.', 'Internal spaces return format error');

const specialCharGstin = '27AAPFU0939F1Z#';
assert(validateGSTIN(specialCharGstin).isValid === false, 'Special character # rejected');
assert(validateGSTIN(specialCharGstin).error === 'Invalid GSTIN format. Please check the number.', 'Special character # returns format error');

// ----------------------------------------------------
// 3. OPTIONAL vs REQUIRED GSTIN BEHAVIOR (REQUIREMENT 3)
// ----------------------------------------------------
console.log('\n--- 3. Optional vs Required Save Validation ---');

// Empty string when optional (e.g. GST unregistered) -> VALID
const resEmptyOptional = validateGSTIN('', { required: false });
assert(resEmptyOptional.isValid === true && resEmptyOptional.error === null, 'Empty GSTIN is valid when optional');

const resNullOptional = validateGSTIN(null, { required: false });
assert(resNullOptional.isValid === true && resNullOptional.error === null, 'Null GSTIN is valid when optional');

// Empty string when required (e.g. GST registered & billing enabled) -> INVALID
const resEmptyRequired = validateGSTIN('', { required: true });
assert(resEmptyRequired.isValid === false, 'Empty GSTIN is invalid when required');
assert(resEmptyRequired.error === 'GSTIN is required (15 characters).', 'Required empty GSTIN returns required error message');

// Non-empty invalid string when optional -> STILL INVALID (Cannot save invalid GSTIN even if unregistered)
const resInvalidWhenOptional = validateGSTIN('688095422', { required: false });
assert(resInvalidWhenOptional.isValid === false, 'Invalid GSTIN is rejected even when optional');
assert(resInvalidWhenOptional.error === 'GSTIN must contain exactly 15 characters.', 'Invalid GSTIN returns length error when optional');

// ----------------------------------------------------
// 4. BACKEND SAVE PATH SIMULATION (REQUIREMENTS 4 & 5)
// ----------------------------------------------------
console.log('\n--- 4. Backend Validation & Non-GSTIN Update Isolation ---');

// Simulate settingsService.saveSettings GSTIN guard logic:
function simulateSaveSettings(existingRecord, newUpdates) {
  const current = { ...existingRecord };
  const updated = { ...current, ...newUpdates };

  const rawRate = newUpdates.default_tax_rate !== undefined && newUpdates.default_tax_rate !== null
    ? Number(newUpdates.default_tax_rate)
    : (newUpdates.tax_rate !== undefined && newUpdates.tax_rate !== null
        ? Number(newUpdates.tax_rate)
        : (updated.default_tax_rate !== undefined && updated.default_tax_rate !== null ? Number(updated.default_tax_rate) : 0));
  const validRate = (!isNaN(rawRate) && rawRate > 0 && rawRate <= 100) ? rawRate : 0;

  let targetGstRegistered = updated.gst_registered !== undefined
    ? Boolean(updated.gst_registered)
    : Boolean((updated.gstin || '').trim());
  let targetIsGstEnabled = updated.is_gst_enabled !== undefined
    ? Boolean(updated.is_gst_enabled)
    : false;

  if (!targetGstRegistered || validRate <= 0) {
    targetIsGstEnabled = false;
  }

  // Strict GSTIN Validation (Backend Guard)
  if (newUpdates.gstin !== undefined) {
    const candidateGstin = (newUpdates.gstin || '').trim().toUpperCase();
    if (candidateGstin) {
      const vResult = validateGSTIN(candidateGstin, { required: false });
      if (!vResult.isValid) {
        throw new Error(vResult.error || 'Invalid GSTIN format or checksum.');
      }
      newUpdates.gstin = candidateGstin;
      updated.gstin = candidateGstin;
    } else {
      if (targetGstRegistered && targetIsGstEnabled) {
        throw new Error('GSTIN is required when GST billing is enabled.');
      }
      newUpdates.gstin = '';
      updated.gstin = '';
    }
  } else if (newUpdates.is_gst_enabled === true && targetIsGstEnabled) {
    const existingGstin = (current.gstin || '').trim();
    if (!existingGstin || !isValidGSTIN(existingGstin)) {
      throw new Error('A valid 15-character GSTIN is required before enabling GST billing.');
    }
  }

  return updated;
}

// Case 1: Existing legacy record with '688095422'
const legacyRecord = {
  restaurant_id: 'f05dda14-4622-488f-b264-5ea4c83bb8fe',
  name: 'Juzz Chill',
  gstin: '688095422',
  gst_registered: false,
  is_gst_enabled: false,
  default_tax_rate: 5,
};

// Authorized non-GSTIN update (Updating restaurant name or address) MUST NOT be blocked
let nonGstUpdateSuccess = false;
try {
  const result = simulateSaveSettings(legacyRecord, { name: 'Juzz Chill Restro & Cafe' });
  assert(result.name === 'Juzz Chill Restro & Cafe', 'Authorized non-GSTIN update succeeded with legacy GSTIN');
  assert(result.gstin === '688095422', 'Existing database GSTIN remains untouched');
  nonGstUpdateSuccess = true;
} catch (e) {
  assert(false, 'Authorized non-GSTIN update failed unexpectedly', e.message);
}

// Attempting to save an invalid GSTIN change MUST fail
let saveInvalidGstinThrew = false;
try {
  simulateSaveSettings(legacyRecord, { gstin: '12345' });
} catch (e) {
  saveInvalidGstinThrew = true;
  assert(e.message === 'GSTIN must contain exactly 15 characters.', 'Saving short GSTIN throws exact error message');
}
assert(saveInvalidGstinThrew === true, 'Attempt to save invalid short GSTIN rejected by backend');

// Attempting to save an invalid checksum GSTIN MUST fail
let saveInvalidChecksumThrew = false;
try {
  simulateSaveSettings(legacyRecord, { gstin: '27AAPFU0939F1Z0' });
} catch (e) {
  saveInvalidChecksumThrew = true;
  assert(e.message === 'Invalid GSTIN checksum. Please verify the GSTIN.', 'Saving invalid checksum throws exact error message');
}
assert(saveInvalidChecksumThrew === true, 'Attempt to save invalid checksum GSTIN rejected by backend');

// Attempting to enable GST billing while DB has legacy '688095422' MUST fail
let enableWithLegacyThrew = false;
try {
  simulateSaveSettings(legacyRecord, { is_gst_enabled: true, gst_registered: true, default_tax_rate: 5 });
} catch (e) {
  enableWithLegacyThrew = true;
  assert(e.message === 'A valid 15-character GSTIN is required before enabling GST billing.', 'Enabling GST with legacy GSTIN throws exact message');
}
assert(enableWithLegacyThrew === true, 'Enabling GST with invalid legacy GSTIN prevented');

// Saving a valid GSTIN succeeds and normalizes to uppercase
let saveValidSuccess = false;
try {
  const saved = simulateSaveSettings(legacyRecord, {
    gstin: '  27aapfu0939f1zv  ',
    gst_registered: true,
    is_gst_enabled: true,
    default_tax_rate: 5
  });
  assert(saved.gstin === '27AAPFU0939F1ZV', 'Valid GSTIN saved and normalized to trimmed uppercase');
  assert(saved.is_gst_enabled === true, 'GST billing successfully enabled with valid GSTIN');
  saveValidSuccess = true;
} catch (e) {
  assert(false, 'Saving valid GSTIN failed unexpectedly', e.message);
}

// ----------------------------------------------------
// 5. PARITY BETWEEN VALIDATORS & VALIDATION EXPORTS
// ----------------------------------------------------
console.log('\n--- 5. Module Parity Verification ---');
const testCases = [
  '27AAPFU0939F1ZV',
  '36AAAAA0000A1Z5',
  '688095422',
  '   27aapfu0939f1zv   ',
  '',
  '00AAAAA0000A1Z0'
];

for (const tc of testCases) {
  const res1 = validatorsModule.validateGSTIN(tc);
  const res2 = validationModule.validateGSTIN(tc);
  assert(res1.isValid === res2.isValid, `validateGSTIN parity for "${tc}" (isValid: ${res1.isValid})`);
  assert(res1.error === res2.error, `validateGSTIN error parity for "${tc}" (error: ${res1.error})`);
  assert(validatorsModule.isValidGSTIN(tc) === validationModule.isValidGSTIN(tc), `isValidGSTIN parity for "${tc}"`);
  assert(validatorsModule.getGSTINValidationError(tc) === validationModule.getGSTINValidationError(tc), `getGSTINValidationError parity for "${tc}"`);
}

console.log('\n====================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('====================================================');
