/**
 * Android USB / USB-OTG ESC/POS Transport
 * Handles USB device discovery, USB Host availability, Android USB permissions,
 * Bulk OUT binary streaming, timeout protection, conservative chunking,
 * per-printer mutex locking, and partial write safety tracking.
 */

import { Platform } from 'react-native';
import {
  UsbDeviceInfo,
  UsbConnectionConfig,
  TestConnectionResult,
  PrintTransportResult,
  DEFAULT_USB_TIMEOUT_MS,
  DEFAULT_USB_CHUNK_SIZE,
} from './types';

// Per-printer active USB job lock
const ACTIVE_USB_PRINTER_LOCKS = new Map<string, boolean>();

/**
 * Resolves the native USB module dynamically.
 */
async function getUsbModule(): Promise<any> {
  if (Platform.OS === 'android') {
    try {
      const mod = await import('react-native-usb-serialport-for-android');
      return mod.UsbSerialManager || mod.default || mod;
    } catch (err) {
      console.warn('[USB Transport] Native USB module not available:', err);
      return null;
    }
  }
  return null;
}

/**
 * Converts a Uint8Array to a hex string for native Android USB transmission.
 * Lossless, exact 1:1 byte representation.
 */
export function uint8ArrayToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Slices a Uint8Array into smaller binary chunks for conservative USB buffer transfer.
 */
export function sliceBinaryChunks(data: Uint8Array, chunkSize: number = DEFAULT_USB_CHUNK_SIZE): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.subarray(i, i + chunkSize));
  }
  return chunks;
}

export const usbTransport = {
  /**
   * Checks if USB Host is supported on this Android device.
   */
  async isUsbHostSupported(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    const usb = await getUsbModule();
    return !!usb;
  },

  /**
   * Enumerates attached USB devices.
   */
  async getAttachedDevices(): Promise<UsbDeviceInfo[]> {
    const usb = await getUsbModule();
    if (!usb) return [];

    try {
      const rawList = await usb.list();
      if (!Array.isArray(rawList)) return [];

      return rawList.map((d: any) => ({
        deviceId: Number(d.deviceId),
        vendorId: Number(d.vendorId),
        productId: Number(d.productId),
        deviceName: d.deviceName || `USB Device (${Number(d.vendorId).toString(16)}:${Number(d.productId).toString(16)})`,
        serialNumber: d.serialNumber || undefined,
        isPrinterClass: true, // Tagged for discovery filtering
      }));
    } catch (err) {
      console.warn('[USB Transport] getAttachedDevices error:', err);
      return [];
    }
  },

  /**
   * Checks if USB permission has already been granted for the device.
   */
  async hasPermission(deviceId: number): Promise<boolean> {
    const usb = await getUsbModule();
    if (!usb) return false;

    try {
      return await usb.hasPermission(deviceId);
    } catch (err) {
      console.warn('[USB Transport] hasPermission error:', err);
      return false;
    }
  },

  /**
   * Requests USB permission for a specific attached USB device.
   * Returns true if permission is granted.
   */
  async requestPermission(deviceId: number): Promise<boolean> {
    const usb = await getUsbModule();
    if (!usb) return false;

    try {
      const alreadyGranted = await usb.hasPermission(deviceId);
      if (alreadyGranted) return true;

      // tryRequestPermission requests system permission dialog on Android
      const granted = await usb.tryRequestPermission(deviceId);
      if (typeof granted === 'boolean') {
        return granted;
      }
      // Re-check after prompt
      return await usb.hasPermission(deviceId);
    } catch (err) {
      console.warn('[USB Transport] requestPermission error:', err);
      return false;
    }
  },

  /**
   * Finds the active attached USB device matching the configured VID/PID and optional serial.
   */
  async findAttachedDevice(config: UsbConnectionConfig): Promise<UsbDeviceInfo | null> {
    const attached = await this.getAttachedDevices();
    if (attached.length === 0) return null;

    // 1. Match by deviceId if directly provided
    if (config.deviceId !== undefined) {
      const direct = attached.find((d) => d.deviceId === config.deviceId);
      if (direct) return direct;
    }

    // 2. Match by serialNumber + VID + PID
    if (config.serialNumber) {
      const serialMatch = attached.find(
        (d) =>
          d.vendorId === config.vendorId &&
          d.productId === config.productId &&
          d.serialNumber === config.serialNumber
      );
      if (serialMatch) return serialMatch;
    }

    // 3. Match by VID + PID
    return attached.find(
      (d) => d.vendorId === config.vendorId && d.productId === config.productId
    ) || null;
  },

  /**
   * Tests connection to a physical USB thermal printer without printing or feeding paper.
   */
  async testConnection(config: UsbConnectionConfig): Promise<TestConnectionResult> {
    const startTime = Date.now();

    if (Platform.OS !== 'android') {
      return {
        reachable: false,
        status: 'usb_host_unsupported',
        message: 'USB thermal printing requires an Android tablet or device with USB Host / OTG support.',
        latencyMs: 0,
      };
    }

    const usb = await getUsbModule();
    if (!usb) {
      return {
        reachable: false,
        status: 'usb_host_unsupported',
        message: 'Android USB Host module is unavailable or unsupported on this device.',
        latencyMs: 0,
      };
    }

    // Resolve attached device
    const device = await this.findAttachedDevice(config);
    if (!device) {
      return {
        reachable: false,
        status: 'device_not_connected',
        message: `USB printer (VID: 0x${config.vendorId.toString(16)}, PID: 0x${config.productId.toString(16)}) is not plugged into this tablet.`,
        latencyMs: Date.now() - startTime,
      };
    }

    // Check / Request Permission
    const hasPerm = await this.hasPermission(device.deviceId);
    if (!hasPerm) {
      const granted = await this.requestPermission(device.deviceId);
      if (!granted) {
        return {
          reachable: false,
          status: 'permission_denied',
          message: 'Android USB permission was denied or cancelled by the user.',
          latencyMs: Date.now() - startTime,
        };
      }
    }

    // Attempt test open and immediate close
    let port: any = null;
    try {
      port = await usb.open(device.deviceId, {
        baudRate: config.baudRate || 9600,
        parity: 0,
        dataBits: 8,
        stopBits: 1,
      });

      const latencyMs = Date.now() - startTime;
      return {
        reachable: true,
        status: 'reachable',
        message: `USB printer connected successfully (VID: 0x${device.vendorId.toString(16)}, PID: 0x${device.productId.toString(16)}, ${latencyMs}ms)`,
        latencyMs,
      };
    } catch (err: any) {
      console.warn('[USB Transport] testConnection open error:', err);
      return {
        reachable: false,
        status: 'connection_failed',
        message: `Failed to open USB device: ${err?.message || 'Interface claim failed'}`,
        latencyMs: Date.now() - startTime,
        error: err?.message,
      };
    } finally {
      if (port) {
        try {
          await port.close();
        } catch (_) {}
      }
    }
  },

  /**
   * Transmits binary ESC/POS payload to a USB thermal printer with per-printer mutex locking,
   * chunking, write timeout, and partial-write tracking.
   */
  async sendPayload(
    config: UsbConnectionConfig,
    payload: Uint8Array,
    printerId?: string
  ): Promise<PrintTransportResult> {
    const startTime = Date.now();
    const lockKey = printerId || `usb_${config.vendorId}_${config.productId}`;

    // 1. Per-printer concurrency lock
    if (ACTIVE_USB_PRINTER_LOCKS.get(lockKey)) {
      return {
        success: false,
        status: 'partial_or_unknown',
        bytesSent: 0,
        totalBytes: payload.length,
        message: 'A print job is already in progress for this USB printer. Please wait.',
        durationMs: 0,
      };
    }

    ACTIVE_USB_PRINTER_LOCKS.set(lockKey, true);

    let bytesSent = 0;
    let port: any = null;

    try {
      if (Platform.OS !== 'android') {
        return {
          success: false,
          status: 'usb_host_unsupported',
          bytesSent: 0,
          totalBytes: payload.length,
          message: 'USB thermal printing requires Android USB Host / OTG.',
          durationMs: 0,
        };
      }

      const usb = await getUsbModule();
      if (!usb) {
        return {
          success: false,
          status: 'usb_host_unsupported',
          bytesSent: 0,
          totalBytes: payload.length,
          message: 'Android USB Host native module not available.',
          durationMs: 0,
        };
      }

      // 2. Resolve attached device
      const device = await this.findAttachedDevice(config);
      if (!device) {
        return {
          success: false,
          status: 'device_not_connected',
          bytesSent: 0,
          totalBytes: payload.length,
          message: `USB printer (VID: 0x${config.vendorId.toString(16)}, PID: 0x${config.productId.toString(16)}) not connected.`,
          durationMs: Date.now() - startTime,
        };
      }

      // 3. Permission check
      const hasPerm = await this.hasPermission(device.deviceId);
      if (!hasPerm) {
        const granted = await this.requestPermission(device.deviceId);
        if (!granted) {
          return {
            success: false,
            status: 'permission_denied',
            bytesSent: 0,
            totalBytes: payload.length,
            message: 'USB permission required to print.',
            durationMs: Date.now() - startTime,
          };
        }
      }

      // 4. Open USB connection
      try {
        port = await usb.open(device.deviceId, {
          baudRate: config.baudRate || 9600,
          parity: 0,
          dataBits: 8,
          stopBits: 1,
        });
      } catch (err: any) {
        return {
          success: false,
          status: 'connection_failed',
          bytesSent: 0,
          totalBytes: payload.length,
          message: `Failed to open USB printer interface: ${err?.message || 'Open failed'}`,
          durationMs: Date.now() - startTime,
          error: err?.message,
        };
      }

      // 5. Sequential chunk transmission
      const chunks = sliceBinaryChunks(payload, DEFAULT_USB_CHUNK_SIZE);
      const timeoutLimit = startTime + (config.timeoutMs || DEFAULT_USB_TIMEOUT_MS);

      for (let i = 0; i < chunks.length; i++) {
        if (Date.now() > timeoutLimit) {
          return {
            success: false,
            status: bytesSent > 0 ? 'partial_or_unknown' : 'timeout',
            bytesSent,
            totalBytes: payload.length,
            message: `USB write timed out after ${bytesSent}/${payload.length} bytes transferred.`,
            durationMs: Date.now() - startTime,
          };
        }

        const chunkHex = uint8ArrayToHex(chunks[i]);
        await port.send(chunkHex);
        bytesSent += chunks[i].length;
      }

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        status: 'data_sent',
        bytesSent,
        totalBytes: payload.length,
        message: `ESC/POS document (${bytesSent} bytes) transmitted via USB in ${durationMs}ms.`,
        durationMs,
      };
    } catch (err: any) {
      console.warn('[USB Transport] sendPayload error:', err);
      const isPartial = bytesSent > 0;
      return {
        success: false,
        status: isPartial ? 'partial_or_unknown' : 'connection_failed',
        bytesSent,
        totalBytes: payload.length,
        message: isPartial
          ? `USB write interrupted after ${bytesSent}/${payload.length} bytes. Check printer status.`
          : `USB transmission failed: ${err?.message || 'Unknown error'}`,
        durationMs: Date.now() - startTime,
        error: err?.message,
      };
    } finally {
      if (port) {
        try {
          await port.close();
        } catch (_) {}
      }
      ACTIVE_USB_PRINTER_LOCKS.delete(lockKey);
    }
  },
};
