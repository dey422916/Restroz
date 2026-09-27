import {
  PrinterCalibration,
  PrinterPaperWidth,
} from '../../types';
import {
  DEFAULT_PRINTER_CALIBRATION,
  CALIBRATION_LIMITS,
} from './printerTypes';

export interface CalibrationValidationResult {
  isValid: boolean;
  errors: string[];
}

export const calibrationService = {
  /**
   * Returns default pristine calibration parameters.
   */
  getDefaultCalibration(): PrinterCalibration {
    return { ...DEFAULT_PRINTER_CALIBRATION };
  },

  /**
   * Validates printer calibration values against strict physical limits.
   */
  validateCalibration(
    cal: Partial<PrinterCalibration>,
    paperWidth: PrinterPaperWidth = '80mm'
  ): CalibrationValidationResult {
    const errors: string[] = [];
    const widthMm = paperWidth === '58mm' ? 58 : 80;

    // 1. Horizontal Shift Check (-10mm to +10mm)
    if (cal.horizontal_shift_mm !== undefined && cal.horizontal_shift_mm !== null) {
      if (
        cal.horizontal_shift_mm < CALIBRATION_LIMITS.MIN_HORIZONTAL_SHIFT_MM ||
        cal.horizontal_shift_mm > CALIBRATION_LIMITS.MAX_HORIZONTAL_SHIFT_MM
      ) {
        errors.push(
          `Horizontal shift must be between ${CALIBRATION_LIMITS.MIN_HORIZONTAL_SHIFT_MM}mm and +${CALIBRATION_LIMITS.MAX_HORIZONTAL_SHIFT_MM}mm.`
        );
      }
    }

    // 2. Alignment Check
    if (cal.alignment && !['left', 'center', 'right'].includes(cal.alignment)) {
      errors.push("Alignment must be 'left', 'center', or 'right'.");
    }

    // 3. Margin Limits
    if (cal.margin_left_mm !== undefined && cal.margin_left_mm !== null) {
      if (cal.margin_left_mm < CALIBRATION_LIMITS.MIN_MARGIN_MM || cal.margin_left_mm > CALIBRATION_LIMITS.MAX_LEFT_MARGIN_MM) {
        errors.push(`Left margin must be between 0mm and ${CALIBRATION_LIMITS.MAX_LEFT_MARGIN_MM}mm.`);
      }
    }

    if (cal.margin_right_mm !== undefined && cal.margin_right_mm !== null) {
      if (cal.margin_right_mm < CALIBRATION_LIMITS.MIN_MARGIN_MM || cal.margin_right_mm > CALIBRATION_LIMITS.MAX_RIGHT_MARGIN_MM) {
        errors.push(`Right margin must be between 0mm and ${CALIBRATION_LIMITS.MAX_RIGHT_MARGIN_MM}mm.`);
      }
    }

    if (cal.margin_top_mm !== undefined && cal.margin_top_mm !== null) {
      if (cal.margin_top_mm < CALIBRATION_LIMITS.MIN_MARGIN_MM || cal.margin_top_mm > CALIBRATION_LIMITS.MAX_TOP_MARGIN_MM) {
        errors.push(`Top margin must be between 0mm and ${CALIBRATION_LIMITS.MAX_TOP_MARGIN_MM}mm.`);
      }
    }

    if (cal.margin_bottom_mm !== undefined && cal.margin_bottom_mm !== null) {
      if (cal.margin_bottom_mm < CALIBRATION_LIMITS.MIN_MARGIN_MM || cal.margin_bottom_mm > CALIBRATION_LIMITS.MAX_BOTTOM_MARGIN_MM) {
        errors.push(`Bottom margin must be between 0mm and ${CALIBRATION_LIMITS.MAX_BOTTOM_MARGIN_MM}mm.`);
      }
    }

    // 4. Combined Width Integrity
    const leftM = cal.margin_left_mm || 0;
    const rightM = cal.margin_right_mm || 0;
    if (leftM + rightM >= widthMm - 10) {
      errors.push(
        `Left margin (${leftM}mm) + Right margin (${rightM}mm) leaves no printable width on ${paperWidth} paper.`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  /**
   * Calculates effective horizontal offset (in mm and 203 DPI dots) for future ESC/POS raster placement.
   */
  calculatePlacementOffsets(
    cal: PrinterCalibration,
    paperWidth: PrinterPaperWidth = '80mm',
    contentWidthMm: number = 72
  ) {
    const totalWidthMm = paperWidth === '58mm' ? 58 : 80;
    const basePrintableMm = paperWidth === '58mm' ? 48 : 72;
    const usableWidthMm = Math.min(contentWidthMm, basePrintableMm);

    // Alignment base offset
    let baseOffsetMm = 0;
    if (cal.alignment === 'center') {
      baseOffsetMm = Math.max(0, (totalWidthMm - usableWidthMm) / 2);
    } else if (cal.alignment === 'right') {
      baseOffsetMm = Math.max(0, totalWidthMm - usableWidthMm - cal.margin_right_mm);
    } else {
      baseOffsetMm = cal.margin_left_mm;
    }

    // Apply manual shift: negative moves left, positive moves right
    const finalShiftMm = baseOffsetMm + cal.horizontal_shift_mm;
    // 203 DPI = ~8 dots per mm
    const dotsPerMm = 8.0;
    const finalShiftDots = Math.round(finalShiftMm * dotsPerMm);

    return {
      totalWidthMm,
      usableWidthMm,
      finalShiftMm,
      finalShiftDots,
    };
  },
};
