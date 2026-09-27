export * from '../../types';

export const DEFAULT_PRINTER_CALIBRATION: {
  alignment: 'center';
  horizontal_shift_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  margin_top_mm: number;
  margin_bottom_mm: number;
} = {
  alignment: 'center',
  horizontal_shift_mm: 0.0,
  margin_left_mm: 0.0,
  margin_right_mm: 0.0,
  margin_top_mm: 0.0,
  margin_bottom_mm: 0.0,
};

export const CALIBRATION_LIMITS = {
  MIN_HORIZONTAL_SHIFT_MM: -10.0,
  MAX_HORIZONTAL_SHIFT_MM: 10.0,
  MIN_MARGIN_MM: 0.0,
  MAX_LEFT_MARGIN_MM: 15.0,
  MAX_RIGHT_MARGIN_MM: 15.0,
  MAX_TOP_MARGIN_MM: 20.0,
  MAX_BOTTOM_MARGIN_MM: 20.0,
  DEFAULT_PORT: 9100,
  MIN_PORT: 1,
  MAX_PORT: 65535,
};
