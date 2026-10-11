import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
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
import { storageService } from '../../src/services/api/storageService';
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

  // Bill Branding (Logo & Payment QR) State
  const [billLogoUrl, setBillLogoUrl] = useState<string>(settings.bill_logo_url || '');
  const [printBillLogo, setPrintBillLogo] = useState<boolean>(Boolean(settings.print_bill_logo));
  const [billPaymentQrUrl, setBillPaymentQrUrl] = useState<string>(settings.bill_payment_qr_url || '');
  const [printBillPaymentQr, setPrintBillPaymentQr] = useState<boolean>(Boolean(settings.print_bill_payment_qr));
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);

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
    setBillLogoUrl(settings.bill_logo_url || '');
    setPrintBillLogo(Boolean(settings.print_bill_logo));
    setBillPaymentQrUrl(settings.bill_payment_qr_url || '');
    setPrintBillPaymentQr(Boolean(settings.print_bill_payment_qr));
  }, [
    settings.kot_paper_size,
    settings.bill_paper_size,
    settings.auto_print_kot,
    settings.bill_logo_url,
    settings.print_bill_logo,
    settings.bill_payment_qr_url,
    settings.print_bill_payment_qr,
  ]);

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

  const handlePickLogo = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update printer settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update printer settings.');
      return;
    }
    try {
      setIsUploadingLogo(true);
      const res = await storageService.pickAndUploadLogo({ restaurantId: effectiveRestaurantId });
      if (res && res.url) {
        setBillLogoUrl(res.url);
        setPrintBillLogo(true);
        await updateSettings({
          bill_logo_url: res.url,
          print_bill_logo: true,
        });
        await refreshSettings();
        showToast('success', 'Bill Logo Uploaded', 'Bill logo has been uploaded and enabled for thermal printing.');
        Alert.alert('Bill Logo Uploaded', 'Bill logo has been uploaded and enabled for thermal printing.');
      }
    } catch (err: any) {
      const errMsg = err.message || 'Failed to upload bill logo.';
      showToast('error', 'Upload Failed', errMsg);
      Alert.alert('Upload Failed', errMsg);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleToggleLogo = async (enable: boolean) => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update printer settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update printer settings.');
      return;
    }
    setPrintBillLogo(enable);
    try {
      await updateSettings({ print_bill_logo: enable });
      await refreshSettings();
      showToast(
        'success',
        `Bill Logo ${enable ? 'Enabled' : 'Disabled'}`,
        enable ? 'Logo will be printed at the top of customer thermal bills.' : 'Logo printing disabled. Logo will not appear on bills.'
      );
    } catch (err: any) {
      setPrintBillLogo(!enable);
      showToast('error', 'Update Failed', err.message || 'Failed to update logo toggle.');
    }
  };

  const handleRemoveLogo = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update printer settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update printer settings.');
      return;
    }
    setBillLogoUrl('');
    setPrintBillLogo(false);
    try {
      await updateSettings({ bill_logo_url: '', print_bill_logo: false });
      await refreshSettings();
      showToast('success', 'Bill Logo Removed', 'Thermal bill logo has been removed.');
    } catch (err: any) {
      showToast('error', 'Update Failed', err.message || 'Failed to remove bill logo.');
    }
  };

  const handlePickQr = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update printer settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update printer settings.');
      return;
    }
    try {
      setIsUploadingQr(true);
      const res = await storageService.pickAndUploadPaymentQr({ restaurantId: effectiveRestaurantId });
      if (res && res.url) {
        setBillPaymentQrUrl(res.url);
        setPrintBillPaymentQr(true);
        await updateSettings({
          bill_payment_qr_url: res.url,
          print_bill_payment_qr: true,
        });
        await refreshSettings();
        showToast('success', 'Payment QR Uploaded', 'Payment QR has been uploaded and enabled for thermal printing.');
        Alert.alert('Payment QR Uploaded', 'Payment QR has been uploaded and enabled for thermal printing.');
      }
    } catch (err: any) {
      const errMsg = err.message || 'Failed to upload payment QR.';
      showToast('error', 'Upload Failed', errMsg);
      Alert.alert('Upload Failed', errMsg);
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleToggleQr = async (enable: boolean) => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update printer settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update printer settings.');
      return;
    }
    setPrintBillPaymentQr(enable);
    try {
      await updateSettings({ print_bill_payment_qr: enable });
      await refreshSettings();
      showToast(
        'success',
        `Payment QR ${enable ? 'Enabled' : 'Disabled'}`,
        enable ? 'Payment QR will be printed at the bottom of customer bills.' : 'Payment QR printing disabled. QR will not appear on bills.'
      );
    } catch (err: any) {
      setPrintBillPaymentQr(!enable);
      showToast('error', 'Update Failed', err.message || 'Failed to update QR toggle.');
    }
  };

  const handleRemoveQr = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update printer settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update printer settings.');
      return;
    }
    setBillPaymentQrUrl('');
    setPrintBillPaymentQr(false);
    try {
      await updateSettings({ bill_payment_qr_url: '', print_bill_payment_qr: false });
      await refreshSettings();
      showToast('success', 'Payment QR Removed', 'Thermal bill payment QR code has been removed.');
    } catch (err: any) {
      showToast('error', 'Update Failed', err.message || 'Failed to remove payment QR.');
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
        bill_logo_url: billLogoUrl,
        print_bill_logo: printBillLogo,
        bill_payment_qr_url: billPaymentQrUrl,
        print_bill_payment_qr: printBillPaymentQr,
      });
      await refreshSettings();
      const summary = `KOT Paper: ${kotPaperSize} • Bill Paper: ${billPaperSize} • Auto Print: ${autoPrintKot ? 'ON' : 'OFF'} • Bill Logo: ${printBillLogo ? 'ON' : 'OFF'} • Bill QR: ${printBillPaymentQr ? 'ON' : 'OFF'}`;
      showToast('success', 'Printer Settings Saved', summary);
      Alert.alert(
        'Printer Settings Saved',
        `KOT Paper: ${kotPaperSize}\nBill Paper: ${billPaperSize}\nAuto Print: ${autoPrintKot ? 'ON' : 'OFF'}\nBill Logo: ${printBillLogo ? 'ON' : 'OFF'}\nPayment QR: ${printBillPaymentQr ? 'ON' : 'OFF'}`
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
            Configure direct physical thermal printers (Bluetooth BLE/SPP, USB OTG, LAN/Wi-Fi), auto-printing rules, receipt dimensions, and bill branding.
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

      {/* Section 2: Dedicated Thermal Bill Logo & Payment QR */}
      <View style={styles.card}>
        <View style={{ marginBottom: 14 }}>
          <Text style={styles.cardHeader}>🧾 Thermal Bill Logo & Payment QR Code</Text>
          <Text style={styles.cardSubHeader}>
            Configure the visual branding printed directly on physical customer thermal bills. Note: General logo and QR uploaded in Settings will NOT be printed on bills.
          </Text>
        </View>

        <View style={[styles.brandingGrid, isDesktop ? styles.brandingGridDesktop : styles.brandingGridMobile]}>
          {/* Bill Logo Card */}
          <View style={styles.brandingBox}>
            <View style={styles.brandingHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.brandingTitle}>🖼️ Bill Header Logo</Text>
                <Text style={styles.brandingDesc}>
                  Monochrome logo printed at the top of customer bills.
                </Text>
              </View>
              {billLogoUrl ? (
                <TouchableOpacity
                  testID="toggle-bill-logo-btn"
                  style={[styles.toggleBadge, printBillLogo ? styles.toggleBadgeOn : styles.toggleBadgeOff]}
                  onPress={() => handleToggleLogo(!printBillLogo)}
                >
                  <Text style={[styles.toggleBadgeText, !printBillLogo && styles.toggleBadgeTextOff]}>
                    {printBillLogo ? '● ON' : '○ OFF'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>No Logo</Text>
                </View>
              )}
            </View>

            {billLogoUrl ? (
              <View style={styles.brandingPreviewContainer}>
                <View style={styles.brandingPreviewImgWrap}>
                  <Image
                    source={{ uri: billLogoUrl }}
                    style={styles.brandingPreviewImg}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.brandingPreviewInfo}>
                  <Text style={styles.brandingStatusText}>
                    {printBillLogo ? '✓ Active for Thermal Print' : '⏸️ Printing Toggled Off'}
                  </Text>
                  <Text style={styles.brandingMutedText}>
                    {printBillLogo
                      ? 'Logo will print at top of customer thermal receipts.'
                      : 'Logo is saved but will NOT be printed on receipts.'}
                  </Text>
                  <View style={styles.brandingBtnRow}>
                    <TouchableOpacity
                      testID="change-bill-logo-btn"
                      style={styles.actionBtnChange}
                      onPress={handlePickLogo}
                      disabled={isUploadingLogo || !canManage}
                    >
                      {isUploadingLogo ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <Text style={styles.actionBtnChangeText}>Change Logo</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="remove-bill-logo-btn"
                      style={styles.actionBtnRemove}
                      onPress={handleRemoveLogo}
                      disabled={isUploadingLogo || !canManage}
                    >
                      <Text style={styles.actionBtnRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                testID="upload-bill-logo-btn"
                style={styles.brandingUploadBtn}
                onPress={handlePickLogo}
                disabled={isUploadingLogo || !canManage}
              >
                {isUploadingLogo ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <>
                    <Text style={styles.uploadIcon}>⬆️</Text>
                    <Text style={styles.brandingUploadBtnText}>Upload Bill Logo</Text>
                    <Text style={styles.brandingUploadSubtext}>
                      PNG, JPG, or WebP. High contrast black & white prints best.
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Bill Payment QR Card */}
          <View style={styles.brandingBox}>
            <View style={styles.brandingHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.brandingTitle}>📱 Bill Payment QR Code</Text>
                <Text style={styles.brandingDesc}>
                  UPI / Payment QR printed at the bottom for instant scan & pay.
                </Text>
              </View>
              {billPaymentQrUrl ? (
                <TouchableOpacity
                  testID="toggle-bill-qr-btn"
                  style={[styles.toggleBadge, printBillPaymentQr ? styles.toggleBadgeOn : styles.toggleBadgeOff]}
                  onPress={() => handleToggleQr(!printBillPaymentQr)}
                >
                  <Text style={[styles.toggleBadgeText, !printBillPaymentQr && styles.toggleBadgeTextOff]}>
                    {printBillPaymentQr ? '● ON' : '○ OFF'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>No QR</Text>
                </View>
              )}
            </View>

            {billPaymentQrUrl ? (
              <View style={styles.brandingPreviewContainer}>
                <View style={styles.brandingPreviewImgWrap}>
                  <Image
                    source={{ uri: billPaymentQrUrl }}
                    style={styles.brandingPreviewImg}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.brandingPreviewInfo}>
                  <Text style={styles.brandingStatusText}>
                    {printBillPaymentQr ? '✓ Active for Thermal Print' : '⏸️ Printing Toggled Off'}
                  </Text>
                  <Text style={styles.brandingMutedText}>
                    {printBillPaymentQr
                      ? 'QR code will print at the end of customer thermal receipts.'
                      : 'QR is saved but will NOT be printed on receipts.'}
                  </Text>
                  <View style={styles.brandingBtnRow}>
                    <TouchableOpacity
                      testID="change-bill-qr-btn"
                      style={styles.actionBtnChange}
                      onPress={handlePickQr}
                      disabled={isUploadingQr || !canManage}
                    >
                      {isUploadingQr ? (
                        <ActivityIndicator size="small" color="#2563eb" />
                      ) : (
                        <Text style={styles.actionBtnChangeText}>Change QR</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="remove-bill-qr-btn"
                      style={styles.actionBtnRemove}
                      onPress={handleRemoveQr}
                      disabled={isUploadingQr || !canManage}
                    >
                      <Text style={styles.actionBtnRemoveText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                testID="upload-bill-qr-btn"
                style={styles.brandingUploadBtn}
                onPress={handlePickQr}
                disabled={isUploadingQr || !canManage}
              >
                {isUploadingQr ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <>
                    <Text style={styles.uploadIcon}>⬆️</Text>
                    <Text style={styles.brandingUploadBtnText}>Upload Payment QR</Text>
                    <Text style={styles.brandingUploadSubtext}>
                      Upload UPI QR. If turned off or missing, no blank space is consumed.
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.brandingNoteBox}>
          <Text style={styles.brandingNoteText}>
            💡 <Text style={{ fontWeight: '700' }}>Strict Privacy & Blank Space Rule:</Text> If a toggle is OFF or no image is uploaded, no blank space will be consumed on thermal bills. Logo and payment QR uploaded in general restaurant Settings will never be printed on bills.
          </Text>
        </View>
      </View>

      {/* Section 3: Web-Only Seznik Chrome/Edge Web Bluetooth & WebUSB */}
      {Platform.OS === 'web' && effectiveRestaurantId ? (
        <SeznikPrinterManagementSection
          restaurantId={effectiveRestaurantId}
          canManage={canManage}
          settings={settings}
          showToast={showToast}
        />
      ) : null}

      {/* Section 4: Native Android Direct Multi-Printer Management & Physical Binding */}
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
  brandingGrid: {
    gap: 16,
  },
  brandingGridDesktop: {
    flexDirection: 'row',
  },
  brandingGridMobile: {
    flexDirection: 'column',
  },
  brandingBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  brandingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  brandingTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  brandingDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 16,
  },
  inactiveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  brandingPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  brandingPreviewImgWrap: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandingPreviewImg: {
    width: 76,
    height: 76,
  },
  brandingPreviewInfo: {
    flex: 1,
    gap: 4,
  },
  brandingStatusText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  brandingMutedText: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },
  brandingBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  actionBtnChange: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnChangeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  actionBtnRemove: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnRemoveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  brandingUploadBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  uploadIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  brandingUploadBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
  },
  brandingUploadSubtext: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 15,
  },
  brandingNoteBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  brandingNoteText: {
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 18,
  },
});

