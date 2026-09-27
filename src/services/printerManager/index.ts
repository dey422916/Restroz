export * from './printerTypes';
export * from './calibration';
export * from './devicePrinterBindings';
export * from './printerRepository';
export * from './routing';
export * from './escpos';

import { printerRepository } from './printerRepository';
import { devicePrinterBindingService } from './devicePrinterBindings';
import { calibrationService } from './calibration';
import { printerRoutingService } from './routing';
import { renderKotToEscPos } from './escpos/kotRenderer';
import { renderBillToEscPos } from './escpos/billRenderer';
import { renderCalibrationReceiptToEscPos } from './escpos/calibrationRenderer';

export const printerManager = {
  ...printerRepository,
  ...devicePrinterBindingService,
  ...calibrationService,
  ...printerRoutingService,
  renderKotToEscPos,
  renderBillToEscPos,
  renderCalibrationReceiptToEscPos,
};

