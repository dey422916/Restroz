import { Platform } from 'react-native';
import { RestaurantSettings } from '../types';
import { webDirectPrintService } from './webDirectPrintService';

export const DEFAULT_KOT_PRINTER_NAME = 'POS80';

export interface DirectPrintOptions {
  printerName?: string;
  jobName?: string;
  paperWidthMm?: number;
  paperSize?: '80mm' | '58mm' | string;
}

export interface DirectPrintResult {
  success: boolean;
  printerName: string;
  jobName: string;
  message?: string;
}

export class DirectPrintError extends Error {
  public readonly code: 'AGENT_NOT_CONNECTED' | 'PRINTER_NOT_FOUND' | 'PRINT_FAILED' | 'PRINT_IN_PROGRESS' | 'UNSUPPORTED_PLATFORM';
  public readonly originalError?: any;

  constructor(
    message: string,
    code: 'AGENT_NOT_CONNECTED' | 'PRINTER_NOT_FOUND' | 'PRINT_FAILED' | 'PRINT_IN_PROGRESS' | 'UNSUPPORTED_PLATFORM',
    originalError?: any
  ) {
    super(message);
    this.name = 'DirectPrintError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Singleton state for duplicate protection mutex
 */
let isKotPrintingLock = false;

/**
 * Device-specific local storage helpers for KOT printer selection.
 * Keyed per restaurant ID: restroz_printer_<restaurantId>_kot
 */
export function getLocalKotPrinter(restaurantId?: string | null): string {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      if (restaurantId) {
        const perRest = window.localStorage.getItem(`restroz_printer_${restaurantId}_kot`);
        if (perRest) return perRest;
      }
      const legacyOrGlobal = window.localStorage.getItem('restroz_printer_kot');
      if (legacyOrGlobal) return legacyOrGlobal;
    }
  } catch (e) {
    console.warn('[directPrintService] Error reading local KOT printer:', e);
  }
  return '';
}

export function setLocalKotPrinter(printerName: string, restaurantId?: string | null): void {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      if (restaurantId) {
        if (printerName) {
          window.localStorage.setItem(`restroz_printer_${restaurantId}_kot`, printerName);
        } else {
          window.localStorage.removeItem(`restroz_printer_${restaurantId}_kot`);
        }
      }
      if (printerName) {
        window.localStorage.setItem('restroz_printer_kot', printerName);
      } else {
        window.localStorage.removeItem('restroz_printer_kot');
      }
    }
  } catch (e) {
    console.warn('[directPrintService] Error saving local KOT printer:', e);
  }
}

/**
 * Resolves the configured KOT printer name from device local storage or RestaurantSettings
 */
export function resolveKotPrinterName(settings?: RestaurantSettings | null, restaurantId?: string | null): string {
  const restId = restaurantId || settings?.restaurant_id || (settings as any)?.id;
  const local = getLocalKotPrinter(restId);
  if (local) return local;

  if (settings) {
    const fromSettings = (settings as any).kot_printer_name || (settings as any).thermal_printer_name;
    if (fromSettings) return fromSettings;
  }
  return '';
}

/**
 * Resolves the configured Bill / Receipt printer name from RestaurantSettings or default
 */
export function resolveBillPrinterName(settings?: RestaurantSettings | null, restaurantId?: string | null): string {
  const restId = restaurantId || settings?.restaurant_id || (settings as any)?.id;
  const local = getLocalKotPrinter(restId);
  if (local) return local;

  if (!settings) return '';
  return (
    (settings as any).bill_printer_name ||
    (settings as any).receipt_printer_name ||
    (settings as any).kot_printer_name ||
    (settings as any).thermal_printer_name ||
    ''
  );
}

/**
 * Helper to check if Auto Print is enabled from RestaurantSettings
 */
export function isAutoPrintEnabled(settings?: RestaurantSettings | null): boolean {
  if (!settings) return false;
  return Boolean(
    settings.auto_print_kot ||
    (settings as any).kot_auto_print ||
    (settings as any).auto_print
  );
}

export const directPrintService = {
  /**
   * Check if a thermal print job is currently in progress
   */
  isKotPrinting(): boolean {
    return isKotPrintingLock;
  },

  /**
   * Test whether RestroZ Print Agent is active and connected
   */
  async isConnected(restaurantId?: string | null): Promise<boolean> {
    if (Platform.OS !== 'web') return false;
    try {
      if (!restaurantId) return false;
      const agent = await webDirectPrintService.getPairedAgent(restaurantId);
      return Boolean(agent && agent.status === 'online');
    } catch {
      return false;
    }
  },

  /**
   * Connect / Check Print Agent status
   */
  async connect(restaurantId?: string | null): Promise<boolean> {
    return this.isConnected(restaurantId);
  },

  /**
   * List all available local printers found by RestroZ Print Agent
   */
  async getAvailablePrinters(restaurantId?: string | null): Promise<string[]> {
    if (!restaurantId) return [];
    try {
      const agent = await webDirectPrintService.getPairedAgent(restaurantId);
      if (agent && agent.installedPrinters) {
        return agent.installedPrinters;
      }
    } catch (err) {
      console.warn('[directPrintService] Failed to list printers:', err);
    }
    return [];
  },

  /**
   * Dispatches direct thermal print job via RestroZ Print Agent
   */
  async printThermalDirect(
    html: string,
    options?: DirectPrintOptions,
    restaurantId?: string | null
  ): Promise<DirectPrintResult> {
    if (isKotPrintingLock) {
      throw new DirectPrintError(
        'A print job is already in progress. Please wait for the current job to complete.',
        'PRINT_IN_PROGRESS'
      );
    }

    isKotPrintingLock = true;
    try {
      const targetPrinterName = options?.printerName || 'POS80';
      const jobName = options?.jobName || 'Thermal Receipt';
      const paperSize = (options?.paperSize === '58mm' ? '58mm' : '80mm') as '58mm' | '80mm';

      // Find configured agent printer or paired agent
      let agent = restaurantId ? await webDirectPrintService.getPairedAgent(restaurantId) : null;
      if (!agent) {
        throw new DirectPrintError(
          'RestroZ Print Agent is not paired or offline. Please pair Print Agent in Settings.',
          'AGENT_NOT_CONNECTED'
        );
      }

      const configuredPrinter = {
        id: `agent_${agent.id}_${targetPrinterName}`,
        name: targetPrinterName,
        transport: 'agent' as const,
        agentId: agent.id,
        windowsQueueName: targetPrinterName,
        paperWidth: paperSize,
        role: 'both' as const,
        status: 'connected' as const,
      };

      const result = await webDirectPrintService.printTest(configuredPrinter);

      return {
        success: result.success,
        printerName: result.printerName,
        jobName,
        message: result.message,
      };
    } catch (err: any) {
      if (err instanceof DirectPrintError) throw err;
      throw new DirectPrintError(err?.message || 'Failed to print via Print Agent', 'PRINT_FAILED', err);
    } finally {
      isKotPrintingLock = false;
    }
  },

  async printKotDirect(html: string, options?: DirectPrintOptions, restaurantId?: string | null): Promise<DirectPrintResult> {
    return this.printThermalDirect(html, { ...options, jobName: options?.jobName || 'KOT Ticket' }, restaurantId);
  },
};
