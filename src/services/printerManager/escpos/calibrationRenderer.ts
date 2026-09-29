/**
 * Android ESC/POS Print Calibration Test Receipt Generator
 * Renders physical ruler, alignment markers, boundary ticks, and active calibration parameters.
 */

import { RestaurantPrinter, PrinterCalibration } from '../../../types';
import { DEFAULT_PRINTER_CALIBRATION } from '../printerTypes';
import { mmToDots, getRasterProfile } from './raster';
import { ReceiptCanvas } from './documentRenderer';
import { encodeRasterToEscPos, EscPosDocument } from './encoder';

/**
 * Generates an ESC/POS calibration test document for visual hardware fine-tuning.
 */
export function renderCalibrationReceiptToEscPos(
  printer: RestaurantPrinter,
  customCalibration?: PrinterCalibration
): EscPosDocument {
  const paperWidth = printer.paper_width || '80mm';
  const profile = getRasterProfile(paperWidth);
  const canvas = new ReceiptCanvas(paperWidth, profile);

  const calibration: PrinterCalibration = customCalibration || {
    alignment: printer.alignment,
    horizontal_shift_mm: printer.horizontal_shift_mm,
    margin_left_mm: printer.margin_left_mm,
    margin_right_mm: printer.margin_right_mm,
    margin_top_mm: printer.margin_top_mm,
    margin_bottom_mm: printer.margin_bottom_mm,
  };

  const shiftDots = mmToDots(calibration.horizontal_shift_mm || 0, profile.dpi);

  // 1. Header Banner
  canvas.drawBanner('PRINT CALIBRATION TEST', { scaleX: 1, scaleY: 1 });
  canvas.drawTextLine('RESTROZ THERMAL RASTER ENGINE', { align: 'center', bold: true });
  canvas.drawDivider('solid', 2);

  // 2. Visual Horizontal Boundary Ruler
  // Generate character markers: |L ... C ... R|
  const is58 = paperWidth === '58mm';
  const totalChars = is58 ? 32 : 48;
  const leftChar = '|L';
  const rightChar = 'R|';
  const centerChar = 'C';
  const halfGap = Math.max(1, Math.floor((totalChars - 5) / 2));
  const boundaryLine = `${leftChar}${'-'.repeat(halfGap)}${centerChar}${'-'.repeat(halfGap)}${rightChar}`;

  canvas.drawTextLine(boundaryLine, { align: 'center', bold: true });

  // 3. Numbered ruler: 12345678901234567890...
  let rulerStr = '';
  for (let i = 1; i <= totalChars; i++) {
    rulerStr += String(i % 10);
  }
  canvas.drawTextLine(rulerStr, { align: 'center' });
  canvas.drawDivider('solid', 1);

  // 4. Current Hardware & Calibration Parameters
  canvas.drawKeyValue('Printer Name:', printer.name, { bold: true });
  canvas.drawKeyValue('Connection:', printer.connection_type.toUpperCase());
  canvas.drawKeyValue('Paper Width:', `${paperWidth} (${profile.printableWidthDots} dots)`);
  canvas.drawKeyValue('Resolution:', `${profile.dpi} DPI (1mm ≈ 8 dots)`);
  canvas.drawKeyValue('Alignment:', calibration.alignment.toUpperCase(), { bold: true });

  const shiftSign = calibration.horizontal_shift_mm > 0 ? '+' : '';
  canvas.drawKeyValue(
    'Horizontal Shift:',
    `${shiftSign}${calibration.horizontal_shift_mm.toFixed(1)}mm (${shiftDots > 0 ? '+' : ''}${shiftDots} dots)`,
    { bold: true }
  );

  canvas.drawKeyValue('Left Margin:', `${calibration.margin_left_mm.toFixed(1)}mm`);
  canvas.drawKeyValue('Right Margin:', `${calibration.margin_right_mm.toFixed(1)}mm`);
  canvas.drawKeyValue('Top Margin:', `${calibration.margin_top_mm.toFixed(1)}mm`);
  canvas.drawKeyValue('Bottom Margin:', `${calibration.margin_bottom_mm.toFixed(1)}mm`);

  canvas.drawDivider('dashed', 1);

  // 5. Calibration Instructions
  canvas.drawTextLine('CALIBRATION GUIDE:', { bold: true });
  canvas.drawTextLine('• If print is too far RIGHT: Tap [-0.5mm]');
  canvas.drawTextLine('• If print is too far LEFT:  Tap [+0.5mm]');
  canvas.drawTextLine('• Adjust until L and R markers fit paper.');

  canvas.drawDivider('solid', 2);
  canvas.drawTextLine(boundaryLine, { align: 'center', bold: true });
  canvas.drawDivider('solid', 2);

  const finalBitmap = canvas.renderToBitmap(calibration);
  return encodeRasterToEscPos(finalBitmap, {
    cut: true,
    feedLines: 4,
    paperWidth,
  });
}
