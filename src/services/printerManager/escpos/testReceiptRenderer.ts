/**
 * ESC/POS Test Receipt Generator & Debug Raster Visualizers
 * Provides deterministic sample fixtures and development raster inspection utilities.
 */

import { Order, KOT, RestaurantSettings, RestaurantPrinter } from '../../../types';
import { renderKotToEscPos } from './kotRenderer';
import { renderBillToEscPos } from './billRenderer';
import { renderCalibrationReceiptToEscPos } from './calibrationRenderer';
import { EscPosDocument } from './encoder';

export const SAMPLE_RESTAURANT_SETTINGS: RestaurantSettings = {
  id: 'rest-001',
  restaurant_id: 'rest-001',
  name: 'RestroZ Gourmet Lounge',
  legal_name: 'RestroZ Hospitality Pvt Ltd',
  address: 'Shop 104, 1st Floor, City Center Mall, MG Road',
  phone: '+91 98765 43210',
  email: 'info@restroz.com',
  gstin: '19ABCDE1234F1Z5',
  state: 'West Bengal',
  state_code: '19',
  invoice_prefix: 'INV-2026-',
  kot_prefix: 'KOT-',
  default_tax_rate: 5.0,
  is_gst_enabled: true,
  gst_registered: true,
  tax_invoice_enabled: true,
  currency: 'INR',
  currency_symbol: '₹',
  service_charge_rate: 0,
  kot_paper_size: '80mm',
  bill_paper_size: '80mm',
  auto_print_kot: false,
} as unknown as RestaurantSettings;

export const SAMPLE_TEST_KOT: KOT = {
  id: 'kot-fixture-001',
  restaurant_id: 'rest-001',
  order_id: 'ord-fixture-001',
  kot_number: 'KOT-042',
  order_type: 'dine_in',
  status: 'sent_to_kitchen',
  kitchen_notes: 'Extra spicy on Biryani, Less ice in cold coffee',
  created_at: '2026-09-27T20:15:00.000Z',
  items: [
    {
      id: 'koti-1',
      kot_id: 'kot-fixture-001',
      product_name: 'Royal Hyderabadi Chicken Dum Biryani',
      quantity: 2,
      notes: 'Extra salan & raita',
    },
    {
      id: 'koti-2',
      kot_id: 'kot-fixture-001',
      product_name: 'Cafe Mocha Cold Coffee with Ice Cream',
      quantity: 1,
      notes: 'Less sugar',
    },
    {
      id: 'koti-3',
      kot_id: 'kot-fixture-001',
      product_name: 'Steamed Veg Momos (6 pcs)',
      quantity: 1,
    },
  ],
} as unknown as KOT;

export const SAMPLE_TEST_ORDER: Order = {
  id: 'ord-fixture-001',
  restaurant_id: 'rest-001',
  order_number: 'ORD-8821',
  invoice_number: 'INV-2026-0042',
  order_type: 'dine_in',
  table_id: 'tbl-7',
  table_number: 'T-7',
  delivery_charge: 0,
  status: 'confirmed',
  payment_status: 'paid',
  payment_method: 'upi',
  created_at: '2026-09-27T20:15:00.000Z',
  updated_at: '2026-09-27T20:45:00.000Z',
  subtotal: 920.00,
  discount_amount: 0.00,
  coupon_discount: 0.00,
  cgst_amount: 23.00,
  sgst_amount: 23.00,
  igst_amount: 0.00,
  service_charge: 0.00,
  grand_total: 966.00,
  round_off: 0.00,
  payable_amount: 966.00,
  notes: 'Customer requested quick service',
  kots: [SAMPLE_TEST_KOT],
  items: [
    {
      id: 'oi-1',
      order_id: 'ord-fixture-001',
      product_id: 'p-1',
      product_name: 'Royal Hyderabadi Chicken Dum Biryani',
      quantity: 2,
      unit_price: 340.00,
      total_price: 680.00,
      tax_rate: 5.0,
      tax_amount: 34.00,
      subtotal: 680.00,
      total: 680.00,
      item_notes: 'Extra salan & raita',
    },
    {
      id: 'oi-2',
      order_id: 'ord-fixture-001',
      product_id: 'p-2',
      product_name: 'Cafe Mocha Cold Coffee with Ice Cream',
      quantity: 1,
      unit_price: 140.00,
      total_price: 140.00,
      tax_rate: 5.0,
      tax_amount: 7.00,
      subtotal: 140.00,
      total: 140.00,
      item_notes: 'Less sugar',
    },
    {
      id: 'oi-3',
      order_id: 'ord-fixture-001',
      product_id: 'p-3',
      product_name: 'Steamed Veg Momos (6 pcs)',
      quantity: 1,
      unit_price: 100.00,
      total_price: 100.00,
      tax_rate: 5.0,
      tax_amount: 5.00,
      subtotal: 100.00,
      total: 100.00,
    },
  ],
  payments: [
    {
      id: 'pay-1',
      order_id: 'ord-fixture-001',
      amount: 966.00,
      payment_method: 'upi',
      reference_number: 'UPI/26092788912/OKAXIS',
      created_at: '2026-09-27T20:45:00.000Z',
    },
  ],
} as unknown as Order;

export const SAMPLE_PRINTER_POS80: RestaurantPrinter = {
  id: 'prn-001',
  restaurant_id: 'rest-001',
  name: 'Kitchen POS80 (Wi-Fi)',
  connection_type: 'wifi',
  paper_width: '80mm',
  printer_role: 'kot',
  is_active: true,
  is_primary: true,
  ip_address: '192.168.1.120',
  port: 9100,
  alignment: 'center',
  horizontal_shift_mm: -1.5,
  margin_left_mm: 0.0,
  margin_right_mm: 0.0,
  margin_top_mm: 0.0,
  margin_bottom_mm: 0.0,
  category_ids: [],
  section_names: [],
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};

export const SAMPLE_PRINTER_POS58: RestaurantPrinter = {
  id: 'prn-002',
  restaurant_id: 'rest-001',
  name: 'Portable Bluetooth 58mm',
  connection_type: 'bluetooth',
  paper_width: '58mm',
  printer_role: 'both',
  is_active: true,
  is_primary: false,
  bluetooth_device_name: 'MPT-II',
  alignment: 'center',
  horizontal_shift_mm: 0.0,
  margin_left_mm: 0.0,
  margin_right_mm: 0.0,
  margin_top_mm: 0.0,
  margin_bottom_mm: 0.0,
  category_ids: [],
  section_names: [],
  created_at: '2026-09-27T00:00:00.000Z',
  updated_at: '2026-09-27T00:00:00.000Z',
};

/**
 * Generates sample KOT document for test validation.
 */
export function generateSampleKotDocument(paperWidth: '58mm' | '80mm' = '80mm'): EscPosDocument {
  const printer = paperWidth === '58mm' ? SAMPLE_PRINTER_POS58 : SAMPLE_PRINTER_POS80;
  return renderKotToEscPos(SAMPLE_TEST_ORDER, SAMPLE_RESTAURANT_SETTINGS, SAMPLE_TEST_KOT, { printer });
}

/**
 * Generates sample Bill document for test validation.
 */
export function generateSampleBillDocument(paperWidth: '58mm' | '80mm' = '80mm'): EscPosDocument {
  const printer = paperWidth === '58mm' ? SAMPLE_PRINTER_POS58 : SAMPLE_PRINTER_POS80;
  return renderBillToEscPos(SAMPLE_TEST_ORDER, SAMPLE_RESTAURANT_SETTINGS, 'Rahul Sen', { printer });
}

/**
 * Generates sample Calibration document for test validation.
 */
export function generateSampleCalibrationDocument(paperWidth: '58mm' | '80mm' = '80mm'): EscPosDocument {
  const printer = paperWidth === '58mm' ? SAMPLE_PRINTER_POS58 : SAMPLE_PRINTER_POS80;
  return renderCalibrationReceiptToEscPos(printer);
}
