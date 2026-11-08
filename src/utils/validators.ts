import { Coupon } from '../types';

export interface CsvProductRow {
  name: string;
  sku: string;
  category: string;
  description?: string;
  price: string | number;
  tax: string | number;
  hsn: string;
  foodType: string;
  quantity: string | number;
  unit: string;
  available: string | boolean;
  imageUrl?: string;
}

export interface CsvValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

export function validateCsvRows(rows: any[]): { validRows: CsvProductRow[]; errors: CsvValidationError[] } {
  const validRows: CsvProductRow[] = [];
  const errors: CsvValidationError[] = [];
  const seenSkus = new Set<string>();

  rows.forEach((row, index) => {
    const rowNum = index + 2; // Row 1 is header, data starts at Row 2

    // Helper to get field by checking exact names or normalized case-insensitive aliases
    const getField = (...aliases: string[]): string => {
      for (const alias of aliases) {
        if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
          return String(row[alias]).trim();
        }
      }
      const normAliases = aliases.map((a) => a.toLowerCase().replace(/[\s_\-\/]/g, ''));
      for (const key of Object.keys(row)) {
        const normKey = key.toLowerCase().replace(/[\s_\-\/]/g, '');
        if (normAliases.includes(normKey)) {
          const val = row[key];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
          }
        }
      }
      return '';
    };

    const name = getField('Product Name', 'name', 'Name', 'product_name', 'productName');
    const sku = getField('SKU', 'sku', 'Item SKU', 'Product Code');
    const category = getField('Category', 'category', 'Category Name', 'category_name');
    const priceStr = getField('Price', 'price', 'Unit Price', 'Selling Price', 'Rate');
    const taxStr = getField('Tax Rate', 'tax', 'Tax', 'tax_rate', 'GST', 'GST Rate') || '5';
    const hsn = getField('HSN', 'hsn', 'HSN/SAC', 'hsn_code') || '996331';
    const foodTypeRaw = (getField('Food Type', 'foodType', 'food_type', 'Type') || 'veg').toLowerCase();
    const qtyStr = getField('Stock', 'quantity', 'Quantity', 'stock_quantity', 'Qty') || '100';
    const unit = getField('Unit', 'unit', 'UOM') || 'portion';
    const description = getField('Description', 'description', 'Desc') || '';
    const imageUrl = getField('Image URL', 'imageUrl', 'image_url', 'Image', 'Photo') || '';

    let hasRowError = false;

    if (!name) {
      errors.push({ rowIndex: rowNum, field: 'Product Name', message: 'Product name is required.' });
      hasRowError = true;
    }

    if (!sku) {
      errors.push({ rowIndex: rowNum, field: 'SKU', message: 'SKU is required.' });
      hasRowError = true;
    } else if (seenSkus.has(sku.toLowerCase())) {
      errors.push({ rowIndex: rowNum, field: 'SKU', message: `Duplicate SKU "${sku}" found multiple times in this CSV.` });
      hasRowError = true;
    } else {
      seenSkus.add(sku.toLowerCase());
    }

    if (!category) {
      errors.push({ rowIndex: rowNum, field: 'Category', message: 'Category is required.' });
      hasRowError = true;
    }

    const price = parseFloat(priceStr);
    if (!priceStr || isNaN(price) || price <= 0) {
      errors.push({ rowIndex: rowNum, field: 'Price', message: 'Price must be a valid number greater than 0.' });
      hasRowError = true;
    }

    const tax = parseFloat(taxStr);
    if (isNaN(tax) || tax < 0 || tax > 100) {
      errors.push({ rowIndex: rowNum, field: 'Tax Rate', message: 'Tax rate must be a percentage between 0 and 100.' });
      hasRowError = true;
    }

    const foodType = ['veg', 'non-veg', 'egg'].includes(foodTypeRaw) ? foodTypeRaw : 'veg';
    const qty = parseInt(qtyStr, 10);

    if (!hasRowError) {
      validRows.push({
        name,
        sku,
        category,
        description,
        price,
        tax: isNaN(tax) ? 5 : tax,
        hsn,
        foodType,
        quantity: isNaN(qty) ? 100 : Math.max(0, qty),
        unit: unit || 'portion',
        available: true,
        imageUrl,
      });
    }
  });

  return { validRows, errors };
}

export function validateCoupon(coupon: Coupon, orderSubtotal: number): { isValid: boolean; message: string } {
  if (!coupon.is_active) {
    return { isValid: false, message: 'Coupon code is inactive or expired.' };
  }

  if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
    return { isValid: false, message: 'Coupon code has expired.' };
  }

  if (coupon.min_order_value && orderSubtotal < coupon.min_order_value) {
    return { isValid: false, message: `Minimum order value for this coupon is ₹${coupon.min_order_value}.` };
  }

  return { isValid: true, message: 'Coupon applied successfully!' };
}

/**
 * Official Indian GST State Codes (2-digit) mapping to State / Union Territory names
 */
export const INDIAN_GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

/**
 * Official Indian GSTIN Base-36 Character Set (0-9 followed by A-Z)
 */
export const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Calculates the official Indian GSTIN 15th character checksum (Luhn mod 36 algorithm)
 * based on the first 14 characters of the GSTIN.
 */
export function calculateGSTINChecksum(gstin14: string): string | null {
  if (!gstin14 || typeof gstin14 !== 'string' || gstin14.length !== 14) return null;
  const upper = gstin14.toUpperCase();
  let totalSum = 0;
  const mod = 36;

  for (let i = 0; i < 14; i++) {
    const char = upper.charAt(i);
    const codePoint = GSTIN_CHARSET.indexOf(char);
    if (codePoint === -1) return null;

    // Alternating multiplier: 1 for even index (0, 2, 4...), 2 for odd index (1, 3, 5...)
    const factor = (i % 2 === 0) ? 1 : 2;
    const weighted = codePoint * factor;
    // Sum quotient and remainder in base 36
    totalSum += Math.floor(weighted / mod) + (weighted % mod);
  }

  const remainder = totalSum % mod;
  const checkCodePoint = (mod - remainder) % mod;
  return GSTIN_CHARSET.charAt(checkCodePoint);
}

/**
 * Extracts Indian state code and state name from the first 2 digits of a GSTIN.
 */
export function getStateFromGSTIN(gstin?: string | null): { stateCode: string; stateName: string } | null {
  if (!gstin) return null;
  const clean = gstin.trim().toUpperCase();
  if (clean.length < 2) return null;
  const code = clean.substring(0, 2);
  const name = INDIAN_GST_STATE_CODES[code];
  if (name) {
    return { stateCode: code, stateName: name };
  }
  return null;
}

/**
 * Standard Indian GSTIN Format Validation
 * Format: 2 digits (state code), 5 letters (PAN), 4 digits, 1 letter, 1 alphanumeric, 'Z', 1 alphanumeric checksum
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export interface GSTINValidationResult {
  isValid: boolean;
  message?: string;
  error?: string | null;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  entityCode?: string;
  checksum?: string;
  expectedChecksum?: string;
}

export type GSTINValidationOptions = {
  required?: boolean;
  selectedStateCode?: string | null;
};

/**
 * Strict Official Indian GSTIN Validator
 * 
 * Enforces:
 * 1. Exactly 15 characters
 * 2. Positions 1-2: Valid 2-digit Indian state/UT code
 * 3. Positions 3-12: Valid 10-character PAN format (5 letters, 4 digits, 1 letter)
 * 4. Position 13: Valid entity code (1-9 or A-Z)
 * 5. Position 14: Must be 'Z'
 * 6. Position 15: Official Luhn mod 36 checksum calculation
 * 7. Disallows internal spaces, hyphens, or special characters
 * 8. Trims accidental leading/trailing spaces and normalizes lowercase to uppercase
 */
export function validateGSTIN(
  gstin?: string | null,
  optionsOrStateCode?: string | null | GSTINValidationOptions
): GSTINValidationResult {
  const isRequired = typeof optionsOrStateCode === 'object' && optionsOrStateCode !== null
    ? Boolean(optionsOrStateCode.required)
    : false;
  const selectedStateCode = typeof optionsOrStateCode === 'string'
    ? optionsOrStateCode
    : (optionsOrStateCode && typeof optionsOrStateCode === 'object' ? optionsOrStateCode.selectedStateCode : null);

  if (!gstin || !gstin.trim()) {
    if (isRequired) {
      const err = 'GSTIN is required (15 characters).';
      return { isValid: false, message: err, error: err };
    }
    return { isValid: true, error: null, message: '' };
  }

  // Trim accidental leading/trailing spaces and uppercase
  const clean = gstin.trim().toUpperCase();

  // 1. Length check: exactly 15 characters
  if (clean.length !== 15) {
    const err = 'GSTIN must contain exactly 15 characters.';
    return { isValid: false, message: err, error: err };
  }

  // 2. Reject internal spaces or disallowed characters
  if (!/^[0-9A-Z]{15}$/.test(clean)) {
    const err = 'Invalid GSTIN format. Please check the number.';
    return { isValid: false, message: err, error: err };
  }

  // 3. State code validation (Positions 1-2)
  const stateCode = clean.substring(0, 2);
  const stateName = INDIAN_GST_STATE_CODES[stateCode];
  if (!stateName) {
    const err = 'Invalid GSTIN format. Please check the number.';
    return { isValid: false, message: err, error: err, stateCode };
  }

  // 4. PAN structure validation (Positions 3-12)
  const panSegment = clean.substring(2, 12);
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panSegment)) {
    const err = 'Invalid GSTIN format. Please check the number.';
    return { isValid: false, message: err, error: err, stateCode, stateName, pan: panSegment };
  }

  // 5. Entity code validation (Position 13: 1-9 or A-Z)
  const entityCode = clean.charAt(12);
  if (!/^[1-9A-Z]$/.test(entityCode)) {
    const err = 'Invalid GSTIN format. Please check the number.';
    return { isValid: false, message: err, error: err, stateCode, stateName, entityCode };
  }

  // 6. Default 'Z' character (Position 14)
  const char14 = clean.charAt(13);
  if (char14 !== 'Z') {
    const err = 'Invalid GSTIN format. Please check the number.';
    return { isValid: false, message: err, error: err, stateCode, stateName };
  }

  // 7. Official Luhn mod 36 Checksum validation (Position 15)
  const expectedChecksum = calculateGSTINChecksum(clean.substring(0, 14));
  const actualChecksum = clean.charAt(14);
  if (!expectedChecksum || actualChecksum !== expectedChecksum) {
    const err = 'Invalid GSTIN checksum. Please verify the GSTIN.';
    return {
      isValid: false,
      message: err,
      error: err,
      stateCode,
      stateName,
      pan: panSegment,
      entityCode,
      checksum: actualChecksum,
      expectedChecksum: expectedChecksum || undefined,
    };
  }

  // 8. Match billing state if selectedStateCode is provided
  if (selectedStateCode && selectedStateCode.trim()) {
    const normSelected = selectedStateCode.trim().padStart(2, '0');
    if (normSelected !== stateCode) {
      const err = `GSTIN state code prefix (${stateCode} - ${stateName}) does not match selected billing state code (${normSelected}).`;
      return {
        isValid: false,
        message: err,
        error: err,
        stateCode,
        stateName,
        pan: panSegment,
        entityCode,
        checksum: actualChecksum,
      };
    }
  }

  return {
    isValid: true,
    message: '✓ Valid GSTIN format',
    error: null,
    stateCode,
    stateName,
    pan: panSegment,
    entityCode,
    checksum: actualChecksum,
  };
}

/**
 * Validates whether a GSTIN string conforms to the strict Indian 15-character format and checksum.
 */
export function isValidGSTIN(gstin?: string | null): boolean {
  if (!gstin || typeof gstin !== 'string') return false;
  const trimmed = gstin.trim();
  if (!trimmed) return false;
  const result = validateGSTIN(trimmed);
  return result.isValid;
}

/**
 * Returns an inline validation error message for a GSTIN field, or null if valid.
 */
export function getGSTINValidationError(value?: string | null, required: boolean = false): string | null {
  const result = validateGSTIN(value, { required });
  return result.isValid ? null : (result.error || 'Invalid GSTIN format.');
}

