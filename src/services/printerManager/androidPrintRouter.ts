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
import { tcpTransport } from './transports/tcpTransport';
import { bluetoothTransport } from './transports/bluetoothTransport';
import { usbTransport } from './transports/usbTransport';
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
}

export interface MultiDestinationPrintResult {
  success: boolean;
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
    depth: number = 0
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
    };

    if (printer.connection_type === 'lan' || printer.connection_type === 'wifi') {
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
      const address = binding?.bluetooth_mac_address;
      if (!address) {
        transportRes = {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: bytes.length,
          message: `Bluetooth printer "${printer.name}" is not bound on this device. Select Bluetooth device in Settings.`,
          durationMs: 0,
        };
      } else {
        transportRes = await bluetoothTransport.sendPayload(
          {
            address,
            name: binding.bluetooth_device_name || printer.bluetooth_device_name || undefined,
          },
          bytes,
          printer.id
        );
      }
    } else if (printer.connection_type === 'usb') {
      const binding = await devicePrinterBindingService.getDeviceBinding(printer.id);
      const vendorId = binding?.usb_vendor_id;
      const productId = binding?.usb_product_id;
      if (vendorId === undefined || vendorId === null || productId === undefined || productId === null) {
        transportRes = {
          success: false,
          status: 'not_bound',
          bytesSent: 0,
          totalBytes: bytes.length,
          message: `USB printer "${printer.name}" is not bound on this device. Select USB device in Settings.`,
          durationMs: 0,
        };
      } else {
        transportRes = await usbTransport.sendPayload(
          {
            vendorId,
            productId,
            serialNumber: binding?.usb_serial_number || undefined,
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
      };
    }

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
            depth + 1
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
      retryPrinterIds?: string[];
      customPrinters?: RestaurantPrinter[];
    } = {}
  ): Promise<MultiDestinationPrintResult> {
    // 1. MASTER AUTO PRINT GATE (Absolute First Step)
    if (!isAutoPrintEnabled(settings) && !options.isReprint) {
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
      const restId = settings.id || order.restaurant_id || '';
      if (restId) {
        try {
          const all = await printerRepository.getRestaurantPrinters(restId);
          activePrinters = (all || []).filter((p) => p.is_active);
        } catch (err: any) {
          console.warn('[androidPrintRouter] Error loading printers from DB:', err);
        }
      }
    }

    const activeKotPrinters = activePrinters.filter(
      (p) => p.printer_role === 'kot' || p.printer_role === 'both'
    );

    if (activeKotPrinters.length === 0) {
      const err = 'NO_PRINTER_CONFIGURED: No active KOT printer found.';
      return {
        success: false,
        allSucceeded: false,
        hasFailures: true,
        hasPartialOrUnknown: false,
        destinations: [
          {
            printerId: 'none',
            printerName: 'Unconfigured KOT Printer',
            role: 'kot',
            status: 'not_configured',
            bytesSent: 0,
            totalBytes: 0,
            message: 'No active thermal printer configured for KOT. Configure in Settings.',
          },
        ],
        errors: [err],
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

      const doc = renderKotToEscPos(order, settings, targetedKot, {
        printer: targetPrinter,
        isReprint: options.isReprint,
      });

      const res = await this.sendPayloadToPrinter(
        targetPrinter,
        doc.bytes,
        'kot',
        activePrinters
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
      customPrinters?: RestaurantPrinter[];
    } = {}
  ): Promise<MultiDestinationPrintResult> {
    // 1. MASTER AUTO PRINT GATE
    if (!isAutoPrintEnabled(settings) && !options.isReprint) {
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
      const restId = settings.id || order.restaurant_id || '';
      if (restId) {
        try {
          const all = await printerRepository.getRestaurantPrinters(restId);
          activePrinters = (all || []).filter((p) => p.is_active);
        } catch (err: any) {
          console.warn('[androidPrintRouter] Error loading printers from DB:', err);
        }
      }
    }

    const activeBillPrinters = activePrinters.filter(
      (p) => p.printer_role === 'bill' || p.printer_role === 'both'
    );

    if (activeBillPrinters.length === 0) {
      const err = 'NO_PRINTER_CONFIGURED: No active Bill printer found.';
      return {
        success: false,
        allSucceeded: false,
        hasFailures: true,
        hasPartialOrUnknown: false,
        destinations: [
          {
            printerId: 'none',
            printerName: 'Unconfigured Bill Printer',
            role: 'bill',
            status: 'not_configured',
            bytesSent: 0,
            totalBytes: 0,
            message: 'No active thermal printer configured for Bill. Configure in Settings.',
          },
        ],
        errors: [err],
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
    const doc = renderBillToEscPos(order, settings, billedBy || 'Staff', {
      printer: targetPrinter,
    });

    // 7. Dispatch to Transport with Fallback
    const res = await this.sendPayloadToPrinter(
      targetPrinter,
      doc.bytes,
      'bill',
      activePrinters
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
