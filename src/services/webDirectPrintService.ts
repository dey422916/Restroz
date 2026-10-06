/**
 * RestroZ Native Print Subsystem (DEV)
 * Implements direct browser printing + outbound Windows Print Agent:
 * 1. Web Bluetooth (BLE GATT writable characteristic, chunked ESC/POS)
 * 2. WebUSB (Bulk OUT endpoint transfer)
 * 3. Web Serial (RS-232 / USB COM port ESC/POS)
 * 4. RestroZ Print Agent (Windows Driver / Spooler RAW ESC/POS via Supabase outbound channel)
 *
 * Distinct Transports:
 * - 'bluetooth' -> Web Bluetooth ONLY
 * - 'usb'       -> WebUSB ONLY
 * - 'serial'    -> Web Serial ONLY
 * - 'agent'     -> Windows Print Agent ONLY
 *
 * ZERO QZ Tray.
 */

import { Order, KOT, RestaurantSettings } from '../types';
import { renderKotToEscPos } from './printerManager/escpos/kotRenderer';
import { renderBillToEscPos } from './printerManager/escpos/billRenderer';
import { generateEscPosLogoRaster } from './printerManager/escpos/logoRaster';
import { ReceiptCanvas } from './printerManager/escpos/documentRenderer';
import { encodeRasterToEscPos } from './printerManager/escpos/encoder';
import { EscPosTextBuilder } from './printerManager/escpos/escposBuilder';
import { supabase } from './supabase';

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  console.log('[RESTROZ_BLE_ROUTER_VERSION]', 'runtime-recovery-v3');
}

export type DirectTransportType = 'bluetooth' | 'usb' | 'serial' | 'agent';
export type DirectPrinterRole = 'kot' | 'bill' | 'both';
export type DirectPaperWidth = '58mm' | '80mm';
export type DirectPrinterStatus = 'connected' | 'available' | 'reconnect_required' | 'unsupported' | 'offline' | 'disconnected';

export interface ConfiguredDirectPrinter {
  id: string;
  name: string;
  transport: DirectTransportType;
  agentId?: string;
  agentDeviceName?: string;
  windowsQueueName?: string;
  deviceId?: string;
  bluetoothDeviceId?: string;
  serviceUuid?: string;
  characteristicUuid?: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  paperWidth: DirectPaperWidth;
  role: DirectPrinterRole;
  isPrimary?: boolean;
  status: DirectPrinterStatus;
  statusMessage?: string;
  errorMessage?: string;
  lastConnectedAt?: number;
}

export interface WebDirectPrintResult {
  success: boolean;
  printerName: string;
  transport: DirectTransportType;
  jobName: string;
  code?: string;
  message?: string;
}

export interface PrintAgentInfo {
  id: string;
  deviceId: string;
  deviceName: string;
  status: 'online' | 'offline' | 'printing' | 'error';
  isPaired: boolean;
  lastSeen: string;
  installedPrinters?: string[];
}

// Known Standard & Vendor Thermal BLE GATT Service UUIDs
export const BLE_PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Bluetooth SIG Printing Service
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 / MPT-II / POS58 / POS80
  '0000ff00-0000-1000-8000-00805f9b34fb', // Common Thermal ESC/POS BLE
  '0000fff0-0000-1000-8000-00805f9b34fb', // Common Serial BLE
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Nordic UART (legacy)
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART (standard)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  '0000ae00-0000-1000-8000-00805f9b34fb', // Rongta / RPP BLE
  '0000ae30-0000-1000-8000-00805f9b34fb', // RPP02 / RPP300
  '0000af30-0000-1000-8000-00805f9b34fb', // Xprinter BLE
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / WeChat IoT BLE
  '000018f1-0000-1000-8000-00805f9b34fb',
];

export interface BleSession {
  device: any;
  gattServer: any;
  writeCharacteristic: any;
  serviceUuid?: string;
  characteristicUuid?: string;
  connected: boolean;
  lastConnectedAt: number;
}

/**
 * Canonical BLE session key generator.
 * Used identically by Test Print, KOT Print, and Thermal Bill Print.
 */
export function getBleSessionKey(
  printer: ConfiguredDirectPrinter | { id?: string; deviceId?: string; bluetoothDeviceId?: string; name?: string }
): string {
  const devId = (printer as any).bluetoothDeviceId || printer.deviceId;
  if (devId && String(devId).trim()) {
    return `ble_${String(devId).trim()}`;
  }
  if (printer.id && String(printer.id).trim()) {
    return `ble_${String(printer.id).trim()}`;
  }
  return `ble_${(printer.name || 'default').trim().toLowerCase().replace(/\s+/g, '_')}`;
}

// Global singleton in-memory cache for live connected Bluetooth, USB, and Serial objects
const activeBleSessions: Map<string, BleSession> =
  (typeof window !== 'undefined' && (window as any).__restroz_activeBleSessions__) ||
  new Map<string, BleSession>();
if (typeof window !== 'undefined') {
  (window as any).__restroz_activeBleSessions__ = activeBleSessions;
}

const cachedBluetoothDevices: Map<string, any> =
  (typeof window !== 'undefined' && (window as any).__restroz_cachedBluetoothDevices__) ||
  new Map<string, any>();
if (typeof window !== 'undefined') {
  (window as any).__restroz_cachedBluetoothDevices__ = cachedBluetoothDevices;
}

const cachedUsbDevices = new Map<string, any>();
const cachedSerialPorts = new Map<string, any>();

function getStorageKey(restaurantId?: string | null): string {
  const restId = restaurantId || 'default';
  return `restroz_printer_config_${restId}`;
}

/**
 * Inspects a WebUSB device to verify whether it exposes a real Bulk OUT endpoint
 */
async function inspectUsbDeviceEndpoints(device: any): Promise<{
  hasBulkOut: boolean;
  interfaceNumber?: number;
  endpointNumber?: number;
  error?: string;
}> {
  try {
    if (!device.opened) {
      await device.open();
    }
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    let targetInterface: any = null;
    let targetEndpointNumber: number | null = null;

    if (device.configuration && device.configuration.interfaces) {
      for (const iface of device.configuration.interfaces) {
        for (const alt of iface.alternates) {
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out' && (ep.type === 'bulk' || ep.type === 'interrupt')) {
              targetInterface = iface;
              targetEndpointNumber = ep.endpointNumber;
              break;
            }
          }
          if (targetEndpointNumber !== null) break;
        }
        if (targetEndpointNumber !== null) break;
      }
    }

    if (!targetInterface || targetEndpointNumber === null) {
      return {
        hasBulkOut: false,
        error: 'No raw bulk OUT endpoint exposed (typical for Windows-installed printer drivers).',
      };
    }

    try {
      await device.claimInterface(targetInterface.interfaceNumber);
      await device.releaseInterface(targetInterface.interfaceNumber);
      return {
        hasBulkOut: true,
        interfaceNumber: targetInterface.interfaceNumber,
        endpointNumber: targetEndpointNumber,
      };
    } catch (claimErr: any) {
      return {
        hasBulkOut: false,
        error: `Interface claimed by Windows driver (${claimErr.message || claimErr}).`,
      };
    }
  } catch (err: any) {
    return { hasBulkOut: false, error: err.message || 'WebUSB device inaccessible' };
  }
}

const inMemoryPrinterStore = new Map<string, ConfiguredDirectPrinter[]>();
type PrinterStatusListener = (printer: ConfiguredDirectPrinter, status: DirectPrinterStatus, message: string) => void;
const statusListeners = new Set<PrinterStatusListener>();

function notifyStatusChange(printer: ConfiguredDirectPrinter, status: DirectPrinterStatus, message: string) {
  statusListeners.forEach((listener) => {
    try {
      listener(printer, status, message);
    } catch (err) {
      console.warn('[webDirectPrintService] Error in status listener:', err);
    }
  });
}

let hardwareListenersInitialized = false;

function initHardwareListeners() {
  if (hardwareListenersInitialized || typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }
  hardwareListenersInitialized = true;

  // 1. USB Disconnect listener
  if ('usb' in (navigator as any) && (navigator as any).usb?.addEventListener) {
    (navigator as any).usb.addEventListener('disconnect', (event: any) => {
      const device = event.device;
      if (!device) return;

      const cacheKey = `${device.vendorId}_${device.productId}_${device.serialNumber || ''}`;
      cachedUsbDevices.delete(cacheKey);

      const savedPrinters = webDirectPrintService.getSavedPrinters();
      savedPrinters.forEach((p) => {
        if (p.transport === 'usb' && p.vendorId === device.vendorId && p.productId === device.productId) {
          const updated: ConfiguredDirectPrinter = {
            ...p,
            status: 'disconnected',
            statusMessage: 'USB printer disconnected. Reconnect cable.',
          };
          webDirectPrintService.updatePrinter(updated);
          notifyStatusChange(
            updated,
            'disconnected',
            `USB printer "${p.name}" was disconnected. Reconnect the USB cable to continue printing.`
          );
        }
      });
    });

    // 2. USB Connect (Auto-reconnect) listener
    (navigator as any).usb.addEventListener('connect', async (event: any) => {
      const device = event.device;
      if (!device) return;

      const savedPrinters = webDirectPrintService.getSavedPrinters();
      const match = savedPrinters.find(
        (p) => p.transport === 'usb' && p.vendorId === device.vendorId && p.productId === device.productId
      );

      if (match) {
        try {
          if (!device.opened) await device.open();
          if (device.configuration === null) await device.selectConfiguration(1);
          const endpointCheck = await inspectUsbDeviceEndpoints(device);
          if (endpointCheck.hasBulkOut) {
            const cacheKey = `${device.vendorId}_${device.productId}_${device.serialNumber || ''}`;
            cachedUsbDevices.set(cacheKey, device);
            const restored: ConfiguredDirectPrinter = {
              ...match,
              status: 'connected',
              statusMessage: 'WebUSB connected (Auto-restored)',
            };
            webDirectPrintService.updatePrinter(restored);
            notifyStatusChange(restored, 'connected', `USB printer "${match.name}" reconnected.`);
          }
        } catch (err) {
          console.warn('[webDirectPrintService] Auto-reconnect error on USB device:', err);
        }
      }
    });
  }

  // 3. Web Serial Disconnect listener
  if ('serial' in (navigator as any) && (navigator as any).serial?.addEventListener) {
    (navigator as any).serial.addEventListener('disconnect', (event: any) => {
      const savedPrinters = webDirectPrintService.getSavedPrinters();
      savedPrinters.forEach((p) => {
        if (p.transport === 'serial') {
          const updated: ConfiguredDirectPrinter = {
            ...p,
            status: 'disconnected',
            statusMessage: 'Serial printer disconnected. Reconnect cable.',
          };
          webDirectPrintService.updatePrinter(updated);
          notifyStatusChange(updated, 'disconnected', `Serial printer "${p.name}" disconnected.`);
        }
      });
    });
  }
}

if (typeof window !== 'undefined') {
  initHardwareListeners();
}

/**
 * Deduplicates configured printer records by BLE device identity, ID, or normalized name.
 * Merges status to ensure 'connected' status and primary flags are preserved without duplicates.
 */
function deduplicatePrinters(printers: ConfiguredDirectPrinter[]): ConfiguredDirectPrinter[] {
  const result: ConfiguredDirectPrinter[] = [];
  const seenBleKeys = new Set<string>();
  const seenIds = new Set<string>();

  for (const p of printers) {
    if (seenIds.has(p.id)) continue;

    if (p.transport === 'bluetooth') {
      const devKey = (p.bluetoothDeviceId || p.deviceId || '').trim();
      const normName = (p.name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
      const bleKey = devKey || normName;
      if (bleKey) {
        if (seenBleKeys.has(bleKey)) {
          const existingIdx = result.findIndex(
            (r) =>
              r.transport === 'bluetooth' &&
              ((devKey && (r.bluetoothDeviceId === devKey || r.deviceId === devKey)) ||
                (normName && (r.name || '').trim().toLowerCase().replace(/[\s_-]+/g, '') === normName))
          );
          if (existingIdx >= 0) {
            const existing = result[existingIdx];
            if (p.status === 'connected' && existing.status !== 'connected') {
              result[existingIdx] = { ...existing, ...p };
            }
            if (p.isPrimary) {
              result[existingIdx].isPrimary = true;
            }
          }
          continue;
        }
        seenBleKeys.add(bleKey);
      }
    }

    seenIds.add(p.id);
    result.push(p);
  }

  return result;
}

export const webDirectPrintService = {
  /**
   * Subscribes to real-time hardware connect/disconnect events
   */
  onPrinterStatusChange(listener: PrinterStatusListener): () => void {
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  },

  /**
   * Check if Web Bluetooth is supported in the current browser
   */
  isBluetoothSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'bluetooth' in (navigator as any) &&
      typeof (navigator as any).bluetooth?.requestDevice === 'function'
    );
  },

  /**
   * Check if WebUSB is supported in the current browser
   */
  isUsbSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'usb' in (navigator as any) &&
      typeof (navigator as any).usb?.requestDevice === 'function'
    );
  },

  /**
   * Check if Web Serial is supported in the current browser
   */
  isSerialSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      'serial' in (navigator as any) &&
      typeof (navigator as any).serial?.requestPort === 'function'
    );
  },

  /**
   * Retrieves saved configured printers from local storage or memory store for the current restaurant.
   * Uses 'restroz_printer_config_default' strictly as a one-time legacy migration source ONLY if the restaurant key has never existed.
   */
  getSavedPrinters(restaurantId?: string | null): ConfiguredDirectPrinter[] {
    const key = getStorageKey(restaurantId);
    let parsedList: ConfiguredDirectPrinter[] = [];
    let keyExists = false;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(key);
        if (raw !== null) {
          keyExists = true;
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsedList = parsed;
          }
        }

        // One-time legacy migration: ONLY if the restaurant-specific key has NEVER existed (raw === null)
        if (!keyExists && key !== 'restroz_printer_config_default') {
          const defRaw = window.localStorage.getItem('restroz_printer_config_default');
          if (defRaw !== null) {
            const parsed = JSON.parse(defRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              parsedList = parsed;
              // Migrate legacy config directly into the restaurant-specific key
              window.localStorage.setItem(key, JSON.stringify(deduplicatePrinters(parsedList)));
              keyExists = true;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[webDirectPrintService] Error reading saved direct printers:', err);
    }

    if (!keyExists && parsedList.length === 0) {
      if (inMemoryPrinterStore.has(key)) {
        parsedList = inMemoryPrinterStore.get(key) || [];
      } else if (key !== 'restroz_printer_config_default') {
        parsedList = inMemoryPrinterStore.get('restroz_printer_config_default') || [];
      }
    }

    const mapped = parsedList.map((p) => {
      if ((p as any).transport === 'qz') {
        return {
          ...p,
          transport: 'agent' as DirectTransportType,
          windowsQueueName: (p as any).qzPrinterName || p.name,
        };
      }
      return p;
    });

    return deduplicatePrinters(mapped);
  },

  /**
   * Persists configured printers strictly to the current restaurant's storage key:
   * restroz_printer_config_<currentRestaurantId>
   */
  savePrinters(printers: ConfiguredDirectPrinter[], restaurantId?: string | null): void {
    const deduped = deduplicatePrinters(printers);
    const key = getStorageKey(restaurantId);
    inMemoryPrinterStore.set(key, deduped);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const serialized = JSON.stringify(deduped);
        window.localStorage.setItem(key, serialized);
      }
    } catch (err) {
      console.warn('[webDirectPrintService] Error saving direct printers:', err);
    }
  },

  /**
   * Single Canonical Status Update Function:
   * Updates printer runtime status across saved storage, in-memory cache, and notifies subscribers.
   */
  updatePrinterRuntimeStatus(
    printerIdOrIdentity: string,
    statusUpdate: {
      status: DirectPrinterStatus;
      runtimeStatus?: string;
      statusMessage?: string;
      lastError?: any;
    },
    restaurantId?: string | null
  ): ConfiguredDirectPrinter | null {
    const list = this.getSavedPrinters(restaurantId);
    let matchedPrinter: ConfiguredDirectPrinter | null = null;
    const normTarget = printerIdOrIdentity.trim().toLowerCase().replace(/[\s_-]+/g, '');

    const updatedList = list.map((p) => {
      const pNorm = (p.name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
      const isMatch =
        p.id === printerIdOrIdentity ||
        p.bluetoothDeviceId === printerIdOrIdentity ||
        p.deviceId === printerIdOrIdentity ||
        (normTarget && pNorm === normTarget) ||
        (normTarget.includes('925') && pNorm.includes('925'));

      if (isMatch) {
        const updated: ConfiguredDirectPrinter = {
          ...p,
          status: statusUpdate.status,
          statusMessage: statusUpdate.statusMessage || p.statusMessage,
          errorMessage: statusUpdate.lastError ? String(statusUpdate.lastError?.message || statusUpdate.lastError) : undefined,
          lastConnectedAt: statusUpdate.status === 'connected' ? Date.now() : p.lastConnectedAt,
        };
        matchedPrinter = updated;
        return updated;
      }
      return p;
    });

    if (matchedPrinter) {
      this.savePrinters(updatedList, restaurantId);
      notifyStatusChange(
        matchedPrinter,
        statusUpdate.status,
        statusUpdate.statusMessage || `Printer status updated to ${statusUpdate.status}`
      );
    }

    return matchedPrinter;
  },

  /**
   * Restores granted devices on Settings load without popping up chooser dialogs.
   */
  async restorePrinters(restaurantId?: string | null): Promise<ConfiguredDirectPrinter[]> {
    const saved = this.getSavedPrinters(restaurantId);

    let grantedBtDevices: any[] = [];
    if (this.isBluetoothSupported() && (navigator as any).bluetooth?.getDevices) {
      try {
        grantedBtDevices = await (navigator as any).bluetooth.getDevices();
        for (const d of grantedBtDevices) {
          if (d.id) cachedBluetoothDevices.set(d.id, d);
        }
      } catch (e) {
        console.warn('[webDirectPrintService] navigator.bluetooth.getDevices failed:', e);
      }
    }

    let grantedUsbDevices: any[] = [];
    if (this.isUsbSupported() && (navigator as any).usb?.getDevices) {
      try {
        grantedUsbDevices = await (navigator as any).usb.getDevices();
        for (const d of grantedUsbDevices) {
          const key = `${d.vendorId}_${d.productId}_${d.serialNumber || ''}`;
          cachedUsbDevices.set(key, d);
        }
      } catch (e) {
        console.warn('[webDirectPrintService] navigator.usb.getDevices failed:', e);
      }
    }

    let grantedSerialPorts: any[] = [];
    if (this.isSerialSupported() && (navigator as any).serial?.getPorts) {
      try {
        grantedSerialPorts = await (navigator as any).serial.getPorts();
        for (let i = 0; i < grantedSerialPorts.length; i++) {
          const p = grantedSerialPorts[i];
          const info = p.getInfo ? p.getInfo() : {};
          const key = `serial_${info.usbVendorId || i}_${info.usbProductId || i}`;
          cachedSerialPorts.set(key, p);
        }
      } catch (e) {
        console.warn('[webDirectPrintService] navigator.serial.getPorts failed:', e);
      }
    }

    // Check Print Agent status from Supabase
    let agentOnline = false;
    let agentName = '';
    let pairedAgentId = '';
    if (restaurantId) {
      try {
        const agent = await this.getPairedAgent(restaurantId);
        if (agent) {
          agentOnline = agent.status === 'online';
          agentName = agent.deviceName;
          pairedAgentId = agent.id;
        }
      } catch (err) {
        console.warn('[webDirectPrintService] Could not check agent status:', err);
      }
    }

    const updated = saved.map((p) => {
      // 1. Bluetooth
      if (p.transport === 'bluetooth') {
        if (!this.isBluetoothSupported()) {
          return {
            ...p,
            status: 'unsupported' as const,
            statusMessage: 'Web Bluetooth is not supported in this browser.',
          };
        }

        const sKey = getBleSessionKey(p);
        const activeSession =
          activeBleSessions.get(sKey) ||
          activeBleSessions.get(p.id) ||
          (p.bluetoothDeviceId ? activeBleSessions.get(p.bluetoothDeviceId) : null) ||
          (p.deviceId ? activeBleSessions.get(p.deviceId) : null);

        if (activeSession && activeSession.writeCharacteristic) {
          return {
            ...p,
            deviceId: activeSession.device?.id || p.deviceId,
            bluetoothDeviceId: activeSession.device?.id || p.bluetoothDeviceId || p.deviceId,
            status: 'connected' as DirectPrinterStatus,
            statusMessage: 'Bluetooth connected.',
            errorMessage: undefined,
          };
        }

        const match = grantedBtDevices.find(
          (d) =>
            (p.bluetoothDeviceId && d.id === p.bluetoothDeviceId) ||
            (p.deviceId && d.id === p.deviceId) ||
            (p.name && d.name && d.name.toLowerCase() === p.name.toLowerCase())
        );
        if (match) {
          const isGattConnected = Boolean(match.gatt?.connected);
          return {
            ...p,
            deviceId: match.id || p.deviceId,
            bluetoothDeviceId: match.id || p.bluetoothDeviceId || p.deviceId,
            status: (isGattConnected ? 'connected' : (p.status === 'connected' ? 'connected' : 'available')) as DirectPrinterStatus,
            statusMessage: isGattConnected ? 'Bluetooth connected.' : (p.status === 'connected' ? 'Bluetooth connected.' : 'Available (Permission granted)'),
            errorMessage: undefined,
          };
        }

        if (p.status === 'connected' || p.status === 'available') {
          return {
            ...p,
            status: p.status,
            statusMessage: p.status === 'connected' ? 'Bluetooth connected.' : 'Available (Permission granted)',
            errorMessage: undefined,
          };
        }

        return {
          ...p,
          status: 'reconnect_required' as const,
          statusMessage: 'Bluetooth permission unavailable. Please reconnect.',
        };
      }

      // 2. Direct USB
      if (p.transport === 'usb') {
        if (!this.isUsbSupported()) {
          return {
            ...p,
            status: 'unsupported' as const,
            statusMessage: 'WebUSB is not supported in this browser.',
          };
        }
        const match = grantedUsbDevices.find((d) => {
          if (p.vendorId && p.productId) {
            return d.vendorId === p.vendorId && d.productId === p.productId;
          }
          return p.name && d.productName && d.productName.toLowerCase() === p.name.toLowerCase();
        });

        if (match) {
          if (p.status === 'unsupported') {
            return p;
          }
          const isOpened = match.opened;
          return {
            ...p,
            status: (isOpened ? 'connected' : 'available') as DirectPrinterStatus,
            statusMessage: isOpened ? 'WebUSB connected' : 'Available (Permission granted)',
          };
        }
        return {
          ...p,
          status: 'reconnect_required' as const,
          statusMessage: 'USB permission unavailable. Please reconnect.',
        };
      }

      // 3. Web Serial
      if (p.transport === 'serial') {
        if (!this.isSerialSupported()) {
          return {
            ...p,
            status: 'unsupported' as const,
            statusMessage: 'Web Serial is not supported in this browser.',
          };
        }
        return {
          ...p,
          status: (grantedSerialPorts.length > 0 ? 'available' : 'reconnect_required') as DirectPrinterStatus,
          statusMessage: grantedSerialPorts.length > 0 ? 'Serial port authorized' : 'Serial port not authorized. Please reconnect.',
        };
      }

      // 4. Windows Print Agent
      if (p.transport === 'agent') {
        const qName = p.windowsQueueName || p.name;
        if (agentOnline) {
          return {
            ...p,
            agentId: pairedAgentId || p.agentId,
            agentDeviceName: agentName || p.agentDeviceName,
            status: 'connected' as const,
            statusMessage: `Print Agent Online (${agentName || 'Windows PC'})`,
          };
        }
        return {
          ...p,
          status: 'offline' as const,
          statusMessage: `Print Agent Offline (${qName})`,
        };
      }

      return p;
    });

    this.savePrinters(updated, restaurantId);
    return updated;
  },

  /**
   * Pairs a new Bluetooth printer using Web Bluetooth (Chrome / Edge chooser)
   */
  async pairBluetoothPrinter(
    options: {
      role?: DirectPrinterRole;
      paperWidth?: DirectPaperWidth;
      isPrimary?: boolean;
    } = {},
    restaurantId?: string | null
  ): Promise<ConfiguredDirectPrinter> {
    if (!this.isBluetoothSupported()) {
      throw new Error(
        'Web Bluetooth is only supported in Chromium-based desktop/Android browsers (Chrome, Edge).'
      );
    }

    let device: any;
    try {
      device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICE_UUIDS,
      });
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.message?.includes('User cancelled')) {
        throw new Error('Bluetooth device selection was cancelled.');
      }
      throw new Error(`Bluetooth pairing request failed: ${err.message || err}`);
    }

    if (!device) {
      throw new Error('No Bluetooth device was selected.');
    }

    const deviceName = device.name || 'Bluetooth POS Printer';
    cachedBluetoothDevices.set(device.id, device);

    // Verify BLE GATT capability
    let isGattSupported = true;
    let gattErrorMsg = '';
    let liveWriteChar: any = null;
    let gattServer: any = null;

    try {
      gattServer = await device.gatt.connect();
      liveWriteChar = await this.locateGattWriteCharacteristic(gattServer);
    } catch (gattErr: any) {
      console.warn('[webDirectPrintService] BLE GATT error:', gattErr);
      isGattSupported = false;
      gattErrorMsg = 'This printer does not support browser Bluetooth direct printing (requires BLE GATT).';
    }

    const printerId = `bt_${device.id || Date.now()}`;
    const sessionKey = getBleSessionKey({ id: printerId, deviceId: device.id, bluetoothDeviceId: device.id, name: deviceName });

    if (isGattSupported && liveWriteChar && gattServer) {
      const session: BleSession = {
        device,
        gattServer,
        writeCharacteristic: liveWriteChar,
        serviceUuid: liveWriteChar.service?.uuid,
        characteristicUuid: liveWriteChar.uuid,
        connected: true,
        lastConnectedAt: Date.now(),
      };
      activeBleSessions.set(sessionKey, session);
      activeBleSessions.set(printerId, session);
      if (device.id) activeBleSessions.set(device.id, session);
    }

    const newPrinter: ConfiguredDirectPrinter = {
      id: printerId,
      name: deviceName,
      transport: 'bluetooth',
      deviceId: device.id,
      bluetoothDeviceId: device.id,
      serviceUuid: liveWriteChar?.service?.uuid,
      characteristicUuid: liveWriteChar?.uuid,
      paperWidth: options.paperWidth || '58mm',
      role: options.role || 'both',
      isPrimary: options.isPrimary ?? true,
      status: isGattSupported ? 'connected' : 'unsupported',
      statusMessage: isGattSupported ? 'Bluetooth connected.' : gattErrorMsg,
      errorMessage: isGattSupported ? undefined : gattErrorMsg,
      lastConnectedAt: Date.now(),
    };

    const currentList = this.getSavedPrinters(restaurantId);
    const filtered = currentList.filter((p) => p.id !== printerId && p.deviceId !== device.id && p.bluetoothDeviceId !== device.id);
    if (newPrinter.isPrimary && isGattSupported) {
      filtered.forEach((p) => (p.isPrimary = false));
    }
    filtered.push(newPrinter);
    this.savePrinters(filtered, restaurantId);

    console.log(
      `[BLE_PAIR_SAVE]\n` +
      `Printer: ${deviceName}\n` +
      `Printer Config ID: ${printerId}\n` +
      `Bluetooth Device ID: ${device.id}\n` +
      `Service UUID: ${liveWriteChar?.service?.uuid || 'N/A'}\n` +
      `Characteristic UUID: ${liveWriteChar?.uuid || 'N/A'}`
    );

    if (!isGattSupported) {
      throw new Error(gattErrorMsg);
    }

    return newPrinter;
  },

  /**
   * Detects and pairs a new USB thermal printer using WebUSB (Chrome / Edge chooser)
   */
  async detectUsbPrinter(
    options: {
      role?: DirectPrinterRole;
      paperWidth?: DirectPaperWidth;
      isPrimary?: boolean;
    } = {},
    restaurantId?: string | null
  ): Promise<ConfiguredDirectPrinter> {
    if (!this.isUsbSupported()) {
      throw new Error(
        'WebUSB is only supported in Chromium-based desktop/Android browsers (Chrome, Edge).'
      );
    }

    let device: any;
    try {
      device = await (navigator as any).usb.requestDevice({ filters: [] });
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.message?.includes('User cancelled')) {
        throw new Error('USB device selection was cancelled.');
      }
      throw new Error(`WebUSB device request failed: ${err.message || err}`);
    }

    if (!device) {
      throw new Error('No USB device was selected.');
    }

    const cacheKey = `${device.vendorId}_${device.productId}_${device.serialNumber || ''}`;
    cachedUsbDevices.set(cacheKey, device);

    const deviceName = device.productName || `USB Printer (0x${device.vendorId.toString(16)})`;
    const capability = await inspectUsbDeviceEndpoints(device);

    const printerId = `usb_${device.vendorId}_${device.productId}_${Date.now()}`;
    const newPrinter: ConfiguredDirectPrinter = {
      id: printerId,
      name: deviceName,
      transport: 'usb',
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber || undefined,
      paperWidth: options.paperWidth || '80mm',
      role: options.role || 'both',
      isPrimary: options.isPrimary ?? capability.hasBulkOut,
      status: capability.hasBulkOut ? 'connected' : 'unsupported',
      statusMessage: capability.hasBulkOut
        ? 'Connected via WebUSB Direct'
        : 'Direct WebUSB is unsupported on this device (interface claimed by Windows driver or no bulk OUT endpoint).',
      errorMessage: capability.hasBulkOut ? undefined : capability.error,
      lastConnectedAt: Date.now(),
    };

    const currentList = this.getSavedPrinters(restaurantId);
    const filtered = currentList.filter(
      (p) => !(p.transport === 'usb' && p.vendorId === device.vendorId && p.productId === device.productId)
    );
    if (newPrinter.isPrimary && capability.hasBulkOut) {
      filtered.forEach((p) => (p.isPrimary = false));
    }
    filtered.push(newPrinter);
    this.savePrinters(filtered, restaurantId);

    return newPrinter;
  },

  /**
   * Pairs a serial/COM port thermal printer using Web Serial
   */
  async pairSerialPrinter(
    options: {
      role?: DirectPrinterRole;
      paperWidth?: DirectPaperWidth;
      isPrimary?: boolean;
    } = {},
    restaurantId?: string | null
  ): Promise<ConfiguredDirectPrinter> {
    if (!this.isSerialSupported()) {
      throw new Error('Web Serial is only supported in Chromium-based desktop browsers (Chrome, Edge).');
    }

    let port: any;
    try {
      port = await (navigator as any).serial.requestPort();
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.message?.includes('User cancelled')) {
        throw new Error('Serial port selection was cancelled.');
      }
      throw new Error(`Web Serial request failed: ${err.message || err}`);
    }

    if (!port) {
      throw new Error('No serial port was selected.');
    }

    const info = port.getInfo ? port.getInfo() : {};
    const key = `serial_${info.usbVendorId || Date.now()}_${info.usbProductId || 0}`;
    cachedSerialPorts.set(key, port);

    const deviceName = info.usbVendorId
      ? `Serial Printer (0x${info.usbVendorId.toString(16)}:0x${(info.usbProductId || 0).toString(16)})`
      : 'Serial/COM POS Printer';

    const printerId = `serial_${Date.now()}`;
    const newPrinter: ConfiguredDirectPrinter = {
      id: printerId,
      name: deviceName,
      transport: 'serial',
      deviceId: key,
      paperWidth: options.paperWidth || '80mm',
      role: options.role || 'both',
      isPrimary: options.isPrimary ?? true,
      status: 'connected',
      statusMessage: 'Connected via Web Serial (COM port)',
      lastConnectedAt: Date.now(),
    };

    const currentList = this.getSavedPrinters(restaurantId);
    const filtered = currentList.filter((p) => p.id !== printerId);
    if (newPrinter.isPrimary) {
      filtered.forEach((p) => (p.isPrimary = false));
    }
    filtered.push(newPrinter);
    this.savePrinters(filtered, restaurantId);

    return newPrinter;
  },

  /**
   * Pairs RestroZ Print Agent with the current restaurant using a 6-digit pairing code
   */
  async pairPrintAgent(pairingCode: string, restaurantId: string): Promise<PrintAgentInfo> {
    if (!pairingCode || !pairingCode.trim()) {
      throw new Error('Pairing code is required.');
    }

    const { data, error } = await supabase.rpc('pair_print_agent', {
      p_pairing_code: pairingCode.trim(),
      p_restaurant_id: restaurantId,
    });

    if (error) {
      throw new Error(`Agent pairing error: ${error.message}`);
    }

    if (!data || !data.success) {
      throw new Error(data?.error || 'Failed to pair Print Agent.');
    }

    // Poll printer_devices for up to 3 seconds to capture immediate queue sync
    let queueList: string[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: devices } = await supabase
        .from('printer_devices')
        .select('printer_name')
        .eq('agent_id', data.agent_id);

      if (devices && devices.length > 0) {
        queueList = devices.map((d: any) => d.printer_name);
        break;
      }
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(`[webDirectPrintService] pairPrintAgent -> pairedAgentId: ${data.agent_id}, printerDevices.length: ${queueList.length}, names:`, queueList);

    return {
      id: data.agent_id,
      deviceId: data.device_id,
      deviceName: data.device_name,
      status: data.status || 'online',
      isPaired: true,
      lastSeen: new Date().toISOString(),
      installedPrinters: queueList,
    };
  },

  /**
   * Refreshes installed printer queue names for an agent directly from Supabase
   */
  async refreshAgentQueues(agentId: string): Promise<string[]> {
    try {
      const { data: devices, error } = await supabase
        .from('printer_devices')
        .select('printer_name')
        .eq('agent_id', agentId);

      if (error || !devices) return [];
      const queueList = devices.map((d: any) => d.printer_name);
      console.log(`[webDirectPrintService] refreshAgentQueues -> pairedAgentId: ${agentId}, printerDevices.length: ${queueList.length}, names:`, queueList);
      return queueList;
    } catch (err) {
      console.warn('[webDirectPrintService] refreshAgentQueues error:', err);
      return [];
    }
  },

  /**
   * Retrieves paired Print Agent for the restaurant from Supabase
   */
  async getPairedAgent(restaurantId: string): Promise<PrintAgentInfo | null> {
    try {
      const { data, error } = await supabase
        .from('print_agents')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_paired', true)
        .order('last_seen', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      // Also get printer devices for this agent
      const { data: devices } = await supabase
        .from('printer_devices')
        .select('printer_name')
        .eq('agent_id', data.id);

      const queueList = (devices || []).map((d: any) => d.printer_name);
      console.log(`[webDirectPrintService] getPairedAgent -> pairedAgentId: ${data.id}, printerDevices.length: ${queueList.length}, names:`, queueList);

      return {
        id: data.id,
        deviceId: data.device_id,
        deviceName: data.device_name,
        status: data.status,
        isPaired: data.is_paired,
        lastSeen: data.last_seen,
        installedPrinters: queueList,
      };
    } catch (err) {
      console.warn('[webDirectPrintService] getPairedAgent error:', err);
      return null;
    }
  },

  /**
   * Unpairs and disconnects a Print Agent from the restaurant
   */
  async unpairPrintAgent(agentId: string, restaurantId: string): Promise<void> {
    const { error } = await supabase.rpc('unpair_print_agent', {
      p_agent_id: agentId,
      p_restaurant_id: restaurantId,
    });
    if (error) {
      throw new Error(`Failed to unpair Print Agent: ${error.message}`);
    }

    // Clean up local storage agent printers
    const list = this.getSavedPrinters(restaurantId);
    const updated = list.filter((p) => !(p.transport === 'agent' && p.agentId === agentId));
    this.savePrinters(updated, restaurantId);
  },

  /**
   * Adds or configures an installed Windows printer queue managed by RestroZ Print Agent
   */
  async addAgentPrinter(
    queueName: string,
    agent: PrintAgentInfo,
    options: {
      role?: DirectPrinterRole;
      paperWidth?: DirectPaperWidth;
      isPrimary?: boolean;
    } = {},
    restaurantId?: string | null
  ): Promise<ConfiguredDirectPrinter> {
    const printerId = `agent_${agent.id}_${queueName.replace(/\s+/g, '_')}`;
    const resolvedPaperWidth: DirectPaperWidth =
      options.paperWidth || (/58|seznik|925|rpp|mpt|mini/i.test(queueName) ? '58mm' : '80mm');

    const newPrinter: ConfiguredDirectPrinter = {
      id: printerId,
      name: queueName,
      transport: 'agent',
      agentId: agent.id,
      agentDeviceName: agent.deviceName,
      windowsQueueName: queueName,
      paperWidth: resolvedPaperWidth,
      role: options.role || 'both',
      isPrimary: options.isPrimary ?? true,
      status: agent.status === 'online' ? 'connected' : 'offline',
      statusMessage: `Print Agent (${agent.deviceName})`,
      lastConnectedAt: Date.now(),
    };

    const currentList = this.getSavedPrinters(restaurantId);
    const filtered = currentList.filter((p) => p.id !== printerId);
    if (newPrinter.isPrimary) {
      filtered.forEach((p) => (p.isPrimary = false));
    }
    filtered.push(newPrinter);
    this.savePrinters(filtered, restaurantId);

    // Sync primary selection and role to Supabase printer_devices for cross-device mobile resolution
    if (restaurantId) {
      try {
        if (newPrinter.isPrimary) {
          await supabase
            .from('printer_devices')
            .update({ is_primary: false })
            .eq('restaurant_id', restaurantId)
            .eq('agent_id', agent.id);
        }
        await supabase
          .from('printer_devices')
          .update({
            is_primary: Boolean(newPrinter.isPrimary),
            role: options.role || 'both',
            paper_width: resolvedPaperWidth,
            is_active: true,
          })
          .eq('restaurant_id', restaurantId)
          .eq('agent_id', agent.id)
          .eq('printer_name', queueName);
      } catch (syncDbErr) {
        console.warn('[webDirectPrintService] Could not sync printer_devices primary status to DB:', syncDbErr);
      }
    }

    return newPrinter;
  },

  /**
   * Disconnects / removes a configured direct printer from the current restaurant's store and clears live BLE/hardware sessions.
   */
  async disconnectPrinter(printerId: string, restaurantId?: string | null): Promise<void> {
    const list = this.getSavedPrinters(restaurantId);
    const target = list.find(
      (p) =>
        p.id === printerId ||
        p.bluetoothDeviceId === printerId ||
        p.deviceId === printerId ||
        (p.name && p.name.toLowerCase() === printerId.toLowerCase())
    );

    let gattDisconnected = false;
    if (target && target.transport === 'bluetooth') {
      const sessionKey = getBleSessionKey(target);
      const devId = target.bluetoothDeviceId || target.deviceId;
      const normName = (target.name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

      // Locate and disconnect live BLE GATT server
      const sess =
        activeBleSessions.get(sessionKey) ||
        activeBleSessions.get(target.id) ||
        (devId ? activeBleSessions.get(devId) : null) ||
        (normName ? activeBleSessions.get(`name_${normName}`) : null);

      if (sess && sess.gattServer && sess.gattServer.connected) {
        try {
          sess.gattServer.disconnect();
          gattDisconnected = true;
        } catch {}
      }

      // Delete all aliases from activeBleSessions to prevent ghost resurrection
      activeBleSessions.delete(sessionKey);
      activeBleSessions.delete(target.id);
      if (devId) activeBleSessions.delete(devId);
      if (normName) activeBleSessions.delete(`name_${normName}`);
      if (sess?.device?.id) {
        activeBleSessions.delete(sess.device.id);
      }

      // Disconnect cached Bluetooth device if still connected
      if (devId) {
        const bt = cachedBluetoothDevices.get(devId);
        if (bt && bt.gatt && bt.gatt.connected) {
          try {
            bt.gatt.disconnect();
            gattDisconnected = true;
          } catch {}
        }
      }
    }

    if (target && target.transport === 'usb') {
      const key = `${target.vendorId}_${target.productId}_${target.serialNumber || ''}`;
      const usb = cachedUsbDevices.get(key);
      if (usb && usb.opened) {
        try {
          await usb.close();
        } catch {}
      }
    }

    if (target && target.transport === 'serial' && target.deviceId) {
      const port = cachedSerialPorts.get(target.deviceId);
      if (port && port.readable) {
        try {
          await port.close();
        } catch {}
      }
    }

    const updated = list.filter((p) => {
      const isMatch =
        p.id === printerId ||
        (target && (p.id === target.id || (target.bluetoothDeviceId && p.bluetoothDeviceId === target.bluetoothDeviceId)));
      return !isMatch;
    });

    this.savePrinters(updated, restaurantId);

    if (target) {
      notifyStatusChange(target, 'disconnected', `Printer "${target.name}" removed.`);
    }

    console.log(
      `[PRINTER_DISCONNECT]\n` +
      `Printer: ${target ? target.name : printerId}\n` +
      `Printer ID: ${target ? target.id : printerId}\n` +
      `Restaurant ID: ${restaurantId || 'default'}\n` +
      `Storage key: ${getStorageKey(restaurantId)}\n` +
      `Removed from saved config: YES\n` +
      `BLE session disconnected: ${gattDisconnected ? 'YES' : 'NO'}\n` +
      `BLE session removed: YES\n` +
      `Runtime store removed: YES\n` +
      `Remaining printers: ${updated.length}`
    );
  },

  /**
   * Updates an existing printer's configuration (role, paper width, primary status)
   */
  updatePrinter(updated: ConfiguredDirectPrinter, restaurantId?: string | null): void {
    const list = this.getSavedPrinters(restaurantId);
    const mapped = list.map((p) => {
      if (p.id === updated.id) {
        return updated;
      }
      if (updated.isPrimary && p.isPrimary) {
        return { ...p, isPrimary: false };
      }
      return p;
    });
    this.savePrinters(mapped, restaurantId);
  },

  /**
   * Automatically restores an authorized BLE printer connection using navigator.bluetooth.getDevices().
   * Reconnects GATT, recovers characteristic, populates activeBleSessions, and repairs runtime status.
   */
  async restoreAuthorizedBlePrinter(
    printer: ConfiguredDirectPrinter,
    restaurantId?: string | null
  ): Promise<BleSession | null> {
    if (!this.isBluetoothSupported() || printer.transport !== 'bluetooth') {
      return null;
    }

    const sessionKey = getBleSessionKey(printer);
    const targetDevId = printer.bluetoothDeviceId || printer.deviceId;
    const savedStatus = (printer.status || 'reconnect_required').toUpperCase().replace(/_/g, ' ');

    // 1. Check existing live in-memory session
    let existing =
      activeBleSessions.get(sessionKey) ||
      activeBleSessions.get(printer.id) ||
      (targetDevId ? activeBleSessions.get(targetDevId) : null);

    if (existing && existing.device && existing.gattServer?.connected && existing.writeCharacteristic) {
      console.log(
        `[BLE_PRE_ROUTE_RECOVERY]\n` +
        `Printer: ${printer.name}\n` +
        `Saved Status: ${savedStatus}\n` +
        `Saved Bluetooth Device ID: ${targetDevId || 'N/A'}\n` +
        `Active Session: YES\n` +
        `Authorized Devices: 1\n` +
        `Matched Device: YES\n` +
        `GATT Recovery: SUCCESS\n` +
        `Final Runtime Status: READY`
      );
      return existing;
    }

    // 2. Query browser authorized devices without popping chooser
    let granted: any[] = [];
    if ((navigator as any).bluetooth?.getDevices) {
      try {
        granted = await (navigator as any).bluetooth.getDevices();
        for (const d of granted) {
          if (d.id) cachedBluetoothDevices.set(d.id, d);
        }
      } catch (err) {
        console.warn('[webDirectPrintService] getDevices error:', err);
      }
    }

    const matchedDevice =
      (targetDevId ? cachedBluetoothDevices.get(targetDevId) : null) ||
      granted.find(
        (d: any) =>
          (targetDevId && d.id === targetDevId) ||
          (printer.name && d.name && d.name.toLowerCase() === printer.name.toLowerCase())
      );

    if (!matchedDevice) {
      console.log(
        `[BLE_PRE_ROUTE_RECOVERY]\n` +
        `Printer: ${printer.name}\n` +
        `Saved Status: ${savedStatus}\n` +
        `Saved Bluetooth Device ID: ${targetDevId || 'N/A'}\n` +
        `Active Session: NO\n` +
        `Authorized Devices: ${granted.length}\n` +
        `Matched Device: NO\n` +
        `GATT Recovery: FAILED\n` +
        `Final Runtime Status: RECONNECT_REQUIRED`
      );
      return null;
    }

    // 3. Connect GATT
    let gattServer = matchedDevice.gatt;
    try {
      if (!gattServer.connected) {
        gattServer = await matchedDevice.gatt.connect();
      }
    } catch (connErr) {
      console.warn('[webDirectPrintService] GATT auto-reconnect error:', connErr);
      console.log(
        `[BLE_PRE_ROUTE_RECOVERY]\n` +
        `Printer: ${printer.name}\n` +
        `Saved Status: ${savedStatus}\n` +
        `Saved Bluetooth Device ID: ${targetDevId || 'N/A'}\n` +
        `Active Session: NO\n` +
        `Authorized Devices: ${granted.length}\n` +
        `Matched Device: YES\n` +
        `GATT Recovery: FAILED\n` +
        `Final Runtime Status: RECONNECT_REQUIRED`
      );
      return null;
    }

    // 4. Locate or recover characteristic
    let writeChar: any = null;
    let serviceUuid = printer.serviceUuid;
    let characteristicUuid = printer.characteristicUuid;

    if (serviceUuid && characteristicUuid) {
      try {
        const s = await gattServer.getPrimaryService(serviceUuid);
        if (s) {
          writeChar = await s.getCharacteristic(characteristicUuid);
        }
      } catch {
        writeChar = null;
      }
    }

    if (!writeChar) {
      try {
        writeChar = await this.locateGattWriteCharacteristic(gattServer);
        serviceUuid = writeChar.service?.uuid;
        characteristicUuid = writeChar.uuid;
      } catch (e) {
        console.warn('[webDirectPrintService] Locate write characteristic failed:', e);
        console.log(
          `[BLE_PRE_ROUTE_RECOVERY]\n` +
          `Printer: ${printer.name}\n` +
          `Saved Status: ${savedStatus}\n` +
          `Saved Bluetooth Device ID: ${targetDevId || 'N/A'}\n` +
          `Active Session: NO\n` +
          `Authorized Devices: ${granted.length}\n` +
          `Matched Device: YES\n` +
          `GATT Recovery: FAILED\n` +
          `Final Runtime Status: RECONNECT_REQUIRED`
        );
        return null;
      }
    }

    // 5. Store session in global activeBleSessions registry
    const session: BleSession = {
      device: matchedDevice,
      gattServer,
      writeCharacteristic: writeChar,
      serviceUuid,
      characteristicUuid,
      connected: true,
      lastConnectedAt: Date.now(),
    };

    activeBleSessions.set(sessionKey, session);
    activeBleSessions.set(printer.id, session);
    if (matchedDevice.id) activeBleSessions.set(matchedDevice.id, session);
    if (targetDevId) activeBleSessions.set(targetDevId, session);

    // 6. Repair status in canonical store
    this.updatePrinterRuntimeStatus(
      printer.id,
      {
        status: 'connected',
        runtimeStatus: 'ready',
        statusMessage: 'Bluetooth connected.',
        lastError: null,
      },
      restaurantId
    );

    console.log(
      `[BLE_PRE_ROUTE_RECOVERY]\n` +
      `Printer: ${printer.name}\n` +
      `Saved Status: ${savedStatus}\n` +
      `Saved Bluetooth Device ID: ${targetDevId || 'N/A'}\n` +
      `Active Session: NO\n` +
      `Authorized Devices: ${granted.length}\n` +
      `Matched Device: YES\n` +
      `GATT Recovery: SUCCESS\n` +
      `Final Runtime Status: READY`
    );

    return session;
  },

  /**
   * Resolves the active direct printer for a given role (KOT or Bill).
   * Routing Priority for KOT/Bill:
   * 1. READY Primary printer matching role (status === 'connected' | 'available')
   * 2. If Primary is unavailable (reconnect_required, offline, unsupported):
   *    Fallback to best READY printer matching role.
   *    Preference for silent automatic printing:
   *    RestroZ Print Agent > connected WebUSB > Web Serial > BLE
   * 3. Logs routing decision in DEV mode without secrets.
   */
  async resolvePrinterForRole(
    role: 'kot' | 'bill',
    restaurantId?: string | null
  ): Promise<ConfiguredDirectPrinter | null> {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[BLE_PRE_ROUTE_ENTER]', role, restaurantId || 'default');
    }

    const rawList = this.getSavedPrinters(restaurantId);

    // 1. Find configured candidate printers matching role (kot/both or bill/both)
    const candidates = rawList.filter((p) => p.role === role || p.role === 'both');
    // 2. Prefer Primary configured printer first
    candidates.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

    // 3. For Bluetooth candidate printers, FIRST attempt runtime recovery before status evaluation
    for (const p of candidates) {
      if (p.transport === 'bluetooth') {
        await this.restoreAuthorizedBlePrinter(p, restaurantId);
      }
    }

    // Re-read latest list after potential restoration
    const currentList = this.getSavedPrinters(restaurantId);

    // Refresh live in-memory BLE session status & repair persisted state if active BLE session exists
    const list = currentList.map((p) => {
      if (p.transport === 'bluetooth') {
        const sKey = getBleSessionKey(p);
        const normName = (p.name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        let liveSession =
          activeBleSessions.get(sKey) ||
          activeBleSessions.get(p.id) ||
          (p.bluetoothDeviceId ? activeBleSessions.get(p.bluetoothDeviceId) : null) ||
          (p.deviceId ? activeBleSessions.get(p.deviceId) : null) ||
          (normName ? activeBleSessions.get(`name_${normName}`) : null);

        if (!liveSession && activeBleSessions.size > 0) {
          for (const sess of activeBleSessions.values()) {
            if (sess.gattServer?.connected && sess.writeCharacteristic) {
              const sessNorm = (sess.device?.name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
              if (!normName || sessNorm === normName || sessNorm.includes('925') || normName.includes('925')) {
                liveSession = sess;
                break;
              }
            }
          }
        }

        if (liveSession && liveSession.writeCharacteristic && liveSession.gattServer?.connected) {
          if (p.status !== 'connected') {
            this.updatePrinterRuntimeStatus(
              p.id,
              {
                status: 'connected',
                runtimeStatus: 'ready',
                statusMessage: 'Bluetooth connected.',
                lastError: null,
              },
              restaurantId
            );
          }
          return {
            ...p,
            status: 'connected' as DirectPrinterStatus,
            statusMessage: 'Bluetooth connected.',
            deviceId: liveSession.device?.id || p.deviceId,
            bluetoothDeviceId: liveSession.device?.id || p.bluetoothDeviceId || p.deviceId,
          };
        }
      }
      return p;
    });

    const primary = list.find((p) => p.isPrimary && (p.role === role || p.role === 'both')) || null;
    const isPrimaryReady = Boolean(primary && (primary.status === 'connected' || primary.status === 'available'));

    let target: ConfiguredDirectPrinter | null = null;
    let isFallback = false;

    if (isPrimaryReady) {
      target = primary;
      isFallback = false;
    } else {
      // Find all ready printers matching role (NEVER route to reconnect_required / offline / unsupported)
      const readyPrinters = list.filter(
        (p) => (p.status === 'connected' || p.status === 'available') && (p.role === role || p.role === 'both')
      );

      // Sort by silent automatic printing preference: Agent > USB > Serial > Bluetooth
      readyPrinters.sort((a, b) => {
        const transportWeight: Record<string, number> = { agent: 1, usb: 2, serial: 3, bluetooth: 4 };
        const twA = transportWeight[a.transport] || 99;
        const twB = transportWeight[b.transport] || 99;
        if (twA !== twB) return twA - twB;

        // Exact role match before dual role 'both'
        const roleA = a.role === role ? 1 : 2;
        const roleB = b.role === role ? 1 : 2;
        return roleA - roleB;
      });

      target = readyPrinters[0] || null;
      isFallback = Boolean(target && primary && target.id !== primary.id);
    }

    // Remote Print Agent resolution for mobile/waiter clients:
    // If no local ready printer is found and a restaurantId is available, query Supabase for the restaurant's active Print Agent and registered printer devices.
    if (!target && restaurantId) {
      try {
        const { data: agentData } = await supabase
          .from('print_agents')
          .select('id, device_id, device_name, status, is_paired, last_seen')
          .eq('restaurant_id', restaurantId)
          .eq('is_paired', true)
          .order('last_seen', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (agentData) {
          const { data: deviceRows } = await supabase
            .from('printer_devices')
            .select('*')
            .eq('agent_id', agentData.id)
            .eq('is_active', true);

          if (deviceRows && deviceRows.length > 0) {
            const matchingDevices = deviceRows.filter(
              (d: any) => d.role === role || d.role === 'both' || !d.role
            );
            matchingDevices.sort((a: any, b: any) => {
              if ((b.is_primary ? 1 : 0) !== (a.is_primary ? 1 : 0)) {
                return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
              }
              // Prioritize physical thermal printer queues (POS80, POS58, Thermal, etc.) over virtual drivers
              const isThermalA = /^(pos|thermal|receipt|kot|sr|rpp|xp|epson|tsp|58|80)/i.test(a.printer_name);
              const isThermalB = /^(pos|thermal|receipt|kot|sr|rpp|xp|epson|tsp|58|80)/i.test(b.printer_name);
              if (isThermalA !== isThermalB) return (isThermalB ? 1 : 0) - (isThermalA ? 1 : 0);

              const isVirtualA = /pdf|xps|fax|onenote|anydesk|document writer/i.test(a.printer_name);
              const isVirtualB = /pdf|xps|fax|onenote|anydesk|document writer/i.test(b.printer_name);
              if (isVirtualA !== isVirtualB) return (isVirtualA ? 1 : 0) - (isVirtualB ? 1 : 0);

              return a.printer_name.localeCompare(b.printer_name);
            });
            const chosenDevice = matchingDevices[0] || deviceRows[0];

            if (chosenDevice) {
              const is58mmDevice = /58|seznik|925|rpp|mpt|mini/i.test(chosenDevice.printer_name);
              const resolvedPaperWidth: DirectPaperWidth = is58mmDevice
                ? '58mm'
                : ((chosenDevice.paper_width as DirectPaperWidth) || '80mm');

              const agentPrinter: ConfiguredDirectPrinter = {
                id: `agent_${agentData.id}_${chosenDevice.printer_name.replace(/\s+/g, '_')}`,
                name: chosenDevice.printer_name,
                transport: 'agent',
                agentId: agentData.id,
                agentDeviceName: agentData.device_name,
                windowsQueueName: chosenDevice.printer_name,
                paperWidth: resolvedPaperWidth,
                role: (chosenDevice.role as DirectPrinterRole) || 'both',
                isPrimary: Boolean(chosenDevice.is_primary),
                status: 'connected',
                statusMessage: `RestroZ Print Agent Online (${agentData.device_name})`,
                lastConnectedAt: Date.now(),
              };

              // Cache in memory / local store for this restaurant
              const currentSaved = this.getSavedPrinters(restaurantId);
              const exists = currentSaved.find((p) => p.id === agentPrinter.id);
              if (!exists) {
                this.savePrinters([...currentSaved, agentPrinter], restaurantId);
              }

              if (typeof __DEV__ !== 'undefined' && __DEV__) {
                console.log(
                  `[REMOTE_AGENT_ROUTED]\n` +
                  `Role: ${role.toUpperCase()}\n` +
                  `Restaurant ID: ${restaurantId}\n` +
                  `Agent: ${agentData.device_name} (${agentData.id})\n` +
                  `Windows Queue: ${chosenDevice.printer_name}\n` +
                  `Paper Width: ${agentPrinter.paperWidth}`
                );
              }

              target = agentPrinter;
            }
          }
        }
      } catch (agentErr) {
        console.warn('[webDirectPrintService] Remote agent resolution error:', agentErr);
      }
    }

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      if (target) {
        console.log(
          `[AUTO_PRINT_ROUTING]\n` +
          `Auto Print Job: ${role.toUpperCase()}\n` +
          `Requested Role: ${role.toUpperCase()}\n` +
          `Primary: ${primary ? primary.name : 'None'}\n` +
          `Primary Status: ${primary ? (primary.status || 'unknown').toUpperCase().replace(/_/g, ' ') : 'N/A'}\n` +
          `Fallback: ${isFallback ? target.name : 'None'}\n` +
          `Transport: ${target.transport.toUpperCase().replace('AGENT', 'PRINT_AGENT')}\n` +
          `Result: ${target.transport === 'agent' ? 'QUEUED' : 'DISPATCHED'}`
        );
        console.log(
          `[ROUTER_IDENTITY_AUDIT]\n` +
          `Router Printer ID: ${target.id}\n` +
          `Router Printer Name: ${target.name}\n` +
          `Router deviceId: ${target.deviceId || 'N/A'}\n` +
          `Router bluetoothDeviceId: ${target.bluetoothDeviceId || 'N/A'}`
        );
      } else {
        console.warn(
          `[AUTO_PRINT_ROUTING]\n` +
          `Auto Print Job: ${role.toUpperCase()}\n` +
          `Requested Role: ${role.toUpperCase()}\n` +
          `Primary: ${primary ? primary.name : 'None'}\n` +
          `Primary Status: ${primary ? (primary.status || 'unknown').toUpperCase().replace(/_/g, ' ') : 'N/A'}\n` +
          `Fallback: None\n` +
          `Transport: NONE\n` +
          `Result: NO_READY_PRINTER`
        );
      }
    }

    return target;
  },

  /**
   * Helper: Traverses GATT server services to find a writable characteristic
   */
  async locateGattWriteCharacteristic(server: any): Promise<any> {
    let services: any[] = [];
    try {
      services = await server.getPrimaryServices();
    } catch {
      for (const uuid of BLE_PRINTER_SERVICE_UUIDS) {
        try {
          const s = await server.getPrimaryService(uuid);
          if (s) services.push(s);
        } catch {}
      }
    }

    if (services.length === 0) {
      throw new Error('No compatible BLE GATT primary services discovered.');
    }

    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            return char;
          }
        }
      } catch {}
    }

    throw new Error('No writable GATT characteristic discovered on BLE printer.');
  },

  /**
   * Retrieves an existing live BLE session or recovers it using getDevices() without user prompt.
   */
  async getOrRecoverBleSession(
    printer: ConfiguredDirectPrinter,
    allowUserGesture: boolean = false,
    restaurantId?: string | null
  ): Promise<BleSession> {
    if (!this.isBluetoothSupported()) {
      const err = new Error('Web Bluetooth is not supported in this browser.');
      (err as any).code = 'BLE_UNSUPPORTED';
      throw err;
    }

    const sessionKey = getBleSessionKey(printer);
    const targetDevId = printer.bluetoothDeviceId || printer.deviceId;

    // 1. Check existing live in-memory session using canonical key or aliases
    let session =
      activeBleSessions.get(sessionKey) ||
      activeBleSessions.get(printer.id) ||
      (targetDevId ? activeBleSessions.get(targetDevId) : null);

    if (session && session.device && session.gattServer?.connected && session.writeCharacteristic) {
      activeBleSessions.set(sessionKey, session);
      activeBleSessions.set(printer.id, session);
      if (session.device.id) activeBleSessions.set(session.device.id, session);
      return session;
    }

    // 2. Find device from existing session object, cache, or getDevices()
    let device = session?.device || (targetDevId ? cachedBluetoothDevices.get(targetDevId) : null);

    let granted: any[] = [];
    if (!device && (navigator as any).bluetooth?.getDevices) {
      try {
        granted = await (navigator as any).bluetooth.getDevices();
      } catch (err) {
        console.warn('[webDirectPrintService] bluetooth.getDevices error:', err);
      }
    }

    const matchedDevice = granted.find(
      (d: any) =>
        (targetDevId && d.id === targetDevId) ||
        (printer.name && d.name && d.name.toLowerCase() === printer.name.toLowerCase())
    );

    console.log(
      `[BLE_DEVICE_RECOVERY]\n` +
      `Authorized devices count: ${granted.length}\n` +
      `Saved bluetoothDeviceId: ${targetDevId || 'N/A'}\n` +
      `Returned device IDs: ${granted.map((d: any) => d.id || 'unknown').join(', ') || 'None'}\n` +
      `Matched device: ${matchedDevice ? `${matchedDevice.name || 'Unnamed'} (${matchedDevice.id})` : 'None'}`
    );

    if (matchedDevice) {
      device = matchedDevice;
      if (device.id) cachedBluetoothDevices.set(device.id, device);
    }

    // 3. If still no device and user gesture allowed (e.g. Test Print / manual reconnect)
    if (!device && allowUserGesture && (navigator as any).bluetooth?.requestDevice) {
      try {
        device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: BLE_PRINTER_SERVICE_UUIDS,
        });
        if (device && device.id) {
          cachedBluetoothDevices.set(device.id, device);
        }
      } catch (err: any) {
        throw new Error(`Bluetooth device request failed: ${err.message || err}`);
      }
    }

    if (!device) {
      const updated: ConfiguredDirectPrinter = {
        ...printer,
        status: 'reconnect_required',
        statusMessage: 'Bluetooth printer not found. Reconnect required.',
      };
      this.updatePrinter(updated, restaurantId);
      notifyStatusChange(updated, 'reconnect_required', `Bluetooth printer "${printer.name}" not found. Reconnect required.`);

      const err = new Error(`Bluetooth printer "${printer.name}" is not paired in this browser session. Please reconnect.`);
      (err as any).code = 'BLE_DISCONNECTED';
      throw err;
    }

    // 4. Connect to GATT Server
    let gattServer = device.gatt;
    try {
      if (!gattServer.connected) {
        gattServer = await device.gatt.connect();
      }
    } catch (connErr: any) {
      console.warn('[webDirectPrintService] GATT connect error:', connErr);
      const updated: ConfiguredDirectPrinter = {
        ...printer,
        status: 'reconnect_required',
        statusMessage: 'Bluetooth GATT connection failed. Reconnect required.',
      };
      this.updatePrinter(updated, restaurantId);
      notifyStatusChange(updated, 'reconnect_required', `Bluetooth printer "${printer.name}" could not be reached.`);

      const err = new Error(`Bluetooth printer "${printer.name}" could not be reached: ${connErr.message || connErr}`);
      (err as any).code = 'BLE_DISCONNECTED';
      throw err;
    }

    // 5. Locate or recover Characteristic
    let writeChar: any = null;
    let serviceUuid: string | undefined = session?.serviceUuid || printer.serviceUuid;
    let characteristicUuid: string | undefined = session?.characteristicUuid || printer.characteristicUuid;

    if (serviceUuid && characteristicUuid) {
      try {
        const s = await gattServer.getPrimaryService(serviceUuid);
        if (s) {
          writeChar = await s.getCharacteristic(characteristicUuid);
        }
      } catch {
        writeChar = null;
      }
    }

    if (!writeChar) {
      writeChar = await this.locateGattWriteCharacteristic(gattServer);
      serviceUuid = writeChar.service?.uuid;
      characteristicUuid = writeChar.uuid;
    }

    // 6. Store live session
    const activeSession: BleSession = {
      device,
      gattServer,
      writeCharacteristic: writeChar,
      serviceUuid,
      characteristicUuid,
      connected: true,
      lastConnectedAt: Date.now(),
    };

    activeBleSessions.set(sessionKey, activeSession);
    activeBleSessions.set(printer.id, activeSession);
    if (device.id) activeBleSessions.set(device.id, activeSession);
    if (targetDevId) activeBleSessions.set(targetDevId, activeSession);
    if (device.id) cachedBluetoothDevices.set(device.id, device);

    // 7. Persist printer configuration & state immediately
    const updated: ConfiguredDirectPrinter = {
      ...printer,
      deviceId: device.id || printer.deviceId,
      bluetoothDeviceId: device.id || printer.bluetoothDeviceId || printer.deviceId,
      name: device.name || printer.name,
      serviceUuid,
      characteristicUuid,
      status: 'connected',
      statusMessage: 'Bluetooth connected.',
      errorMessage: undefined,
      lastConnectedAt: Date.now(),
    };
    this.updatePrinter(updated, restaurantId);
    notifyStatusChange(updated, 'connected', `Bluetooth printer "${printer.name}" connected.`);

    return activeSession;
  },

  /**
   * Sends raw ESC/POS binary data to a Web Bluetooth printer using the shared live session.
   * Outputs structured diagnostics [BLE_SESSION], [BLE_WRITE], [BLE_WRITE_ERROR].
   * Applies sequential flow control with 20-byte chunks and 50ms inter-chunk delay.
   */
  async sendEscPosToBluetooth(
    printer: ConfiguredDirectPrinter,
    data: Uint8Array,
    documentType: string = 'DOCUMENT',
    restaurantId?: string | null,
    allowUserGesture: boolean = false
  ): Promise<void> {
    if (!this.isBluetoothSupported()) {
      const err = new Error('Web Bluetooth is not supported in this browser.');
      (err as any).code = 'BLE_UNSUPPORTED';
      throw err;
    }

    if (!(data instanceof Uint8Array)) {
      throw new Error(`[BLE_WRITE] Expected Uint8Array payload, received ${typeof data}`);
    }

    const sessionKey = getBleSessionKey(printer);
    const existingSession =
      activeBleSessions.get(sessionKey) ||
      activeBleSessions.get(printer.id) ||
      (printer.deviceId ? activeBleSessions.get(printer.deviceId) : null) ||
      (printer.bluetoothDeviceId ? activeBleSessions.get(printer.bluetoothDeviceId) : null);

    console.log(
      `[BLE_SESSION_LOAD]\n` +
      `Printer ID: ${printer.id}\n` +
      `Saved Device ID: ${printer.bluetoothDeviceId || printer.deviceId || 'N/A'}\n` +
      `Session Key: ${sessionKey}\n` +
      `Session Found: ${existingSession ? 'YES' : 'NO'}\n` +
      `GATT Connected: ${Boolean(existingSession?.gattServer?.connected)}`
    );

    const session = await this.getOrRecoverBleSession(printer, allowUserGesture, restaurantId);
    const writeChar = session.writeCharacteristic;
    const gattServer = session.gattServer;
    const device = session.device;

    const hasWriteWithoutResponse = Boolean(writeChar.properties?.writeWithoutResponse);
    const hasWrite = Boolean(writeChar.properties?.write);

    // Choose write mode: writeWithoutResponse if available (standard thermal BLE), else writeWithResponse or writeValue
    let writeMethod = 'writeValue';
    if (hasWriteWithoutResponse && typeof writeChar.writeValueWithoutResponse === 'function') {
      writeMethod = 'writeValueWithoutResponse';
    } else if (typeof writeChar.writeValueWithResponse === 'function') {
      writeMethod = 'writeValueWithResponse';
    } else if (typeof writeChar.writeValue === 'function') {
      writeMethod = 'writeValue';
    }

    // Conservative BLE transport settings: 20 bytes, 50ms delay
    const CHUNK_SIZE = 20;
    const CHUNK_DELAY = 50;
    const totalChunks = Math.ceil(data.length / CHUNK_SIZE);

    // [ESC_POS_BINARY_VALIDATION] Structured Logging
    const first40Hex = Array.from(data.subarray(0, Math.min(data.length, 40)))
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    const last20Hex = Array.from(data.subarray(Math.max(0, data.length - 20)))
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    console.log(
      `[ESC_POS_BINARY_VALIDATION]\n` +
      `Document: ${documentType.toUpperCase()}\n` +
      `Byte Count: ${data.length}\n` +
      `Is Uint8Array: ${data instanceof Uint8Array}\n` +
      `First 40 bytes in HEX: ${first40Hex}\n` +
      `Last 20 bytes in HEX: ${last20Hex}`
    );

    // [BLE_RUNTIME] Structured Logging
    console.log(
      `[BLE_RUNTIME]\n` +
      `Document: ${documentType.toUpperCase()}\n` +
      `Printer Name: ${printer.name}\n` +
      `Printer ID: ${printer.id}\n` +
      `Session Key: ${sessionKey}\n` +
      `activeBleSessions.size: ${activeBleSessions.size}\n` +
      `Session Found: YES\n` +
      `Device ID: ${device?.id || printer.bluetoothDeviceId || printer.deviceId || 'N/A'}\n` +
      `Device Name: ${device?.name || printer.name}\n` +
      `GATT Connected: ${Boolean(gattServer?.connected)}\n` +
      `Service UUID: ${session.serviceUuid || writeChar.service?.uuid || 'N/A'}\n` +
      `Characteristic UUID: ${session.characteristicUuid || writeChar.uuid || 'N/A'}\n` +
      `Characteristic write: ${hasWrite}\n` +
      `Characteristic writeWithoutResponse: ${hasWriteWithoutResponse}\n` +
      `Bytes instanceof Uint8Array: ${data instanceof Uint8Array}\n` +
      `Byte Count: ${data.length}\n` +
      `Chunk Size: ${CHUNK_SIZE}\n` +
      `Chunk Delay: ${CHUNK_DELAY}ms\n` +
      `Number of Chunks: ${totalChunks}\n` +
      `Write Method: ${writeMethod}`
    );

    let successChunkCount = 0;
    let failedChunk: number | null = null;

    try {
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunkIndex = Math.floor(i / CHUNK_SIZE);
        const chunkNumber = chunkIndex + 1;
        const chunk = data.subarray(i, Math.min(i + CHUNK_SIZE, data.length));

        console.log(`Chunk ${chunkNumber}/${totalChunks} -> START`);

        try {
          if (writeMethod === 'writeValueWithoutResponse') {
            await writeChar.writeValueWithoutResponse(chunk);
          } else if (writeMethod === 'writeValueWithResponse') {
            await writeChar.writeValueWithResponse(chunk);
          } else {
            await writeChar.writeValue(chunk);
          }
          successChunkCount++;
          console.log(`Chunk ${chunkNumber}/${totalChunks} -> SUCCESS`);
        } catch (chunkErr: any) {
          failedChunk = chunkNumber;
          console.error(
            `Chunk ${chunkNumber}/${totalChunks} -> FAILED\n` +
            `Error name: ${chunkErr?.name || 'Error'}\n` +
            `Error message: ${chunkErr?.message || String(chunkErr)}`
          );
          throw chunkErr;
        }

        // Sequential inter-chunk delay: 50ms gives thermal printer MCU time to drain UART FIFO
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY));
      }

      // Post-document drain delay: 200ms before completing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Persist status = 'connected', lastError = null
      const updatedPrinter: ConfiguredDirectPrinter = {
        ...printer,
        deviceId: device?.id || printer.deviceId,
        bluetoothDeviceId: device?.id || printer.bluetoothDeviceId || printer.deviceId,
        name: device?.name || printer.name,
        serviceUuid: session.serviceUuid,
        characteristicUuid: session.characteristicUuid,
        status: 'connected',
        statusMessage: 'Bluetooth connected.',
        errorMessage: undefined,
        lastConnectedAt: Date.now(),
      };
      this.updatePrinter(updatedPrinter, restaurantId);
      notifyStatusChange(updatedPrinter, 'connected', 'Bluetooth connected.');

      console.log(
        `[PRINTER_STATE_AFTER_TEST]\n` +
        `Printer ID: ${printer.id}\n` +
        `Saved Status: connected\n` +
        `Runtime Status: ready\n` +
        `BLE Session Exists: YES\n` +
        `GATT Connected: ${Boolean(gattServer?.connected)}`
      );

      console.log(
        `[BLE_SESSION_SAVE]\n` +
        `Printer ID: ${printer.id}\n` +
        `Device ID: ${device?.id || printer.bluetoothDeviceId || printer.deviceId || 'N/A'}\n` +
        `Session Key: ${sessionKey}\n` +
        `activeBleSessions.size: ${activeBleSessions.size}\n` +
        `Status: READY`
      );

      console.log(
        `[BLE_WRITE_SUMMARY]\n` +
        `Document: ${documentType.toUpperCase()}\n` +
        `Chunk count: ${totalChunks}\n` +
        `Successful chunks: ${successChunkCount}\n` +
        `Failed chunk: None\n` +
        `Final transport result: SUCCESS`
      );

      console.log(`Final Result: SUCCESS (${documentType})`);
    } catch (writeErr: any) {
      console.error(
        `[BLE_WRITE_SUMMARY]\n` +
        `Document: ${documentType.toUpperCase()}\n` +
        `Chunk count: ${totalChunks}\n` +
        `Successful chunks: ${successChunkCount}\n` +
        `Failed chunk: ${failedChunk || '1'}\n` +
        `Final transport result: FAILED (${writeErr?.message || writeErr})`
      );

      console.error(
        `[BLE_WRITE_ERROR]\n` +
        `name: ${writeErr?.name || 'Error'}\n` +
        `message: ${writeErr?.message || String(writeErr)}\n` +
        `stack: ${writeErr?.stack || 'N/A'}`
      );

      activeBleSessions.delete(sessionKey);
      activeBleSessions.delete(printer.id);
      if (printer.deviceId) activeBleSessions.delete(printer.deviceId);
      if (printer.bluetoothDeviceId) activeBleSessions.delete(printer.bluetoothDeviceId);

      const updated: ConfiguredDirectPrinter = {
        ...printer,
        status: 'reconnect_required',
        statusMessage: 'Bluetooth connection lost during write. Reconnect required.',
      };
      this.updatePrinter(updated, restaurantId);
      notifyStatusChange(updated, 'reconnect_required', `Bluetooth printer "${printer.name}" connection lost.`);

      const err = new Error(`Failed to send data to Bluetooth printer "${printer.name}": ${writeErr.message || writeErr}`);
      (err as any).code = 'BLE_WRITE_FAILED';
      throw err;
    }
  },

  /**
   * Sends raw ESC/POS binary data to a WebUSB printer
   */
  async sendEscPosToUsb(printer: ConfiguredDirectPrinter, data: Uint8Array): Promise<void> {
    if (!this.isUsbSupported()) {
      const err = new Error('WebUSB is not supported in this browser.');
      (err as any).code = 'USB_UNSUPPORTED';
      throw err;
    }

    const cacheKey = `${printer.vendorId}_${printer.productId}_${printer.serialNumber || ''}`;
    let device = cachedUsbDevices.get(cacheKey);

    if (!device && (navigator as any).usb?.getDevices) {
      try {
        const granted = await (navigator as any).usb.getDevices();
        device = granted.find(
          (d: any) => d.vendorId === printer.vendorId && d.productId === printer.productId
        );
        if (device) cachedUsbDevices.set(cacheKey, device);
      } catch (e) {
        console.warn('[webDirectPrintService] getDevices error:', e);
      }
    }

    if (!device) {
      // Mark printer as disconnected in store
      const updated: ConfiguredDirectPrinter = {
        ...printer,
        status: 'disconnected',
        statusMessage: 'USB printer disconnected. Reconnect cable.',
      };
      this.updatePrinter(updated);
      notifyStatusChange(updated, 'disconnected', `USB printer "${printer.name}" is disconnected.`);

      const err = new Error(`USB printer "${printer.name}" is disconnected. Please reconnect.`);
      (err as any).code = 'USB_DISCONNECTED';
      throw err;
    }

    let targetInterface: any = null;
    try {
      if (!device.opened) {
        await device.open();
      }
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      let targetEndpointNumber: number | null = null;

      if (device.configuration && device.configuration.interfaces) {
        for (const iface of device.configuration.interfaces) {
          for (const alt of iface.alternates) {
            for (const ep of alt.endpoints) {
              if (ep.direction === 'out' && (ep.type === 'bulk' || ep.type === 'interrupt')) {
                targetInterface = iface;
                targetEndpointNumber = ep.endpointNumber;
                break;
              }
            }
            if (targetEndpointNumber !== null) break;
          }
          if (targetEndpointNumber !== null) break;
        }
      }

      if (!targetInterface || targetEndpointNumber === null) {
        const err = new Error(
          'Could not find a writable Bulk OUT endpoint on this USB printer (interface claimed by Windows driver).'
        );
        (err as any).code = 'USB_NO_BULK_OUT';
        throw err;
      }

      try {
        await device.claimInterface(targetInterface.interfaceNumber);
      } catch (claimErr: any) {
        const err = new Error(
          `WebUSB could not claim printer interface (${claimErr.message || claimErr}).`
        );
        (err as any).code = 'USB_CLAIM_FAILED';
        throw err;
      }

      const CHUNK_SIZE = 512;
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.subarray(i, i + CHUNK_SIZE);
        const res = await device.transferOut(targetEndpointNumber, chunk);
        if (res.status !== 'ok') {
          const err = new Error(`USB transfer failed with status: ${res.status}`);
          (err as any).code = 'USB_TRANSFER_FAILED';
          throw err;
        }
      }
    } catch (err: any) {
      const isDisconnect =
        err.code === 'USB_DISCONNECTED' ||
        err.name === 'NetworkError' ||
        err.name === 'NotFoundError' ||
        err.name === 'InvalidStateError' ||
        err.message?.includes('device closed') ||
        err.message?.includes('disconnected') ||
        err.message?.includes('transferOut') ||
        err.message?.includes('claimInterface');

      if (isDisconnect) {
        cachedUsbDevices.delete(cacheKey);
        const updated: ConfiguredDirectPrinter = {
          ...printer,
          status: 'disconnected',
          statusMessage: 'USB printer disconnected. Reconnect cable.',
        };
        this.updatePrinter(updated);
        notifyStatusChange(
          updated,
          'disconnected',
          `USB printer "${printer.name}" disconnected. Reconnect cable.`
        );
      }

      const customErr = new Error(err.message || 'USB print operation failed.');
      (customErr as any).code = isDisconnect ? 'USB_DISCONNECTED' : err.code || 'USB_PRINT_FAILED';
      throw customErr;
    } finally {
      if (targetInterface && device?.opened) {
        try {
          await device.releaseInterface(targetInterface.interfaceNumber);
        } catch {}
      }
    }
  },

  /**
   * Sends raw ESC/POS binary data to a Web Serial / COM port printer
   */
  async sendEscPosToSerial(printer: ConfiguredDirectPrinter, data: Uint8Array): Promise<void> {
    if (!this.isSerialSupported()) {
      throw new Error('Web Serial is not supported in this browser.');
    }

    let port = printer.deviceId ? cachedSerialPorts.get(printer.deviceId) : null;
    if (!port && (navigator as any).serial?.getPorts) {
      const ports = await (navigator as any).serial.getPorts();
      if (ports.length > 0) {
        port = ports[0];
      }
    }

    if (!port) {
      throw new Error(`Serial printer "${printer.name}" is not open or disconnected. Please reconnect.`);
    }

    if (!port.readable && !port.writable) {
      await port.open({ baudRate: 9600 });
    }

    const writer = port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  },

  /**
   * Dispatches a print job to RestroZ Print Agent via Supabase print_jobs table
   */
  async sendEscPosToAgent(
    printer: ConfiguredDirectPrinter,
    data: Uint8Array,
    jobType: 'kot' | 'bill' | 'test' = 'kot',
    jobTitle: string = 'Print Job',
    restaurantId?: string | null
  ): Promise<WebDirectPrintResult> {
    const queueName = printer.windowsQueueName || printer.name;
    let agentId = printer.agentId;

    if (!agentId && restaurantId) {
      const agent = await this.getPairedAgent(restaurantId);
      if (agent) {
        agentId = agent.id;
      }
    }

    if (!agentId) {
      throw new Error('No RestroZ Print Agent is paired for this restaurant. Please pair Print Agent in Settings.');
    }

    // Convert binary to base64 safely across Web, Node, and React Native (Hermes)
    let payloadBase64 = '';
    if (typeof (globalThis as any).Buffer !== 'undefined') {
      payloadBase64 = (globalThis as any).Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
    } else if (typeof (globalThis as any).btoa === 'function') {
      let binaryStr = '';
      for (let i = 0; i < data.length; i++) {
        binaryStr += String.fromCharCode(data[i]);
      }
      payloadBase64 = (globalThis as any).btoa(binaryStr);
    } else {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let i = 0;
      const len = data.length;
      while (i < len) {
        const b1 = data[i++];
        const b2 = i < len ? data[i++] : NaN;
        const b3 = i < len ? data[i++] : NaN;
        const e1 = b1 >> 2;
        const e2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
        const e3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
        const e4 = isNaN(b3) ? 64 : b3 & 63;
        payloadBase64 += chars.charAt(e1) + chars.charAt(e2) + (e3 === 64 ? '=' : chars.charAt(e3)) + (e4 === 64 ? '=' : chars.charAt(e4));
      }
    }

    console.log(
      `[PRINT_AGENT_JOB_DISPATCH]\n` +
      `Restaurant ID: ${restaurantId || 'N/A'}\n` +
      `Agent ID: ${agentId}\n` +
      `Printer Queue: ${queueName}\n` +
      `Job Type: ${jobType.toUpperCase()}\n` +
      `Job Title: ${jobTitle}\n` +
      `Payload Bytes: ${data.length}`
    );

    // Insert into public.print_jobs
    const { data: job, error } = await supabase
      .from('print_jobs')
      .insert({
        restaurant_id: restaurantId,
        agent_id: agentId,
        printer_name: queueName,
        job_type: jobType,
        job_title: jobTitle,
        payload_base64: payloadBase64,
        paper_width: printer.paperWidth || '80mm',
        status: 'queued',
      })
      .select()
      .single();

    if (error) {
      console.warn('[webDirectPrintService] Failed to insert print job into Supabase:', error);
      throw new Error(`Failed to queue print job for RestroZ Print Agent: ${error.message}`);
    }

    console.log(
      `[PRINT_AGENT_JOB_ENQUEUED]\n` +
      `Job ID: ${job.id}\n` +
      `Status: ${job.status}\n` +
      `Queue: ${queueName}\n` +
      `Created At: ${job.created_at}`
    );

    return {
      success: true,
      printerName: queueName,
      transport: 'agent',
      jobName: jobTitle,
      message: `Job dispatched to RestroZ Print Agent for Windows queue "${queueName}".`,
    };
  },

  /**
   * Generates a clean ESC/POS binary test receipt
   */
  /**
   * Generates a clean ESC/POS binary test receipt
   */
  async generateTestReceipt(
    printer: ConfiguredDirectPrinter,
    settings?: RestaurantSettings | null
  ): Promise<Uint8Array> {
    const builder = new EscPosTextBuilder(printer.paperWidth, printer.name, {
      isBle: printer.transport === 'bluetooth',
      disableCutCmd: printer.transport === 'bluetooth',
    });
    const restName = settings?.name || 'RESTROZ POS';
    const logoUrl =
      settings?.logo_url ||
      (settings as any)?.restaurant?.logo_url;

    if (logoUrl) {
      try {
        const logoBytes = await generateEscPosLogoRaster(
          logoUrl,
          printer.paperWidth === '58mm' ? '58mm' : '80mm'
        );
        if (logoBytes && logoBytes.length > 0) {
          builder.addRawBytes(logoBytes);
        }
      } catch (logoErr) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[webDirectPrintService] Test receipt logo rasterization failed:', logoErr);
        }
      }
    }

    builder.addLine(restName.toUpperCase(), { align: 'center', bold: true, scale: 'double_height' });
    builder.addLine('HARDWARE TEST RECEIPT', { align: 'center', bold: true });
    builder.addDivider('-');

    builder.addKeyValue('Printer Name:', printer.name);
    let transportLabel = 'RESTROZ PRINT AGENT';
    if (printer.transport === 'bluetooth') transportLabel = 'WEB BLUETOOTH (BLE)';
    if (printer.transport === 'usb') transportLabel = 'WEBUSB DIRECT';
    if (printer.transport === 'serial') transportLabel = 'WEB SERIAL (COM PORT)';
    builder.addKeyValue('Transport:', transportLabel);
    builder.addKeyValue('Paper Width:', printer.paperWidth);
    builder.addKeyValue('Role:', printer.role.toUpperCase());
    builder.addKeyValue('Primary:', printer.isPrimary ? 'YES' : 'NO');
    builder.addKeyValue('Timestamp:', new Date().toLocaleTimeString());

    builder.addDivider('-');
    builder.addLine('ESC/POS DIRECT PRINTING ACTIVE', { align: 'center', bold: true });
    builder.addLine('*** TEST PRINT SUCCESSFUL ***', { align: 'center' });
    builder.addDivider('-');

    builder.addFeedAndCut(4);

    const doc = builder.build();
    return doc.bytes;
  },

  /**
   * Performs a test print using the printer's ACTUAL transport
   */
  async printTest(
    printer: ConfiguredDirectPrinter,
    settings?: RestaurantSettings | null,
    restaurantId?: string | null
  ): Promise<WebDirectPrintResult> {
    const bytes = await this.generateTestReceipt(printer, settings);
    const restId = restaurantId || settings?.restaurant_id || (settings as any)?.id;
    const sessionKey = getBleSessionKey(printer);

    console.log(
      `[PRINT_ROUTE]\n` +
      `Document: TEST\n` +
      `resolvePrinterForRole result: ${printer.name}\n` +
      `Transport: ${printer.transport.toUpperCase()}\n` +
      `Status: ${printer.status.toUpperCase()}\n` +
      `Role: ${printer.role.toUpperCase()}\n` +
      `Paper Width: ${printer.paperWidth}\n` +
      `Reached printTest(): YES\n` +
      `Reached sendEscPosToBluetooth(): ${printer.transport === 'bluetooth' ? 'YES' : 'NO'}`
    );

    // 1. Bluetooth: Web Bluetooth ONLY
    if (printer.transport === 'bluetooth') {
      if (printer.status === 'unsupported') {
        throw new Error('This Bluetooth printer does not support browser direct printing (requires BLE GATT).');
      }
      await this.sendEscPosToBluetooth(printer, bytes, 'TEST', restId, true);
      return {
        success: true,
        printerName: printer.name,
        transport: 'bluetooth',
        jobName: 'Test Print',
        message: `Test print successfully sent to Bluetooth printer "${printer.name}"`,
      };
    }

    // 2. Direct USB: WebUSB ONLY
    if (printer.transport === 'usb') {
      if (printer.status === 'unsupported') {
        throw new Error(
          `Direct WebUSB is unsupported on "${printer.name}" (${printer.errorMessage || 'No Bulk OUT endpoint'}). ` +
          'Please use "Windows Printer (RestroZ Print Agent)" to print to this device.'
        );
      }
      await this.sendEscPosToUsb(printer, bytes);
      return {
        success: true,
        printerName: printer.name,
        transport: 'usb',
        jobName: 'Test Print',
        message: `Test print successfully sent to WebUSB printer "${printer.name}"`,
      };
    }

    // 3. Web Serial: Serial Port ONLY
    if (printer.transport === 'serial') {
      await this.sendEscPosToSerial(printer, bytes);
      return {
        success: true,
        printerName: printer.name,
        transport: 'serial',
        jobName: 'Test Print',
        message: `Test print successfully sent to Serial printer "${printer.name}"`,
      };
    }

    // 4. Windows Print Agent
    if (printer.transport === 'agent') {
      return await this.sendEscPosToAgent(printer, bytes, 'test', 'Hardware Test Print', restId);
    }

    throw new Error(`Unsupported transport type "${printer.transport}" for test print.`);
  },

  /**
   * Prints KOT directly to configured Web Bluetooth / WebUSB / Serial / Windows Print Agent
   */
  async printKot(
    order: Order,
    settings: RestaurantSettings,
    kot?: KOT,
    options: { isReprint?: boolean } = {}
  ): Promise<WebDirectPrintResult | null> {
    const restId = order.restaurant_id || settings.restaurant_id || (settings as any).id;
    const prePrinters = this.getSavedPrinters(restId);
    const primaryPrinter = prePrinters.find((p) => p.isPrimary) || prePrinters[0];
    console.log(
      `[PRINTER_STATE_BEFORE_ROUTE]\n` +
      `Printer ID: ${primaryPrinter?.id || 'N/A'}\n` +
      `Saved Status: ${primaryPrinter?.status || 'N/A'}\n` +
      `Runtime Status: ${primaryPrinter?.status === 'connected' ? 'ready' : primaryPrinter?.status || 'N/A'}`
    );

    const targetPrinter = await this.resolvePrinterForRole('kot', restId);

    console.log(
      `[PRINT_ROUTE]\n` +
      `Document: KOT\n` +
      `resolvePrinterForRole result: ${targetPrinter ? targetPrinter.name : 'null'}\n` +
      `Transport: ${targetPrinter ? targetPrinter.transport.toUpperCase() : 'NONE'}\n` +
      `Status: ${targetPrinter ? targetPrinter.status.toUpperCase() : 'N/A'}\n` +
      `Role: ${targetPrinter ? targetPrinter.role.toUpperCase() : 'N/A'}\n` +
      `Paper Width: ${targetPrinter ? targetPrinter.paperWidth : 'N/A'}\n` +
      `Reached printKot(): YES\n` +
      `Reached sendEscPosToBluetooth(): ${targetPrinter && targetPrinter.transport === 'bluetooth' ? 'YES' : 'NO'}`
    );

    if (!targetPrinter) {
      console.warn(
        `[KOT_REAL_FLOW]\n` +
        `Handler entered: YES\n` +
        `Printer resolved: NO\n` +
        `Printer: None\n` +
        `Transport: NONE\n` +
        `Status: N/A\n` +
        `Reached printKot(): YES\n` +
        `Renderer completed: NO\n` +
        `Rendered bytes: 0\n` +
        `Reached sendEscPosToBluetooth(): NO\n` +
        `Final transport result: FAILED (NO_RESOLVED_PRINTER)`
      );
      return null;
    }

    const kotNum = kot?.kot_number || (order.kots && order.kots[0]?.kot_number) || order.order_number;
    const jobName = `KOT_${kotNum}`;

    const kotDoc = renderKotToEscPos(order, settings, kot, {
      isReprint: options.isReprint,
      printer: { paper_width: targetPrinter.paperWidth, transport: targetPrinter.transport, name: targetPrinter.name } as any,
      isBle: targetPrinter.transport === 'bluetooth',
    });

    console.log(
      `[KOT_REAL_FLOW]\n` +
      `Handler entered: YES\n` +
      `Printer resolved: YES\n` +
      `Printer: ${targetPrinter.name}\n` +
      `Transport: ${targetPrinter.transport}\n` +
      `Status: ${targetPrinter.status}\n` +
      `Reached printKot(): YES\n` +
      `Renderer completed: YES\n` +
      `Rendered bytes: ${kotDoc.bytes.length}\n` +
      `Reached sendEscPosToBluetooth(): ${targetPrinter.transport === 'bluetooth' ? 'YES' : 'NO'}`
    );

    if (targetPrinter.transport === 'bluetooth') {
      try {
        await this.sendEscPosToBluetooth(targetPrinter, kotDoc.bytes, 'KOT', restId, false);
        return {
          success: true,
          printerName: targetPrinter.name,
          transport: 'bluetooth',
          jobName,
          message: `KOT sent directly to Bluetooth printer "${targetPrinter.name}"`,
        };
      } catch (err: any) {
        console.warn('[webDirectPrintService] Bluetooth KOT print failed:', err);
        return {
          success: false,
          printerName: targetPrinter.name,
          transport: 'bluetooth',
          jobName,
          code: err.code || 'BLE_PRINT_FAILED',
          message: err.message || 'Bluetooth printer could not print the KOT.',
        };
      }
    }

    if (targetPrinter.transport === 'usb') {
      try {
        await this.sendEscPosToUsb(targetPrinter, kotDoc.bytes);
        return {
          success: true,
          printerName: targetPrinter.name,
          transport: 'usb',
          jobName,
          message: `KOT sent directly to USB printer "${targetPrinter.name}"`,
        };
      } catch (err: any) {
        console.warn('[webDirectPrintService] USB KOT print failed:', err);
        return {
          success: false,
          printerName: targetPrinter.name,
          transport: 'usb',
          jobName,
          code: err.code || 'USB_DISCONNECTED',
          message: err.message || 'USB printer is disconnected.',
        };
      }
    }

    if (targetPrinter.transport === 'serial') {
      await this.sendEscPosToSerial(targetPrinter, kotDoc.bytes);
      return {
        success: true,
        printerName: targetPrinter.name,
        transport: 'serial',
        jobName,
        message: `KOT sent directly to Serial printer "${targetPrinter.name}"`,
      };
    }

    if (targetPrinter.transport === 'agent') {
      return await this.sendEscPosToAgent(targetPrinter, kotDoc.bytes, 'kot', jobName, restId);
    }

    return null;
  },

  /**
   * Prints Final Bill directly to configured Web Bluetooth / WebUSB / Serial / Windows Print Agent
   */
  async printBill(
    order: Order,
    settings: RestaurantSettings,
    billedBy: string = 'Staff'
  ): Promise<WebDirectPrintResult | null> {
    const restId = order.restaurant_id || settings.restaurant_id || (settings as any).id;
    const prePrinters = this.getSavedPrinters(restId);
    const primaryPrinter = prePrinters.find((p) => p.isPrimary) || prePrinters[0];
    console.log(
      `[PRINTER_STATE_BEFORE_ROUTE]\n` +
      `Printer ID: ${primaryPrinter?.id || 'N/A'}\n` +
      `Saved Status: ${primaryPrinter?.status || 'N/A'}\n` +
      `Runtime Status: ${primaryPrinter?.status === 'connected' ? 'ready' : primaryPrinter?.status || 'N/A'}`
    );

    const targetPrinter = await this.resolvePrinterForRole('bill', restId);

    console.log(
      `[PRINT_ROUTE]\n` +
      `Document: BILL\n` +
      `resolvePrinterForRole result: ${targetPrinter ? targetPrinter.name : 'null'}\n` +
      `Transport: ${targetPrinter ? targetPrinter.transport.toUpperCase() : 'NONE'}\n` +
      `Status: ${targetPrinter ? targetPrinter.status.toUpperCase() : 'N/A'}\n` +
      `Role: ${targetPrinter ? targetPrinter.role.toUpperCase() : 'N/A'}\n` +
      `Paper Width: ${targetPrinter ? targetPrinter.paperWidth : 'N/A'}\n` +
      `Reached printBill(): YES\n` +
      `Reached sendEscPosToBluetooth(): ${targetPrinter && targetPrinter.transport === 'bluetooth' ? 'YES' : 'NO'}`
    );

    if (!targetPrinter) {
      console.warn(
        `[BILL_REAL_FLOW]\n` +
        `Handler entered: YES\n` +
        `Printer resolved: NO\n` +
        `Printer: None\n` +
        `Transport: NONE\n` +
        `Status: N/A\n` +
        `Reached printBill(): YES\n` +
        `Renderer completed: NO\n` +
        `Rendered bytes: 0\n` +
        `Reached sendEscPosToBluetooth(): NO\n` +
        `Final transport result: FAILED (NO_RESOLVED_PRINTER)`
      );
      return null;
    }

    const invNum = order.invoice_number || order.order_number;
    const jobName = `Bill_${invNum}`;

    // Generate Brand Logo Raster if configured
    const logoUrl =
      settings.logo_url ||
      (settings as any).restaurant?.logo_url ||
      (order as any).restaurant?.logo_url ||
      (order as any).logo_url;
    let logoRasterBytes: Uint8Array | null = null;
    if (logoUrl) {
      try {
        logoRasterBytes = await generateEscPosLogoRaster(
          logoUrl,
          targetPrinter.paperWidth === '58mm' ? '58mm' : '80mm'
        );
      } catch (logoErr) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[webDirectPrintService] Logo generation failed, printing text-only receipt:', logoErr);
        }
      }
    }

    const billDoc = renderBillToEscPos(order, settings, billedBy, {
      printer: { paper_width: targetPrinter.paperWidth, transport: targetPrinter.transport, name: targetPrinter.name } as any,
      isBle: targetPrinter.transport === 'bluetooth',
      logoRasterBytes,
    });

    console.log(
      `[BILL_REAL_FLOW]\n` +
      `Handler entered: YES\n` +
      `Printer resolved: YES\n` +
      `Printer: ${targetPrinter.name}\n` +
      `Transport: ${targetPrinter.transport}\n` +
      `Status: ${targetPrinter.status}\n` +
      `Reached printBill(): YES\n` +
      `Renderer completed: YES\n` +
      `Rendered bytes: ${billDoc.bytes.length}\n` +
      `Reached sendEscPosToBluetooth(): ${targetPrinter.transport === 'bluetooth' ? 'YES' : 'NO'}`
    );

    if (targetPrinter.transport === 'bluetooth') {
      try {
        await this.sendEscPosToBluetooth(targetPrinter, billDoc.bytes, 'BILL', restId, false);
        return {
          success: true,
          printerName: targetPrinter.name,
          transport: 'bluetooth',
          jobName,
          message: `Bill sent directly to Bluetooth printer "${targetPrinter.name}"`,
        };
      } catch (err: any) {
        console.warn('[webDirectPrintService] Bluetooth Bill print failed:', err);
        return {
          success: false,
          printerName: targetPrinter.name,
          transport: 'bluetooth',
          jobName,
          code: err.code || 'BLE_PRINT_FAILED',
          message: err.message || 'Bluetooth printer could not print the Bill.',
        };
      }
    }

    if (targetPrinter.transport === 'usb') {
      try {
        await this.sendEscPosToUsb(targetPrinter, billDoc.bytes);
        return {
          success: true,
          printerName: targetPrinter.name,
          transport: 'usb',
          jobName,
          message: `Bill sent directly to USB printer "${targetPrinter.name}"`,
        };
      } catch (err: any) {
        console.warn('[webDirectPrintService] USB Bill print failed:', err);
        return {
          success: false,
          printerName: targetPrinter.name,
          transport: 'usb',
          jobName,
          code: err.code || 'USB_DISCONNECTED',
          message: err.message || 'USB printer is disconnected.',
        };
      }
    }

    if (targetPrinter.transport === 'serial') {
      await this.sendEscPosToSerial(targetPrinter, billDoc.bytes);
      return {
        success: true,
        printerName: targetPrinter.name,
        transport: 'serial',
        jobName,
        message: `Bill sent directly to Serial printer "${targetPrinter.name}"`,
      };
    }

    if (targetPrinter.transport === 'agent') {
      return await this.sendEscPosToAgent(targetPrinter, billDoc.bytes, 'bill', jobName, restId);
    }

    return null;
  },
};
