import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  RestaurantPrinter,
  PrinterConnectionType,
  PrinterPaperWidth,
  PrinterRole,
  PrinterAlignment,
  PrinterCalibration,
  DevicePrinterBinding,
  DevicePrinterDefaults,
  RestaurantSettings,
  Category,
  TableSection,
  Order,
} from '../types';
import { printerManager } from '../services/printerManager';
import { CALIBRATION_LIMITS, DEFAULT_PRINTER_CALIBRATION } from '../services/printerManager/printerTypes';
import {
  AutoPrintReadinessReport,
  RoutingPreviewReport,
  PrinterSystemCheckReport,
} from '../services/printerManager/diagnostics';
import { isAutoPrintEnabled } from '../services/directPrintService';

interface Props {
  restaurantId: string;
  categories: Category[];
  canManage: boolean;
  settings?: RestaurantSettings | null;
  showToast: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

const TABLE_SECTIONS: TableSection[] = [
  'Ground Floor',
  'First Floor',
  'Outdoor',
  'AC Section',
  'VIP Section',
  'VIP',
];

export const PrinterManagementSection: React.FC<Props> = ({
  restaurantId,
  categories,
  canManage,
  settings,
  showToast,
}) => {
  const [printers, setPrinters] = useState<RestaurantPrinter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<RestaurantPrinter | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Device-local defaults
  const [deviceKotPrinterId, setDeviceKotPrinterId] = useState<string>('');
  const [deviceBillPrinterId, setDeviceBillPrinterId] = useState<string>('');
  const [isSavingDeviceDefaults, setIsSavingDeviceDefaults] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>('wifi');
  const [paperWidth, setPaperWidth] = useState<PrinterPaperWidth>('80mm');
  const [printerRole, setPrinterRole] = useState<PrinterRole>('kot');
  const [isPrimary, setIsPrimary] = useState(false);
  const [fallbackPrinterId, setFallbackPrinterId] = useState<string>('');

  // Network fields
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('9100');

  // Bluetooth fields
  const [bluetoothDeviceName, setBluetoothDeviceName] = useState('');
  const [selectedBluetoothMac, setSelectedBluetoothMac] = useState('');
  const [discoveredBluetoothDevices, setDiscoveredBluetoothDevices] = useState<
    import('../services/printerManager/transports/types').BluetoothDeviceInfo[]
  >([]);
  const [isScanningBt, setIsScanningBt] = useState(false);

  // USB fields
  const [usbVendorId, setUsbVendorId] = useState('');
  const [usbProductId, setUsbProductId] = useState('');
  const [usbSerialNumber, setUsbSerialNumber] = useState('');
  const [usbDeviceName, setUsbDeviceName] = useState('');
  const [discoveredUsbDevices, setDiscoveredUsbDevices] = useState<
    import('../services/printerManager/transports/types').UsbDeviceInfo[]
  >([]);
  const [isScanningUsb, setIsScanningUsb] = useState(false);

  const [deviceBindings, setDeviceBindings] = useState<Record<string, DevicePrinterBinding>>({});
  // Routing fields
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<TableSection[]>([]);

  // Calibration Form State
  const [alignment, setAlignment] = useState<PrinterAlignment>('center');
  const [horizontalShiftMm, setHorizontalShiftMm] = useState<number>(0.0);
  const [marginLeftMm, setMarginLeftMm] = useState<number>(0.0);
  const [marginRightMm, setMarginRightMm] = useState<number>(0.0);
  const [marginTopMm, setMarginTopMm] = useState<number>(0.0);
  const [marginBottomMm, setMarginBottomMm] = useState<number>(0.0);

  // Diagnostic Modals State
  const [readinessModalVisible, setReadinessModalVisible] = useState(false);
  const [readinessReport, setReadinessReport] = useState<AutoPrintReadinessReport | null>(null);

  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewReport, setPreviewReport] = useState<RoutingPreviewReport | null>(null);

  const [systemCheckModalVisible, setSystemCheckModalVisible] = useState(false);
  const [systemCheckReport, setSystemCheckReport] = useState<PrinterSystemCheckReport | null>(null);

  const [harnessModalVisible, setHarnessModalVisible] = useState(false);

  const autoPrintActive = isAutoPrintEnabled(settings);

  const loadPrinters = useCallback(async () => {
    if (!restaurantId) return;
    setIsLoading(true);
    try {
      const data = await printerManager.getRestaurantPrinters(restaurantId);
      setPrinters(data);

      // Load device bindings for all printers
      const bindingsMap: Record<string, DevicePrinterBinding> = {};
      for (const p of data) {
        if (p.connection_type === 'bluetooth' || p.connection_type === 'usb') {
          const b = await printerManager.getDeviceBinding(p.id);
          if (b) bindingsMap[p.id] = b;
        }
      }
      setDeviceBindings(bindingsMap);

      // Load device defaults
      const defaults = await printerManager.getDeviceDefaults();
      if (defaults.default_kot_printer_id) setDeviceKotPrinterId(defaults.default_kot_printer_id);
      if (defaults.default_bill_printer_id) setDeviceBillPrinterId(defaults.default_bill_printer_id);
    } catch (err: any) {
      console.warn('[PrinterManagementSection] Load error:', err);
      showToast('error', 'Error', err.message || 'Could not load printers');
    } finally {
      setIsLoading(false);
    }
  }, [restaurantId, showToast]);

  const handleScanBluetoothDevices = async () => {
    setIsScanningBt(true);
    try {
      const paired = await printerManager.getBluetoothPairedDevices();
      setDiscoveredBluetoothDevices(paired);
      if (paired.length === 0) {
        showToast('info', 'No Paired Devices', 'Pair your thermal printer in Android Bluetooth Settings first.');
      } else {
        showToast('success', 'Bluetooth Devices Found', `Found ${paired.length} paired Bluetooth printer(s).`);
      }
    } catch (err: any) {
      showToast('error', 'Scan Error', err?.message || 'Could not scan Bluetooth devices.');
    } finally {
      setIsScanningBt(false);
    }
  };

  const handleDetectUsbPrinters = async () => {
    setIsScanningUsb(true);
    try {
      const devices = await printerManager.getAttachedUsbDevices();
      setDiscoveredUsbDevices(devices);
      if (devices.length === 0) {
        showToast('info', 'No USB Printers Detected', 'Connect the thermal printer using USB OTG or tablet USB Host port.');
      } else {
        showToast('success', 'USB Printers Found', `Found ${devices.length} attached USB device(s).`);
      }
    } catch (err: any) {
      showToast('error', 'USB Error', err?.message || 'Could not detect USB devices.');
    } finally {
      setIsScanningUsb(false);
    }
  };

  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  const openAddModal = () => {
    setEditingPrinter(null);
    setName('');
    setConnectionType('wifi');
    setPaperWidth('80mm');
    setPrinterRole('kot');
    setIsPrimary(false);
    setFallbackPrinterId('');
    setIpAddress('');
    setPort('9100');
    setBluetoothDeviceName('');
    setSelectedBluetoothMac('');
    setDiscoveredBluetoothDevices([]);
    setUsbVendorId('');
    setUsbProductId('');
    setUsbSerialNumber('');
    setUsbDeviceName('');
    setDiscoveredUsbDevices([]);
    setSelectedCategoryIds([]);
    setSelectedSections([]);
    resetCalibrationForm();
    setModalVisible(true);
  };

  const openEditModal = (printer: RestaurantPrinter) => {
    setEditingPrinter(printer);
    setName(printer.name);
    setConnectionType(printer.connection_type);
    setPaperWidth(printer.paper_width);
    setPrinterRole(printer.printer_role);
    setIsPrimary(printer.is_primary);
    setFallbackPrinterId(printer.fallback_printer_id || '');
    setIpAddress(printer.ip_address || '');
    setPort(String(printer.port || 9100));
    setBluetoothDeviceName(printer.bluetooth_device_name || '');
    setSelectedBluetoothMac(deviceBindings[printer.id]?.bluetooth_mac_address || '');
    setDiscoveredBluetoothDevices([]);

    const b = deviceBindings[printer.id];
    if (b && b.usb_vendor_id !== undefined && b.usb_vendor_id !== null) {
      setUsbVendorId(`0x${b.usb_vendor_id.toString(16).toUpperCase()}`);
    } else {
      setUsbVendorId('');
    }
    if (b && b.usb_product_id !== undefined && b.usb_product_id !== null) {
      setUsbProductId(`0x${b.usb_product_id.toString(16).toUpperCase()}`);
    } else {
      setUsbProductId('');
    }
    setUsbSerialNumber(b?.usb_serial_number || '');
    setUsbDeviceName('');
    setDiscoveredUsbDevices([]);

    setSelectedCategoryIds(printer.category_ids || []);
    setSelectedSections(printer.section_names || []);

    setAlignment(printer.alignment || 'center');
    setHorizontalShiftMm(Number(printer.horizontal_shift_mm ?? 0));
    setMarginLeftMm(Number(printer.margin_left_mm ?? 0));
    setMarginRightMm(Number(printer.margin_right_mm ?? 0));
    setMarginTopMm(Number(printer.margin_top_mm ?? 0));
    setMarginBottomMm(Number(printer.margin_bottom_mm ?? 0));

    setModalVisible(true);
  };

  const resetCalibrationForm = () => {
    setAlignment(DEFAULT_PRINTER_CALIBRATION.alignment);
    setHorizontalShiftMm(DEFAULT_PRINTER_CALIBRATION.horizontal_shift_mm);
    setMarginLeftMm(DEFAULT_PRINTER_CALIBRATION.margin_left_mm);
    setMarginRightMm(DEFAULT_PRINTER_CALIBRATION.margin_right_mm);
    setMarginTopMm(DEFAULT_PRINTER_CALIBRATION.margin_top_mm);
    setMarginBottomMm(DEFAULT_PRINTER_CALIBRATION.margin_bottom_mm);
  };

  const adjustShift = (delta: number) => {
    const next = Math.round((horizontalShiftMm + delta) * 10) / 10;
    if (next >= CALIBRATION_LIMITS.MIN_HORIZONTAL_SHIFT_MM && next <= CALIBRATION_LIMITS.MAX_HORIZONTAL_SHIFT_MM) {
      setHorizontalShiftMm(next);
    }
  };

  const handleSavePrinter = async () => {
    if (!name.trim()) {
      showToast('error', 'Validation Error', 'Printer name is required.');
      return;
    }

    if (['lan', 'wifi'].includes(connectionType) && !ipAddress.trim()) {
      showToast('error', 'Validation Error', 'IP Address is required for LAN / Wi-Fi printers.');
      return;
    }

    const portNum = Number(port);
    if (['lan', 'wifi'].includes(connectionType) && (isNaN(portNum) || portNum < 1 || portNum > 65535)) {
      showToast('error', 'Validation Error', 'Port must be between 1 and 65535.');
      return;
    }

    const calibrationPayload: PrinterCalibration = {
      alignment,
      horizontal_shift_mm: horizontalShiftMm,
      margin_left_mm: marginLeftMm,
      margin_right_mm: marginRightMm,
      margin_top_mm: marginTopMm,
      margin_bottom_mm: marginBottomMm,
    };

    const calValidation = printerManager.validateCalibration(calibrationPayload, paperWidth);
    if (!calValidation.isValid) {
      showToast('error', 'Calibration Error', calValidation.errors.join(' '));
      return;
    }

    setIsSaving(true);
    try {
      let savedPrinterId = editingPrinter?.id;
      if (editingPrinter) {
        await printerManager.updatePrinter(editingPrinter.id, {
          name: name.trim(),
          connection_type: connectionType,
          paper_width: paperWidth,
          printer_role: printerRole,
          is_primary: isPrimary,
          fallback_printer_id: fallbackPrinterId || null,
          ip_address: ['lan', 'wifi'].includes(connectionType) ? ipAddress.trim() : null,
          port: ['lan', 'wifi'].includes(connectionType) ? portNum : null,
          bluetooth_device_name: bluetoothDeviceName.trim() || null,
          category_ids: selectedCategoryIds,
          section_names: selectedSections,
          ...calibrationPayload,
        });
        showToast('success', 'Printer Updated', `${name} updated successfully.`);
      } else {
        const created = await printerManager.createPrinter({
          restaurant_id: restaurantId,
          name: name.trim(),
          connection_type: connectionType,
          paper_width: paperWidth,
          printer_role: printerRole,
          is_active: true,
          is_primary: isPrimary,
          fallback_printer_id: fallbackPrinterId || null,
          ip_address: ['lan', 'wifi'].includes(connectionType) ? ipAddress.trim() : null,
          port: ['lan', 'wifi'].includes(connectionType) ? portNum : null,
          bluetooth_device_name: bluetoothDeviceName.trim() || null,
          category_ids: selectedCategoryIds,
          section_names: selectedSections,
          ...calibrationPayload,
        });
        savedPrinterId = created.id;
        showToast('success', 'Printer Added', `${name} added successfully.`);
      }

      // Save device-local Bluetooth binding if configured
      if (savedPrinterId && connectionType === 'bluetooth' && selectedBluetoothMac) {
        await printerManager.saveDeviceBinding({
          restaurant_printer_id: savedPrinterId,
          connection_type: 'bluetooth',
          bluetooth_mac_address: selectedBluetoothMac,
          bluetooth_device_name: bluetoothDeviceName || undefined,
        });
      }

      // Save device-local USB binding if configured
      if (savedPrinterId && connectionType === 'usb' && usbVendorId.trim() && usbProductId.trim()) {
        const vIdStr = usbVendorId.trim();
        const pIdStr = usbProductId.trim();
        const vId = vIdStr.startsWith('0x') || vIdStr.startsWith('0X') ? parseInt(vIdStr, 16) : parseInt(vIdStr, 10);
        const pId = pIdStr.startsWith('0x') || pIdStr.startsWith('0X') ? parseInt(pIdStr, 16) : parseInt(pIdStr, 10);

        if (!isNaN(vId) && !isNaN(pId)) {
          await printerManager.saveDeviceBinding({
            restaurant_printer_id: savedPrinterId,
            connection_type: 'usb',
            usb_vendor_id: vId,
            usb_product_id: pId,
            usb_serial_number: usbSerialNumber.trim() || undefined,
          });
        }
      }

      setModalVisible(false);
      await loadPrinters();
    } catch (err: any) {
      console.warn('[PrinterManagementSection] Save error:', err);
      showToast('error', 'Save Failed', err.message || 'Could not save printer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePrinter = (printer: RestaurantPrinter) => {
    const warnings = printerManager.getDeleteOrDisableWarnings(printer.id, printers, {
      default_kot_printer_id: deviceKotPrinterId,
      default_bill_printer_id: deviceBillPrinterId,
    });

    const warningText = warnings.length > 0 ? `\n\n⚠️ Warnings:\n${warnings.map((w) => `• ${w}`).join('\n')}` : '';

    const doDelete = async () => {
      try {
        await printerManager.deletePrinter(printer.id);
        await printerManager.removeDeviceBinding(printer.id);
        showToast('success', 'Printer Deleted', `${printer.name} removed.`);
        await loadPrinters();
      } catch (err: any) {
        showToast('error', 'Delete Failed', err.message || 'Could not delete printer');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete "${printer.name}"?${warningText}`)) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Printer', `Are you sure you want to delete "${printer.name}"?${warningText}`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleSaveDeviceDefaults = async () => {
    setIsSavingDeviceDefaults(true);
    try {
      await printerManager.saveDeviceDefaults({
        default_kot_printer_id: deviceKotPrinterId || null,
        default_bill_printer_id: deviceBillPrinterId || null,
      });
      showToast('success', 'Saved', 'Device-local default printers updated for this tablet.');
    } catch (err: any) {
      showToast('error', 'Error', err.message || 'Could not save device defaults.');
    } finally {
      setIsSavingDeviceDefaults(false);
    }
  };

  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [printerStatuses, setPrinterStatuses] = useState<Record<string, { status: string; text: string; color?: string }>>({});

  const handleTestConnection = async (p: RestaurantPrinter) => {
    setTestingPrinterId(p.id);
    setPrinterStatuses((prev) => ({
      ...prev,
      [p.id]: { status: 'checking', text: 'Checking connection...', color: '#0284c7' },
    }));

    try {
      const result = await printerManager.testPrinterConnection(p);
      if (result.reachable) {
        setPrinterStatuses((prev) => ({
          ...prev,
          [p.id]: { status: 'reachable', text: `Reachable (${result.latencyMs}ms)`, color: '#16a34a' },
        }));
        showToast('success', 'Printer Reachable', `${p.name} responded: ${result.message}`);
      } else {
        setPrinterStatuses((prev) => ({
          ...prev,
          [p.id]: { status: 'unreachable', text: result.status.toUpperCase(), color: '#dc2626' },
        }));
        showToast('error', 'Connection Failed', result.message);
      }
    } catch (err: any) {
      setPrinterStatuses((prev) => ({
        ...prev,
        [p.id]: { status: 'error', text: 'Test failed', color: '#dc2626' },
      }));
      showToast('error', 'Test Failed', err.message || 'Unknown connection error.');
    } finally {
      setTestingPrinterId(null);
    }
  };

  const handleTestPrint = async (p: RestaurantPrinter) => {
    setTestingPrinterId(p.id);
    try {
      const result = await printerManager.printTestReceipt(p);
      if (result.success) {
        showToast('success', 'Print Data Sent', `Test receipt payload sent to ${p.name} (${result.bytesSent} bytes).`);
      } else if (result.status === 'partial_or_unknown') {
        const msg = 'Print transmission interrupted. Check the printer output before retrying to prevent duplicate paper waste.';
        if (Platform.OS === 'web') window.alert(`[${p.name}]\n${msg}`);
        else Alert.alert('Partial Print Result', msg);
      } else {
        showToast('error', 'Print Failed', result.message);
      }
    } catch (err: any) {
      showToast('error', 'Print Error', err?.message || 'Could not send test print.');
    } finally {
      setTestingPrinterId(null);
    }
  };

  const handleCalibrationTest = async () => {
    const activeTarget = editingPrinter || {
      id: 'preview',
      restaurant_id: restaurantId,
      name: name.trim() || 'Preview Printer',
      connection_type: connectionType,
      paper_width: paperWidth,
      printer_role: printerRole,
      is_active: true,
      is_primary: isPrimary,
      ip_address: ipAddress.trim() || null,
      port: Number(port) || 9100,
      alignment,
      horizontal_shift_mm: horizontalShiftMm,
      margin_left_mm: marginLeftMm,
      margin_right_mm: marginRightMm,
      margin_top_mm: marginTopMm,
      margin_bottom_mm: marginBottomMm,
    } as RestaurantPrinter;

    setIsSaving(true);
    try {
      const calPayload: PrinterCalibration = {
        alignment,
        horizontal_shift_mm: horizontalShiftMm,
        margin_left_mm: marginLeftMm,
        margin_right_mm: marginRightMm,
        margin_top_mm: marginTopMm,
        margin_bottom_mm: marginBottomMm,
      };

      const result = await printerManager.printCalibrationTest(activeTarget, calPayload);
      if (result.success) {
        showToast('success', 'Calibration Sent', `Calibration test sent to ${activeTarget.name} (${result.bytesSent} bytes).`);
      } else {
        showToast('error', 'Calibration Failed', result.message);
      }
    } catch (err: any) {
      showToast('error', 'Calibration Error', err.message || 'Could not send calibration receipt.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintSampleKot = async (p: RestaurantPrinter) => {
    try {
      const result = await printerManager.printSampleKot(p);
      if (result.success) {
        showToast('success', 'KOT Sample Sent', `Deterministic test KOT sent to ${p.name} (${result.bytesSent} bytes).`);
      } else {
        showToast('error', 'KOT Print Failed', result.message);
      }
    } catch (err: any) {
      showToast('error', 'Error', err?.message || 'Failed to print test KOT.');
    }
  };

  const handlePrintSampleBill = async (p: RestaurantPrinter) => {
    try {
      const result = await printerManager.printSampleBill(p);
      if (result.success) {
        showToast('success', 'Bill Sample Sent', `Deterministic test Bill sent to ${p.name} (${result.bytesSent} bytes).`);
      } else {
        showToast('error', 'Bill Print Failed', result.message);
      }
    } catch (err: any) {
      showToast('error', 'Error', err?.message || 'Failed to print test Bill.');
    }
  };

  // Phase 7 Diagnostic Handlers (NON-HARDWARE TOUCHING)
  const handleCheckAutoPrintSetup = () => {
    const report = printerManager.checkAutoPrintReadiness(
      settings,
      printers,
      deviceBindings,
      {
        default_kot_printer_id: deviceKotPrinterId,
        default_bill_printer_id: deviceBillPrinterId,
      }
    );
    setReadinessReport(report);
    setReadinessModalVisible(true);
  };

  const handlePreviewRouting = () => {
    // Deterministic sample order for routing inspection
    const sampleOrder: Order = {
      id: 'preview-ord-001',
      restaurant_id: restaurantId,
      order_number: 'ORD-PREVIEW',
      order_type: 'dine_in',
      table_number: 'T1',
      customer_name: 'Walk-in Guest',
      status: 'confirmed',
      payment_status: 'unpaid',
      subtotal: 750,
      discount_amount: 0,
      coupon_discount: 0,
      cgst_amount: 18.75,
      sgst_amount: 18.75,
      igst_amount: 0,
      service_charge: 0,
      delivery_charge: 0,
      grand_total: 787.5,
      round_off: 0.5,
      payable_amount: 788,
      created_at: new Date().toISOString(),
      items: [
        {
          id: 'item-1',
          order_id: 'preview-ord-001',
          product_name: 'Chicken Biryani',
          quantity: 2,
          unit_price: 250,
          total_price: 500,
          subtotal: 500,
          tax_rate: 5,
          tax_amount: 25,
          product: {
            id: 'prod-1',
            name: 'Chicken Biryani',
            category_id: categories.find((c) => c.name.toLowerCase().includes('main'))?.id || 'cat-mains',
            price: 250,
            is_active: true,
            created_at: '',
            updated_at: '',
          },
        } as any,
        {
          id: 'item-2',
          order_id: 'preview-ord-001',
          product_name: 'Cold Coffee',
          quantity: 1,
          unit_price: 120,
          total_price: 120,
          subtotal: 120,
          tax_rate: 5,
          tax_amount: 6,
          product: {
            id: 'prod-2',
            name: 'Cold Coffee',
            category_id: categories.find((c) => c.name.toLowerCase().includes('beverage') || c.name.toLowerCase().includes('drink'))?.id || 'cat-beverages',
            price: 120,
            is_active: true,
            created_at: '',
            updated_at: '',
          },
        } as any,
        {
          id: 'item-3',
          order_id: 'preview-ord-001',
          product_name: 'Veg Momo',
          quantity: 1,
          unit_price: 130,
          total_price: 130,
          subtotal: 130,
          tax_rate: 5,
          tax_amount: 6.5,
          product: {
            id: 'prod-3',
            name: 'Veg Momo',
            category_id: categories.find((c) => c.name.toLowerCase().includes('starter') || c.name.toLowerCase().includes('snack'))?.id || 'cat-starters',
            price: 130,
            is_active: true,
            created_at: '',
            updated_at: '',
          },
        } as any,
      ],
    };

    const report = printerManager.previewRouting(
      sampleOrder,
      settings,
      printers,
      deviceBindings,
      {
        default_kot_printer_id: deviceKotPrinterId,
        default_bill_printer_id: deviceBillPrinterId,
      }
    );
    setPreviewReport(report);
    setPreviewModalVisible(true);
  };

  const handleRunSystemCheck = () => {
    const report = printerManager.runPrinterSystemCheck(
      settings,
      printers,
      deviceBindings,
      {
        default_kot_printer_id: deviceKotPrinterId,
        default_bill_printer_id: deviceBillPrinterId,
      }
    );
    setSystemCheckReport(report);
    setSystemCheckModalVisible(true);
  };

  const toggleCategorySelection = (catId: string) => {
    if (selectedCategoryIds.includes(catId)) {
      setSelectedCategoryIds(selectedCategoryIds.filter((id) => id !== catId));
    } else {
      setSelectedCategoryIds([...selectedCategoryIds, catId]);
    }
  };

  const toggleSectionSelection = (sec: TableSection) => {
    if (selectedSections.includes(sec)) {
      setSelectedSections(selectedSections.filter((s) => s !== sec));
    } else {
      setSelectedSections([...selectedSections, sec]);
    }
  };

  // Helper for printer card status badge
  const getPrinterCardStatusBadge = (p: RestaurantPrinter) => {
    if (!p.is_active) {
      return <View style={styles.inactiveBadge}><Text style={styles.inactiveBadgeText}>DISABLED</Text></View>;
    }

    if (p.connection_type === 'bluetooth' && !deviceBindings[p.id]?.bluetooth_mac_address) {
      return (
        <View style={styles.unboundBadge}>
          <Text style={styles.unboundBadgeText}>⚠️ UNBOUND ON TABLET</Text>
        </View>
      );
    }

    if (
      p.connection_type === 'usb' &&
      (deviceBindings[p.id]?.usb_vendor_id == null || deviceBindings[p.id]?.usb_product_id == null)
    ) {
      return (
        <View style={styles.unboundBadge}>
          <Text style={styles.unboundBadgeText}>⚠️ UNBOUND ON TABLET</Text>
        </View>
      );
    }

    if (['lan', 'wifi'].includes(p.connection_type) && (!p.ip_address || !p.ip_address.trim())) {
      return (
        <View style={styles.configIssueBadge}>
          <Text style={styles.configIssueBadgeText}>MISSING IP</Text>
        </View>
      );
    }

    return (
      <View style={styles.readyBadge}>
        <Text style={styles.readyBadgeText}>CONFIGURED</Text>
      </View>
    );
  };

  // Filter valid fallback printers (exclude self and cycle)
  const validFallbackPrinters = printers.filter((p) => {
    if (editingPrinter && p.id === editingPrinter.id) return false;
    if (!p.is_active) return false;
    return true;
  });

  return (
    <View style={styles.container}>
      {/* 1. Master Auto Print Status Banner */}
      <View style={[styles.autoPrintBanner, autoPrintActive ? styles.autoPrintBannerOn : styles.autoPrintBannerOff]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 16 }}>{autoPrintActive ? '🟢' : '⚪'}</Text>
            <Text style={styles.autoPrintBannerTitle}>
              Master Auto Print: {autoPrintActive ? 'ON' : 'OFF'}
            </Text>
          </View>
          <Text style={styles.autoPrintBannerText}>
            {autoPrintActive
              ? 'Automatically sends thermal KOTs and bills directly to configured printers.'
              : 'Uses manual printing. Direct printers will not trigger automatically.'}
          </Text>
        </View>
      </View>

      {/* 2. Header and Diagnostic Actions Bar */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🖨️ Multi-Printer Management</Text>
          <Text style={styles.subtitle}>
            Configure Bluetooth, USB, LAN, and Wi-Fi thermal printers per restaurant.
          </Text>
        </View>
        <TouchableOpacity
          testID="add-printer-btn"
          style={[styles.addBtn, !canManage && { opacity: 0.5 }]}
          onPress={openAddModal}
          disabled={!canManage}
        >
          <Text style={styles.addBtnText}>+ Add Printer</Text>
        </TouchableOpacity>
      </View>

      {/* Diagnostic Action Buttons */}
      <View style={styles.diagnosticsRow}>
        <TouchableOpacity style={styles.diagBtn} onPress={handleCheckAutoPrintSetup}>
          <Text style={styles.diagBtnText}>🔍 Check Auto Print Setup</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.diagBtn} onPress={handlePreviewRouting}>
          <Text style={styles.diagBtnText}>📋 Preview Routing</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.diagBtn} onPress={handleRunSystemCheck}>
          <Text style={styles.diagBtnText}>⚡ Run System Check</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.diagBtn, styles.diagBtnHarness]} onPress={() => setHarnessModalVisible(true)}>
          <Text style={[styles.diagBtnText, { color: '#7c3aed' }]}>🧪 Physical Test Harness</Text>
        </TouchableOpacity>
      </View>

      {/* 3. Printer Cards List */}
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.loadingText}>Loading configured printers...</Text>
        </View>
      ) : printers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>📠</Text>
          <Text style={styles.emptyTitle}>No Printers Configured</Text>
          <Text style={styles.emptySubtitle}>
            Add thermal printers to route KOTs to kitchen stations and bills to billing counters.
          </Text>
        </View>
      ) : (
        <View style={styles.printerList}>
          {printers.map((p) => (
            <View key={p.id} style={styles.printerCard}>
              <View style={styles.printerCardHeader}>
                <View style={styles.nameRow}>
                  <Text style={styles.printerName}>{p.name}</Text>
                  {p.is_primary && <View style={styles.primaryBadge}><Text style={styles.primaryBadgeText}>PRIMARY</Text></View>}
                  {getPrinterCardStatusBadge(p)}
                </View>

                <View style={styles.badgesRow}>
                  <View style={styles.connBadge}>
                    <Text style={styles.connBadgeText}>
                      {p.connection_type === 'bluetooth'
                        ? '🔵 Bluetooth'
                        : p.connection_type === 'usb'
                        ? '🔌 USB'
                        : p.connection_type === 'lan'
                        ? '🌐 LAN'
                        : '📶 Wi-Fi'}
                    </Text>
                  </View>
                  <View style={styles.paperBadge}>
                    <Text style={styles.paperBadgeText}>{p.paper_width}</Text>
                  </View>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>
                      {p.printer_role === 'both' ? 'KOT & BILL' : p.printer_role.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.printerDetails}>
                {['lan', 'wifi'].includes(p.connection_type) && p.ip_address && (
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '700' }}>Target: </Text>{p.ip_address}:{p.port || 9100}
                  </Text>
                )}
                {p.connection_type === 'bluetooth' && (
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '700' }}>Device: </Text>{p.bluetooth_device_name || 'Generic BT'}{' '}
                    {deviceBindings[p.id]?.bluetooth_mac_address
                      ? `(${deviceBindings[p.id]?.bluetooth_mac_address})`
                      : '(⚠️ Not bound on this tablet)'}
                  </Text>
                )}
                {p.connection_type === 'usb' && (
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '700' }}>USB Target: </Text>
                    {deviceBindings[p.id]?.usb_vendor_id !== undefined && deviceBindings[p.id]?.usb_vendor_id !== null
                      ? `VID: 0x${deviceBindings[p.id]!.usb_vendor_id!.toString(16).toUpperCase()}, PID: 0x${deviceBindings[p.id]!.usb_product_id!.toString(16).toUpperCase()}`
                      : '(⚠️ Not bound on this tablet)'}
                  </Text>
                )}
                <Text style={styles.detailText}>
                  <Text style={{ fontWeight: '700' }}>Calibration: </Text>{p.alignment || 'Center'} /{' '}
                  {Number(p.horizontal_shift_mm) > 0 ? `+${p.horizontal_shift_mm}` : p.horizontal_shift_mm}mm shift
                </Text>
                {p.category_ids && p.category_ids.length > 0 && (
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '700' }}>Categories: </Text>{p.category_ids.length} assigned
                  </Text>
                )}
                {p.section_names && p.section_names.length > 0 && (
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '700' }}>Sections: </Text>{p.section_names.join(', ')}
                  </Text>
                )}
                {p.fallback_printer_id && (
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '700' }}>Fallback: </Text>
                    {printers.find((tp) => tp.id === p.fallback_printer_id)?.name || 'Unknown target'}
                  </Text>
                )}
                <Text style={[styles.statusText, printerStatuses[p.id]?.color ? { color: printerStatuses[p.id]?.color } : null]}>
                  <Text style={{ fontWeight: '700' }}>Reachability: </Text>
                  {printerStatuses[p.id]?.text || 'Not tested in current session'}
                </Text>
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.actionBtnSecondary}
                  onPress={() => handleTestConnection(p)}
                  disabled={testingPrinterId === p.id}
                >
                  {testingPrinterId === p.id ? (
                    <ActivityIndicator size="small" color="#2563eb" />
                  ) : (
                    <Text style={styles.actionBtnTextSecondary}>Test Conn</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtnSecondary}
                  onPress={() => handleTestPrint(p)}
                  disabled={testingPrinterId === p.id}
                >
                  <Text style={styles.actionBtnTextSecondary}>Test Print</Text>
                </TouchableOpacity>

                {(p.printer_role === 'kot' || p.printer_role === 'both') && (
                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={() => handlePrintSampleKot(p)}
                  >
                    <Text style={styles.actionBtnTextSecondary}>Test KOT</Text>
                  </TouchableOpacity>
                )}

                {(p.printer_role === 'bill' || p.printer_role === 'both') && (
                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={() => handlePrintSampleBill(p)}
                  >
                    <Text style={styles.actionBtnTextSecondary}>Test Bill</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionBtnSecondary}
                  onPress={() => openEditModal(p)}
                  disabled={!canManage}
                >
                  <Text style={styles.actionBtnTextSecondary}>Edit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtnDanger}
                  onPress={() => handleDeletePrinter(p)}
                  disabled={!canManage}
                >
                  <Text style={styles.actionBtnTextDanger}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* 4. Device-Local Defaults Card */}
      {printers.length > 0 && (
        <View style={styles.deviceCard}>
          <Text style={styles.deviceCardTitle}>📱 This Device Defaults (Local Tablet Binding)</Text>
          <Text style={styles.deviceCardSubtitle}>
            Configure which printer this tablet sends KOTs and Bills to by default.
          </Text>

          <View style={styles.deviceFormRow}>
            <View style={styles.deviceFormCol}>
              <Text style={styles.fieldLabel}>Default KOT Printer for this Device</Text>
              <View style={styles.pickerWrap}>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => {
                    const kotPrinters = printers.filter((p) => p.printer_role === 'kot' || p.printer_role === 'both');
                    if (kotPrinters.length === 0) return;
                    const idx = kotPrinters.findIndex((p) => p.id === deviceKotPrinterId);
                    const next = kotPrinters[(idx + 1) % kotPrinters.length];
                    setDeviceKotPrinterId(next?.id || '');
                  }}
                >
                  <Text style={styles.pickerBtnText}>
                    {printers.find((p) => p.id === deviceKotPrinterId)?.name || 'Auto (Primary KOT Printer)'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.deviceFormCol}>
              <Text style={styles.fieldLabel}>Default Bill Printer for this Device</Text>
              <View style={styles.pickerWrap}>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => {
                    const billPrinters = printers.filter((p) => p.printer_role === 'bill' || p.printer_role === 'both');
                    if (billPrinters.length === 0) return;
                    const idx = billPrinters.findIndex((p) => p.id === deviceBillPrinterId);
                    const next = billPrinters[(idx + 1) % billPrinters.length];
                    setDeviceBillPrinterId(next?.id || '');
                  }}
                >
                  <Text style={styles.pickerBtnText}>
                    {printers.find((p) => p.id === deviceBillPrinterId)?.name || 'Auto (Primary Bill Printer)'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveDefaultsBtn}
            onPress={handleSaveDeviceDefaults}
            disabled={isSavingDeviceDefaults}
          >
            {isSavingDeviceDefaults ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveDefaultsBtnText}>Save Device Defaults</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================================================= */}
      {/* 5. DIAGNOSTIC MODAL: Check Auto Print Setup                                */}
      {/* ========================================================================= */}
      <Modal visible={readinessModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔍 Auto Print Setup Readiness Check</Text>
              <TouchableOpacity onPress={() => setReadinessModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={[styles.diagStatusHeader, readinessReport?.isReady ? styles.diagReady : styles.diagAttention]}>
                <Text style={styles.diagStatusTitle}>
                  {readinessReport?.isReady ? '✓ Auto Print is Ready' : '⚠️ Attention Required'}
                </Text>
                <Text style={styles.diagStatusMessage}>{readinessReport?.statusMessage}</Text>
              </View>

              <Text style={[styles.sectionHeader, { marginTop: 14 }]}>Configuration Checklist</Text>
              {readinessReport?.checklist.map((item) => (
                <View key={item.key} style={styles.checkItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkItemLabel}>{item.label}</Text>
                    {item.detail ? <Text style={styles.checkItemDetail}>{item.detail}</Text> : null}
                  </View>
                  <View
                    style={[
                      styles.checkBadge,
                      item.status === 'ready'
                        ? styles.checkBadgeReady
                        : item.status === 'error'
                        ? styles.checkBadgeError
                        : item.status === 'warning'
                        ? styles.checkBadgeWarning
                        : styles.checkBadgeMuted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.checkBadgeText,
                        item.status === 'ready'
                          ? { color: '#047857' }
                          : item.status === 'error'
                          ? { color: '#b91c1c' }
                          : item.status === 'warning'
                          ? { color: '#b45309' }
                          : { color: '#64748b' },
                      ]}
                    >
                      {item.summary}
                    </Text>
                  </View>
                </View>
              ))}

              <View style={styles.diagFooterNotice}>
                <Text style={styles.diagFooterNoticeText}>
                  ℹ️ Diagnostic only. This check inspects configuration and does NOT transmit data or connect to physical hardware.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setReadinessModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. DIAGNOSTIC MODAL: Routing Preview                                      */}
      {/* ========================================================================= */}
      <Modal visible={previewModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📋 KOT & Bill Routing Preview</Text>
              <TouchableOpacity onPress={() => setPreviewModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.previewSubtext}>
                Demonstrates how live orders are deterministically routed across configured printers without touching physical hardware.
              </Text>

              <Text style={styles.sectionHeader}>KOT Document Splits</Text>
              {previewReport?.kotRoutes.length === 0 ? (
                <Text style={styles.emptyDetailText}>No active KOT routes available.</Text>
              ) : (
                previewReport?.kotRoutes.map((route, idx) => (
                  <View key={idx} style={styles.previewCard}>
                    <View style={styles.previewCardHeader}>
                      <Text style={styles.previewCardTitle}>🖨️ {route.printerName}</Text>
                      <View style={styles.connBadge}>
                        <Text style={styles.connBadgeText}>{route.connectionType} ({route.paperWidth})</Text>
                      </View>
                    </View>
                    <Text style={styles.previewReasonText}>Routing Reason: {route.routingReason}</Text>
                    <View style={styles.previewItemsList}>
                      {route.items.map((i, iIdx) => (
                        <Text key={iIdx} style={styles.previewItemText}>
                          • {i.quantity}x {i.name} {i.notes ? `(${i.notes})` : ''}
                        </Text>
                      ))}
                    </View>
                  </View>
                ))
              )}

              <Text style={[styles.sectionHeader, { marginTop: 14 }]}>Final Bill Destination</Text>
              {previewReport?.billRoute ? (
                <View style={styles.previewCard}>
                  <View style={styles.previewCardHeader}>
                    <Text style={styles.previewCardTitle}>🧾 {previewReport.billRoute.printerName}</Text>
                    <View style={styles.connBadge}>
                      <Text style={styles.connBadgeText}>{previewReport.billRoute.connectionType} ({previewReport.billRoute.paperWidth})</Text>
                    </View>
                  </View>
                  <Text style={styles.previewReasonText}>Routing Reason: {previewReport.billRoute.routingReason}</Text>
                </View>
              ) : (
                <Text style={styles.emptyDetailText}>No active Bill printer configured.</Text>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPreviewModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. DIAGNOSTIC MODAL: Printer System Health Check                          */}
      {/* ========================================================================= */}
      <Modal visible={systemCheckModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ RestroZ Printer System Health Check</Text>
              <TouchableOpacity onPress={() => setSystemCheckModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.sysCheckList}>
                {systemCheckReport?.checks.map((c, idx) => (
                  <View key={idx} style={styles.sysCheckRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sysCheckName}>{c.name}</Text>
                      <Text style={styles.sysCheckDetail}>{c.detail}</Text>
                    </View>
                    <View
                      style={[
                        styles.sysCheckBadge,
                        c.status === 'PASS' || c.status === 'CONFIGURED'
                          ? styles.sysCheckPass
                          : c.status === 'NOT_TESTED'
                          ? styles.sysCheckNotTested
                          : c.status === 'WARN'
                          ? styles.sysCheckWarn
                          : styles.sysCheckFail,
                      ]}
                    >
                      <Text style={styles.sysCheckBadgeText}>{c.status}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.hardwareStatusBox}>
                <Text style={styles.hardwareStatusTitle}>Physical Hardware Status</Text>
                <Text style={styles.hardwareStatusText}>
                  {systemCheckReport?.hardwareStatus}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setSystemCheckModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. DIAGNOSTIC MODAL: Physical Validation Harness                          */}
      {/* ========================================================================= */}
      <Modal visible={harnessModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🧪 Physical Hardware Validation Harness</Text>
              <TouchableOpacity onPress={() => setHarnessModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.harnessWarningBox}>
                <Text style={styles.harnessWarningTitle}>⚠️ Physical Hardware Validation Notice</Text>
                <Text style={styles.harnessWarningText}>
                  These actions send real test commands to connected thermal hardware. Run these explicitly during physical hardware testing.
                </Text>
              </View>

              {printers.map((p) => (
                <View key={p.id} style={styles.harnessCard}>
                  <Text style={styles.harnessCardTitle}>
                    {p.name} ({p.connection_type.toUpperCase()} • {p.paper_width})
                  </Text>

                  <View style={styles.harnessButtonsRow}>
                    <TouchableOpacity
                      style={styles.harnessActionBtn}
                      onPress={() => handleTestConnection(p)}
                    >
                      <Text style={styles.harnessActionBtnText}>Test Conn</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.harnessActionBtn}
                      onPress={() => {
                        Alert.alert('Print Physical Test', `Print 1 test receipt to "${p.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Print', onPress: () => handleTestPrint(p) },
                        ]);
                      }}
                    >
                      <Text style={styles.harnessActionBtnText}>Test Print</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.harnessActionBtn}
                      onPress={() => {
                        Alert.alert('Print Calibration Sheet', `Print calibration receipt to "${p.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Print',
                            onPress: () => printerManager.printCalibrationTest(p).then((res) => {
                              if (res.success) showToast('success', 'Sent', 'Calibration sheet sent.');
                              else showToast('error', 'Failed', res.message);
                            }),
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.harnessActionBtnText}>Calibration</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.harnessActionBtn}
                      onPress={() => {
                        Alert.alert('Print Sample KOT', `Print sample KOT to "${p.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Print', onPress: () => handlePrintSampleKot(p) },
                        ]);
                      }}
                    >
                      <Text style={styles.harnessActionBtnText}>Sample KOT</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.harnessActionBtn}
                      onPress={() => {
                        Alert.alert('Print Sample Bill', `Print sample Bill to "${p.name}"?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Print', onPress: () => handlePrintSampleBill(p) },
                        ]);
                      }}
                    >
                      <Text style={styles.harnessActionBtnText}>Sample Bill</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setHarnessModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* 9. ADD / EDIT PRINTER MODAL                                               */}
      {/* ========================================================================= */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPrinter ? `Edit ${editingPrinter.name}` : 'Add New Thermal Printer'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* 1. Connection Type Selector */}
              <Text style={styles.sectionHeader}>1. Connection Type</Text>
              <View style={styles.connTypeRow}>
                {(['wifi', 'lan', 'bluetooth', 'usb'] as PrinterConnectionType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.connTypeBtn, connectionType === type && styles.connTypeBtnActive]}
                    onPress={() => setConnectionType(type)}
                  >
                    <Text
                      style={[
                        styles.connTypeBtnText,
                        connectionType === type && styles.connTypeBtnTextActive,
                      ]}
                    >
                      {type === 'wifi'
                        ? '📶 Wi-Fi'
                        : type === 'lan'
                        ? '🌐 LAN'
                        : type === 'bluetooth'
                        ? '🔵 Bluetooth'
                        : '🔌 USB / OTG'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 2. Basic Configuration */}
              <Text style={styles.sectionHeader}>2. Printer Details</Text>
              <Text style={styles.fieldLabel}>Printer Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Kitchen POS80, Bar Counter, Billing 1"
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
              />

              <View style={styles.rowTwoCol}>
                <View style={styles.col}>
                  <Text style={styles.fieldLabel}>Paper Width</Text>
                  <View style={styles.segmentedRow}>
                    {(['58mm', '80mm'] as PrinterPaperWidth[]).map((w) => (
                      <TouchableOpacity
                        key={w}
                        style={[styles.segmentBtn, paperWidth === w && styles.segmentBtnActive]}
                        onPress={() => setPaperWidth(w)}
                      >
                        <Text style={[styles.segmentBtnText, paperWidth === w && styles.segmentBtnTextActive]}>
                          {w}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.col}>
                  <Text style={styles.fieldLabel}>Role</Text>
                  <View style={styles.segmentedRow}>
                    {(['kot', 'bill', 'both'] as PrinterRole[]).map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.segmentBtn, printerRole === r && styles.segmentBtnActive]}
                        onPress={() => setPrinterRole(r)}
                      >
                        <Text style={[styles.segmentBtnText, printerRole === r && styles.segmentBtnTextActive]}>
                          {r.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <Text style={styles.roleExplanationText}>
                {printerRole === 'kot'
                  ? 'KOT: Kitchen & order tickets.'
                  : printerRole === 'bill'
                  ? 'Bill: Customer bills & payment receipts.'
                  : 'Both: Can handle either KOT or Bill.'}
              </Text>

              {/* Network Specific Fields */}
              {['lan', 'wifi'].includes(connectionType) && (
                <View style={styles.rowTwoCol}>
                  <View style={[styles.col, { flex: 2 }]}>
                    <Text style={styles.fieldLabel}>IP Address / Hostname *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 192.168.1.120"
                      placeholderTextColor="#94a3b8"
                      value={ipAddress}
                      onChangeText={setIpAddress}
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={[styles.col, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Port</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="9100"
                      placeholderTextColor="#94a3b8"
                      value={port}
                      onChangeText={setPort}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              )}

              {/* Bluetooth Specific Fields */}
              {connectionType === 'bluetooth' && (
                <View style={styles.infoNoticeBox}>
                  <Text style={styles.infoNoticeTitle}>🔵 Bluetooth Classic Printer (SPP / RFCOMM)</Text>
                  <Text style={styles.infoNoticeText}>
                    Pair your Bluetooth thermal printer in Android Settings, then scan below to bind it to this device.
                  </Text>

                  <TouchableOpacity
                    style={[styles.addBtn, { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#0284c7' }]}
                    onPress={handleScanBluetoothDevices}
                    disabled={isScanningBt}
                  >
                    {isScanningBt ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.addBtnText}>🔍 Scan Paired Bluetooth Devices</Text>
                    )}
                  </TouchableOpacity>

                  {selectedBluetoothMac ? (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: '#ecfdf5', borderRadius: 6, borderWidth: 1, borderColor: '#a7f3d0' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#065f46' }}>
                        ✓ Bound Device: {bluetoothDeviceName || 'Thermal Printer'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#047857' }}>MAC Address: {selectedBluetoothMac}</Text>
                    </View>
                  ) : null}

                  {discoveredBluetoothDevices.length > 0 && (
                    <View style={{ marginTop: 10, gap: 6 }}>
                      <Text style={[styles.fieldLabel, { marginBottom: 2 }]}>Available Paired Devices:</Text>
                      {discoveredBluetoothDevices.map((d) => (
                        <TouchableOpacity
                          key={d.address}
                          style={{
                            padding: 8,
                            backgroundColor: selectedBluetoothMac === d.address ? '#dbeafe' : '#f8fafc',
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: selectedBluetoothMac === d.address ? '#2563eb' : '#cbd5e1',
                          }}
                          onPress={() => {
                            setSelectedBluetoothMac(d.address);
                            if (d.name && !name) setName(d.name);
                            if (d.name) setBluetoothDeviceName(d.name);
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>
                            {d.name} {selectedBluetoothMac === d.address ? '✓' : ''}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748b' }}>MAC: {d.address}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Device Name (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. POS-80, MPT-II"
                    placeholderTextColor="#94a3b8"
                    value={bluetoothDeviceName}
                    onChangeText={setBluetoothDeviceName}
                  />
                </View>
              )}

              {/* USB Specific Fields */}
              {connectionType === 'usb' && (
                <View style={styles.infoNoticeBox}>
                  <Text style={styles.infoNoticeTitle}>🔌 USB Host / USB-OTG Printer</Text>
                  <Text style={styles.infoNoticeText}>
                    Connect the thermal printer using USB OTG or the tablet's USB Host port.
                  </Text>

                  <TouchableOpacity
                    style={[styles.addBtn, { marginTop: 10, alignSelf: 'flex-start', backgroundColor: '#0284c7' }]}
                    onPress={handleDetectUsbPrinters}
                    disabled={isScanningUsb}
                  >
                    {isScanningUsb ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.addBtnText}>🔍 Detect USB Printers</Text>
                    )}
                  </TouchableOpacity>

                  {usbVendorId && usbProductId ? (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: '#ecfdf5', borderRadius: 6, borderWidth: 1, borderColor: '#a7f3d0' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#065f46' }}>
                        ✓ Bound USB Target: VID {usbVendorId}, PID {usbProductId}
                      </Text>
                      {usbSerialNumber ? (
                        <Text style={{ fontSize: 11, color: '#047857' }}>Serial: {usbSerialNumber}</Text>
                      ) : null}
                    </View>
                  ) : null}

                  {discoveredUsbDevices.length > 0 && (
                    <View style={{ marginTop: 10, gap: 6 }}>
                      <Text style={[styles.fieldLabel, { marginBottom: 2 }]}>Attached USB Devices:</Text>
                      {discoveredUsbDevices.map((d) => {
                        const vHex = `0x${d.vendorId.toString(16).toUpperCase()}`;
                        const pHex = `0x${d.productId.toString(16).toUpperCase()}`;
                        const isSelected = usbVendorId === vHex && usbProductId === pHex;
                        return (
                          <TouchableOpacity
                            key={d.deviceId}
                            style={{
                              padding: 8,
                              backgroundColor: isSelected ? '#dbeafe' : '#f8fafc',
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: isSelected ? '#2563eb' : '#cbd5e1',
                            }}
                            onPress={() => {
                              setUsbVendorId(vHex);
                              setUsbProductId(pHex);
                              if (d.serialNumber) setUsbSerialNumber(d.serialNumber);
                              if (d.deviceName && !name) setName(d.deviceName);
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>
                              {d.deviceName || 'Thermal USB Printer'} {isSelected ? '✓' : ''}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#64748b' }}>
                              VID: {vHex} • PID: {pHex} {d.serialNumber ? `• S/N: ${d.serialNumber}` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.rowTwoCol}>
                    <View style={styles.col}>
                      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Vendor ID (Hex/Dec)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 0x0416 or 1046"
                        placeholderTextColor="#94a3b8"
                        value={usbVendorId}
                        onChangeText={setUsbVendorId}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Product ID (Hex/Dec)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 0x5011 or 20497"
                        placeholderTextColor="#94a3b8"
                        value={usbProductId}
                        onChangeText={setUsbProductId}
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* 3. Primary and Fallback Configuration */}
              <Text style={styles.sectionHeader}>3. Primary & Fallback Routing</Text>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setIsPrimary(!isPrimary)}
              >
                <View style={[styles.checkbox, isPrimary && styles.checkboxActive]}>
                  {isPrimary && <Text style={styles.checkboxText}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>Set as Restaurant Primary Printer for this role</Text>
              </TouchableOpacity>

              <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Fallback Printer (Optional)</Text>
              <View style={styles.pickerWrap}>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => {
                    if (validFallbackPrinters.length === 0) return;
                    const idx = validFallbackPrinters.findIndex((p) => p.id === fallbackPrinterId);
                    const next = validFallbackPrinters[(idx + 1) % validFallbackPrinters.length];
                    setFallbackPrinterId(next?.id || '');
                  }}
                >
                  <Text style={styles.pickerBtnText}>
                    {printers.find((p) => p.id === fallbackPrinterId)?.name || 'None (No fallback)'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 4. KOT Routing (Categories & Sections) */}
              {(printerRole === 'kot' || printerRole === 'both') && (
                <View style={styles.routingSection}>
                  <Text style={styles.sectionHeader}>4. KOT Menu Categories & Dining Sections</Text>
                  <Text style={styles.helperText}>
                    Route specific menu categories to this printer (e.g. Kitchen, Bar, Bakery).
                  </Text>
                  <View style={styles.tagWrap}>
                    {categories.map((cat) => {
                      const selected = selectedCategoryIds.includes(cat.id);
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[styles.tag, selected && styles.tagActive]}
                          onPress={() => toggleCategorySelection(cat.id)}
                        >
                          <Text style={[styles.tagText, selected && styles.tagTextActive]}>
                            {cat.name} {selected ? '✓' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.helperText}>
                    Route specific dining room sections or floors to this printer (e.g. Rooftop).
                  </Text>
                  <View style={styles.tagWrap}>
                    {TABLE_SECTIONS.map((sec) => {
                      const selected = selectedSections.includes(sec);
                      return (
                        <TouchableOpacity
                          key={sec}
                          style={[styles.tag, selected && styles.tagActive]}
                          onPress={() => toggleSectionSelection(sec)}
                        >
                          <Text style={[styles.tagText, selected && styles.tagTextActive]}>
                            {sec} {selected ? '✓' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* 5. Physical Calibration Controls */}
              <View style={styles.calibrationSection}>
                <Text style={styles.sectionHeader}>5. Physical Paper Calibration</Text>
                <Text style={styles.helperText}>
                  Adjust alignment and margins to prevent text clipping on physical paper.
                </Text>

                <Text style={styles.fieldLabel}>Alignment</Text>
                <View style={styles.segmentedRow}>
                  {(['left', 'center', 'right'] as PrinterAlignment[]).map((a) => (
                    <TouchableOpacity
                      key={a}
                      style={[styles.segmentBtn, alignment === a && styles.segmentBtnActive]}
                      onPress={() => setAlignment(a)}
                    >
                      <Text style={[styles.segmentBtnText, alignment === a && styles.segmentBtnTextActive]}>
                        {a.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>
                  Horizontal Shift: <Text style={styles.highlightVal}>{horizontalShiftMm > 0 ? `+${horizontalShiftMm}` : horizontalShiftMm} mm</Text>
                </Text>
                <Text style={styles.subHelperText}>Negative = Left shift • Positive = Right shift (-10mm to +10mm)</Text>
                <View style={styles.stepperRow}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(-2.0)}><Text style={styles.stepBtnText}>-2mm</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(-0.5)}><Text style={styles.stepBtnText}>-0.5mm</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.stepBtn, styles.stepBtnZero]} onPress={() => setHorizontalShiftMm(0.0)}><Text style={styles.stepBtnTextZero}>0 mm</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(0.5)}><Text style={styles.stepBtnText}>+0.5mm</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(2.0)}><Text style={styles.stepBtnText}>+2mm</Text></TouchableOpacity>
                </View>

                <View style={styles.rowTwoCol}>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Left Margin (mm)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.0"
                      value={String(marginLeftMm)}
                      onChangeText={(t) => setMarginLeftMm(Number(t) || 0)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Right Margin (mm)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.0"
                      value={String(marginRightMm)}
                      onChangeText={(t) => setMarginRightMm(Number(t) || 0)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.calibrationActionsRow}>
                  <TouchableOpacity style={styles.calTestBtn} onPress={handleCalibrationTest}>
                    <Text style={styles.calTestBtnText}>📄 Print Calibration Test</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.calResetBtn} onPress={resetCalibrationForm}>
                    <Text style={styles.calResetBtnText}>Reset</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={handleSavePrinter}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveModalBtnText}>
                    {editingPrinter ? 'Save Changes' : 'Create Printer'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 10,
  },
  autoPrintBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
  },
  autoPrintBannerOn: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  autoPrintBannerOff: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  autoPrintBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  autoPrintBannerText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 2,
  },
  diagnosticsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  diagBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  diagBtnHarness: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  diagBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  addBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  centerBox: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 380,
  },
  printerList: {
    gap: 12,
  },
  printerCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  printerCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  printerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  primaryBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  inactiveBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  readyBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  readyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  unboundBadge: {
    backgroundColor: '#fffbeb',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  unboundBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b45309',
  },
  configIssueBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  configIssueBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b91c1c',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 4,
  },
  connBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  connBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  paperBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  paperBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  roleBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  printerDetails: {
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 2,
    marginVertical: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#475569',
  },
  statusText: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  actionBtnSecondary: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnTextSecondary: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  actionBtnDanger: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  actionBtnTextDanger: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#b91c1c',
  },
  deviceCard: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  deviceCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  deviceCardSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 8,
  },
  deviceFormRow: {
    flexDirection: 'row',
    gap: 10,
  },
  deviceFormCol: {
    flex: 1,
  },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  pickerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pickerBtnText: {
    fontSize: 12.5,
    color: '#0f172a',
    fontWeight: '600',
  },
  saveDefaultsBtn: {
    marginTop: 10,
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveDefaultsBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '700',
  },
  modalBody: {
    padding: 16,
  },
  sectionHeader: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  connTypeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  connTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
  },
  connTypeBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  connTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  connTypeBtnTextActive: {
    color: '#1d4ed8',
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 10,
  },
  rowTwoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
    marginBottom: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentBtnTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  roleExplanationText: {
    fontSize: 11.5,
    color: '#64748b',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  infoNoticeBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  infoNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
    marginBottom: 2,
  },
  infoNoticeText: {
    fontSize: 11.5,
    color: '#166534',
    lineHeight: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkboxText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  routingSection: {
    marginTop: 6,
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tagActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  tagText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  tagTextActive: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  calibrationSection: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  highlightVal: {
    color: '#2563eb',
    fontWeight: '800',
  },
  subHelperText: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  stepBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
  },
  stepBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  stepBtnZero: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  stepBtnTextZero: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  calibrationActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  calTestBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
    alignItems: 'center',
  },
  calTestBtnText: {
    color: '#0369a1',
    fontWeight: '700',
    fontSize: 12,
  },
  calResetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center',
  },
  calResetBtnText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 12,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  saveModalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  saveModalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Diagnostic Modal Styles
  diagStatusHeader: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  diagReady: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  diagAttention: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  diagStatusTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  diagStatusMessage: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  checkItemLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  checkItemDetail: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  checkBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  checkBadgeReady: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  checkBadgeError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  checkBadgeWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  checkBadgeMuted: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  checkBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  diagFooterNotice: {
    marginTop: 14,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  diagFooterNoticeText: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },
  previewSubtext: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
    lineHeight: 16,
  },
  previewCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  previewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  previewReasonText: {
    fontSize: 11.5,
    color: '#2563eb',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 6,
  },
  previewItemsList: {
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    gap: 2,
  },
  previewItemText: {
    fontSize: 12,
    color: '#334155',
  },
  emptyDetailText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  sysCheckList: {
    gap: 8,
  },
  sysCheckRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  sysCheckName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  sysCheckDetail: {
    fontSize: 11.5,
    color: '#64748b',
  },
  sysCheckBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  sysCheckPass: {
    backgroundColor: '#ecfdf5',
  },
  sysCheckWarn: {
    backgroundColor: '#fffbeb',
  },
  sysCheckFail: {
    backgroundColor: '#fef2f2',
  },
  sysCheckNotTested: {
    backgroundColor: '#f1f5f9',
  },
  sysCheckBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  hardwareStatusBox: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  hardwareStatusTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
  },
  hardwareStatusText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  harnessWarningBox: {
    backgroundColor: '#fffbeb',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 12,
  },
  harnessWarningTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400e',
  },
  harnessWarningText: {
    fontSize: 11.5,
    color: '#78350f',
    marginTop: 2,
    lineHeight: 15,
  },
  harnessCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginBottom: 10,
  },
  harnessCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  harnessButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  harnessActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  harnessActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
});
