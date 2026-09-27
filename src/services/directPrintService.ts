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
 * Official QZ Tray Demo Digital Certificate (CN=QZ Tray Demo Cert, O=QZ Industries, LLC).
 * SHA-1 Fingerprint: 37689c0f897400076109cefc4092adcac861a057
 * Permanently Allowed in QZ Tray Site Manager.
 */
export const QZ_TRAY_DEMO_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIEMDCCAxigAwIBAgIGAaDhzufpMA0GCSqGSIb3DQEBCwUAMIGiMQswCQYDVQQG
EwJVUzELMAkGA1UECAwCTlkxEjAQBgNVBAcMCUNhbmFzdG90YTEbMBkGA1UECgwS
UVogSW5kdXN0cmllcywgTExDMRswGQYDVQQLDBJRWiBJbmR1c3RyaWVzLCBMTEMx
HDAaBgkqhkiG9w0BCQEWDXN1cHBvcnRAcXouaW8xGjAYBgNVBAMMEVFaIFRyYXkg
RGVtbyBDZXJ0MB4XDTI2MDkyNjA3NDAyOFoXDTQ2MDkyNjA3NDAyOFowgaIxCzAJ
BgNVBAYTAlVTMQswCQYDVQQIDAJOWTESMBAGA1UEBwwJQ2FuYXN0b3RhMRswGQYD
VQQKDBJRWiBJbmR1c3RyaWVzLCBMTEMxGzAZBgNVBAsMElFaIEluZHVzdHJpZXMs
IExMQzEcMBoGCSqGSIb3DQEJARYNc3VwcG9ydEBxei5pbzEaMBgGA1UEAwwRUVog
VHJheSBEZW1vIENlcnQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDd
t/IH0/gKssnfv345xR19zhiU4kKvmJ8vid4gUPjZdostPGAF8UmfBqlp6Io6P8jT
eOUOzC3HsRzGV/2rX5T2bAdxceFI8admgo2+sBmtWyZ1kyuOmGB4VWIHAzyXIcIg
sj8iB9NAJedV3ASqlLvuOD7b/IWmKKpaAo79tloycNFUJ8JxqlcqwO0TLLcR2o4B
lecVe/Q7qQU75au1HLX5bs71UUvdDAWSijMW7qTRYTHaUnx6dy6MHsjE2dVD/gOJ
r49n1r3Tt8eal5KBjslLeIGuKbG/upfY+jNYFbmT1zY1GfqYQgmMNUj0SpnRcYUQ
3yGX6tEDNpgp0eXaSSz/AgMBAAGjajBoMBIGA1UdEwEB/wQIMAYBAf8CAQEwDgYD
VR0PAQH/BAQDAgEGMB0GA1UdDgQWBBTeJfCcjGwjifz2NVt5nrqwjgx3XzAjBgNV
HR4BAf8EGTAXoBUwE4IRUVogVHJheSBEZW1vIENlcnQwDQYJKoZIhvcNAQELBQAD
ggEBAJHyCSpgjXqCFUS0UF6Hy1/M/GJL0orZ6SOxMTinE/0VfzER8d+DLSXYj+W+
s8bzsJ0pIcK26AeFbW0xgT6rucxFBaMPKDOw9jw7lVlUYaqqr5kaY6U15FpxsGa2
By2bQoFG3u19IkhwBxeFq7He3xk1S87c24G0bQ36oEOmyYBanAROf8CXRj9fL4T0
0bWG1HaUrIryJDGTlg0L4SBR2IGz0Lne6Pnt647AdFkAPwgCzNZe099DjfacoZpa
rdbqM5WL1Q4saBf51ES4RuCEODT5TAaOP2IUnyw458xNHIn/3pnnlaJ//3k8X8Ex
7wlv8qrnwZlKBUIM7JrxwmcKDbo=
-----END CERTIFICATE-----`;

export const RESTROZ_PUBLIC_CERTIFICATE = QZ_TRAY_DEMO_CERTIFICATE;

/**
 * Checks whether the application is running in development mode
 */
function isDevEnvironment(): boolean {
  return (typeof __DEV__ !== 'undefined' && Boolean(__DEV__)) || process.env.NODE_ENV === 'development';
}

/**
 * Safe non-sensitive certificate logging for DEV diagnostics
 */
function logCertificateDiagnostic(certText: string): void {
  if (!isDevEnvironment()) return;
  const hasBegin = certText.includes('-----BEGIN CERTIFICATE-----');
  const hasEnd = certText.includes('-----END CERTIFICATE-----');
  console.log('[QZ SECURITY DIAGNOSTIC]', {
    certificatePresent: Boolean(certText),
    beginCertificatePresent: hasBegin,
    endCertificatePresent: hasEnd,
    certificateLength: certText.length,
    commonName: 'QZ Tray Demo Cert',
    organization: 'QZ Industries, LLC',
    expectedSha1Fingerprint: '37689c0f897400076109cefc4092adcac861a057',
  });
}

/**
 * Resolves the server-side signing endpoint URL.
 * In production: calls Supabase Edge Function `/functions/v1/sign-qz-tray` or configured `EXPO_PUBLIC_QZ_SIGN_ENDPOINT`.
 * In development: falls back to local dev signing server http://localhost:8183.
 */
export function resolveSigningEndpoint(): string {
  if (isDevEnvironment()) {
    return 'http://localhost:8183';
  }
  if (process.env.EXPO_PUBLIC_QZ_SIGN_ENDPOINT) {
    return process.env.EXPO_PUBLIC_QZ_SIGN_ENDPOINT;
  }
  const baseUrl = SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  if (baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}/functions/v1/sign-qz-tray`;
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
 * Configures QZ Tray certificatePromise and signaturePromise BEFORE websocket connection
 */
function setupQzSecurity(qz: any): void {
  if (isSecurityConfigured) return;

  // 1. Certificate Promise: Delivers verified QZ certificate to QZ Tray
  qz.security.setCertificatePromise((resolve: (cert: string) => void, reject: (err: any) => void) => {
    if (isDevEnvironment()) {
      // In DEV: Fetch active certificate from local signer (GET http://localhost:8183) with fallback to embedded QZ_TRAY_DEMO_CERTIFICATE
      fetch('http://localhost:8183', { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Local dev signer returned HTTP ${response.status}`);
          }
          const cert = (await response.text()).trim();
          if (cert.includes('-----BEGIN CERTIFICATE-----') && cert.includes('-----END CERTIFICATE-----')) {
            logCertificateDiagnostic(cert);
            resolve(cert);
            return;
          }
          throw new Error('Invalid certificate returned from local dev signer');
        })
        .catch((fetchErr) => {
          console.warn('[directPrintService] Could not reach http://localhost:8183 for cert, using embedded Demo Cert:', fetchErr.message);
          if (QZ_TRAY_DEMO_CERTIFICATE.includes('-----BEGIN CERTIFICATE-----')) {
            logCertificateDiagnostic(QZ_TRAY_DEMO_CERTIFICATE);
            resolve(QZ_TRAY_DEMO_CERTIFICATE.trim());
          } else {
            reject(new Error('QZ DEV certificate could not be loaded'));
          }
        });
    } else {
      const cert = (process.env.EXPO_PUBLIC_QZ_CERTIFICATE || RESTROZ_PUBLIC_CERTIFICATE || QZ_TRAY_DEMO_CERTIFICATE).trim();
      resolve(cert);
    }
  });

  // 2. Signature Algorithm: SHA512 (Official standard)
  qz.security.setSignatureAlgorithm('SHA512');

  // 3. Signature Promise: Dispatches to secure server-side signing endpoint
  qz.security.setSignaturePromise((toSign: string) => {
    return async (resolve: (sig: string) => void, reject: (err: any) => void) => {
      // In DEV environment: send directly to http://localhost:8183 without exposing private keys
      if (isDevEnvironment()) {
        try {
          const response = await fetch('http://localhost:8183', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request: toSign }),
          });
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`DEV signing server returned HTTP ${response.status}: ${errText}`);
          }
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await response.json();
            if (data.signature) {
              resolve(data.signature);
              return;
            }
          }
          const rawSig = await response.text();
          resolve(rawSig.trim());
        } catch (devErr: any) {
          console.error('[directPrintService] DEV QZ signature request failed:', devErr);
          reject(devErr);
        }
        return;
      }

      // Production Signing Endpoint
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

      try {
        const response = await fetch(signingUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(anonKey ? { apikey: anonKey } : {}),
            Authorization: authHeaderValue,
          },
          body: JSON.stringify({ request: toSign }),
        });

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
      } catch (err: any) {
        console.error('[directPrintService] QZ signature request failed:', err);
        reject(err);
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
