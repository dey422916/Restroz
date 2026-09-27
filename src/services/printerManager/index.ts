export * from './printerTypes';
export * from './calibration';
export * from './devicePrinterBindings';
export * from './printerRepository';
export * from './routing';
export * from './escpos';
export * from './transports';

import { RestaurantPrinter, PrinterCalibration } from '../../types';
import { printerRepository } from './printerRepository';
import { devicePrinterBindingService } from './devicePrinterBindings';
import { calibrationService } from './calibration';
import { printerRoutingService } from './routing';
import { renderKotToEscPos } from './escpos/kotRenderer';
import { renderBillToEscPos } from './escpos/billRenderer';
import { renderCalibrationReceiptToEscPos } from './escpos/calibrationRenderer';
import {
  renderNetworkTestReceiptToEscPos,
  generateSampleKotDocument,
  generateSampleBillDocument,
} from './escpos/testReceiptRenderer';
import { tcpTransport } from './transports/tcpTransport';
import { TestConnectionResult, PrintTransportResult } from './transports/types';

export const printerManager = {
  ...printerRepository,
  ...devicePrinterBindingService,
  ...calibrationService,
  ...printerRoutingService,
  renderKotToEscPos,
  renderBillToEscPos,
  renderCalibrationReceiptToEscPos,
  renderNetworkTestReceiptToEscPos,

  /**
   * Tests TCP connection to a LAN / Wi-Fi thermal printer.
   */
  async testPrinterConnection(printer: RestaurantPrinter): Promise<TestConnectionResult> {
    if (printer.connection_type !== 'lan' && printer.connection_type !== 'wifi') {
      return {
        reachable: false,
        status: 'not_configured',
        message: `${printer.connection_type.toUpperCase()} hardware testing will become available in later phases.`,
        latencyMs: 0,
      };
    }

    return tcpTransport.testConnection({
      host: printer.ip_address || '',
      port: printer.port || 9100,
    });
  },

  /**
   * Prints a clean, small test receipt to a LAN / Wi-Fi thermal printer.
   */
  async printTestReceipt(
    printer: RestaurantPrinter,
    customCalibration?: PrinterCalibration
  ): Promise<PrintTransportResult> {
    if (printer.connection_type !== 'lan' && printer.connection_type !== 'wifi') {
      return {
        success: false,
        status: 'not_configured',
        bytesSent: 0,
        totalBytes: 0,
        message: `${printer.connection_type.toUpperCase()} direct printing will become available after hardware driver support is installed.`,
        durationMs: 0,
      };
    }

    const doc = renderNetworkTestReceiptToEscPos(printer, customCalibration);
    return tcpTransport.sendPayload(
      {
        host: printer.ip_address || '',
        port: printer.port || 9100,
      },
      doc.bytes,
      printer.id
    );
  },

  /**
   * Prints a visual calibration test receipt to a LAN / Wi-Fi thermal printer.
   */
  async printCalibrationTest(
    printer: RestaurantPrinter,
    customCalibration?: PrinterCalibration
  ): Promise<PrintTransportResult> {
    if (printer.connection_type !== 'lan' && printer.connection_type !== 'wifi') {
      return {
        success: false,
        status: 'not_configured',
        bytesSent: 0,
        totalBytes: 0,
        message: `${printer.connection_type.toUpperCase()} direct printing will become available after hardware driver support is installed.`,
        durationMs: 0,
      };
    }

    const doc = renderCalibrationReceiptToEscPos(printer, customCalibration);
    return tcpTransport.sendPayload(
      {
        host: printer.ip_address || '',
        port: printer.port || 9100,
      },
      doc.bytes,
      printer.id
    );
  },

  /**
   * Sends deterministic sample KOT to a LAN / Wi-Fi thermal printer for DEV validation.
   */
  async printSampleKot(
    printer: RestaurantPrinter,
    customCalibration?: PrinterCalibration
  ): Promise<PrintTransportResult> {
    if (printer.connection_type !== 'lan' && printer.connection_type !== 'wifi') {
      return {
        success: false,
        status: 'not_configured',
        bytesSent: 0,
        totalBytes: 0,
        message: `${printer.connection_type.toUpperCase()} printing not supported in this phase.`,
        durationMs: 0,
      };
    }

    const doc = generateSampleKotDocument(printer.paper_width);
    return tcpTransport.sendPayload(
      {
        host: printer.ip_address || '',
        port: printer.port || 9100,
      },
      doc.bytes,
      printer.id
    );
  },

  /**
   * Sends deterministic sample Bill to a LAN / Wi-Fi thermal printer for DEV validation.
   */
  async printSampleBill(
    printer: RestaurantPrinter,
    customCalibration?: PrinterCalibration
  ): Promise<PrintTransportResult> {
    if (printer.connection_type !== 'lan' && printer.connection_type !== 'wifi') {
      return {
        success: false,
        status: 'not_configured',
        bytesSent: 0,
        totalBytes: 0,
        message: `${printer.connection_type.toUpperCase()} printing not supported in this phase.`,
        durationMs: 0,
      };
    }

    const doc = generateSampleBillDocument(printer.paper_width);
    return tcpTransport.sendPayload(
      {
        host: printer.ip_address || '',
        port: printer.port || 9100,
      },
      doc.bytes,
      printer.id
    );
  },
};


