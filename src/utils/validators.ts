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
 * Standard Indian GSTIN Format Validation
 * Format: 2 digits (state code), 5 letters (PAN), 4 digits, 1 letter, 1 alphanumeric, 'Z', 1 alphanumeric checksum
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;

export function isValidGSTIN(gstin?: string | null): boolean {
  if (!gstin) return false;
  const clean = gstin.trim().toUpperCase();
  return clean.length === 15 && GSTIN_REGEX.test(clean);
}

export function validateGSTIN(gstin?: string | null): { isValid: boolean; message?: string; error?: string } {
  if (!gstin || !gstin.trim()) {
    return { isValid: true }; // Optional field: valid if empty
  }
  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) {
    const err = 'GSTIN must be exactly 15 characters long.';
    return { isValid: false, message: err, error: err };
  }
  if (!GSTIN_REGEX.test(clean)) {
    const err = 'Invalid GSTIN format. Example: 36AAAAA0000A1Z5';
    return { isValid: false, message: err, error: err };
  }
  return { isValid: true };
}
