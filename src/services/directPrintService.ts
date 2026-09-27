import { Platform } from 'react-native';
import { RestaurantSettings } from '../types';
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

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
 * Public X.509 Digital Certificate for RestroZ POS Printing System.
 * Note: Digital certificates contain ONLY the public key and identity metadata (Common Name: RestroZ POS, Organization: RestroZ Technologies).
 * It is completely safe to distribute in frontend bundles.
 */
export const RESTROZ_PUBLIC_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDoTCCAomgAwIBAgIUOBiazfCjA53dg+oaFSyDyRZcQXYwDQYJKoZIhvcNAQEL
BQAwYDEUMBIGA1UEAwwLUmVzdHJvWiBQT1MxHTAbBgNVBAoMFFJlc3Ryb1ogVGVj
aG5vbG9naWVzMRwwGgYDVQQLDBNQT1MgUHJpbnRpbmcgU3lzdGVtMQswCQYDVQQG
EwJJTjAeFw0yNjA5MjYyMzIzMjVaFw0zNjA5MjMyMzIzMjVaMGAxFDASBgNVBAMM
C1Jlc3Ryb1ogUE9TMR0wGwYDVQQKDBRSZXN0cm9aIFRlY2hub2xvZ2llczEcMBoG
A1UECwwTUE9TIFByaW50aW5nIFN5c3RlbTELMAkGA1UEBhMCSU4wggEiMA0GCSqG
SIb3DQEBAQUAA4IBDwAwggEKAoIBAQDnCWo/jjz2odnstyP7VEDrr1RjiIgTYDZF
cExo1W1nT7VBr/AmT+dMAnmRtPIF1s2pQnyWlaBp1wAWuwdr9e7I9QEq3XHZBqDp
gzxFXxKNptMN04uKG+RCAgZ5HyZGPyqXR8ksT4hDZ6/8ORxc29y7kkTPr2U/jxHX
YWOzQdsLbfYOxYpwdwAHw0fwNOm3UAwZuKJConqhOLj7oXj5OiCfCHUQK104Gdiy
ft1x0mWq59EEK/+/m3hidRTm7k4XHsXAwXh251Sl1LMeWDwoBggK+ZznRspF39NT
lxud5+s+u7H25JrUk36lkkDlGCYgMQnETx6rLNc7H6lapLM18PTLAgMBAAGjUzBR
MB0GA1UdDgQWBBR2TY1deR8hXuukLzTlYmR+3O87sDAfBgNVHSMEGDAWgBR2TY1d
eR8hXuukLzTlYmR+3O87sDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA
A4IBAQAJFif4qzMNkKAvDlbRIAmdHnZo6g2tK4rnJ+6PzSJ2brhk0nL5DW67RkPw
ugz0CGENf7LcnZBFtlAR+urABil4Ur/KgmbiUurHlvZcxj3bsMYslBfxZbpXrwkk
FrGfJMS8Mc/xvfQbrsHRYWQ3+TbAAdmRkvh5RMKa951gBYeniwIz1IagN7EkEhME
bSIP91mmRuLch4fTwwmH1hNJ0YR6kY5lTEMQPRP1qh2+CZxXdNaOBJw/B6KI/ziA
ONeto3C/FEx656ChdLlbM2luU2peQskDkivkH6IhyW4wqIFvoy1oxcTGWK077/fa
GXZZ7xhCVM0mse4TVg7c2KX6mUBP
-----END CERTIFICATE-----`;

/**
 * Checks whether the application is running in development mode
 */
function isDevEnvironment(): boolean {
  return (typeof __DEV__ !== 'undefined' && Boolean(__DEV__)) || process.env.NODE_ENV === 'development';
}

/**
 * Resolves the server-side signing endpoint URL.
 * In production: calls Supabase Edge Function `/functions/v1/sign-qz-tray` or configured `EXPO_PUBLIC_QZ_SIGN_ENDPOINT`.
 * In development: falls back to local dev signing server if configured.
 */
export function resolveSigningEndpoint(): string {
  if (process.env.EXPO_PUBLIC_QZ_SIGN_ENDPOINT) {
    return process.env.EXPO_PUBLIC_QZ_SIGN_ENDPOINT;
  }
  const baseUrl = SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}/functions/v1/sign-qz-tray`;
  }
  if (isDevEnvironment()) {
    return 'http://localhost:8183';
  }
  throw new Error('[directPrintService] Supabase URL is not configured for production QZ signing.');
}

/**
 * Singleton state for QZ Tray instance and duplicate protection mutex
 */
let qzModuleCache: any = null;
let isKotPrintingLock = false;
let isSecurityConfigured = false;

/**
 * Configures QZ Tray certificatePromise and signaturePromise
 */
function setupQzSecurity(qz: any): void {
  if (isSecurityConfigured) return;

  // 1. Certificate Promise: Delivers public certificate to QZ Tray
  qz.security.setCertificatePromise((resolve: (cert: string) => void) => {
    const cert = process.env.EXPO_PUBLIC_QZ_CERTIFICATE || RESTROZ_PUBLIC_CERTIFICATE;
    resolve(cert);
  });

  // 2. Signature Algorithm: SHA512 (Official standard)
  qz.security.setSignatureAlgorithm('SHA512');

  // 3. Signature Promise: Dispatches to secure server-side signing endpoint
  qz.security.setSignaturePromise((toSign: string) => {
    return async (resolve: (sig: string) => void, reject: (err: any) => void) => {
      const signingUrl = resolveSigningEndpoint();
      const anonKey = SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

      // Retrieve active user authentication session token if available
      let authHeaderValue = `Bearer ${anonKey}`;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          authHeaderValue = `Bearer ${sessionData.session.access_token}`;
        }
      } catch (authErr) {
        console.warn('[directPrintService] Could not retrieve session for signing:', authErr);
      }

      const performRemoteSigning = () => {
        fetch(signingUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(anonKey ? { apikey: anonKey } : {}),
            Authorization: authHeaderValue,
          },
          body: JSON.stringify({ request: toSign }),
        })
          .then(async (response) => {
            if (!response.ok) {
              const errText = await response.text();
              throw new Error(`Signing server returned HTTP ${response.status}: ${errText}`);
            }
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const data = await response.json();
              if (data.signature) {
                resolve(data.signature);
                return;
              }
            }
            const rawText = await response.text();
            resolve(rawText.trim());
          })
          .catch((err) => {
            if (isDevEnvironment() && signingUrl !== 'http://localhost:8183') {
              // Development fallback to local signer
              fetch('http://localhost:8183', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request: toSign }),
              })
                .then((res) => res.json())
                .then((d) => resolve(d.signature))
                .catch(() => {
                  console.error('[directPrintService] QZ signature request failed on both remote and local:', err);
                  reject(err);
                });
            } else {
              console.error('[directPrintService] QZ signature request failed:', err);
              reject(err);
            }
          });
      };

      // In dev environment, if local signer is running on 8183, try it directly for instant signing
      if (isDevEnvironment()) {
        fetch('http://localhost:8183', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request: toSign }),
        })
          .then((res) => res.json())
          .then((d) => {
            if (d && d.signature) {
              resolve(d.signature);
            } else {
              performRemoteSigning();
            }
          })
          .catch(() => {
            performRemoteSigning();
          });
      } else {
        performRemoteSigning();
      }
    };
  });

  isSecurityConfigured = true;
}

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
 * Connects to QZ Tray if not already connected and initializes security callbacks
 */
async function ensureConnection(): Promise<any> {
  const qz = await getQzInstance();

  // Ensure certificate and signature promises are configured before connecting
  setupQzSecurity(qz);

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
 * Resolves the configured KOT printer name from RestaurantSettings or default
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
 * Resolves the configured Bill / Receipt printer name from RestaurantSettings or default
 */
export function resolveBillPrinterName(settings?: RestaurantSettings | null): string {
  if (!settings) return DEFAULT_KOT_PRINTER_NAME;
  return (
    (settings as any).bill_printer_name ||
    (settings as any).receipt_printer_name ||
    (settings as any).kot_printer_name ||
    (settings as any).thermal_printer_name ||
    DEFAULT_KOT_PRINTER_NAME
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

      // Check common thermal printer names (POS80, POS-80, Thermal, 80mm, 58mm)
      const thermalMatch = allPrinters.find((p) => {
        const low = p.toLowerCase();
        return (
          low.includes('pos80') ||
          low.includes('pos-80') ||
          low.includes('pos 80') ||
          low.includes('pos_80') ||
          low.includes('pos58') ||
          low.includes('pos-58') ||
          low.includes('pos 58') ||
          low.includes('thermal') ||
          low.includes('receipt') ||
          low.includes('80mm') ||
          low.includes('58mm')
        );
      });
      if (thermalMatch) return thermalMatch;
    }
  } catch (listErr) {
    console.warn('[directPrintService] Error querying printer list:', listErr);
  }

  throw new DirectPrintError(
    `Unable to locate configured thermal printer "${trimmed}". Please check that your printer is turned on and connected.`,
    'PRINTER_NOT_FOUND'
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
   * Sends thermal HTML (KOT / Bill / Receipt) directly to the configured thermal printer via QZ Tray.
   * Includes duplicate protection mutex and strict error handling.
   */
  async printThermalDirect(html: string, options?: DirectPrintOptions): Promise<DirectPrintResult> {
    // 1. Duplicate Protection Check
    if (isKotPrintingLock) {
      throw new DirectPrintError(
        'A print job is already in progress. Please wait for the current job to complete.',
        'PRINT_IN_PROGRESS'
      );
    }

    isKotPrintingLock = true;

    try {
      // 2. Connect to QZ Tray (with certificate and signature setup)
      const qz = await ensureConnection();

      // 3. Locate configured POS80 / thermal printer
      const targetPrinterName = options?.printerName || DEFAULT_KOT_PRINTER_NAME;
      const matchedPrinter = await locatePrinter(qz, targetPrinterName);

      const jobName = options?.jobName || 'Thermal Receipt';
      const is58 = options?.paperSize === '58mm' || (options?.paperWidthMm && options.paperWidthMm < 65);
      const paperWidthInches = is58 ? 2.2835 : (options?.paperWidthMm ? options.paperWidthMm / 25.4 : 3.1496);

      // 4. Create QZ Tray configuration for 80mm / 58mm thermal receipt
      const config = qz.configs.create(matchedPrinter, {
        size: { width: paperWidthInches },
        units: 'in',
        margins: 0,
        colorType: 'color',
        scaleContent: false,
        rasterize: false,
        density: 203,
        jobName,
      });

      // 5. Build print data payload with explicit HTML rendering pageWidth
      const printData = [
        {
          type: 'pixel',
          format: 'html',
          flavor: 'plain',
          data: html,
          options: {
            pageWidth: paperWidthInches,
          },
        },
      ];

      // Diagnostic logging in development (non-sensitive only)
      if (isDevEnvironment()) {
        console.log('[directPrintService] QZ Print Diagnostic:', {
          matchedPrinter,
          jobName,
          paperWidthInches,
          config: {
            units: 'in',
            size: { width: paperWidthInches },
            density: 203,
            scaleContent: false,
            rasterize: false,
          },
          data: {
            type: 'pixel',
            format: 'html',
            flavor: 'plain',
            options: {
              pageWidth: paperWidthInches,
              pageHeight: 'auto',
            },
          },
        });
      }

      // 6. Send print job directly to printer
      await qz.print(config, printData);

      return {
        success: true,
        printerName: matchedPrinter,
        jobName,
        message: 'Thermal print job sent successfully',
      };
    } catch (err: any) {
      if (err instanceof DirectPrintError) {
        throw err;
      }
      console.error('[directPrintService] printThermalDirect error:', err);
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

  /**
   * Sends KOT HTML directly to the configured POS80 thermal printer via QZ Tray.
   */
  async printKotDirect(html: string, options?: DirectPrintOptions): Promise<DirectPrintResult> {
    return this.printThermalDirect(html, {
      ...options,
      jobName: options?.jobName || 'KOT Ticket',
    });
  },
};
