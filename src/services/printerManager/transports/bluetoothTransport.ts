/**
 * Android Bluetooth Classic ESC/POS Transport (SPP / RFCOMM)
 * Handles Bluetooth pairing discovery, permissions on Android 12+,
 * binary streaming over Serial Port Profile (UUID: 00001101-0000-1000-8000-00805F9B34FB),
 * timeout handling, conservative chunking, and partial write tracking.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import {
  BluetoothDeviceInfo,
  BluetoothConnectionConfig,
  TestConnectionResult,
  PrintTransportResult,
  DEFAULT_BLUETOOTH_TIMEOUT_MS,
  SPP_UUID,
} from './types';

// Per-printer active Bluetooth job lock
const ACTIVE_BT_PRINTER_LOCKS = new Map<string, boolean>();

/**
 * Resolves the native Bluetooth Classic module dynamically.
 */
async function getBluetoothClassicModule(): Promise<any> {
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    try {
      const mod = await import('react-native-bluetooth-classic');
      return mod.default || mod;
    } catch (err) {
      console.warn('[Bluetooth Transport] Native Bluetooth module not available:', err);
      return null;
    }
  }
  return null;
}

export const bluetoothTransport = {
  /**
   * Checks whether Bluetooth permissions are granted.
   * On Android 12+ (API 31+), requests BLUETOOTH_CONNECT and BLUETOOTH_SCAN.
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const apiLevel = Number(Platform.Version);
      if (apiLevel >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        ]);

        return (
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Bluetooth Permission',
            message: 'RestroZ requires location permission to discover nearby Bluetooth thermal printers on this Android version.',
            buttonPositive: 'Allow',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn('[Bluetooth Transport] Permission request error:', err);
      return false;
    }
  },

  /**
   * Checks if Bluetooth adapter is enabled on the device.
   */
  async isEnabled(): Promise<boolean> {
    const bt = await getBluetoothClassicModule();
    if (!bt) return false;
    try {
      return await bt.isBluetoothEnabled();
    } catch (err) {
      console.warn('[Bluetooth Transport] isBluetoothEnabled error:', err);
      return false;
    }
  },

  /**
   * Returns list of bonded / paired Bluetooth Classic devices on the Android device.
   */
  async getPairedDevices(): Promise<BluetoothDeviceInfo[]> {
    const bt = await getBluetoothClassicModule();
    if (!bt) return [];

    try {
      const hasPerm = await this.requestPermissions();
      if (!hasPerm) return [];

      const devices = await bt.getBondedDevices();
      return (devices || []).map((d: any) => ({
        id: d.address || d.id,
        address: d.address || d.id,
        name: d.name || 'Unnamed Bluetooth Device',
        bonded: true,
      }));
    } catch (err) {
      console.warn('[Bluetooth Transport] getBondedDevices error:', err);
      return [];
    }
  },

  /**
   * Starts discovery for nearby Bluetooth Classic devices.
   */
  async startDiscovery(): Promise<BluetoothDeviceInfo[]> {
    const bt = await getBluetoothClassicModule();
    if (!bt) return [];

    try {
      const hasPerm = await this.requestPermissions();
      if (!hasPerm) return [];

      const discovered = await bt.startDiscovery();
      return (discovered || []).map((d: any) => ({
        id: d.address || d.id,
        address: d.address || d.id,
        name: d.name || 'Unnamed Bluetooth Device',
        bonded: Boolean(d.bonded),
      }));
    } catch (err) {
      console.warn('[Bluetooth Transport] startDiscovery error:', err);
      return [];
    }
  },

  /**
   * Tests connection to a Bluetooth Classic printer without printing data.
   */
  async testConnection(config: BluetoothConnectionConfig): Promise<TestConnectionResult> {
    if (!config.address || !config.address.trim()) {
      return {
        reachable: false,
        status: 'not_bound',
        message: 'No Bluetooth device paired or configured on this tablet.',
        latencyMs: 0,
      };
    }

    const address = config.address.trim();
    const startTime = Date.now();
    const timeoutMs = config.timeoutMs || DEFAULT_BLUETOOTH_TIMEOUT_MS;

    const bt = await getBluetoothClassicModule();
    if (!bt) {
      if (Platform.OS === 'web') {
        return {
          reachable: false,
          status: 'invalid_config',
          message: 'Bluetooth Classic thermal printing is supported on Android devices.',
          latencyMs: 0,
        };
      }
      return {
        reachable: false,
        status: 'invalid_config',
        message: 'Native Bluetooth Classic module unavailable.',
        latencyMs: 0,
      };
    }

    const enabled = await this.isEnabled();
    if (!enabled) {
      return {
        reachable: false,
        status: 'bluetooth_disabled',
        message: 'Bluetooth is turned OFF on this device. Please turn Bluetooth ON.',
        latencyMs: 0,
      };
    }

    const hasPerm = await this.requestPermissions();
    if (!hasPerm) {
      return {
        reachable: false,
        status: 'permission_denied',
        message: 'Bluetooth permission denied by user.',
        latencyMs: 0,
      };
    }

    try {
      // Connect to device using RFCOMM/SPP
      const connected = await bt.connectToDevice(address, {
        connectorType: 'rfcomm',
        delimiter: '',
      });

      const latency = Date.now() - startTime;

      // Disconnect cleanly
      try {
        await bt.disconnectFromDevice(address);
      } catch (_) {}

      if (connected) {
        return {
          reachable: true,
          status: 'reachable',
          message: `Bluetooth printer reachable (${latency}ms).`,
          latencyMs: latency,
        };
      } else {
        return {
          reachable: false,
          status: 'unreachable',
          message: `Could not connect to Bluetooth device (${address}). Verify printer is turned on and in range.`,
          latencyMs: latency,
        };
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      return {
        reachable: false,
        status: errMsg.includes('timeout') ? 'timeout' : 'unreachable',
        message: `Bluetooth connection failed: ${errMsg}`,
        latencyMs: Date.now() - startTime,
        error: errMsg,
      };
    }
  },

  /**
   * Transmits raw binary ESC/POS payload to a Bluetooth Classic printer over SPP/RFCOMM.
   * Performs conservative chunking (256-512 bytes) to ensure Bluetooth buffer integrity.
   */
  async sendPayload(
    config: BluetoothConnectionConfig,
    payload: Uint8Array,
    printerId: string = 'default'
  ): Promise<PrintTransportResult> {
    if (ACTIVE_BT_PRINTER_LOCKS.get(printerId)) {
      return {
        success: false,
        status: 'sending',
        bytesSent: 0,
        totalBytes: payload.length,
        message: 'A Bluetooth print job is already in progress for this printer.',
        durationMs: 0,
      };
    }

    if (!config.address || !config.address.trim()) {
      return {
        success: false,
        status: 'not_bound',
        bytesSent: 0,
        totalBytes: payload.length,
        message: 'Bluetooth printer is not physically bound on this tablet. Select printer from Settings.',
        durationMs: 0,
      };
    }

    ACTIVE_BT_PRINTER_LOCKS.set(printerId, true);
    const address = config.address.trim();
    const startTime = Date.now();
    let bytesSent = 0;

    const bt = await getBluetoothClassicModule();
    if (!bt) {
      ACTIVE_BT_PRINTER_LOCKS.delete(printerId);
      return {
        success: false,
        status: 'invalid_config',
        bytesSent: 0,
        totalBytes: payload.length,
        message: 'Bluetooth module unavailable on this platform.',
        durationMs: 0,
      };
    }

    try {
      const enabled = await this.isEnabled();
      if (!enabled) {
        ACTIVE_BT_PRINTER_LOCKS.delete(printerId);
        return {
          success: false,
          status: 'bluetooth_disabled',
          bytesSent: 0,
          totalBytes: payload.length,
          message: 'Bluetooth is turned OFF. Please enable Bluetooth.',
          durationMs: 0,
        };
      }

      // Connect over SPP
      const connected = await bt.connectToDevice(address, {
        connectorType: 'rfcomm',
        delimiter: '',
      });

      if (!connected) {
        ACTIVE_BT_PRINTER_LOCKS.delete(printerId);
        return {
          success: false,
          status: 'unreachable',
          bytesSent: 0,
          totalBytes: payload.length,
          message: `Failed to connect to Bluetooth printer (${address}).`,
          durationMs: Date.now() - startTime,
        };
      }

      // Chunked binary transmission (512-byte slices)
      const chunkSize = 512;
      const totalLen = payload.length;
      let offset = 0;

      // Base64 encoding helper for raw binary transport across React Native bridge
      const encodeBase64 = (uint8: Uint8Array): string => {
        if (typeof (globalThis as any).btoa === 'function') {
          let binary = '';
          const len = uint8.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          return (globalThis as any).btoa(binary);
        }
        const gBuf = (globalThis as any).Buffer;
        if (gBuf) {
          return gBuf.from(uint8.buffer, uint8.byteOffset, uint8.byteLength).toString('base64');
        }
        return '';
      };

      while (offset < totalLen) {
        const currentChunkSize = Math.min(chunkSize, totalLen - offset);
        const chunk = payload.subarray(offset, offset + currentChunkSize);
        const base64Chunk = encodeBase64(chunk);

        await bt.writeToDevice(address, base64Chunk, 'base64');
        bytesSent += currentChunkSize;
        offset += currentChunkSize;

        // Brief delay between large chunks to allow printer internal buffer drainage
        if (offset < totalLen) {
          await new Promise((r) => setTimeout(r, 20));
        }
      }

      // Disconnect cleanly
      try {
        await bt.disconnectFromDevice(address);
      } catch (_) {}

      ACTIVE_BT_PRINTER_LOCKS.delete(printerId);

      if (__DEV__) {
        console.log(
          `[ANDROID PRINT]\nPrinter: ${printerId}\nTransport: BLUETOOTH\nDevice: ${address}\nBytes: ${bytesSent}/${totalLen}\nResult: DATA_SENT\nDuration: ${Date.now() - startTime}ms`
        );
      }

      return {
        success: true,
        status: 'data_sent',
        bytesSent,
        totalBytes: totalLen,
        message: 'Print data sent to Bluetooth printer.',
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      // Disconnect on failure
      try {
        await bt.disconnectFromDevice(address);
      } catch (_) {}

      ACTIVE_BT_PRINTER_LOCKS.delete(printerId);
      const errMsg = err?.message || String(err);
      const isPartial = bytesSent > 0;

      return {
        success: false,
        status: isPartial ? 'partial_or_unknown' : 'unreachable',
        bytesSent,
        totalBytes: payload.length,
        message: isPartial
          ? 'Bluetooth transmission interrupted. Check printer output before retrying.'
          : `Bluetooth write failed: ${errMsg}`,
        durationMs: Date.now() - startTime,
        error: errMsg,
      };
    }
  },
};
