/**
 * RestroZ Android Multi-Printer System — Phase 6
 * Unified Android Print Router, Master Auto Print Gate, Multi-Printer Routing,
 * Failure Handling, Partial-Write Protection & Destination-Specific Dedup.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  RestaurantPrinter,
  Order,
  KOT,
  RestaurantSettings,
  OrderItem,
  TableSection,
} from '../../types';
import { printerRepository } from './printerRepository';
import { devicePrinterBindingService } from './devicePrinterBindings';
import { printerRoutingService, CategoryPrintSplit } from './routing';
import { renderKotToEscPos } from './escpos/kotRenderer';
import { renderBillToEscPos } from './escpos/billRenderer';
import { generateEscPosLogoRaster } from './escpos/logoRaster';
import { tcpTransport, bluetoothTransport, bleGattTransport, usbTransport } from './transports';
import { isAutoPrintEnabled } from '../directPrintService';
import { printedKotTracker } from '../../utils/printedKotTracker';

export type PrintDestinationStatus =
  | 'success'
  | 'failed_before_write'
  | 'partial_or_unknown'
  | 'not_configured'
  | 'not_bound'
  | 'skipped_dedup';

export interface DestinationPrintResult {
  printerId: string;
  printerName: string;
  role: 'kot' | 'bill';
  connectionType?: 'lan' | 'wifi' | 'bluetooth' | 'usb';
  status: PrintDestinationStatus;
  bytesSent: number;
  totalBytes: number;
  message?: string;
  durationMs?: number;
  itemCount?: number;
  attemptedFallback?: boolean;
  fallbackPrinterId?: string;
  jobId?: string;
  errorCode?: string;
}

export interface MultiDestinationPrintResult {
  success: boolean;
  skipped?: boolean;
  allSucceeded: boolean;
  hasFailures: boolean;
  hasPartialOrUnknown: boolean;
  destinations: DestinationPrintResult[];
  errors: string[];
  summary: string;
}

// Destination-specific persistent deduplication storage
const STORAGE_KEY_PRINTED_JOBS = '@printed_destination_jobs';
const inMemoryPrintedJobs = new Set<string>();
let isDedupInitialized = false;

async function ensureDedupInitialized(): Promise<void> {
  if (isDedupInitialized) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PRINTED_JOBS);
    if (raw) {
      const ids: string[] = JSON.parse(raw);
      ids.forEach((id) => inMemoryPrintedJobs.add(id));
    }
  } catch (err) {
    console.warn('[androidPrintRouter] Error loading printed job cache:', err);
  } finally {
    isDedupInitialized = true;
  }
}

interface AndroidPrintDiagnosticParams {
  job: 'KOT' | 'BILL';
  source: string;
  printerName: string;
  transport: string;
  deviceId: string;
  roleEligible: boolean;
  bindingFound: boolean;
  payloadBytes: number;
  connection: string;
  serviceDiscovery: string;
  characteristic: string;
  chunksSent: number;
  result: 'SUCCESS' | 'FAILURE';
  errorCode?: string;
  errorMessage?: string;
}

function logAndroidPrintDiagnostic(params: AndroidPrintDiagnosticParams) {
  console.log(
`[ANDROID_PRINT]
Job: ${params.job}
Source: ${params.source}
Mode: DIRECT_DEVICE
Printer: ${params.printerName}
Transport: ${params.transport}
Device ID: ${params.deviceId}
Role Eligible: ${params.roleEligible ? 'YES' : 'NO'}
Binding Found: ${params.bindingFound ? 'YES' : 'NO'}
Payload Bytes: ${params.payloadBytes}
Connection: ${params.connection}
Service Discovery: ${params.serviceDiscovery}
Characteristic: ${params.characteristic}
Chunks Sent: ${params.chunksSent}
Result: ${params.result}
Error Code: ${params.errorCode || 'NONE'}
Error Message: ${params.errorMessage || 'NONE'}`
  );
}

export const androidPrintRouter = {
  /**
   * Checks if a destination job has already been successfully auto-printed.
   */
  async hasDestinationBeenPrinted(jobId: string): Promise<boolean> {
    if (!jobId) return false;
    await ensureDedupInitialized();
    return inMemoryPrintedJobs.has(jobId);
  },

  /**
   * Marks a specific destination job as printed both in-memory and in AsyncStorage.
   */
  async markDestinationAsPrinted(jobId: string): Promise<void> {
    if (!jobId) return;
    await ensureDedupInitialized();
    inMemoryPrintedJobs.add(jobId);

    try {
      const list = Array.from(inMemoryPrintedJobs).slice(-500); // retain last 500
      await AsyncStorage.setItem(STORAGE_KEY_PRINTED_JOBS, JSON.stringify(list));
    } catch (e) {
      console.warn('[androidPrintRouter] Failed to persist printed job:', e);
    }
  },

  /**
   * Resets local destination deduplication cache (useful for testing & shift resets).
   */
  async resetDedupCache(): Promise<void> {
    inMemoryPrintedJobs.clear();
    isDedupInitialized = true;
    await AsyncStorage.removeItem(STORAGE_KEY_PRINTED_JOBS).catch(() => {});
  },

  /**
   * Sends binary ESC/POS payload to a specific printer using its configured transport.
   * Includes failure-before-write fallback with circular loop protection.
   * NEVER attempts fallback after bytes have started sending (partial_or_unknown).
   */
  async sendPayloadToPrinter(
    printer: RestaurantPrinter,
    bytes: Uint8Array,
    role: 'kot' | 'bill',
    allPrinters: RestaurantPrinter[],
    visitedPrinterIds: Set<string> = new Set(),
    depth: number = 0,
    source: string = 'DIRECT_PRINT'
  ): Promise<DestinationPrintResult> {
    // 1. Fallback loop protection
    if (depth >= 5 || visitedPrinterIds.has(printer.id)) {
      return {
        printerId: printer.id,
        printerName: printer.name,
        role,
        connectionType: printer.connection_type,
        status: 'failed_before_write',
        bytesSent: 0,
        totalBytes: bytes.length,
        message: `Fallback loop detected or max depth exceeded for printer ${printer.name}.`,
        durationMs: 0,
        errorCode: 'FALLBACK_LOOP_EXCEEDED',
      };
    }

    visitedPrinterIds.add(printer.id);

    // 2. Transport resolution & execution
    let transportRes: {
      success: boolean;
      status: string;
      bytesSent: number;
      totalBytes: number;
      message: string;
      durationMs: number;
      errorCode?: string;
    };

    let resolvedTransport = (printer.connection_type || 'unknown').toUpperCase();
    let resolvedDeviceId = 'NONE';
    let bindingFound = false;

    if (printer.connection_type === 'lan' || printer.connection_type === 'wifi') {
      resolvedTransport = 'TCP';
      resolvedDeviceId = `${printer.ip_address || ''}:${printer.port || 9100}`;
      bindingFound = Boolean(printer.ip_address);
      transportRes = await tcpTransport.sendPayload(
        {
          host: printer.ip_address || '',
          port: printer.port || 9100,
        },
        bytes,
        printer.id
      );
    } else if (printer.connection_type === 'bluetooth') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const address = binding?.bluetooth_mac_address || (printer as any).bluetooth_mac_address;
      resolvedDeviceId = address || 'NOT_BOUND';
      bindingFound = Boolean(address);

      const isBle =
        (binding as any)?.bluetooth_transport_type === 'ble_gatt' ||
        (printer as any).bluetooth_transport_type === 'ble_gatt' ||
        /seznik|925/i.test(printer.name) ||
        /seznik|925/i.test(binding?.bluetooth_device_name || (printer as any).bluetooth_device_name || '');

      resolvedTransport = isBle ? 'BLE_GATT' : 'BLUETOOTH_SPP';

      if (!address) {
        transportRes = {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: bytes.length,
          message: `Bluetooth printer "${printer.name}" is not bound on this device. Select Bluetooth device in Settings.`,
          durationMs: 0,
          errorCode: 'DEVICE_BINDING_MISSING',
        };
      } else {
        if (isBle) {
          if (!bleGattTransport.isAvailable()) {
            transportRes = {
              success: false,
              status: 'failed_before_write',
              bytesSent: 0,
              totalBytes: bytes.length,
              message: `Native BLE GATT transport is not available in this environment. Install a RestroZ development or production APK to print.`,
              durationMs: 0,
              errorCode: 'BLE_CONNECTION_FAILED',
            };
          } else {
            transportRes = await bleGattTransport.sendPayload(
              {
                address,
                name: binding?.bluetooth_device_name || printer.bluetooth_device_name || undefined,
                transportType: 'ble_gatt',
              },
              bytes,
              printer.id
            );
          }
        } else {
          if (!bluetoothTransport.isAvailable()) {
            transportRes = {
              success: false,
              status: 'failed_before_write',
              bytesSent: 0,
              totalBytes: bytes.length,
              message: `Native Bluetooth Classic SPP transport is not available in this environment. Install a RestroZ development or production APK to print.`,
              durationMs: 0,
              errorCode: 'BLE_CONNECTION_FAILED',
            };
          } else {
            transportRes = await bluetoothTransport.sendPayload(
              {
                address,
                name: binding?.bluetooth_device_name || printer.bluetooth_device_name || undefined,
              },
              bytes,
              printer.id
            );
          }
        }
      }
    } else if (printer.connection_type === 'usb') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const vendorId = binding?.usb_vendor_id ?? (printer as any).usb_vendor_id;
      const productId = binding?.usb_product_id ?? (printer as any).usb_product_id;
      resolvedTransport = 'USB';
      resolvedDeviceId = `${vendorId}:${productId}`;
      bindingFound = vendorId !== undefined && vendorId !== null && productId !== undefined && productId !== null;

      if (!bindingFound) {
        transportRes = {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: bytes.length,
          message: `USB printer "${printer.name}" is not bound on this device. Select USB device in Settings.`,
          durationMs: 0,
          errorCode: 'DEVICE_BINDING_MISSING',
        };
      } else if (!usbTransport.isAvailable()) {
        transportRes = {
          success: false,
          status: 'failed_before_write',
          bytesSent: 0,
          totalBytes: bytes.length,
          message: `Native USB OTG transport is not available in this environment. Install a RestroZ development or production APK to print.`,
          durationMs: 0,
          errorCode: 'BLE_CONNECTION_FAILED',
        };
      } else {
        transportRes = await usbTransport.sendPayload(
          {
            vendorId,
            productId,
            serialNumber: binding?.usb_serial_number || (printer as any).usb_serial_number || undefined,
          },
          bytes,
          printer.id
        );
      }
    } else {
      transportRes = {
        success: false,
        status: 'not_configured',
        bytesSent: 0,
        totalBytes: bytes.length,
        message: `Unsupported connection type ${(printer.connection_type as string).toUpperCase()}`,
        durationMs: 0,
        errorCode: 'PRINTER_NOT_CONFIGURED',
      };
    }

    // Map error code if not already set on failure
    let finalErrorCode = transportRes.errorCode;
    if (!transportRes.success && !finalErrorCode) {
      const msg = (transportRes.message || '').toLowerCase();
      if (transportRes.status === 'permission_denied' || msg.includes('permission')) {
        finalErrorCode = 'BLUETOOTH_PERMISSION_DENIED';
      } else if (transportRes.status === 'not_bound') {
        finalErrorCode = 'DEVICE_BINDING_MISSING';
      } else if (transportRes.status === 'timeout' || msg.includes('timeout')) {
        finalErrorCode = 'PRINT_TIMEOUT';
      } else if (transportRes.bytesSent > 0 || transportRes.status === 'partial_or_unknown') {
        finalErrorCode = 'BLE_WRITE_FAILED';
      } else if (msg.includes('service')) {
        finalErrorCode = 'BLE_SERVICE_NOT_FOUND';
      } else if (msg.includes('characteristic')) {
        finalErrorCode = 'BLE_CHARACTERISTIC_NOT_FOUND';
      } else if (msg.includes('write')) {
        finalErrorCode = 'BLE_WRITE_FAILED';
      } else {
        finalErrorCode = 'BLE_CONNECTION_FAILED';
      }
    }

    const chunksSent = Math.floor(transportRes.bytesSent / 20);

    // Structured diagnostic logging for DEV / diagnosis
    logAndroidPrintDiagnostic({
      job: role.toUpperCase() as 'KOT' | 'BILL',
      source,
      printerName: printer.name,
      transport: resolvedTransport,
      deviceId: resolvedDeviceId,
      roleEligible: true,
      bindingFound,
      payloadBytes: bytes.length,
      connection: transportRes.success ? 'CONNECTED' : (transportRes.bytesSent > 0 ? 'CONNECTED' : 'FAILED'),
      serviceDiscovery: transportRes.success ? 'DISCOVERED (0000ff00)' : (transportRes.bytesSent > 0 ? 'DISCOVERED' : 'SKIPPED'),
      characteristic: transportRes.success ? 'RESOLVED (0000ff02)' : (transportRes.bytesSent > 0 ? 'RESOLVED' : 'SKIPPED'),
      chunksSent: transportRes.success ? Math.ceil(bytes.length / 20) : chunksSent,
      result: transportRes.success ? 'SUCCESS' : 'FAILURE',
      errorCode: transportRes.success ? undefined : finalErrorCode,
      errorMessage: transportRes.success ? undefined : transportRes.message,
    });

    // 3. Evaluate Result
    if (transportRes.success) {
      if (__DEV__) {
        console.log(`[ANDROID AUTO PRINT] ${printer.name} → ${printer.connection_type.toUpperCase()} → DATA_SENT (${transportRes.bytesSent}/${transportRes.totalBytes} bytes)`);
      }
      return {
        printerId: printer.id,
        printerName: printer.name,
        role,
        connectionType: printer.connection_type,
        status: 'success',
        bytesSent: transportRes.bytesSent,
        totalBytes: transportRes.totalBytes,
        message: transportRes.message,
        durationMs: transportRes.durationMs,
      };
    }

    // 4. Handle Failure BEFORE any bytes were sent (Safe for Fallback)
    if (transportRes.bytesSent === 0) {
      if (__DEV__) {
        console.warn(`[ANDROID AUTO PRINT] ${printer.name} → ${printer.connection_type.toUpperCase()} → FAILED_BEFORE_WRITE: ${transportRes.message}`);
      }

      // Check if a valid fallback printer is configured
      if (printer.fallback_printer_id) {
        const fallbackTarget = allPrinters.find(
          (p) =>
            p.id === printer.fallback_printer_id &&
            p.is_active &&
            (p.printer_role === role || p.printer_role === 'both')
        );

        if (fallbackTarget && !visitedPrinterIds.has(fallbackTarget.id)) {
          if (__DEV__) {
            console.log(`[ANDROID AUTO PRINT] Attempting automatic fallback: ${printer.name} → ${fallbackTarget.name}`);
          }
          const fallbackRes = await this.sendPayloadToPrinter(
            fallbackTarget,
            bytes,
            role,
            allPrinters,
            visitedPrinterIds,
            depth + 1,
            source
          );
          fallbackRes.attemptedFallback = true;
          fallbackRes.fallbackPrinterId = fallbackTarget.id;
          return fallbackRes;
        }
      }

      return {
        printerId: printer.id,
        printerName: printer.name,
        role,
        connectionType: printer.connection_type,
        status: (transportRes.status === 'not_bound' ? 'not_bound' : 'failed_before_write') as PrintDestinationStatus,
        bytesSent: 0,
        totalBytes: transportRes.totalBytes,
        message: transportRes.message,
        durationMs: transportRes.durationMs,
        errorCode: finalErrorCode,
      };
    }

    // 5. Handle Failure AFTER bytes were sent (PARTIAL OR UNKNOWN — NO AUTOMATIC FALLBACK)
    if (__DEV__) {
      console.error(`[ANDROID AUTO PRINT] ${printer.name} → PARTIAL_OR_UNKNOWN (${transportRes.bytesSent}/${transportRes.totalBytes} bytes sent). Fallback blocked.`);
    }

    return {
      printerId: printer.id,
      printerName: printer.name,
      role,
      connectionType: printer.connection_type,
      status: 'partial_or_unknown',
      bytesSent: transportRes.bytesSent,
      totalBytes: transportRes.totalBytes,
      message: `Printer connection interrupted after ${transportRes.bytesSent} bytes were sent. Receipt may have partially printed. Check physical printer before reprinting.`,
      durationMs: transportRes.durationMs,
      errorCode: finalErrorCode || 'BLE_WRITE_FAILED',
    };
  },

  /**
   * Unified KOT print router for Android.
   * Handles Category Splitting, Section Routing, Device Defaults, Primary Resolution,
   * Fallback Routing, Destination Dedup, and Partial Write Safety.
   */
  async printKot(
    order: Order,
    settings: RestaurantSettings,
    kot?: KOT,
    options: {
      isReprint?: boolean;
      isManual?: boolean;
      retryPrinterIds?: string[];
      customPrinters?: RestaurantPrinter[];
      source?: string;
    } = {}
  ): Promise<MultiDestinationPrintResult> {
    // 1. MASTER AUTO PRINT GATE (Absolute First Step)
    if (!isAutoPrintEnabled(settings) && !options.isReprint && !options.isManual) {
      return {
        success: false,
        allSucceeded: false,
        hasFailures: false,
        hasPartialOrUnknown: false,
        destinations: [],
        errors: [],
        summary: 'Auto Print is OFF. Android direct printing bypassed.',
      };
    }

    // 2. Fetch and filter active printers
    let activePrinters: RestaurantPrinter[] = [];
    if (options.customPrinters && options.customPrinters.length > 0) {
      activePrinters = options.customPrinters.filter((p) => p.is_active);
    } else {
      const restId = settings?.id || (order as any)?.restaurant_id || '';
      try {
        const all = await printerRepository.getRestaurantPrinters(restId);
        activePrinters = (all || []).filter((p) => p.is_active);
      } catch (err: any) {
        console.warn('[androidPrintRouter] Error loading printers:', err);
      }
    }

    const activeKotPrinters = activePrinters.filter(
      (p) => p.printer_role === 'kot' || p.printer_role === 'both'
    );

    if (activeKotPrinters.length === 0) {
      const err = 'No eligible KOT printer is configured on this device.';
      logAndroidPrintDiagnostic({
        job: 'KOT',
        source: options.source || 'POS_AUTO',
        printerName: 'NONE',
        transport: 'NONE',
        deviceId: 'NONE',
        roleEligible: false,
        bindingFound: false,
        payloadBytes: 0,
        connection: 'SKIPPED',
        serviceDiscovery: 'SKIPPED',
        characteristic: 'SKIPPED',
        chunksSent: 0,
        result: 'FAILURE',
        errorCode: 'PRINTER_NOT_CONFIGURED',
        errorMessage: err,
      });
      return {
        success: false,
        skipped: true,
        allSucceeded: false,
        hasFailures: false,
        hasPartialOrUnknown: false,
        destinations: [],
        errors: [],
        summary: err,
      };
    }

    // 3. Resolve Device Defaults & Section
    const deviceDefaults = await devicePrinterBindingService.getDeviceDefaults();
    const sectionName = (order as any).section || (order as any).dining_tables?.section as TableSection | undefined;

    // Deterministic Default KOT Printer Resolution:
    // Priority: 1. Section/Floor printer -> 2. Device-local Default -> 3. Primary KOT printer -> 4. First matching
    let defaultKotPrinter: RestaurantPrinter | null = null;
    if (sectionName) {
      defaultKotPrinter = printerRoutingService.resolveKotPrinterBySection(sectionName, activeKotPrinters);
    }
    if (!defaultKotPrinter) {
      defaultKotPrinter = printerRoutingService.resolvePrinterForRole(
        activeKotPrinters,
        'kot',
        deviceDefaults?.default_kot_printer_id
      );
    }
    if (!defaultKotPrinter && activeKotPrinters.length > 0) {
      defaultKotPrinter = activeKotPrinters[0];
    }

    // 4. Candidate Items Extraction
    const rawItems: OrderItem[] = [];
    if (kot && kot.items && kot.items.length > 0) {
      for (const ki of kot.items) {
        rawItems.push({
          id: ki.id,
          order_id: order.id,
          product_name: ki.product_name,
          quantity: ki.quantity,
          unit_price: 0,
          total_price: 0,
          subtotal: 0,
          tax_rate: 0,
          tax_amount: 0,
          item_notes: ki.notes,
          product: {
            id: ki.id,
            name: ki.product_name,
            category_id: (ki as any).category_id,
            price: 0,
            is_active: true,
            created_at: '',
            updated_at: '',
          },
        } as unknown as OrderItem);
      }
    } else if (order.items && order.items.length > 0) {
      rawItems.push(...order.items.filter((i) => i.quantity > 0));
    }

    // 5. Category Splitting (PAYLOAD SPLITTING ONLY — NEVER CREATES DUPLICATE DB RECORDS)
    const categoryPrinters = activeKotPrinters.filter(
      (p) => p.category_ids && p.category_ids.length > 0
    );

    let splits: CategoryPrintSplit[] = [];
    if (categoryPrinters.length > 0) {
      splits = printerRoutingService.resolveKotsByCategory(rawItems, activeKotPrinters, defaultKotPrinter);
    } else {
      if (defaultKotPrinter) {
        splits = [{ printer: defaultKotPrinter, items: rawItems }];
      }
    }

    if (splits.length === 0 && defaultKotPrinter) {
      splits = [{ printer: defaultKotPrinter, items: rawItems }];
    }

    // 6. Execute Routing across all resolved destinations
    const destinationResults: DestinationPrintResult[] = [];
    const errors: string[] = [];

    for (const split of splits) {
      const targetPrinter = split.printer;
      const targetItems = split.items;

      // Check if filtered by retry list
      if (options.retryPrinterIds && !options.retryPrinterIds.includes(targetPrinter.id)) {
        continue;
      }

      // Generate deterministic Print Job ID
      const kotId = kot?.id || order.id;
      const kotNum = kot?.kot_number || 'KOT-001';
      const jobId = `kot_${kotId}_${targetPrinter.id}_${kotNum}`;

      // Destination-specific deduplication (Bypassed for explicit user reprints)
      if (!options.isReprint) {
        const alreadyPrinted = await this.hasDestinationBeenPrinted(jobId);
        if (alreadyPrinted) {
          if (__DEV__) {
            console.log(`[ANDROID AUTO PRINT] KOT Destination ${targetPrinter.name} already auto-printed. Skipping dedup.`);
          }
          destinationResults.push({
            printerId: targetPrinter.id,
            printerName: targetPrinter.name,
            role: 'kot',
            connectionType: targetPrinter.connection_type,
            status: 'skipped_dedup',
            bytesSent: 0,
            totalBytes: 0,
            message: 'KOT already printed to this destination. Skipped duplicate.',
            itemCount: targetItems.length,
            jobId,
          });
          continue;
        }
      }

      // Create targeted KOT document representing only the items routed to this printer
      const targetedKot: KOT = {
        id: kot?.id || 'temp-kot',
        order_id: order.id,
        order_number: order.order_number,
        order_type: kot?.order_type || order.order_type,
        restaurant_id: order.restaurant_id,
        table_number: kot?.table_number || order.table_number,
        customer_name: kot?.customer_name || order.customer_name,
        kot_number: kotNum,
        status: kot?.status || 'pending',
        kitchen_notes: kot?.kitchen_notes,
        created_at: kot?.created_at || order.created_at,
        items: targetItems.map((ti: OrderItem) => ({
          id: ti.id,
          kot_id: kot?.id || 'temp-kot',
          product_name: ti.product_name,
          quantity: ti.quantity,
          notes: ti.item_notes,
        })),
      };

      let doc;
      try {
        const isBleTarget =
          (targetPrinter as any).bluetooth_transport_type === 'ble_gatt' ||
          targetPrinter.connection_type === 'bluetooth' ||
          /seznik|925/i.test(targetPrinter.name) ||
          /seznik|925/i.test((targetPrinter as any).bluetooth_device_name || '');

        doc = renderKotToEscPos(order, settings, targetedKot, {
          printer: {
            ...targetPrinter,
            transport: targetPrinter.connection_type === 'bluetooth' ? 'bluetooth' : targetPrinter.connection_type,
            isBle: isBleTarget,
          },
          isBle: isBleTarget,
          isReprint: options.isReprint,
        });
      } catch (renderErr: any) {
        const errMsg = renderErr?.message || 'Failed to render KOT ESC/POS payload';
        logAndroidPrintDiagnostic({
          job: 'KOT',
          source: options.source || (options.isReprint ? 'ORDERS_REPRINT' : options.isManual ? 'MANUAL_TRIGGER' : 'POS_AUTO'),
          printerName: targetPrinter.name,
          transport: targetPrinter.connection_type === 'bluetooth' ? 'BLE_GATT' : targetPrinter.connection_type.toUpperCase(),
          deviceId: (targetPrinter as any).bluetooth_mac_address || 'UNKNOWN',
          roleEligible: true,
          bindingFound: true,
          payloadBytes: 0,
          connection: 'SKIPPED',
          serviceDiscovery: 'SKIPPED',
          characteristic: 'SKIPPED',
          chunksSent: 0,
          result: 'FAILURE',
          errorCode: 'PAYLOAD_BUILD_FAILED',
          errorMessage: errMsg,
        });
        const failRes: DestinationPrintResult = {
          printerId: targetPrinter.id,
          printerName: targetPrinter.name,
          role: 'kot',
          connectionType: targetPrinter.connection_type,
          status: 'failed_before_write',
          bytesSent: 0,
          totalBytes: 0,
          message: errMsg,
          errorCode: 'PAYLOAD_BUILD_FAILED',
        };
        destinationResults.push(failRes);
        errors.push(`${targetPrinter.name}: ${errMsg}`);
        continue;
      }

      const res = await this.sendPayloadToPrinter(
        targetPrinter,
        doc.bytes,
        'kot',
        activePrinters,
        new Set(),
        0,
        options.source || (options.isReprint ? 'ORDERS_REPRINT' : options.isManual ? 'MANUAL_TRIGGER' : 'POS_AUTO')
      );

      res.itemCount = targetItems.length;
      res.jobId = jobId;

      if (res.status === 'success') {
        await this.markDestinationAsPrinted(jobId);
        if (kot?.id) {
          await printedKotTracker.markKotAsAutoPrinted(kot.id, kot.kitchen_notes);
        }
      } else {
        errors.push(`${targetPrinter.name}: ${res.message || res.status}`);
      }

      destinationResults.push(res);
    }

    const allSucceeded =
      destinationResults.length > 0 &&
      destinationResults.every((d) => d.status === 'success' || d.status === 'skipped_dedup');
    const hasFailures = destinationResults.some(
      (d) => d.status === 'failed_before_write' || d.status === 'not_configured' || d.status === 'not_bound'
    );
    const hasPartialOrUnknown = destinationResults.some((d) => d.status === 'partial_or_unknown');

    const summary = allSucceeded
      ? `Successfully routed KOT to ${destinationResults.length} printer(s).`
      : `KOT print completed with issues (${destinationResults.filter((d) => d.status === 'success').length}/${destinationResults.length} succeeded).`;

    return {
      success: allSucceeded,
      allSucceeded,
      hasFailures,
      hasPartialOrUnknown,
      destinations: destinationResults,
      errors,
      summary,
    };
  },

  /**
   * Unified Thermal Bill / Receipt print router for Android.
   * Handles Device Defaults, Primary Bill Printer Resolution, Fallback Routing,
   * Destination Dedup, and Partial Write Safety.
   */
  async printBill(
    order: Order,
    settings: RestaurantSettings,
    billedBy?: string,
    options: {
      isReprint?: boolean;
      isManual?: boolean;
      customPrinters?: RestaurantPrinter[];
      source?: string;
    } = {}
  ): Promise<MultiDestinationPrintResult> {
    // 1. MASTER AUTO PRINT GATE
    if (!isAutoPrintEnabled(settings) && !options.isReprint && !options.isManual) {
      return {
        success: false,
        allSucceeded: false,
        hasFailures: false,
        hasPartialOrUnknown: false,
        destinations: [],
        errors: [],
        summary: 'Auto Print is OFF. Android direct printing bypassed.',
      };
    }

    // 2. Fetch and filter active printers
    let activePrinters: RestaurantPrinter[] = [];
    if (options.customPrinters && options.customPrinters.length > 0) {
      activePrinters = options.customPrinters.filter((p) => p.is_active);
    } else {
      const restId = settings?.id || (order as any)?.restaurant_id || '';
      try {
        const all = await printerRepository.getRestaurantPrinters(restId);
        activePrinters = (all || []).filter((p) => p.is_active);
      } catch (err: any) {
        console.warn('[androidPrintRouter] Error loading printers:', err);
      }
    }

    const activeBillPrinters = activePrinters.filter(
      (p) => p.printer_role === 'bill' || p.printer_role === 'both'
    );

    if (activeBillPrinters.length === 0) {
      const err = 'No eligible Bill printer is configured on this device.';
      logAndroidPrintDiagnostic({
        job: 'BILL',
        source: options.source || 'SETTLEMENT_AUTO',
        printerName: 'NONE',
        transport: 'NONE',
        deviceId: 'NONE',
        roleEligible: false,
        bindingFound: false,
        payloadBytes: 0,
        connection: 'SKIPPED',
        serviceDiscovery: 'SKIPPED',
        characteristic: 'SKIPPED',
        chunksSent: 0,
        result: 'FAILURE',
        errorCode: 'PRINTER_NOT_CONFIGURED',
        errorMessage: err,
      });
      return {
        success: false,
        skipped: true,
        allSucceeded: false,
        hasFailures: false,
        hasPartialOrUnknown: false,
        destinations: [],
        errors: [],
        summary: err,
      };
    }

    // 3. Resolve Bill Printer in priority:
    // 1. Device-local default Bill printer -> 2. Primary Bill printer -> 3. First matching
    const deviceDefaults = await devicePrinterBindingService.getDeviceDefaults();
    const targetPrinter =
      printerRoutingService.resolvePrinterForRole(
        activeBillPrinters,
        'bill',
        deviceDefaults?.default_bill_printer_id
      ) || activeBillPrinters[0];

    // 4. Deterministic Bill Job ID
    const invoiceNum = order.invoice_number || order.order_number || 'B1';
    const jobId = `bill_${order.id}_${targetPrinter.id}_${invoiceNum}`;

    // 5. Deduplication check (bypassed on explicit reprint)
    if (!options.isReprint) {
      const alreadyPrinted = await this.hasDestinationBeenPrinted(jobId);
      if (alreadyPrinted) {
        if (__DEV__) {
          console.log(`[ANDROID AUTO PRINT] Bill ${invoiceNum} already auto-printed to ${targetPrinter.name}. Skipping dedup.`);
        }
        return {
          success: true,
          allSucceeded: true,
          hasFailures: false,
          hasPartialOrUnknown: false,
          destinations: [
            {
              printerId: targetPrinter.id,
              printerName: targetPrinter.name,
              role: 'bill',
              connectionType: targetPrinter.connection_type,
              status: 'skipped_dedup',
              bytesSent: 0,
              totalBytes: 0,
              message: 'Bill already printed to this destination.',
              jobId,
            },
          ],
          errors: [],
          summary: 'Bill already printed to this destination.',
        };
      }
    }

    // 6. Render ESC/POS Document
    let logoRasterBytes: Uint8Array | null = null;
    let paymentQrRasterBytes: Uint8Array | null = null;
    const shouldPrintLogo = Boolean(settings.print_bill_logo && settings.bill_logo_url?.trim());
    const shouldPrintQr = Boolean(settings.print_bill_payment_qr && settings.bill_payment_qr_url?.trim());
    const effectiveWidth = targetPrinter.paper_width === '58mm' ? '58mm' : '80mm';

    if (shouldPrintLogo && settings.bill_logo_url) {
      try {
        logoRasterBytes = await generateEscPosLogoRaster(settings.bill_logo_url.trim(), effectiveWidth);
      } catch (e) {
        console.warn('[androidPrintRouter] Logo rasterization failed:', e);
      }
    }

    if (shouldPrintQr && settings.bill_payment_qr_url) {
      try {
        paymentQrRasterBytes = await generateEscPosLogoRaster(
          settings.bill_payment_qr_url.trim(),
          effectiveWidth,
          { isQrCode: true }
        );
      } catch (e) {
        console.warn('[androidPrintRouter] QR rasterization failed:', e);
      }
    }

    let doc;
    try {
      const isBleTarget =
        (targetPrinter as any).bluetooth_transport_type === 'ble_gatt' ||
        targetPrinter.connection_type === 'bluetooth' ||
        /seznik|925/i.test(targetPrinter.name) ||
        /seznik|925/i.test((targetPrinter as any).bluetooth_device_name || '');

      doc = renderBillToEscPos(order, settings, billedBy || 'Staff', {
        printer: {
          ...targetPrinter,
          transport: targetPrinter.connection_type === 'bluetooth' ? 'bluetooth' : targetPrinter.connection_type,
          isBle: isBleTarget,
        },
        isBle: isBleTarget,
        logoRasterBytes,
        paymentQrRasterBytes,
      });
    } catch (renderErr: any) {
      const errMsg = renderErr?.message || 'Failed to render Bill ESC/POS payload';
      logAndroidPrintDiagnostic({
        job: 'BILL',
        source: options.source || (options.isReprint ? 'BILL_REPRINT' : options.isManual ? 'MANUAL_TRIGGER' : 'SETTLEMENT_AUTO'),
        printerName: targetPrinter.name,
        transport: targetPrinter.connection_type === 'bluetooth' ? 'BLE_GATT' : targetPrinter.connection_type.toUpperCase(),
        deviceId: (targetPrinter as any).bluetooth_mac_address || 'UNKNOWN',
        roleEligible: true,
        bindingFound: true,
        payloadBytes: 0,
        connection: 'SKIPPED',
        serviceDiscovery: 'SKIPPED',
        characteristic: 'SKIPPED',
        chunksSent: 0,
        result: 'FAILURE',
        errorCode: 'PAYLOAD_BUILD_FAILED',
        errorMessage: errMsg,
      });
      const failRes: DestinationPrintResult = {
        printerId: targetPrinter.id,
        printerName: targetPrinter.name,
        role: 'bill',
        connectionType: targetPrinter.connection_type,
        status: 'failed_before_write',
        bytesSent: 0,
        totalBytes: 0,
        message: errMsg,
        errorCode: 'PAYLOAD_BUILD_FAILED',
      };
      return {
        success: false,
        allSucceeded: false,
        hasFailures: true,
        hasPartialOrUnknown: false,
        destinations: [failRes],
        errors: [errMsg],
        summary: `Bill print failed: ${errMsg}`,
      };
    }

    // 7. Dispatch to Transport with Fallback
    const res = await this.sendPayloadToPrinter(
      targetPrinter,
      doc.bytes,
      'bill',
      activePrinters,
      new Set(),
      0,
      options.source || (options.isReprint ? 'BILL_REPRINT' : options.isManual ? 'MANUAL_TRIGGER' : 'SETTLEMENT_AUTO')
    );

    res.jobId = jobId;

    if (res.status === 'success') {
      await this.markDestinationAsPrinted(jobId);
    }

    const allSucceeded = res.status === 'success';
    const hasFailures = res.status === 'failed_before_write' || res.status === 'not_configured' || res.status === 'not_bound';
    const hasPartialOrUnknown = res.status === 'partial_or_unknown';
    const errors = res.status !== 'success' && res.status !== 'skipped_dedup' ? [res.message || res.status] : [];

    return {
      success: allSucceeded,
      allSucceeded,
      hasFailures,
      hasPartialOrUnknown,
      destinations: [res],
      errors,
      summary: allSucceeded ? `Bill printed successfully to ${targetPrinter.name}` : `Bill print failed: ${res.message}`,
    };
  },

  /**
   * Helper to format human-readable operator warning messages based on print results.
   */
  getOperatorWarningMessage(result: MultiDestinationPrintResult): string {
    if (result.hasPartialOrUnknown) {
      return (
        'Printer connection was interrupted after print data started sending.\n\n' +
        'The receipt may already have printed.\n\n' +
        'Check the physical printer before reprinting.'
      );
    }

    if (result.hasFailures) {
      const failedNames = result.destinations
        .filter((d) => d.status !== 'success' && d.status !== 'skipped_dedup')
        .map((d) => d.printerName)
        .join(', ');

      return (
        `Auto Print failed for: ${failedNames}.\n\n` +
        'No print data was sent.\n\n' +
        'Would you like to print manually using the system print dialog?'
      );
    }

    return result.summary;
  },
};
