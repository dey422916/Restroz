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
  Category,
  TableSection,
} from '../types';
import { printerManager } from '../services/printerManager';
import { CALIBRATION_LIMITS, DEFAULT_PRINTER_CALIBRATION } from '../services/printerManager/printerTypes';

interface Props {
  restaurantId: string;
  categories: Category[];
  canManage: boolean;
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

  const loadPrinters = useCallback(async () => {
    if (!restaurantId) return;
    setIsLoading(true);
    try {
      const data = await printerManager.getRestaurantPrinters(restaurantId);
      setPrinters(data);

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
      if (editingPrinter) {
        await printerManager.updatePrinter(editingPrinter.id, {
          name: name.trim(),
          connection_type: connectionType,
          paper_width: paperWidth,
          printer_role: printerRole,
          is_primary: isPrimary,
          fallback_printer_id: fallbackPrinterId || null,
          ip_address: ipAddress.trim() || null,
          port: portNum || 9100,
          bluetooth_device_name: bluetoothDeviceName.trim() || null,
          category_ids: selectedCategoryIds,
          section_names: selectedSections,
          ...calibrationPayload,
        });
        showToast('success', 'Printer Updated', `${name} updated successfully.`);
      } else {
        await printerManager.createPrinter({
          restaurant_id: restaurantId,
          name: name.trim(),
          connection_type: connectionType,
          paper_width: paperWidth,
          printer_role: printerRole,
          is_active: true,
          is_primary: isPrimary,
          fallback_printer_id: fallbackPrinterId || null,
          ip_address: ipAddress.trim() || null,
          port: portNum || 9100,
          bluetooth_device_name: bluetoothDeviceName.trim() || null,
          category_ids: selectedCategoryIds,
          section_names: selectedSections,
          ...calibrationPayload,
        });
        showToast('success', 'Printer Added', `${name} added successfully.`);
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
      if (window.confirm(`Are you sure you want to delete "${printer.name}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Printer', `Are you sure you want to delete "${printer.name}"?`, [
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
      showToast('success', 'Saved', 'Device-local default printers updated.');
    } catch (err: any) {
      showToast('error', 'Error', err.message || 'Could not save device defaults.');
    } finally {
      setIsSavingDeviceDefaults(false);
    }
  };

  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [printerStatuses, setPrinterStatuses] = useState<Record<string, { status: string; text: string; color?: string }>>({});

  const handleTestConnection = async (p: RestaurantPrinter) => {
    if (p.connection_type === 'bluetooth') {
      const msg = 'Bluetooth printer discovery & connection testing will become available after Bluetooth printer support is installed.';
      if (Platform.OS === 'web') window.alert(`[${p.name}]\n${msg}`);
      else Alert.alert(p.name, msg);
      return;
    }
    if (p.connection_type === 'usb') {
      const msg = 'USB printer detection & testing will become available after USB printer support is installed.';
      if (Platform.OS === 'web') window.alert(`[${p.name}]\n${msg}`);
      else Alert.alert(p.name, msg);
      return;
    }

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
        showToast('success', 'Printer Reachable', `${p.name} responded in ${result.latencyMs}ms (${p.ip_address}:${p.port || 9100}).`);
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
      showToast('error', 'Test Failed', err.message || 'Unknown network error.');
    } finally {
      setTestingPrinterId(null);
    }
  };

  const handleTestPrint = async (p: RestaurantPrinter) => {
    if (p.connection_type !== 'lan' && p.connection_type !== 'wifi') {
      const msg = `${p.connection_type.toUpperCase()} test printing will become available after hardware support is installed.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert(p.name, msg);
      return;
    }

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

    if (connectionType !== 'lan' && connectionType !== 'wifi') {
      const msg = `${connectionType.toUpperCase()} calibration test printing will become available after driver installation.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Calibration Test', msg);
      return;
    }

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
    if (p.connection_type !== 'lan' && p.connection_type !== 'wifi') {
      showToast('info', 'Hardware Support Pending', 'Available for LAN / Wi-Fi printers in Phase 3.');
      return;
    }
    try {
      const result = await printerManager.printSampleKot(p);
      if (result.success) {
        showToast('success', 'KOT Sample Sent', `Deterministic test KOT sent to ${p.name}.`);
      } else {
        showToast('error', 'KOT Print Failed', result.message);
      }
    } catch (err: any) {
      showToast('error', 'Error', err?.message || 'Failed to print test KOT.');
    }
  };

  const handlePrintSampleBill = async (p: RestaurantPrinter) => {
    if (p.connection_type !== 'lan' && p.connection_type !== 'wifi') {
      showToast('info', 'Hardware Support Pending', 'Available for LAN / Wi-Fi printers in Phase 3.');
      return;
    }
    try {
      const result = await printerManager.printSampleBill(p);
      if (result.success) {
        showToast('success', 'Bill Sample Sent', `Deterministic test Bill sent to ${p.name}.`);
      } else {
        showToast('error', 'Bill Print Failed', result.message);
      }
    } catch (err: any) {
      showToast('error', 'Error', err?.message || 'Failed to print test Bill.');
    }
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

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
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
                  {!p.is_active && <View style={styles.inactiveBadge}><Text style={styles.inactiveBadgeText}>DISABLED</Text></View>}
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
                    <b>Target:</b> {p.ip_address}:{p.port || 9100}
                  </Text>
                )}
                {p.connection_type === 'bluetooth' && p.bluetooth_device_name && (
                  <Text style={styles.detailText}>
                    <b>Device Name:</b> {p.bluetooth_device_name}
                  </Text>
                )}
                <Text style={styles.detailText}>
                  <b>Calibration:</b> {p.alignment || 'Center'} / {Number(p.horizontal_shift_mm) > 0 ? `+${p.horizontal_shift_mm}` : p.horizontal_shift_mm}mm shift
                </Text>
                {p.category_ids && p.category_ids.length > 0 && (
                  <Text style={styles.detailText}>
                    <b>Categories:</b> {p.category_ids.length} assigned
                  </Text>
                )}
                {p.section_names && p.section_names.length > 0 && (
                  <Text style={styles.detailText}>
                    <b>Sections:</b> {p.section_names.join(', ')}
                  </Text>
                )}
                <Text style={[styles.statusText, printerStatuses[p.id]?.color ? { color: printerStatuses[p.id]?.color } : null]}>
                  <b>Status:</b> {printerStatuses[p.id]?.text || (['lan', 'wifi'].includes(p.connection_type) ? 'Configured (TCP Ready)' : 'Configured')}
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
                {['lan', 'wifi'].includes(p.connection_type) && (
                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={() => handleTestPrint(p)}
                    disabled={testingPrinterId === p.id}
                  >
                    <Text style={styles.actionBtnTextSecondary}>Test Print</Text>
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

      {/* Device-Local Defaults Card */}
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

      {/* Add / Edit Printer Modal */}
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
                  <Text style={styles.infoNoticeTitle}>Bluetooth Discovery</Text>
                  <Text style={styles.infoNoticeText}>
                    Bluetooth printer discovery will become available after Bluetooth printer support is installed in Phase 4.
                  </Text>
                  <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Device Name (Optional)</Text>
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
                  <Text style={styles.infoNoticeTitle}>USB OTG Detection</Text>
                  <Text style={styles.infoNoticeText}>
                    USB printer detection will become available after USB printer support is installed in Phase 5.
                  </Text>
                </View>
              )}

              {/* Primary & Fallback */}
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.checkbox, isPrimary && styles.checkboxActive]}
                  onPress={() => setIsPrimary(!isPrimary)}
                >
                  <Text style={styles.checkboxText}>{isPrimary ? '✓' : ''}</Text>
                </TouchableOpacity>
                <Text style={styles.checkboxLabel}>Set as Primary {printerRole.toUpperCase()} Printer</Text>
              </View>

              {/* 3. Category Routing Foundation */}
              {(printerRole === 'kot' || printerRole === 'both') && categories.length > 0 && (
                <View style={styles.routingSection}>
                  <Text style={styles.sectionHeader}>3. Category Routing (Optional)</Text>
                  <Text style={styles.helperText}>
                    Select specific menu categories for this kitchen station. Leave unselected to receive all items.
                  </Text>
                  <View style={styles.tagWrap}>
                    {categories.map((c) => {
                      const selected = selectedCategoryIds.includes(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.tag, selected && styles.tagActive]}
                          onPress={() => toggleCategorySelection(c.id)}
                        >
                          <Text style={[styles.tagText, selected && styles.tagTextActive]}>
                            {c.name} {selected ? '✓' : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* 4. Floor / Section Routing Foundation */}
              {(printerRole === 'kot' || printerRole === 'both') && (
                <View style={styles.routingSection}>
                  <Text style={styles.sectionHeader}>4. Floor / Section Routing (Optional)</Text>
                  <Text style={styles.helperText}>
                    Select dining table sections that route to this printer.
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

              {/* 5. Print Calibration */}
              <View style={styles.calibrationSection}>
                <Text style={styles.sectionHeader}>5. Print Calibration</Text>
                <Text style={styles.helperText}>
                  Fine-tune hardware margins and horizontal alignment without altering application CSS.
                </Text>

                {/* Alignment */}
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

                {/* Horizontal Shift */}
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                  Horizontal Shift: <Text style={styles.highlightVal}>{horizontalShiftMm > 0 ? `+${horizontalShiftMm}` : horizontalShiftMm}mm</Text>
                </Text>
                <Text style={styles.subHelperText}>
                  Negative = Move content LEFT | Positive = Move content RIGHT
                </Text>

                <View style={styles.stepperRow}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(-2.0)}>
                    <Text style={styles.stepBtnText}>-2mm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(-1.0)}>
                    <Text style={styles.stepBtnText}>-1mm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(-0.5)}>
                    <Text style={styles.stepBtnText}>-0.5mm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.stepBtn, styles.stepBtnZero]} onPress={() => setHorizontalShiftMm(0.0)}>
                    <Text style={styles.stepBtnTextZero}>RESET 0</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(+0.5)}>
                    <Text style={styles.stepBtnText}>+0.5mm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(+1.0)}>
                    <Text style={styles.stepBtnText}>+1mm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjustShift(+2.0)}>
                    <Text style={styles.stepBtnText}>+2mm</Text>
                  </TouchableOpacity>
                </View>

                {/* Margins */}
                <View style={styles.rowTwoCol}>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Left Margin (mm)</Text>
                    <TextInput
                      style={styles.input}
                      value={String(marginLeftMm)}
                      onChangeText={(v) => setMarginLeftMm(Number(v) || 0)}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.fieldLabel}>Right Margin (mm)</Text>
                    <TextInput
                      style={styles.input}
                      value={String(marginRightMm)}
                      onChangeText={(v) => setMarginRightMm(Number(v) || 0)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.calibrationActionsRow}>
                  <TouchableOpacity
                    style={styles.calTestBtn}
                    onPress={handleCalibrationTest}
                    disabled={isSaving}
                  >
                    <Text style={styles.calTestBtnText}>Print Calibration Test</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.calResetBtn}
                    onPress={resetCalibrationForm}
                  >
                    <Text style={styles.calResetBtnText}>Reset to Default</Text>
                  </TouchableOpacity>
                </View>

                {editingPrinter && ['lan', 'wifi'].includes(editingPrinter.connection_type) && (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 }}>
                      🧪 DEV Test Receipts (No Database Mutation)
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.calTestBtn, { backgroundColor: '#f59e0b', flex: 1 }]}
                        onPress={() => handlePrintSampleKot(editingPrinter)}
                      >
                        <Text style={styles.calTestBtnText}>Test KOT Slip</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.calTestBtn, { backgroundColor: '#10b981', flex: 1 }]}
                        onPress={() => handlePrintSampleBill(editingPrinter)}
                      >
                        <Text style={styles.calTestBtnText}>Test Bill Receipt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
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
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
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
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#64748b',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 320,
  },
  printerList: {
    gap: 12,
  },
  printerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  printerCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  printerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  primaryBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryBadgeText: {
    color: '#15803d',
    fontSize: 10,
    fontWeight: '800',
  },
  inactiveBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '800',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  connBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  connBadgeText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
  },
  paperBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  paperBadgeText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
  },
  roleBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    color: '#1d4ed8',
    fontSize: 11,
    fontWeight: '700',
  },
  printerDetails: {
    gap: 3,
    marginVertical: 6,
  },
  detailText: {
    fontSize: 12,
    color: '#475569',
  },
  statusText: {
    fontSize: 12,
    color: '#0284c7',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtnSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  actionBtnTextSecondary: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  actionBtnDanger: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  actionBtnTextDanger: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
  },
  deviceCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 14,
  },
  deviceCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  deviceCardSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    marginBottom: 10,
  },
  deviceFormRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  deviceFormCol: {
    flex: 1,
    minWidth: 200,
  },
  pickerWrap: {
    marginTop: 4,
  },
  pickerBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pickerBtnText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '600',
  },
  saveDefaultsBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
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
    borderRadius: 14,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
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
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: '700',
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 4,
  },
  connTypeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  connTypeBtn: {
    flex: 1,
    minWidth: 110,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    alignItems: 'center',
  },
  connTypeBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  connTypeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  connTypeBtnTextActive: {
    color: '#1d4ed8',
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
    marginBottom: 10,
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
});
