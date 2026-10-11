import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useSettings } from '../../src/context/SettingsContext';
import { categoryService } from '../../src/services/api/categoryService';
import { Category, PaperSize } from '../../src/types';
import { PrinterManagementSection } from '../../src/components/PrinterManagementSection';
import { SeznikPrinterManagementSection } from '../../src/components/SeznikPrinterManagementSection';

export default function PrintersScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 1024;
  const isMobile = windowWidth < 640;

  const { isSuperAdmin, isAdmin, activeRestaurantId, hasPermission } = useAuth();
  const { settings, updateSettings, refreshSettings } = useSettings();

  const effectiveRestaurantId = activeRestaurantId || settings.id || '';
  const canManage = isSuperAdmin || isAdmin || hasPermission('can_view_settings');

  // Categories for KOT routing
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // Authoritative Printer Settings State
  const [kotPaperSize, setKotPaperSize] = useState<PaperSize>(settings.kot_paper_size || '80mm');
  const [billPaperSize, setBillPaperSize] = useState<PaperSize>(settings.bill_paper_size || '80mm');
  const [autoPrintKot, setAutoPrintKot] = useState<boolean>(Boolean(settings.auto_print_kot));
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showToast = (type: 'success' | 'error' | 'info', title: string, message: string) => {
    setToast({ visible: true, type, title, message });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4000);
  };

  useEffect(() => {
    setKotPaperSize(settings.kot_paper_size || '80mm');
    setBillPaperSize(settings.bill_paper_size || '80mm');
    setAutoPrintKot(Boolean(settings.auto_print_kot));
  }, [settings.kot_paper_size, settings.bill_paper_size, settings.auto_print_kot]);

  useEffect(() => {
    let isMounted = true;
    const fetchCats = async () => {
      if (!effectiveRestaurantId) return;
      setIsLoadingCategories(true);
      try {
        const data = await categoryService.getCategories(effectiveRestaurantId);
        if (isMounted) setCategories(data || []);
      } catch (err: any) {
        console.warn('[PrintersScreen] Error loading categories:', err);
      } finally {
        if (isMounted) setIsLoadingCategories(false);
      }
    };
    fetchCats();
    return () => {
      isMounted = false;
    };
  }, [effectiveRestaurantId]);

  const handleToggleAutoPrint = async (enable: boolean) => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update printer settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update printer settings.');
      return;
    }
    setAutoPrintKot(enable);
    try {
      await updateSettings({ auto_print_kot: enable });
      await refreshSettings();
      showToast(
        'success',
        `Auto Print ${enable ? 'Enabled' : 'Disabled'}`,
        enable
          ? 'Thermal KOTs and Bills will be dispatched automatically upon order punch & settlement.'
          : 'Automatic direct printing suspended. Manual Print/Reprint buttons remain available.'
      );
    } catch (err: any) {
      setAutoPrintKot(!enable);
      showToast('error', 'Update Failed', err.message || 'Could not update Auto Print setting.');
    }
  };

  const handleSavePrinterSettings = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update printer settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update printer settings.');
      return;
    }
    try {
      setIsSavingPrinter(true);
      await updateSettings({
        kot_paper_size: kotPaperSize,
        bill_paper_size: billPaperSize,
        auto_print_kot: autoPrintKot,
      });
      await refreshSettings();
      const summary = `KOT Paper: ${kotPaperSize} • Bill Paper: ${billPaperSize} • Auto Print: ${autoPrintKot ? 'ON' : 'OFF'}`;
      showToast('success', 'Printer Settings Saved', summary);
      Alert.alert(
        'Printer Settings Saved',
        `KOT Paper: ${kotPaperSize}\nBill Paper: ${billPaperSize}\nAuto Print: ${autoPrintKot ? 'ON' : 'OFF'}`
      );
    } catch (e: any) {
      showToast('error', 'Save Failed', e.message || 'Failed to save printer settings.');
      Alert.alert('Save Failed', e.message || 'Failed to save printer settings.');
    } finally {
      setIsSavingPrinter(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Toast Notification Banner */}
      {toast.visible && (
        <View
          style={[
            styles.toastBox,
            toast.type === 'success'
              ? styles.toastSuccess
              : toast.type === 'error'
              ? styles.toastError
              : styles.toastInfo,
          ]}
        >
          <Text style={styles.toastTitle}>
            {toast.type === 'success' ? '✓ ' : toast.type === 'error' ? '❌ ' : 'ℹ️ '}
            {toast.title}
          </Text>
          <Text style={styles.toastMessage}>{toast.message}</Text>
        </View>
      )}

      {/* Screen Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>🖨️ Thermal Printers & Hardware Management</Text>
          <Text style={styles.pageSubtitle}>
            Configure direct physical thermal printers (Bluetooth BLE/SPP, USB OTG, LAN/Wi-Fi), auto-printing rules, and receipt dimensions.
          </Text>
        </View>
      </View>

      {/* Section 1: Authoritative Global Auto Print & Receipt Dimensions Card */}
      <View style={styles.card}>
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.cardHeader}>⚙️ Receipt Dimensions & Master Auto Print</Text>
          <Text style={styles.cardSubHeader}>
            Master configuration for kitchen ticket (KOT) paper width, customer bill paper width, and automated print triggering.
          </Text>
        </View>

        <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile]}>
          {/* KOT Paper Size */}
          <View style={styles.formCol}>
            <Text style={styles.fieldLabel}>KOT Paper Size</Text>
            <View style={styles.segmentedRow}>
              {(['58mm', '80mm', 'A4'] as PaperSize[]).map((size) => (
                <TouchableOpacity
                  key={`kot-${size}`}
                  testID={`kot-paper-${size}`}
                  style={[styles.segmentBtn, kotPaperSize === size && styles.segmentBtnActive]}
                  onPress={() => setKotPaperSize(size)}
                >
                  <Text style={[styles.segmentBtnText, kotPaperSize === size && styles.segmentBtnTextActive]}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Bill Paper Size */}
          <View style={styles.formCol}>
            <Text style={styles.fieldLabel}>Bill Paper Size</Text>
            <View style={styles.segmentedRow}>
              {(['58mm', '80mm', 'A4'] as PaperSize[]).map((size) => (
                <TouchableOpacity
                  key={`bill-${size}`}
                  testID={`bill-paper-${size}`}
                  style={[styles.segmentBtn, billPaperSize === size && styles.segmentBtnActive]}
                  onPress={() => setBillPaperSize(size)}
                >
                  <Text style={[styles.segmentBtnText, billPaperSize === size && styles.segmentBtnTextActive]}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Master Authoritative Auto Print Toggle Card */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleHeaderRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>{autoPrintKot ? '🟢' : '⚪'}</Text>
                <Text style={styles.toggleTitle}>Master Auto Print</Text>
              </View>
              <Text style={styles.toggleDesc}>
                {autoPrintKot
                  ? 'ON — Orders punch directly to Kitchen KOT printers and Settlement bills print immediately without system dialogs.'
                  : 'OFF — Automatic dispatching suspended. Use manual Print/Reprint buttons on orders.'}
              </Text>
            </View>

            <TouchableOpacity
              testID="toggle-auto-print-kot"
              style={[styles.toggleBadge, autoPrintKot ? styles.toggleBadgeOn : styles.toggleBadgeOff]}
              onPress={() => handleToggleAutoPrint(!autoPrintKot)}
            >
              <Text style={[styles.toggleBadgeText, !autoPrintKot && styles.toggleBadgeTextOff]}>
                {autoPrintKot ? '● ON' : '○ OFF'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          testID="save-printer-settings-btn"
          style={[styles.saveBtn, (isSavingPrinter || !canManage) && { opacity: 0.6 }]}
          onPress={handleSavePrinterSettings}
          disabled={isSavingPrinter || !canManage}
        >
          {isSavingPrinter ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator color="#ffffff" size="small" />
              <Text style={styles.saveBtnText}>Saving...</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>Save Paper & Auto Print Settings</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Section 2: Web-Only Seznik Chrome/Edge Web Bluetooth & WebUSB */}
      {Platform.OS === 'web' && effectiveRestaurantId ? (
        <SeznikPrinterManagementSection
          restaurantId={effectiveRestaurantId}
          canManage={canManage}
          settings={settings}
          showToast={showToast}
        />
      ) : null}

      {/* Section 3: Native Android Direct Multi-Printer Management & Physical Binding */}
      <PrinterManagementSection
        restaurantId={effectiveRestaurantId || ''}
        categories={categories}
        canManage={canManage}
        settings={settings}
        showToast={showToast}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 48,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
  },
  headerRow: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  cardSubHeader: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 16,
  },
  formRow: {
    gap: 12,
  },
  formRowDesktop: {
    flexDirection: 'row',
  },
  formRowMobile: {
    flexDirection: 'column',
  },
  formCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  segmentedRow: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#2563eb',
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  segmentBtnTextActive: {
    color: '#ffffff',
  },
  toggleCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  toggleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  toggleDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
    lineHeight: 16,
  },
  toggleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBadgeOn: {
    backgroundColor: '#16a34a',
  },
  toggleBadgeOff: {
    backgroundColor: '#e2e8f0',
  },
  toggleBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  toggleBadgeTextOff: {
    color: '#64748b',
  },
  saveBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  toastBox: {
    position: 'absolute',
    top: 10,
    right: 16,
    left: 16,
    zIndex: 9999,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  toastSuccess: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  toastError: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  toastInfo: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  toastTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  toastMessage: {
    fontSize: 12,
    color: '#334155',
    marginTop: 2,
  },
});
