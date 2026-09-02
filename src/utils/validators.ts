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
    const rowNum = index + 2;

    const name = String(row.name || row['Product Name'] || row.Name || '').trim();
    const sku = String(row.sku || row['SKU'] || row.SKU || '').trim();
    const category = String(row.category || row['Category'] || '').trim();
    const priceStr = String(row.price || row['Price'] || '0').trim();
    const taxStr = String(row.tax || row['Tax'] || row['Tax Rate'] || '5').trim();
    const hsn = String(row.hsn || row['HSN'] || row['HSN/SAC'] || '996331').trim();
    const foodTypeRaw = String(row.foodType || row['Food Type'] || row['Type'] || 'veg').toLowerCase().trim();
    const qtyStr = String(row.quantity || row['Quantity'] || row['Stock'] || '100').trim();
    const unit = String(row.unit || row['Unit'] || 'portion').trim();

    if (!name) {
      errors.push({ rowIndex: rowNum, field: 'name', message: 'Product name is required' });
    }

    if (!sku) {
      errors.push({ rowIndex: rowNum, field: 'sku', message: 'SKU is required' });
    } else if (seenSkus.has(sku.toLowerCase())) {
      errors.push({ rowIndex: rowNum, field: 'sku', message: `Duplicate SKU "${sku}" found in CSV` });
    } else {
      seenSkus.add(sku.toLowerCase());
    }

    if (!category) {
      errors.push({ rowIndex: rowNum, field: 'category', message: 'Category is required' });
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 0) {
      errors.push({ rowIndex: rowNum, field: 'price', message: 'Price must be a positive number' });
    }

    const tax = parseFloat(taxStr);
    if (isNaN(tax) || tax < 0 || tax > 100) {
      errors.push({ rowIndex: rowNum, field: 'tax', message: 'Tax rate must be between 0 and 100' });
    }

    const foodType = ['veg', 'non-veg', 'egg'].includes(foodTypeRaw) ? foodTypeRaw : 'veg';
    const qty = parseInt(qtyStr, 10);

    if (errors.filter((e) => e.rowIndex === rowNum).length === 0) {
      validRows.push({
        name,
        sku,
        category,
        description: row.description || row['Description'] || '',
        price,
        tax,
        hsn,
        foodType,
        quantity: isNaN(qty) ? 100 : qty,
        unit: unit || 'portion',
        available: true,
        imageUrl: row.imageUrl || row['Image URL'] || row['Image'] || '',
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
