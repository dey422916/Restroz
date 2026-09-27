export * from './printerTypes';
export * from './calibration';
export * from './devicePrinterBindings';
export * from './printerRepository';
export * from './routing';
export * from './escpos';
export * from './transports';
export * from './androidPrintRouter';
export * from './diagnostics';

import { RestaurantPrinter, PrinterCalibration } from '../../types';
import { printerRepository } from './printerRepository';
import { devicePrinterBindingService } from './devicePrinterBindings';
import { calibrationService } from './calibration';
import { printerRoutingService } from './routing';
import { androidPrintRouter } from './androidPrintRouter';
import { printerDiagnosticsService } from './diagnostics';
import { renderKotToEscPos } from './escpos/kotRenderer';
import { renderBillToEscPos } from './escpos/billRenderer';
import { renderCalibrationReceiptToEscPos } from './escpos/calibrationRenderer';
import {
  renderNetworkTestReceiptToEscPos,
  generateSampleKotDocument,
  generateSampleBillDocument,
} from './escpos/testReceiptRenderer';
import { tcpTransport } from './transports/tcpTransport';
import { bluetoothTransport } from './transports/bluetoothTransport';
import { usbTransport } from './transports/usbTransport';
import { TestConnectionResult, PrintTransportResult } from './transports/types';

export const printerManager = {
  ...printerRepository,
  ...devicePrinterBindingService,
  ...calibrationService,
  ...printerRoutingService,
  ...androidPrintRouter,
  ...printerDiagnosticsService,
  renderKotToEscPos,
  renderBillToEscPos,
  renderCalibrationReceiptToEscPos,
  renderNetworkTestReceiptToEscPos,

  // Bluetooth Discovery and Status APIs
  requestBluetoothPermissions: () => bluetoothTransport.requestPermissions(),
  isBluetoothEnabled: () => bluetoothTransport.isEnabled(),
  getBluetoothPairedDevices: () => bluetoothTransport.getPairedDevices(),
  startBluetoothDiscovery: () => bluetoothTransport.startDiscovery(),

  // USB Discovery and Status APIs
  isUsbHostSupported: () => usbTransport.isUsbHostSupported(),
  getAttachedUsbDevices: () => usbTransport.getAttachedDevices(),
  requestUsbPermission: (deviceId: number) => usbTransport.requestPermission(deviceId),

  /**
   * Tests connection to a LAN, Wi-Fi, Bluetooth, or USB thermal printer.
   */
  async testPrinterConnection(printer: RestaurantPrinter): Promise<TestConnectionResult> {
    if (printer.connection_type === 'bluetooth') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const address = binding?.bluetooth_mac_address;
      if (!address) {
        return {
          reachable: false,
          status: 'not_bound',
          message: 'Bluetooth printer is not physically paired or bound on this tablet. Select device in Settings.',
          latencyMs: 0,
        };
      }

      return bluetoothTransport.testConnection({
        address,
        name: binding.bluetooth_device_name || printer.bluetooth_device_name || undefined,
      });
    }

    if (printer.connection_type === 'usb') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const vendorId = binding?.usb_vendor_id;
      const productId = binding?.usb_product_id;
      if (vendorId === undefined || vendorId === null || productId === undefined || productId === null) {
        return {
          reachable: false,
          status: 'not_bound',
          message: 'USB printer is not bound on this tablet. Select USB device in Settings.',
          latencyMs: 0,
        };
      }

      return usbTransport.testConnection({
        vendorId,
        productId,
        serialNumber: binding?.usb_serial_number || undefined,
      });
    }

    if (printer.connection_type === 'lan' || printer.connection_type === 'wifi') {
      return tcpTransport.testConnection({
        host: printer.ip_address || '',
        port: printer.port || 9100,
      });
    }

    return {
      reachable: false,
      status: 'not_configured',
      message: `${(printer.connection_type as string).toUpperCase()} hardware testing will become available in later phases.`,
      latencyMs: 0,
    };
  },

  /**
   * Prints a clean, small test receipt to a LAN, Wi-Fi, Bluetooth, or USB thermal printer.
   */
  async printTestReceipt(
    printer: RestaurantPrinter,
    customCalibration?: PrinterCalibration
  ): Promise<PrintTransportResult> {
    const doc = renderNetworkTestReceiptToEscPos(printer, customCalibration);

    if (printer.connection_type === 'bluetooth') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const address = binding?.bluetooth_mac_address;
      if (!address) {
        return {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: doc.bytes.length,
          message: 'Bluetooth printer not bound on this tablet. Please pair and select device in Settings.',
          durationMs: 0,
        };
      }

      return bluetoothTransport.sendPayload(
        { address, name: binding.bluetooth_device_name || undefined },
        doc.bytes,
        printer.id
      );
    }

    if (printer.connection_type === 'usb') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const vendorId = binding?.usb_vendor_id;
      const productId = binding?.usb_product_id;
      if (vendorId === undefined || vendorId === null || productId === undefined || productId === null) {
        return {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: doc.bytes.length,
          message: 'USB printer not bound on this tablet. Please connect and select device in Settings.',
          durationMs: 0,
        };
      }

      return usbTransport.sendPayload(
        {
          vendorId,
          productId,
          serialNumber: binding?.usb_serial_number || undefined,
        },
        doc.bytes,
        printer.id
      );
    }

    if (printer.connection_type === 'lan' || printer.connection_type === 'wifi') {
      return tcpTransport.sendPayload(
        {
          host: printer.ip_address || '',
          port: printer.port || 9100,
        },
        doc.bytes,
        printer.id
      );
    }

    return {
      success: false,
      status: 'not_configured',
      bytesSent: 0,
      totalBytes: doc.bytes.length,
      message: `${(printer.connection_type as string).toUpperCase()} direct printing will become available after hardware driver support is installed.`,
      durationMs: 0,
    };
  },

  /**
   * Prints a visual calibration test receipt to a LAN, Wi-Fi, Bluetooth, or USB thermal printer.
   */
  async printCalibrationTest(
    printer: RestaurantPrinter,
    customCalibration?: PrinterCalibration
  ): Promise<PrintTransportResult> {
    const doc = renderCalibrationReceiptToEscPos(printer, customCalibration);

    if (printer.connection_type === 'bluetooth') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const address = binding?.bluetooth_mac_address;
      if (!address) {
        return {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: doc.bytes.length,
          message: 'Bluetooth printer not bound on this tablet. Please pair and select device in Settings.',
          durationMs: 0,
        };
      }

      return bluetoothTransport.sendPayload(
        { address, name: binding.bluetooth_device_name || undefined },
        doc.bytes,
        printer.id
      );
    }

    if (printer.connection_type === 'usb') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const vendorId = binding?.usb_vendor_id;
      const productId = binding?.usb_product_id;
      if (vendorId === undefined || vendorId === null || productId === undefined || productId === null) {
        return {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: doc.bytes.length,
          message: 'USB printer not bound on this tablet. Please connect and select device in Settings.',
          durationMs: 0,
        };
      }

      return usbTransport.sendPayload(
        {
          vendorId,
          productId,
          serialNumber: binding?.usb_serial_number || undefined,
        },
        doc.bytes,
        printer.id
      );
    }

    if (printer.connection_type === 'lan' || printer.connection_type === 'wifi') {
      return tcpTransport.sendPayload(
        {
          host: printer.ip_address || '',
          port: printer.port || 9100,
        },
        doc.bytes,
        printer.id
      );
    }

    return {
      success: false,
      status: 'not_configured',
      bytesSent: 0,
      totalBytes: doc.bytes.length,
      message: `${(printer.connection_type as string).toUpperCase()} direct printing will become available after hardware driver support is installed.`,
      durationMs: 0,
    };
  },

  /**
   * Sends deterministic sample KOT to a LAN, Wi-Fi, Bluetooth, or USB thermal printer for DEV validation.
   */
  async printSampleKot(
    printer: RestaurantPrinter,
    customCalibration?: PrinterCalibration
  ): Promise<PrintTransportResult> {
    const doc = generateSampleKotDocument(printer.paper_width);

    if (printer.connection_type === 'bluetooth') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const address = binding?.bluetooth_mac_address;
      if (!address) {
        return {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: doc.bytes.length,
          message: 'Bluetooth printer not bound on this tablet.',
          durationMs: 0,
        };
      }

      return bluetoothTransport.sendPayload({ address }, doc.bytes, printer.id);
    }

    if (printer.connection_type === 'usb') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const vendorId = binding?.usb_vendor_id;
      const productId = binding?.usb_product_id;
      if (vendorId === undefined || vendorId === null || productId === undefined || productId === null) {
        return {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: doc.bytes.length,
          message: 'USB printer not bound on this tablet.',
          durationMs: 0,
        };
      }

      return usbTransport.sendPayload(
        { vendorId, productId, serialNumber: binding?.usb_serial_number || undefined },
        doc.bytes,
        printer.id
      );
    }

    if (printer.connection_type === 'lan' || printer.connection_type === 'wifi') {
      return tcpTransport.sendPayload(
        {
          host: printer.ip_address || '',
          port: printer.port || 9100,
        },
        doc.bytes,
        printer.id
      );
    }

    return {
      success: false,
      status: 'not_configured',
      bytesSent: 0,
      totalBytes: doc.bytes.length,
      message: `${(printer.connection_type as string).toUpperCase()} printing not supported in this phase.`,
      durationMs: 0,
    };
  },

  /**
   * Sends deterministic sample Bill to a LAN, Wi-Fi, Bluetooth, or USB thermal printer for DEV validation.
   */
  async printSampleBill(
    printer: RestaurantPrinter,
    customCalibration?: PrinterCalibration
  ): Promise<PrintTransportResult> {
    const doc = generateSampleBillDocument(printer.paper_width);

    if (printer.connection_type === 'bluetooth') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const address = binding?.bluetooth_mac_address;
      if (!address) {
        return {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: doc.bytes.length,
          message: 'Bluetooth printer not bound on this tablet.',
          durationMs: 0,
        };
      }

      return bluetoothTransport.sendPayload({ address }, doc.bytes, printer.id);
    }

    if (printer.connection_type === 'usb') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const vendorId = binding?.usb_vendor_id;
      const productId = binding?.usb_product_id;
      if (vendorId === undefined || vendorId === null || productId === undefined || productId === null) {
        return {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: doc.bytes.length,
          message: 'USB printer not bound on this tablet.',
          durationMs: 0,
        };
      }

      return usbTransport.sendPayload(
        { vendorId, productId, serialNumber: binding?.usb_serial_number || undefined },
        doc.bytes,
        printer.id
      );
    }

    if (printer.connection_type === 'lan' || printer.connection_type === 'wifi') {
      return tcpTransport.sendPayload(
        {
          host: printer.ip_address || '',
          port: printer.port || 9100,
        },
        doc.bytes,
        printer.id
      );
    }

    return {
      success: false,
      status: 'not_configured',
      bytesSent: 0,
      totalBytes: doc.bytes.length,
      message: `${(printer.connection_type as string).toUpperCase()} printing not supported in this phase.`,
      durationMs: 0,
    };
  },
};
