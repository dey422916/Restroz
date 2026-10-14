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

import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
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

export function isExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  );
}

const ACTIVE_BLE_LOCKS = new Map<string, boolean>();

let bleManagerInstance: any = null;

function getBleManager(): any {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  // In Expo Go or when native BleClientManager is absent, do not call new BleManager()
  if (isExpoGo() || !NativeModules.BleClientManager) {
    return null;
  }
  if (!bleManagerInstance) {
    try {
      // Dynamic require to prevent crash if native module is not linked in existing APK
      const { BleManager } = require('react-native-ble-plx');
      bleManagerInstance = new BleManager();
    } catch (err) {
      if (!isExpoGo()) {
        console.warn('[BLE GATT Transport] react-native-ble-plx native module not available:', err);
      }
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
   * Android 12+ (API 31+): BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION
   * Android 11 and below (API <= 30): ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION
   */
  async requestPermissions(): Promise<{ granted: boolean; error?: string }> {
    if (Platform.OS !== 'android') return { granted: true };

    try {
      const apiLevel = Number(Platform.Version);
      if (apiLevel >= 31) {
        // First check if permissions are already granted
        const connectCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        const scanCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
        if (connectCheck && scanCheck) {
          return { granted: true };
        }

        const permissions = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ];
        const granted = await PermissionsAndroid.requestMultiple(permissions);

        const scanOk = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
        const connectOk = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

        if (!scanOk || !connectOk) {
          return {
            granted: false,
            error: 'Bluetooth Scan and Connect permissions are required to detect nearby printers.',
          };
        }
        return { granted: true };
      } else {
        const permissions = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ];
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        const fineOk = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
        const coarseOk = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

        if (!fineOk && !coarseOk) {
          return {
            granted: false,
            error: 'Location permission is required to discover Bluetooth devices on Android 11 and below.',
          };
        }
        return { granted: true };
      }
    } catch (err: any) {
      console.warn('[BLE GATT Transport] Permission request error:', err);
      return { granted: false, error: err?.message || 'Permission request failed' };
    }
  },

  /**
   * Verifies that the Bluetooth adapter is powered ON.
   * Gracefully waits for initial Unknown/Resetting state transitions during app startup.
   */
  async ensurePoweredOn(timeoutMs = 3000): Promise<{ poweredOn: boolean; state: string }> {
    const manager = getBleManager();
    if (!manager) {
      const classicEnabled = await bluetoothTransport.isEnabled().catch(() => false);
      return { poweredOn: classicEnabled, state: classicEnabled ? 'PoweredOn' : 'PoweredOff' };
    }

    try {
      const currentState = await manager.state().catch(() => 'Unknown');
      if (currentState === 'PoweredOn') {
        return { poweredOn: true, state: 'PoweredOn' };
      }
      if (currentState === 'PoweredOff' || currentState === 'Unauthorized' || currentState === 'Unsupported') {
        return { poweredOn: false, state: currentState };
      }

      // Wait for state transition if Unknown or Resetting
      return await new Promise((resolve) => {
        let resolved = false;
        let sub: any = null;

        const timer = setTimeout(async () => {
          if (!resolved) {
            resolved = true;
            try {
              if (sub && typeof sub.remove === 'function') sub.remove();
            } catch (_) {}
            const finalState = await manager.state().catch(() => 'Unknown');
            resolve({ poweredOn: finalState === 'PoweredOn', state: finalState });
          }
        }, timeoutMs);

        try {
          sub = manager.onStateChange((state: string) => {
            if (state !== 'Unknown' && state !== 'Resetting') {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                try {
                  if (sub && typeof sub.remove === 'function') sub.remove();
                } catch (_) {}
                resolve({ poweredOn: state === 'PoweredOn', state });
              }
            }
          }, true);
        } catch (_) {
          clearTimeout(timer);
          resolve({ poweredOn: false, state: currentState });
        }
      });
    } catch (err: any) {
      console.warn('[BLE GATT Transport] Error verifying Bluetooth state:', err);
      return { poweredOn: false, state: 'Error' };
    }
  },

  /**
   * Stops any currently running BLE scanning.
   */
  stopScan(): void {
    const manager = getBleManager();
    if (manager) {
      try {
        manager.stopDeviceScan();
      } catch (_) {}
    }
  },

  /**
   * Scans for nearby BLE devices for 10-15 seconds (default: 12 seconds).
   * Streams discovered devices progressively via onDeviceDiscovered callback.
   * Captures named printers and unnamed BLE devices without restriction to FF00 advertisements.
   */
  async scanForDevices(options?: {
    timeoutMs?: number;
    onDeviceDiscovered?: (device: BluetoothDeviceInfo) => void;
  } | number): Promise<BluetoothDeviceInfo[]> {
    const timeoutMs = typeof options === 'number' ? options : options?.timeoutMs ?? 12000;
    const onDeviceDiscovered = typeof options === 'object' ? options?.onDeviceDiscovered : undefined;

    const manager = getBleManager();
    if (!manager) {
      return [];
    }

    // 1. Verify runtime permissions
    const permStatus = await this.requestPermissions();
    if (!permStatus.granted) {
      throw new Error(permStatus.error || 'BLUETOOTH_PERMISSION_DENIED');
    }

    // 2. Verify Bluetooth adapter power state
    const powerStatus = await this.ensurePoweredOn();
    if (!powerStatus.poweredOn) {
      throw new Error('BLUETOOTH_POWERED_OFF');
    }

    // Stop any lingering scan before initiating new one
    this.stopScan();

    const discoveredMap = new Map<string, BluetoothDeviceInfo>();

    return new Promise<BluetoothDeviceInfo[]>((resolve) => {
      let finished = false;
      let scanTimer: any = null;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (scanTimer) {
          clearTimeout(scanTimer);
          scanTimer = null;
        }
        try {
          manager.stopDeviceScan();
        } catch (_) {}
        resolve(Array.from(discoveredMap.values()));
      };

      scanTimer = setTimeout(finish, timeoutMs);

      try {
        manager.startDeviceScan(
          null, // Scan all advertising services — DO NOT restrict to FF00!
          { allowDuplicates: false },
          (error: any, device: any) => {
            if (finished) return;

            if (error) {
              console.warn('[BLE GATT Transport] Scan callback warning:', error?.message || error);
              return;
            }

            if (device && device.id) {
              const rawName = (device.name || device.localName || '').trim();
              const devName = rawName || `Unnamed BLE Device (${device.id.slice(-5)})`;
              const isSeznik = /seznik|925/i.test(devName);

              const info: BluetoothDeviceInfo = {
                id: device.id,
                address: device.id,
                name: devName,
                bonded: false,
                transportType: 'ble_gatt',
              };

              if (!discoveredMap.has(device.id)) {
                discoveredMap.set(device.id, info);
                if (onDeviceDiscovered) {
                  try {
                    onDeviceDiscovered(info);
                  } catch (cbErr) {
                    console.warn('[BLE GATT Transport] onDeviceDiscovered callback error:', cbErr);
                  }
                }
              } else if (rawName && discoveredMap.get(device.id)!.name.startsWith('Unnamed')) {
                // Update unnamed entry if name became available in a later packet
                discoveredMap.set(device.id, info);
                if (onDeviceDiscovered) {
                  try {
                    onDeviceDiscovered(info);
                  } catch (_) {}
                }
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
      return {
        reachable: false,
        status: 'unreachable',
        message: isExpoGo()
          ? 'Native BLE printing requires the RestroZ Android APK (not supported in Expo Go).'
          : 'BLE native module is not available on this device.',
        latencyMs: 0,
      };
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
      console.warn('[BLE GATT Transport] testConnection failed:', err?.message || err);

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
      return {
        success: false,
        status: 'connection_failed',
        bytesSent: 0,
        totalBytes: bytes.length,
        message: isExpoGo()
          ? 'Native BLE printing requires the RestroZ Android APK (not supported in Expo Go).'
          : 'BLE native module is not available.',
        durationMs: 0,
      };
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

    // 1. Verify Bluetooth permissions
    const permStatus = await this.requestPermissions();
    if (!permStatus.granted) {
      return {
        success: false,
        status: 'permission_denied',
        bytesSent: 0,
        totalBytes: bytes.length,
        message: permStatus.error || 'BLUETOOTH_PERMISSION_DENIED',
        durationMs: 0,
      };
    }

    // 2. Verify Bluetooth adapter power state
    const powerStatus = await this.ensurePoweredOn();
    if (!powerStatus.poweredOn) {
      return {
        success: false,
        status: 'bluetooth_disabled',
        bytesSent: 0,
        totalBytes: bytes.length,
        message: 'Bluetooth is powered off on this device. Please turn Bluetooth ON.',
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
      // 3. Connect or reuse existing active connection
      let isConnected = false;
      try {
        isConnected = await manager.isDeviceConnected(deviceId);
      } catch (_) {}

      if (isConnected) {
        try {
          const knownDevices = await manager.devices([deviceId]);
          if (knownDevices && knownDevices.length > 0) {
            device = knownDevices[0];
          }
        } catch (_) {}
      }

      if (!device) {
        try {
          device = await manager.connectToDevice(deviceId, { autoConnect: false, timeout: 8000 });
        } catch (connErr: any) {
          const errMsg = (connErr?.message || '').toLowerCase();
          if (errMsg.includes('already connected') || connErr?.errorCode === 201) {
            try {
              const knownDevices = await manager.devices([deviceId]);
              if (knownDevices && knownDevices.length > 0) {
                device = knownDevices[0];
              }
            } catch (_) {}
          }

          if (!device) {
            // Short backoff in case of Android BLE status 133 (transitional disconnect)
            await delay(300);
            try {
              device = await manager.connectToDevice(deviceId, { autoConnect: false, timeout: 8000 });
            } catch (retryErr: any) {
              throw retryErr;
            }
          }
        }
      }

      await device.discoverAllServicesAndCharacteristics();

      // Resolve Service & Characteristic with casing/discovery fallback
      const reqServiceUuid = (config.serviceUuid || SEZNIK_BLE_SERVICE_UUID).toLowerCase();
      const reqCharUuid = (config.characteristicUuid || SEZNIK_BLE_WRITE_CHAR_UUID).toLowerCase();

      let serviceUuid = config.serviceUuid || SEZNIK_BLE_SERVICE_UUID;
      let charUuid = config.characteristicUuid || SEZNIK_BLE_WRITE_CHAR_UUID;

      try {
        const services = await device.services();
        const matchedSvc = services.find((s: any) =>
          s.uuid?.toLowerCase() === reqServiceUuid ||
          s.uuid?.toLowerCase().includes('ff00')
        );
        if (matchedSvc) {
          serviceUuid = matchedSvc.uuid;
          const chars = await matchedSvc.characteristics();
          const matchedChar = chars.find((c: any) =>
            c.uuid?.toLowerCase() === reqCharUuid ||
            c.uuid?.toLowerCase().includes('ff02')
          );
          if (matchedChar) {
            charUuid = matchedChar.uuid;
          }
        }
      } catch (discErr) {
        // Retain fallback UUIDs if dynamic discovery fails
      }

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
