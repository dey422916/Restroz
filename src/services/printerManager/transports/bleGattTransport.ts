/**
 * Android Native BLE GATT Thermal Printer Transport
 * Specifically implements the proven Seznik-Veer_925C BLE GATT protocol:
 * - Service: 0000ff00-0000-1000-8000-00805f9b34fb
 * - Characteristic: 0000ff02-0000-1000-8000-00805f9b34fb
 * - Write mode: WriteWithoutResponse
 * - Chunk size: 20 bytes
 * - Inter-chunk delay: 50 ms
 * - Post-document delay: 200 ms
 * 
 * Seamlessly coexists with Classic SPP (bluetoothTransport).
 */

import { Platform, PermissionsAndroid } from 'react-native';
import {
  BluetoothDeviceInfo,
  BluetoothConnectionConfig,
  TestConnectionResult,
  PrintTransportResult,
  SEZNIK_BLE_SERVICE_UUID,
  SEZNIK_BLE_WRITE_CHAR_UUID,
  SEZNIK_BLE_CHUNK_SIZE,
  SEZNIK_BLE_INTER_CHUNK_DELAY_MS,
  SEZNIK_BLE_POST_DOCUMENT_DELAY_MS,
} from './types';
import { bluetoothTransport } from './bluetoothTransport';

const ACTIVE_BLE_LOCKS = new Map<string, boolean>();

let bleManagerInstance: any = null;

function getBleManager(): any {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (!bleManagerInstance) {
    try {
      // Dynamic require to prevent crash if native module is not linked in existing APK
      const { BleManager } = require('react-native-ble-plx');
      bleManagerInstance = new BleManager();
    } catch (err) {
      console.warn('[BLE GATT Transport] react-native-ble-plx native module not available:', err);
    }
  }
  return bleManagerInstance;
}

/**
 * Converts a Uint8Array slice to base64 string for native BLE GATT transmission.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const a = bytes[i++];
    const b = i < bytes.length ? bytes[i++] : 0;
    const c = i < bytes.length ? bytes[i++] : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    result +=
      chars.charAt((bitmap >> 18) & 63) +
      chars.charAt((bitmap >> 12) & 63) +
      (i - 1 > bytes.length ? '=' : chars.charAt((bitmap >> 6) & 63)) +
      (i > bytes.length ? '=' : chars.charAt(bitmap & 63));
  }
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const bleGattTransport = {
  /**
   * Checks whether the native BLE module is initialized and ready.
   */
  isAvailable(): boolean {
    return !!getBleManager();
  },

  /**
   * Requests necessary Android Bluetooth and Location permissions for BLE GATT scanning/connecting.
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const apiLevel = Number(Platform.Version);
      if (apiLevel >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        return (
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Nearby Printer Permission',
            message: 'RestroZ needs location permission to detect nearby BLE thermal printers.',
            buttonPositive: 'Allow',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn('[BLE GATT Transport] Permission request error:', err);
      return false;
    }
  },

  /**
   * Scans for nearby BLE devices and returns detected thermal printers.
   */
  async scanForDevices(timeoutMs: number = 4000): Promise<BluetoothDeviceInfo[]> {
    const manager = getBleManager();
    if (!manager) {
      // Fallback to Classic Bluetooth discovery if BLE native module is not linked
      return bluetoothTransport.getPairedDevices();
    }

    const hasPerm = await this.requestPermissions();
    if (!hasPerm) return [];

    const discoveredMap = new Map<string, BluetoothDeviceInfo>();

    return new Promise<BluetoothDeviceInfo[]>((resolve) => {
      let scanTimer: any = null;

      const finish = () => {
        if (scanTimer) clearTimeout(scanTimer);
        try {
          manager.stopDeviceScan();
        } catch (_) {}
        resolve(Array.from(discoveredMap.values()));
      };

      scanTimer = setTimeout(finish, timeoutMs);

      try {
        manager.startDeviceScan(
          null, // Scan all advertising services
          { allowDuplicates: false },
          (error: any, device: any) => {
            if (error) {
              console.warn('[BLE GATT Transport] Scan error:', error);
              finish();
              return;
            }

            if (device && device.id) {
              const devName = device.name || device.localName;
              if (devName && devName.trim()) {
                discoveredMap.set(device.id, {
                  id: device.id,
                  address: device.id,
                  name: devName.trim(),
                  bonded: false,
                  transportType: 'ble_gatt',
                });
              }
            }
          }
        );
      } catch (scanErr) {
        console.warn('[BLE GATT Transport] Exception starting scan:', scanErr);
        finish();
      }
    });
  },

  /**
   * Tests connection to a BLE thermal printer by connecting and discovering services.
   */
  async testConnection(config: BluetoothConnectionConfig): Promise<TestConnectionResult> {
    const manager = getBleManager();
    if (!manager) {
      // If BLE manager is not linked, attempt connection via Classic SPP
      return bluetoothTransport.testConnection(config);
    }

    if (!config.address || !config.address.trim()) {
      return {
        reachable: false,
        status: 'not_bound',
        message: 'No Bluetooth address provided for BLE GATT test.',
        latencyMs: 0,
      };
    }

    const deviceId = config.address.trim();
    const startTime = Date.now();

    try {
      const device = await manager.connectToDevice(deviceId, { autoConnect: false, timeout: 5000 });
      await device.discoverAllServicesAndCharacteristics();

      const services = await device.services();
      const hasFf00 = services.some(
        (s: any) => s.uuid?.toLowerCase() === SEZNIK_BLE_SERVICE_UUID.toLowerCase()
      );

      const latencyMs = Date.now() - startTime;
      await device.cancelConnection().catch(() => {});

      return {
        reachable: true,
        status: 'reachable',
        message: hasFf00
          ? `BLE GATT Printer reachable. Seznik FF00 service verified in ${latencyMs}ms.`
          : `BLE GATT Printer connected in ${latencyMs}ms.`,
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      console.warn('[BLE GATT Transport] testConnection failed, testing SPP fallback:', err?.message || err);

      // Attempt fallback to Classic SPP
      const sppResult = await bluetoothTransport.testConnection(config);
      if (sppResult.reachable) {
        return sppResult;
      }

      return {
        reachable: false,
        status: 'unreachable',
        message: `BLE GATT connection failed: ${err?.message || 'Device unreachable'}`,
        latencyMs,
        error: err?.message,
      };
    }
  },

  /**
   * Sends binary ESC/POS payload to a BLE thermal printer using the proven 20-byte WriteWithoutResponse chunking.
   * If BLE native module is unavailable, transparently falls back to Classic SPP.
   */
  async sendPayload(
    config: BluetoothConnectionConfig,
    bytes: Uint8Array,
    printerId: string
  ): Promise<PrintTransportResult> {
    const manager = getBleManager();
    if (!manager) {
      console.log('[BLE GATT Transport] Native BLE manager not linked in APK. Falling back to Classic SPP.');
      return bluetoothTransport.sendPayload(config, bytes, printerId);
    }

    if (!config.address || !config.address.trim()) {
      return {
        success: false,
        status: 'not_bound',
        bytesSent: 0,
        totalBytes: bytes.length,
        message: 'Bluetooth address is missing.',
        durationMs: 0,
      };
    }

    const deviceId = config.address.trim();
    const startTime = Date.now();

    if (ACTIVE_BLE_LOCKS.get(printerId)) {
      return {
        success: false,
        status: 'partial_or_unknown',
        bytesSent: 0,
        totalBytes: bytes.length,
        message: `Printer ${printerId} is already busy executing a BLE print job.`,
        durationMs: 0,
      };
    }

    ACTIVE_BLE_LOCKS.set(printerId, true);
    let device: any = null;
    let bytesSent = 0;

    try {
      device = await manager.connectToDevice(deviceId, { autoConnect: false, timeout: 6000 });
      await device.discoverAllServicesAndCharacteristics();

      // Resolve Service & Characteristic
      const serviceUuid = config.serviceUuid || SEZNIK_BLE_SERVICE_UUID;
      const charUuid = config.characteristicUuid || SEZNIK_BLE_WRITE_CHAR_UUID;

      // Slice payload into 20-byte chunks
      const chunkSize = SEZNIK_BLE_CHUNK_SIZE;
      const totalChunks = Math.ceil(bytes.length / chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, bytes.length);
        const chunk = bytes.subarray(start, end);
        const base64Chunk = uint8ArrayToBase64(chunk);

        await manager.writeCharacteristicWithoutResponseForDevice(
          deviceId,
          serviceUuid,
          charUuid,
          base64Chunk
        );

        bytesSent += chunk.length;

        // Required 50ms delay between 20-byte packets for BLE thermal hardware buffer
        if (i < totalChunks - 1) {
          await delay(SEZNIK_BLE_INTER_CHUNK_DELAY_MS);
        }
      }

      // Required post-document buffer flush delay
      await delay(SEZNIK_BLE_POST_DOCUMENT_DELAY_MS);

      const durationMs = Date.now() - startTime;
      return {
        success: true,
        status: 'data_sent',
        bytesSent,
        totalBytes: bytes.length,
        message: `Direct BLE GATT print succeeded (${bytesSent}/${bytes.length} bytes in ${durationMs}ms).`,
        durationMs,
      };
    } catch (bleErr: any) {
      console.warn('[BLE GATT Transport] BLE write error:', bleErr?.message || bleErr);

      // If failed before any bytes were sent, attempt fallback to Classic SPP
      if (bytesSent === 0) {
        console.log('[BLE GATT Transport] Attempting Classic SPP fallback for printer:', config.name || deviceId);
        try {
          const sppRes = await bluetoothTransport.sendPayload(config, bytes, printerId);
          if (sppRes.success) {
            return sppRes;
          }
        } catch (_) {}
      }

      const durationMs = Date.now() - startTime;
      return {
        success: false,
        status: bytesSent > 0 ? 'partial_or_unknown' : 'connection_failed',
        bytesSent,
        totalBytes: bytes.length,
        message: `BLE GATT write failed: ${bleErr?.message || 'Unknown error'}`,
        durationMs,
        error: bleErr?.message,
      };
    } finally {
      if (device) {
        try {
          await device.cancelConnection();
        } catch (_) {}
      }
      ACTIVE_BLE_LOCKS.delete(printerId);
    }
  },
};
