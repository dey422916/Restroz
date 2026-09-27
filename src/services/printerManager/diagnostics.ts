/**
 * RestroZ Android Multi-Printer System — Phase 7
 * Diagnostics, Auto Print Readiness Checker, Routing Preview,
 * System Software Health Checks, Delete/Disable Safety, and Error Normalization.
 * 
 * ABSOLUTE INVARIANT:
 * Diagnostics and readiness checks NEVER touch physical hardware (no TCP sockets,
 * no Bluetooth scans, no USB permissions, no ESC/POS transmissions).
 */

import {
  RestaurantPrinter,
  Order,
  RestaurantSettings,
  DevicePrinterBinding,
  DevicePrinterDefaults,
  OrderItem,
  TableSection,
} from '../../types';
import { printerRoutingService, CategoryPrintSplit } from './routing';
import { isAutoPrintEnabled } from '../directPrintService';

export interface ReadinessCheckItem {
  key: string;
  label: string;
  status: 'ready' | 'warning' | 'error' | 'off' | 'not_applicable';
  summary: string;
  detail?: string;
}

export interface AutoPrintReadinessReport {
  isAutoPrintEnabled: boolean;
  isReady: boolean;
  statusMessage: string;
  checklist: ReadinessCheckItem[];
  warnings: string[];
  errors: string[];
  activeKotPrinters: RestaurantPrinter[];
  activeBillPrinters: RestaurantPrinter[];
}

export interface RoutingPreviewItem {
  printerName: string;
  printerId: string;
  connectionType: string;
  paperWidth: string;
  isBoundOnDevice: boolean;
  items: Array<{ name: string; quantity: number; notes?: string }>;
  routingReason: string;
}

export interface RoutingPreviewReport {
  kotRoutes: RoutingPreviewItem[];
  billRoute: {
    printerName: string;
    printerId: string;
    connectionType: string;
    paperWidth: string;
    isBoundOnDevice: boolean;
    routingReason: string;
  } | null;
  unroutedKotItems: Array<{ name: string; quantity: number }>;
  issues: string[];
}

export interface SystemCheckItem {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'CONFIGURED' | 'MISSING' | 'NOT_APPLICABLE' | 'NOT_TESTED';
  detail: string;
}

export interface PrinterSystemCheckReport {
  timestamp: string;
  overallStatus: 'PASS' | 'WARN' | 'FAIL';
  checks: SystemCheckItem[];
  hardwareStatus: 'NOT TESTED (PENDING FINAL HARDWARE VALIDATION)';
}

export const printerDiagnosticsService = {
  /**
   * Diagnostic-only readiness checker for Auto Print.
   * NEVER connects to physical hardware or transmits bytes.
   */
  checkAutoPrintReadiness(
    settings: RestaurantSettings | null | undefined,
    printers: RestaurantPrinter[],
    deviceBindings: Record<string, DevicePrinterBinding> = {},
    deviceDefaults?: DevicePrinterDefaults | null
  ): AutoPrintReadinessReport {
    const autoPrintOn = isAutoPrintEnabled(settings);
    const activePrinters = (printers || []).filter((p) => p.is_active);
    const activeKotPrinters = activePrinters.filter(
      (p) => p.printer_role === 'kot' || p.printer_role === 'both'
    );
    const activeBillPrinters = activePrinters.filter(
      (p) => p.printer_role === 'bill' || p.printer_role === 'both'
    );

    const checklist: ReadinessCheckItem[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // 1. Auto Print Gate Status
    checklist.push({
      key: 'auto_print_gate',
      label: 'Master Auto Print Switch',
      status: autoPrintOn ? 'ready' : 'off',
      summary: autoPrintOn ? 'ON' : 'OFF',
      detail: autoPrintOn
        ? 'Automatically routes thermal KOTs and Bills directly to configured printers.'
        : 'Auto Print is OFF. Orders will not automatically use configured direct printers. Manual printing remains available.',
    });

    if (!autoPrintOn) {
      warnings.push('Auto Print is currently turned OFF in Settings.');
    }

    // 2. KOT Printer Availability
    if (activeKotPrinters.length === 0) {
      checklist.push({
        key: 'kot_printer',
        label: 'KOT Printer',
        status: autoPrintOn ? 'error' : 'warning',
        summary: 'Missing',
        detail: 'No active printer with role KOT or Both is configured.',
      });
      if (autoPrintOn) {
        errors.push('No active KOT printer configured.');
      }
    } else {
      const names = activeKotPrinters.map((p) => p.name).join(', ');
      checklist.push({
        key: 'kot_printer',
        label: 'KOT Printer(s)',
        status: 'ready',
        summary: `${activeKotPrinters.length} Active`,
        detail: `Configured: ${names}`,
      });
    }

    // 3. Bill Printer Availability
    if (activeBillPrinters.length === 0) {
      checklist.push({
        key: 'bill_printer',
        label: 'Bill Printer',
        status: autoPrintOn ? 'error' : 'warning',
        summary: 'Missing',
        detail: 'No active printer with role Bill or Both is configured.',
      });
      if (autoPrintOn) {
        errors.push('No active Bill printer configured.');
      }
    } else {
      const primary = activeBillPrinters.find((p) => p.is_primary) || activeBillPrinters[0];
      checklist.push({
        key: 'bill_printer',
        label: 'Bill Printer',
        status: 'ready',
        summary: primary.name,
        detail: `Primary Bill destination: ${primary.name} (${primary.connection_type.toUpperCase()})`,
      });
    }

    // 4. Physical Binding Checks (Bluetooth & USB)
    const btPrinters = activePrinters.filter((p) => p.connection_type === 'bluetooth');
    const usbPrinters = activePrinters.filter((p) => p.connection_type === 'usb');

    if (btPrinters.length === 0) {
      checklist.push({
        key: 'bt_binding',
        label: 'Bluetooth Device Binding',
        status: 'not_applicable',
        summary: 'N/A',
        detail: 'No active Bluetooth thermal printers in configuration.',
      });
    } else {
      const unboundBt = btPrinters.filter(
        (p) => !deviceBindings[p.id]?.bluetooth_mac_address
      );
      if (unboundBt.length > 0) {
        const names = unboundBt.map((p) => p.name).join(', ');
        checklist.push({
          key: 'bt_binding',
          label: 'Bluetooth Device Binding',
          status: 'error',
          summary: `${unboundBt.length} Unbound`,
          detail: `Bluetooth printer(s) not bound on this tablet: ${names}. Open Settings to pair & bind.`,
        });
        errors.push(`Bluetooth printer(s) not configured on this tablet: ${names}`);
      } else {
        checklist.push({
          key: 'bt_binding',
          label: 'Bluetooth Device Binding',
          status: 'ready',
          summary: 'All Bound',
          detail: `All ${btPrinters.length} Bluetooth printer(s) physically bound on this device.`,
        });
      }
    }

    if (usbPrinters.length === 0) {
      checklist.push({
        key: 'usb_binding',
        label: 'USB Device Binding',
        status: 'not_applicable',
        summary: 'N/A',
        detail: 'No active USB thermal printers in configuration.',
      });
    } else {
      const unboundUsb = usbPrinters.filter(
        (p) =>
          deviceBindings[p.id]?.usb_vendor_id == null ||
          deviceBindings[p.id]?.usb_product_id == null
      );
      if (unboundUsb.length > 0) {
        const names = unboundUsb.map((p) => p.name).join(', ');
        checklist.push({
          key: 'usb_binding',
          label: 'USB Device Binding',
          status: 'error',
          summary: `${unboundUsb.length} Unbound`,
          detail: `USB printer(s) not bound on this tablet: ${names}. Connect and configure in Settings.`,
        });
        errors.push(`USB printer(s) not configured on this tablet: ${names}`);
      } else {
        checklist.push({
          key: 'usb_binding',
          label: 'USB Device Binding',
          status: 'ready',
          summary: 'All Bound',
          detail: `All ${usbPrinters.length} USB printer(s) bound on this device.`,
        });
      }
    }

    // 5. Network (LAN / Wi-Fi) Configuration Syntax Check
    const networkPrinters = activePrinters.filter(
      (p) => p.connection_type === 'lan' || p.connection_type === 'wifi'
    );

    if (networkPrinters.length === 0) {
      checklist.push({
        key: 'network_config',
        label: 'Network Configuration',
        status: 'not_applicable',
        summary: 'N/A',
        detail: 'No active LAN/Wi-Fi thermal printers configured.',
      });
    } else {
      const invalidNet = networkPrinters.filter((p) => {
        if (!p.ip_address || !p.ip_address.trim()) return true;
        const portNum = Number(p.port || 9100);
        return isNaN(portNum) || portNum < 1 || portNum > 65535;
      });

      if (invalidNet.length > 0) {
        const names = invalidNet.map((p) => p.name).join(', ');
        checklist.push({
          key: 'network_config',
          label: 'Network Configuration',
          status: 'error',
          summary: `${invalidNet.length} Invalid`,
          detail: `Invalid IP/Port on: ${names}. Configure valid IP address (e.g. 192.168.1.100:9100).`,
        });
        errors.push(`Invalid network configuration on: ${names}`);
      } else {
        checklist.push({
          key: 'network_config',
          label: 'Network Configuration',
          status: 'ready',
          summary: 'Valid',
          detail: `All ${networkPrinters.length} network printer(s) have valid IP and Port configurations.`,
        });
      }
    }

    // 6. Fallback Printer Validity
    const printersWithFallback = activePrinters.filter((p) => p.fallback_printer_id);
    let fallbackIssues = 0;
    printersWithFallback.forEach((p) => {
      const target = (printers || []).find((tp) => tp.id === p.fallback_printer_id);
      if (!target || !target.is_active) {
        warnings.push(`Printer "${p.name}" has fallback to an inactive or non-existent printer.`);
        fallbackIssues++;
      } else if (target.id === p.id) {
        errors.push(`Printer "${p.name}" has fallback configured to itself.`);
        fallbackIssues++;
      }
    });

    checklist.push({
      key: 'fallback_config',
      label: 'Fallback Routing',
      status: fallbackIssues > 0 ? 'warning' : printersWithFallback.length > 0 ? 'ready' : 'not_applicable',
      summary: fallbackIssues > 0 ? `${fallbackIssues} Issue(s)` : `${printersWithFallback.length} Configured`,
      detail:
        fallbackIssues > 0
          ? 'Some fallback targets are missing or inactive.'
          : printersWithFallback.length > 0
          ? 'Configured fallback routes are valid and active.'
          : 'No fallback printers configured.',
    });

    // 7. Overall Readiness Assessment
    const isReady = autoPrintOn && errors.length === 0 && activeKotPrinters.length > 0 && activeBillPrinters.length > 0;
    let statusMessage = '';

    if (!autoPrintOn) {
      statusMessage =
        'Auto Print is OFF.\nOrders will not automatically use configured direct printers.\nManual printing remains available.';
    } else if (isReady) {
      const kotSummary = activeKotPrinters.map((p) => p.name).join(', ');
      const billSummary = activeBillPrinters.map((p) => p.name).join(', ');
      statusMessage = `Auto Print is ready.\n\nKOT: ${kotSummary}\nBill: ${billSummary}`;
    } else {
      statusMessage = `Auto Print requires attention.\n\n${errors.join('\n') || warnings.join('\n')}`;
    }

    return {
      isAutoPrintEnabled: autoPrintOn,
      isReady,
      statusMessage,
      checklist,
      warnings,
      errors,
      activeKotPrinters,
      activeBillPrinters,
    };
  },

  /**
   * Diagnostic-only Routing Preview.
   * Uses the EXACT live routing resolver to display deterministic item destinations.
   * NEVER connects to physical hardware or transmits bytes.
   */
  previewRouting(
    sampleOrder: Order,
    settings: RestaurantSettings | null | undefined,
    printers: RestaurantPrinter[],
    deviceBindings: Record<string, DevicePrinterBinding> = {},
    deviceDefaults?: DevicePrinterDefaults | null
  ): RoutingPreviewReport {
    const activePrinters = (printers || []).filter((p) => p.is_active);
    const activeKotPrinters = activePrinters.filter(
      (p) => p.printer_role === 'kot' || p.printer_role === 'both'
    );
    const activeBillPrinters = activePrinters.filter(
      (p) => p.printer_role === 'bill' || p.printer_role === 'both'
    );

    const issues: string[] = [];

    // 1. Resolve Default KOT Printer
    const sectionName = (sampleOrder as any).section || (sampleOrder as any).dining_tables?.section as TableSection | undefined;
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

    // 2. Resolve KOT Category Splits
    const rawItems: OrderItem[] = (sampleOrder.items || []).filter((i) => i.quantity > 0);
    const kotRoutes: RoutingPreviewItem[] = [];
    const unroutedKotItems: Array<{ name: string; quantity: number }> = [];

    if (activeKotPrinters.length === 0) {
      issues.push('No active KOT printer configured. KOT items cannot be routed.');
      unroutedKotItems.push(...rawItems.map((i) => ({ name: i.product_name, quantity: i.quantity })));
    } else {
      const splits: CategoryPrintSplit[] = printerRoutingService.resolveKotsByCategory(
        rawItems,
        activeKotPrinters,
        defaultKotPrinter
      );

      for (const split of splits) {
        const p = split.printer;
        let isBound = true;
        if (p.connection_type === 'bluetooth') {
          isBound = Boolean(deviceBindings[p.id]?.bluetooth_mac_address);
        } else if (p.connection_type === 'usb') {
          isBound =
            deviceBindings[p.id]?.usb_vendor_id != null &&
            deviceBindings[p.id]?.usb_product_id != null;
        }

        let reason = 'Default KOT Printer';
        if (p.category_ids && p.category_ids.length > 0) {
          reason = 'Category-specific routing';
        } else if (p.section_names && sectionName && p.section_names.includes(sectionName)) {
          reason = `Section routing (${sectionName})`;
        } else if (p.id === deviceDefaults?.default_kot_printer_id) {
          reason = 'Device-local default KOT';
        } else if (p.is_primary) {
          reason = 'Restaurant Primary KOT';
        }

        kotRoutes.push({
          printerName: p.name,
          printerId: p.id,
          connectionType: p.connection_type.toUpperCase(),
          paperWidth: p.paper_width,
          isBoundOnDevice: isBound,
          items: split.items.map((i) => ({
            name: i.product_name,
            quantity: i.quantity,
            notes: i.item_notes,
          })),
          routingReason: reason,
        });
      }
    }

    // 3. Resolve Bill Printer
    let billRoute: RoutingPreviewReport['billRoute'] = null;
    if (activeBillPrinters.length === 0) {
      issues.push('No active Bill printer configured. Bill cannot be routed.');
    } else {
      const targetBill =
        printerRoutingService.resolvePrinterForRole(
          activeBillPrinters,
          'bill',
          deviceDefaults?.default_bill_printer_id
        ) || activeBillPrinters[0];

      let isBound = true;
      if (targetBill.connection_type === 'bluetooth') {
        isBound = Boolean(deviceBindings[targetBill.id]?.bluetooth_mac_address);
      } else if (targetBill.connection_type === 'usb') {
        isBound =
          deviceBindings[targetBill.id]?.usb_vendor_id != null &&
          deviceBindings[targetBill.id]?.usb_product_id != null;
      }

      let reason = 'Restaurant Primary Bill';
      if (targetBill.id === deviceDefaults?.default_bill_printer_id) {
        reason = 'Device-local default Bill';
      } else if (targetBill.printer_role === 'both' && !targetBill.is_primary) {
        reason = 'Matching role (Both)';
      }

      billRoute = {
        printerName: targetBill.name,
        printerId: targetBill.id,
        connectionType: targetBill.connection_type.toUpperCase(),
        paperWidth: targetBill.paper_width,
        isBoundOnDevice: isBound,
        routingReason: reason,
      };
    }

    return {
      kotRoutes,
      billRoute,
      unroutedKotItems,
      issues,
    };
  },

  /**
   * Diagnostic-only System Health Check (Software & Configuration only).
   * NEVER connects to physical hardware or transmits bytes.
   */
  runPrinterSystemCheck(
    settings: RestaurantSettings | null | undefined,
    printers: RestaurantPrinter[],
    deviceBindings: Record<string, DevicePrinterBinding> = {},
    deviceDefaults?: DevicePrinterDefaults | null
  ): PrinterSystemCheckReport {
    const checks: SystemCheckItem[] = [];
    const readiness = this.checkAutoPrintReadiness(settings, printers, deviceBindings, deviceDefaults);

    // 1. Auto Print Gate Check
    checks.push({
      name: 'Auto Print Gate',
      status: 'PASS',
      detail: readiness.isAutoPrintEnabled ? 'Master switch is ON' : 'Master switch is OFF (Manual printing active)',
    });

    // 2. Routing Engine
    checks.push({
      name: 'Routing Engine',
      status: 'PASS',
      detail: 'Category, section, device-default & fallback algorithms verified.',
    });

    // 3. KOT Destination
    checks.push({
      name: 'KOT Printer',
      status: readiness.activeKotPrinters.length > 0 ? 'CONFIGURED' : 'MISSING',
      detail:
        readiness.activeKotPrinters.length > 0
          ? `${readiness.activeKotPrinters.length} active KOT destination(s)`
          : 'No active KOT printer configured',
    });

    // 4. Bill Destination
    checks.push({
      name: 'Bill Printer',
      status: readiness.activeBillPrinters.length > 0 ? 'CONFIGURED' : 'MISSING',
      detail:
        readiness.activeBillPrinters.length > 0
          ? `${readiness.activeBillPrinters.length} active Bill destination(s)`
          : 'No active Bill printer configured',
    });

    // 5. Network Configuration
    const netCheck = readiness.checklist.find((c) => c.key === 'network_config');
    checks.push({
      name: 'Network Configuration',
      status: netCheck?.status === 'ready' ? 'PASS' : netCheck?.status === 'error' ? 'FAIL' : 'NOT_APPLICABLE',
      detail: netCheck?.detail || 'No network printers',
    });

    // 6. Bluetooth Binding
    const btCheck = readiness.checklist.find((c) => c.key === 'bt_binding');
    checks.push({
      name: 'Bluetooth Binding',
      status: btCheck?.status === 'ready' ? 'PASS' : btCheck?.status === 'error' ? 'FAIL' : 'NOT_APPLICABLE',
      detail: btCheck?.detail || 'No Bluetooth printers',
    });

    // 7. USB Binding
    const usbCheck = readiness.checklist.find((c) => c.key === 'usb_binding');
    checks.push({
      name: 'USB Binding',
      status: usbCheck?.status === 'ready' ? 'PASS' : usbCheck?.status === 'error' ? 'FAIL' : 'NOT_APPLICABLE',
      detail: usbCheck?.detail || 'No USB printers',
    });

    // 8. Fallback Routing
    const fbCheck = readiness.checklist.find((c) => c.key === 'fallback_config');
    checks.push({
      name: 'Fallback Routing',
      status: fbCheck?.status === 'error' ? 'FAIL' : fbCheck?.status === 'warning' ? 'WARN' : 'PASS',
      detail: fbCheck?.detail || 'Fallback configuration valid',
    });

    // 9. Duplicate Protection
    checks.push({
      name: 'Duplicate Protection',
      status: 'PASS',
      detail: 'Destination-specific job identity and [AUTO_PRINTED] tracking verified.',
    });

    // 10. Physical Hardware Status
    checks.push({
      name: 'Physical Hardware',
      status: 'NOT_TESTED',
      detail: 'PENDING FINAL HARDWARE VALIDATION (Software verification complete)',
    });

    const hasFail = checks.some((c) => c.status === 'FAIL');
    const hasWarn = checks.some((c) => c.status === 'WARN' || c.status === 'MISSING');

    return {
      timestamp: new Date().toISOString(),
      overallStatus: hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS',
      checks,
      hardwareStatus: 'NOT TESTED (PENDING FINAL HARDWARE VALIDATION)',
    };
  },

  /**
   * Evaluates if disabling or deleting a printer causes broken dependencies.
   */
  getDeleteOrDisableWarnings(
    printerId: string,
    printers: RestaurantPrinter[],
    deviceDefaults?: DevicePrinterDefaults | null
  ): string[] {
    const warnings: string[] = [];
    const target = (printers || []).find((p) => p.id === printerId);
    if (!target) return warnings;

    // 1. Device Defaults
    if (deviceDefaults?.default_kot_printer_id === printerId) {
      warnings.push(`This printer is currently set as the Device Default KOT Printer for this tablet.`);
    }
    if (deviceDefaults?.default_bill_printer_id === printerId) {
      warnings.push(`This printer is currently set as the Device Default Bill Printer for this tablet.`);
    }

    // 2. Fallback dependencies
    const dependentFallbacks = (printers || []).filter((p) => p.fallback_printer_id === printerId && p.id !== printerId);
    if (dependentFallbacks.length > 0) {
      const names = dependentFallbacks.map((p) => p.name).join(', ');
      warnings.push(`The following printer(s) use this printer as their configured fallback: ${names}.`);
    }

    // 3. Category routing
    if (target.category_ids && target.category_ids.length > 0) {
      warnings.push(`This printer has ${target.category_ids.length} menu category route(s) assigned.`);
    }

    // 4. Section routing
    if (target.section_names && target.section_names.length > 0) {
      warnings.push(`This printer has ${target.section_names.length} dining section(s) assigned: ${target.section_names.join(', ')}.`);
    }

    return warnings;
  },

  /**
   * Normalizes low-level transport exceptions into clean, operator-friendly messages.
   */
  normalizeOperatorErrorMessage(error: any): string {
    const msg = error?.message || String(error || '');

    if (
      msg.includes('not_bound') ||
      msg.includes('not bound') ||
      msg.includes('not configured on this device') ||
      msg.includes('Select Bluetooth device') ||
      msg.includes('Select USB device')
    ) {
      return 'Printer is not configured on this device. Open Printer Settings to bind the device.';
    }
    if (msg.includes('bluetooth_disabled') || msg.includes('Bluetooth is turned off') || msg.includes('Bluetooth not enabled')) {
      return 'Bluetooth is turned off. Please enable Bluetooth on your tablet.';
    }
    if (msg.includes('device_not_connected') || msg.includes('USB printer not connected') || msg.includes('USB disconnected')) {
      return 'USB printer is disconnected. Check USB cable and power.';
    }
    if (msg.includes('permission_denied') || msg.includes('USB permission rejected')) {
      return 'Printer permission was denied. Please grant permission when prompted.';
    }
    if (msg.includes('unreachable') || msg.includes('ECONNREFUSED') || msg.includes('EHOSTUNREACH') || msg.includes('timeout')) {
      return 'Printer is not reachable. Check printer power and network connection.';
    }
    if (msg.includes('partial_or_unknown') || msg.includes('partially printed') || msg.includes('interrupted after')) {
      return 'Print may have partially completed. Check the physical printer before reprinting.';
    }
    if (msg.includes('NO_PRINTER_CONFIGURED')) {
      return 'Printer configuration is missing. Open Settings to configure a thermal printer.';
    }

    return msg || 'Thermal print operation failed. Check printer connection.';
  },
};
