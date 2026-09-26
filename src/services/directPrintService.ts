import { Platform } from 'react-native';
import { RestaurantSettings } from '../types';

export const DEFAULT_KOT_PRINTER_NAME = 'POS80';

export interface DirectPrintOptions {
  printerName?: string;
  jobName?: string;
  paperWidthMm?: number;
}

export interface DirectPrintResult {
  success: boolean;
  printerName: string;
  jobName: string;
  message?: string;
}

export class DirectPrintError extends Error {
  public readonly code: 'QZ_NOT_CONNECTED' | 'PRINTER_NOT_FOUND' | 'PRINT_FAILED' | 'PRINT_IN_PROGRESS' | 'UNSUPPORTED_PLATFORM';
  public readonly originalError?: any;

  constructor(
    message: string,
    code: 'QZ_NOT_CONNECTED' | 'PRINTER_NOT_FOUND' | 'PRINT_FAILED' | 'PRINT_IN_PROGRESS' | 'UNSUPPORTED_PLATFORM',
    originalError?: any
  ) {
    super(message);
    this.name = 'DirectPrintError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Singleton state for QZ Tray instance and duplicate protection mutex
 */
let qzModuleCache: any = null;
let isKotPrintingLock = false;

/**
 * Helper to dynamically load qz-tray without breaking native builds
 */
async function getQzInstance(): Promise<any> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    throw new DirectPrintError(
      'Direct QZ Tray printing is only supported in desktop browser environments.',
      'UNSUPPORTED_PLATFORM'
    );
  }

  if (qzModuleCache) {
    return qzModuleCache;
  }

  try {
    const qz = await import('qz-tray');
    qzModuleCache = (qz as any).default || qz;
    return qzModuleCache;
  } catch (err) {
    console.error('[directPrintService] Failed to load qz-tray module:', err);
    throw new DirectPrintError(
      'Unable to load QZ Tray printing module in browser.',
      'QZ_NOT_CONNECTED',
      err
    );
  }
}

/**
 * Connects to QZ Tray if not already connected
 */
async function ensureConnection(): Promise<any> {
  const qz = await getQzInstance();

  if (qz.websocket && qz.websocket.isActive()) {
    return qz;
  }

  try {
    await qz.websocket.connect({
      retries: 2,
      delay: 1,
      keepAlive: 60,
    });
    return qz;
  } catch (connErr: any) {
    console.warn('[directPrintService] QZ Tray connection failed:', connErr);
    throw new DirectPrintError(
      'Unable to connect to QZ Tray. Please ensure QZ Tray is running on your computer.',
      'QZ_NOT_CONNECTED',
      connErr
    );
  }
}

/**
 * Resolves the configured printer name from RestaurantSettings or default
 */
export function resolveKotPrinterName(settings?: RestaurantSettings | null): string {
  if (!settings) return DEFAULT_KOT_PRINTER_NAME;
  return (
    (settings as any).kot_printer_name ||
    (settings as any).thermal_printer_name ||
    DEFAULT_KOT_PRINTER_NAME
  );
}

/**
 * Locates the target thermal printer on the local machine
 */
async function locatePrinter(qz: any, targetName: string): Promise<string> {
  const trimmed = targetName.trim();

  // 1. Try finding by exact / regex query
  try {
    const found = await qz.printers.find(trimmed);
    if (found) {
      if (typeof found === 'string') return found;
      if (Array.isArray(found) && found.length > 0) return found[0];
    }
  } catch (findErr) {
    // Continue to fuzzy search across printer list
  }

  // 2. Fuzzy search across all installed printers
  try {
    const allPrinters: string[] = await qz.printers.find();
    if (allPrinters && allPrinters.length > 0) {
      const normalizedTarget = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Check if target name matches any printer
      const directMatch = allPrinters.find((p) => {
        const norm = p.toLowerCase().replace(/[^a-z0-9]/g, '');
        return norm.includes(normalizedTarget) || normalizedTarget.includes(norm);
      });
      if (directMatch) return directMatch;

      // Check common thermal printer names (POS80, POS-80, Thermal, 80mm)
      const thermalMatch = allPrinters.find((p) => {
        const low = p.toLowerCase();
        return (
          low.includes('pos80') ||
          low.includes('pos-80') ||
          low.includes('pos 80') ||
          low.includes('pos_80') ||
          low.includes('thermal') ||
          low.includes('receipt') ||
          low.includes('80mm')
        );
      });
      if (thermalMatch) return thermalMatch;

      // Fallback: check default system printer
      const defaultPrinter = await qz.printers.getDefault();
      if (defaultPrinter) return defaultPrinter;
    }
  } catch (listErr) {
    console.warn('[directPrintService] Error querying printer list:', listErr);
  }

  throw new DirectPrintError(
    `Unable to locate printer "${trimmed}". Check that your thermal printer is turned on and connected.`,
    'PRINTER_NOT_FOUND'
  );
}

export const directPrintService = {
  /**
   * Check if a KOT print job is currently in progress
   */
  isKotPrinting(): boolean {
    return isKotPrintingLock;
  },

  /**
   * Test whether QZ Tray is active and connected
   */
  async isConnected(): Promise<boolean> {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    try {
      const qz = await getQzInstance();
      return qz.websocket && qz.websocket.isActive();
    } catch {
      return false;
    }
  },

  /**
   * Connect to QZ Tray manually if needed
   */
  async connect(): Promise<boolean> {
    try {
      await ensureConnection();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * List all available local printers found by QZ Tray
   */
  async getAvailablePrinters(): Promise<string[]> {
    const qz = await ensureConnection();
    try {
      const printers = await qz.printers.find();
      if (Array.isArray(printers)) return printers;
      if (typeof printers === 'string') return [printers];
      return [];
    } catch (err) {
      console.warn('[directPrintService] Failed to list printers:', err);
      return [];
    }
  },

  /**
   * Sends KOT HTML directly to the configured POS80 thermal printer via QZ Tray.
   * Includes duplicate protection mutex and strict error handling.
   */
  async printKotDirect(html: string, options?: DirectPrintOptions): Promise<DirectPrintResult> {
    // 1. Duplicate Protection Check
    if (isKotPrintingLock) {
      throw new DirectPrintError(
        'A KOT print job is already in progress. Please wait for the current job to complete.',
        'PRINT_IN_PROGRESS'
      );
    }

    isKotPrintingLock = true;

    try {
      // 2. Connect to QZ Tray
      const qz = await ensureConnection();

      // 3. Locate configured POS80 printer
      const targetPrinterName = options?.printerName || DEFAULT_KOT_PRINTER_NAME;
      const matchedPrinter = await locatePrinter(qz, targetPrinterName);

      const jobName = options?.jobName || 'KOT Ticket';

      // 4. Create QZ Tray configuration for 80mm thermal receipt
      // margins: 0 and rasterize: true ensures HTML @page CSS layout renders 1:1 identically to browser print
      const config = qz.configs.create(matchedPrinter, {
        margins: 0,
        units: 'mm',
        colorType: 'color',
        scaleContent: false,
        rasterize: true,
        jobName,
      });

      // 5. Build print data payload
      const printData = [
        {
          type: 'pixel',
          format: 'html',
          flavor: 'plain',
          data: html,
        },
      ];

      // 6. Send print job directly to printer
      await qz.print(config, printData);

      return {
        success: true,
        printerName: matchedPrinter,
        jobName,
        message: 'KOT printed successfully',
      };
    } catch (err: any) {
      if (err instanceof DirectPrintError) {
        throw err;
      }
      console.error('[directPrintService] printKotDirect error:', err);
      throw new DirectPrintError(
        err?.message || 'Failed to send print job to thermal printer.',
        'PRINT_FAILED',
        err
      );
    } finally {
      // Release lock after print job dispatched
      isKotPrintingLock = false;
    }
  },
};
