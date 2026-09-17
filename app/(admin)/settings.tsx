import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image, useWindowDimensions, Platform } from 'react-native';
import { useSettings } from '../../src/context/SettingsContext';
import { useAuth } from '../../src/context/AuthContext';
import { useNotification } from '../../src/context/NotificationContext';
import { authService } from '../../src/services/api/authService';
import { storageService } from '../../src/services/api/storageService';
import { supabase } from '../../src/services/supabase';
import { UserRole, PaperSize } from '../../src/types';
import { OptimizedImage } from '../../src/components/common/OptimizedImage';
import {
  parseBannerUrls,
  extractBannerCleanUrl,
  extractBannerPosY,
  formatBannerWithPosY,
} from '../../src/utils/mediaUtils';
import {
  isValidEmail,
  normalizeEmail,
  isValidIndianPhone,
  normalizeIndianPhone,
  getEmailValidationError,
  getIndianPhoneValidationError,
} from '../../src/utils/validation';

export default function SettingsScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 860;
  const { settings, updateSettings, isOnlineOrdersEnabled, toggleOnlineOrders, loading: settingsLoading } = useSettings();
  const { user, role, isSuperAdmin, isAdmin, activeRestaurantId } = useAuth();
  const { showToast } = useNotification();
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);

  const [name, setName] = useState(settings.name);
  const [legalName, setLegalName] = useState(settings.legal_name || '');
  const [address, setAddress] = useState(settings.address || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [email, setEmail] = useState(settings.email || '');
  const [gstin, setGstin] = useState(settings.gstin || '');
  const [taxRate, setTaxRate] = useState(
    settings.default_tax_rate !== undefined && settings.default_tax_rate !== null
      ? settings.default_tax_rate.toString()
      : '5.0'
  );
  const [gstRegistered, setGstRegistered] = useState<boolean>(
    settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim())
  );
  const [isGstEnabled, setIsGstEnabled] = useState<boolean>(
    settings.is_gst_enabled !== undefined
      ? Boolean(settings.is_gst_enabled)
      : false
  );
  const [taxInvoiceEnabled, setTaxInvoiceEnabled] = useState<boolean>(
    settings.tax_invoice_enabled !== undefined
      ? Boolean(settings.tax_invoice_enabled)
      : false
  );
  const [logoUrl, setLogoUrl] = useState(settings.logo_url || '');
  const [bannerUrls, setBannerUrls] = useState<string[]>(() =>
    parseBannerUrls(settings.banner_url || settings.banner_urls)
  );

  // Banner Drag & Focal Position Adjuster State
  const [selectedBannerIdx, setSelectedBannerIdx] = useState<number>(0);
  const [bannerPosY, setBannerPosY] = useState<number>(50);
  const [showOverlaysInPreview, setShowOverlaysInPreview] = useState<boolean>(true);
  const [showCropGuides, setShowCropGuides] = useState<boolean>(true);
  const [previewDeviceMode, setPreviewDeviceMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isSavingBannerPos, setIsSavingBannerPos] = useState<boolean>(false);
  const [isDraggingBanner, setIsDraggingBanner] = useState<boolean>(false);

  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartPosYRef = useRef(50);

  // Printer settings state
  const [kotPaperSize, setKotPaperSize] = useState<PaperSize>(settings.kot_paper_size || '80mm');
  const [billPaperSize, setBillPaperSize] = useState<PaperSize>(settings.bill_paper_size || '80mm');
  const [autoPrintKot, setAutoPrintKot] = useState<boolean>(Boolean(settings.auto_print_kot));
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);

  // Online Delivery & Payment settings state
  const [deliveryPaymentQrUrl, setDeliveryPaymentQrUrl] = useState(settings.delivery_payment_qr_url || '');
  const [deliveryUpiId, setDeliveryUpiId] = useState(settings.delivery_upi_id || '');
  const [deliverySampleScreenshotUrl, setDeliverySampleScreenshotUrl] = useState(settings.delivery_sample_screenshot_url || '');
  const [enableCod, setEnableCod] = useState<boolean>(settings.enable_cod !== undefined ? Boolean(settings.enable_cod) : true);
  const [deliveryChargeBase, setDeliveryChargeBase] = useState(
    settings.delivery_charge_base !== undefined && settings.delivery_charge_base !== null
      ? settings.delivery_charge_base.toString()
      : '0'
  );
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState(
    settings.free_delivery_above !== undefined && settings.free_delivery_above !== null
      ? settings.free_delivery_above.toString()
      : '0'
  );
  const [minimumOrderValue, setMinimumOrderValue] = useState(
    settings.minimum_order_value !== undefined && settings.minimum_order_value !== null
      ? settings.minimum_order_value.toString()
      : (settings.min_order_value !== undefined && settings.min_order_value !== null ? settings.min_order_value.toString() : '0')
  );
  const [isSavingDeliverySettings, setIsSavingDeliverySettings] = useState(false);
  const [isUploadingPaymentQr, setIsUploadingPaymentQr] = useState(false);
  const [isUploadingPaymentSample, setIsUploadingPaymentSample] = useState(false);
  const [deliveryStatusMessage, setDeliveryStatusMessage] = useState<{
    type: 'success' | 'error';
    title: string;
    text: string;
  } | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingGst, setIsSavingGst] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [customBannerUrl, setCustomBannerUrl] = useState('');

  const canManage = isAdmin || isSuperAdmin || role === 'ADMIN' || role === 'SUPER_ADMIN';

  // Sync form values from settings whenever settings change, unless user is actively editing
  useEffect(() => {
    if (!isDirty) {
      setName(settings.name || '');
      setLegalName(settings.legal_name || '');
      setAddress(settings.address || '');
      setPhone(settings.phone || '');
      setEmail(settings.email || '');
      setGstin(settings.gstin || '');
      setTaxRate(
        settings.default_tax_rate !== undefined && settings.default_tax_rate !== null
          ? settings.default_tax_rate.toString()
          : '5.0'
      );
      setGstRegistered(
        settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim())
      );
      setIsGstEnabled(
        settings.is_gst_enabled !== undefined
          ? Boolean(settings.is_gst_enabled)
          : false
      );
      setTaxInvoiceEnabled(
        settings.tax_invoice_enabled !== undefined
          ? Boolean(settings.tax_invoice_enabled)
          : false
      );
      setLogoUrl(settings.logo_url || '');
      setBannerUrls(parseBannerUrls(settings.banner_url || settings.banner_urls));
      setKotPaperSize(settings.kot_paper_size || '80mm');
      setBillPaperSize(settings.bill_paper_size || '80mm');
      setAutoPrintKot(Boolean(settings.auto_print_kot));

      setDeliveryPaymentQrUrl(settings.delivery_payment_qr_url || '');
      setDeliveryUpiId(settings.delivery_upi_id || '');
      setDeliverySampleScreenshotUrl(settings.delivery_sample_screenshot_url || '');
      setEnableCod(settings.enable_cod !== undefined ? Boolean(settings.enable_cod) : true);
      setDeliveryChargeBase(
        settings.delivery_charge_base !== undefined && settings.delivery_charge_base !== null
          ? settings.delivery_charge_base.toString()
          : '0'
      );
      setFreeDeliveryAbove(
        settings.free_delivery_above !== undefined && settings.free_delivery_above !== null
          ? settings.free_delivery_above.toString()
          : '0'
      );
      setMinimumOrderValue(
        settings.minimum_order_value !== undefined && settings.minimum_order_value !== null
          ? settings.minimum_order_value.toString()
          : (settings.min_order_value !== undefined && settings.min_order_value !== null ? settings.min_order_value.toString() : '0')
      );
    }
  }, [settings, isDirty, activeRestaurantId]);

  const handleUploadPaymentQr = async () => {
    if (!canManage) {
      Alert.alert('Permission Denied', 'Only ADMIN users can modify delivery payment settings.');
      return;
    }
    try {
      setIsUploadingPaymentQr(true);
      setDeliveryStatusMessage(null);
      const res = await storageService.pickAndUploadPaymentQr({ restaurantId: activeRestaurantId });
      if (res && res.url) {
        setDeliveryPaymentQrUrl(res.url);
        await updateSettings({ delivery_payment_qr_url: res.url });
        setDeliveryStatusMessage({
          type: 'success',
          title: '✓ Payment QR Code Saved',
          text: 'Payment QR code was uploaded and saved successfully.',
        });
        showToast('success', 'Payment QR Saved', 'Payment QR code uploaded successfully.');
        Alert.alert('Payment QR Saved', 'Payment QR code uploaded successfully.');
      }
    } catch (e: any) {
      const errMsg = e.message || 'Failed to upload QR code.';
      setDeliveryStatusMessage({
        type: 'error',
        title: '❌ QR Upload Failed',
        text: errMsg,
      });
      showToast('error', 'Upload Failed', errMsg);
      Alert.alert('Upload Failed', errMsg);
    } finally {
      setIsUploadingPaymentQr(false);
    }
  };

  const handleUploadPaymentSample = async () => {
    if (!canManage) {
      Alert.alert('Permission Denied', 'Only ADMIN users can modify delivery payment settings.');
      return;
    }
    try {
      setIsUploadingPaymentSample(true);
      setDeliveryStatusMessage(null);
      const res = await storageService.pickAndUploadPaymentSample({ restaurantId: activeRestaurantId });
      if (res && res.url) {
        setDeliverySampleScreenshotUrl(res.url);
        await updateSettings({ delivery_sample_screenshot_url: res.url });
        setDeliveryStatusMessage({
          type: 'success',
          title: '✓ Sample Screenshot Saved',
          text: 'Sample payment reference screenshot was uploaded and saved successfully.',
        });
        showToast('success', 'Sample Screenshot Saved', 'Sample payment screenshot uploaded successfully.');
        Alert.alert('Sample Screenshot Saved', 'Sample payment screenshot uploaded successfully.');
      }
    } catch (e: any) {
      const errMsg = e.message || 'Failed to upload sample screenshot.';
      setDeliveryStatusMessage({
        type: 'error',
        title: '❌ Sample Upload Failed',
        text: errMsg,
      });
      showToast('error', 'Upload Failed', errMsg);
      Alert.alert('Upload Failed', errMsg);
    } finally {
      setIsUploadingPaymentSample(false);
    }
  };

  const handleSaveDeliverySettings = async () => {
    if (!canManage) {
      Alert.alert('Permission Denied', 'Only ADMIN users can update delivery settings.');
      return;
    }
    try {
      setIsSavingDeliverySettings(true);
      setDeliveryStatusMessage(null);
      const parsedDeliveryFee = parseFloat(deliveryChargeBase) || 0;
      const parsedFreeThreshold = parseFloat(freeDeliveryAbove) || 0;
      const parsedMinOrder = parseFloat(minimumOrderValue) || 0;

      await updateSettings({
        delivery_payment_qr_url: deliveryPaymentQrUrl.trim() || '',
        delivery_upi_id: deliveryUpiId.trim() || '',
        delivery_sample_screenshot_url: deliverySampleScreenshotUrl.trim() || '',
        enable_cod: enableCod,
        delivery_charge_base: parsedDeliveryFee >= 0 ? parsedDeliveryFee : 0,
        free_delivery_above: parsedFreeThreshold >= 0 ? parsedFreeThreshold : 0,
        minimum_order_value: parsedMinOrder >= 0 ? parsedMinOrder : 0,
      });

      setIsDirty(false);
      const summaryText = `COD: ${enableCod ? 'ON' : 'OFF'} • Min. Order: ₹${parsedMinOrder} • Delivery Fee: ₹${parsedDeliveryFee} • Free Above: ${parsedFreeThreshold > 0 ? `₹${parsedFreeThreshold}` : 'N/A'} • UPI ID: ${deliveryUpiId.trim() || 'None'}`;

      setDeliveryStatusMessage({
        type: 'success',
        title: '✓ Delivery & Payment Settings Saved Successfully!',
        text: summaryText,
      });
      showToast('success', 'Settings Saved', 'Delivery & payment settings saved successfully.');
      Alert.alert('Delivery & Payment Settings Saved', summaryText);
    } catch (e: any) {
      const errMsg = e.message || 'Failed to save delivery settings.';
      setDeliveryStatusMessage({
        type: 'error',
        title: '❌ Settings Not Saved',
        text: errMsg,
      });
      showToast('error', 'Save Failed', errMsg);
      Alert.alert('Save Failed', errMsg);
    } finally {
      setIsSavingDeliverySettings(false);
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
      const summary = `KOT Paper: ${kotPaperSize} • Bill Paper: ${billPaperSize} • Auto-Print: ${autoPrintKot ? 'ON' : 'OFF'}`;
      showToast('success', 'Printer Settings Saved', summary);
      Alert.alert(
        'Printer Settings Saved',
        `KOT Paper: ${kotPaperSize}\nBill Paper: ${billPaperSize}\nAuto-Print KOT: ${autoPrintKot ? 'ON' : 'OFF'}`
      );
    } catch (e: any) {
      showToast('error', 'Save Failed', e.message || 'Failed to save printer settings.');
      Alert.alert('Save Failed', e.message || 'Failed to save printer settings.');
    } finally {
      setIsSavingPrinter(false);
    }
  };

  // Staff & Admin Management form state
  const [accountEmail, setAccountEmail] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountPhone, setAccountPhone] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountRole, setAccountRole] = useState<UserRole>('STAFF');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const handleUploadLogo = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update restaurant logo.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update restaurant logo.');
      return;
    }
    try {
      setIsUploadingLogo(true);
      const res = await storageService.pickAndUploadLogo({ restaurantId: activeRestaurantId });
      if (res && res.url) {
        setLogoUrl(res.url);
        const persisted = await updateSettings({ logo_url: res.url });
        if (persisted) {
          setLogoUrl(persisted.logo_url || res.url);
        }
        if (activeRestaurantId) {
          await Promise.all([
            supabase.from('restaurants').update({ logo_url: res.url }).eq('id', activeRestaurantId),
          ]);
        }
        setIsDirty(false);
        showToast('success', 'Logo Updated', 'Restaurant logo uploaded and saved successfully.');
        Alert.alert('Logo Updated', 'Restaurant logo uploaded and saved successfully.');
      }
    } catch (err: any) {
      showToast('error', 'Logo Upload Failed', err.message || 'Failed to upload logo.');
      Alert.alert('Logo Upload Failed', err.message || 'Failed to upload logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update restaurant logo.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update restaurant logo.');
      return;
    }
    try {
      setIsSaving(true);
      setLogoUrl('');
      await updateSettings({ logo_url: '' });
      if (activeRestaurantId) {
        await supabase.from('restaurants').update({ logo_url: null }).eq('id', activeRestaurantId);
      }
      setIsDirty(false);
      showToast('success', 'Logo Removed', 'Restaurant logo has been removed.');
      Alert.alert('Logo Removed', 'Restaurant logo has been removed.');
    } catch (err: any) {
      showToast('error', 'Error', err.message || 'Failed to remove logo.');
      Alert.alert('Error', err.message || 'Failed to remove logo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadBanner = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can update restaurant banners.');
      Alert.alert('Permission Denied', 'Only ADMIN users can update restaurant banners.');
      return;
    }
    try {
      setIsUploadingBanner(true);
      const res = await storageService.pickAndUploadBanner({ restaurantId: activeRestaurantId });
      if (res && res.url) {
        const updated = [...bannerUrls, res.url];
        setBannerUrls(updated);
        const bannerPayload = updated.length > 0 ? JSON.stringify(updated) : '';

        await updateSettings({
          banner_url: bannerPayload,
          banner_urls: updated,
          gallery_urls: updated,
        });

        if (activeRestaurantId) {
          await Promise.all([
            supabase.from('restaurants').update({ banner_url: bannerPayload }).eq('id', activeRestaurantId),
            supabase.from('restaurant_public_profiles').update({ banner_url: bannerPayload }).eq('restaurant_id', activeRestaurantId),
          ]);
        }

        setIsDirty(false);
        showToast('success', 'Banner Added', 'New banner image added to restaurant showcase carousel.');
        Alert.alert('Banner Added', 'New banner image added to restaurant showcase carousel.');
      }
    } catch (err: any) {
      showToast('error', 'Upload Failed', err.message || 'Failed to upload banner image. You can also paste an image URL directly.');
      Alert.alert('Upload Failed', err.message || 'Failed to upload banner image. You can also paste an image URL directly.');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleAddBannerByUrl = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can manage restaurant banners.');
      Alert.alert('Permission Denied', 'Only ADMIN users can manage restaurant banners.');
      return;
    }
    const cleanUrl = customBannerUrl.trim();
    if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('data:'))) {
      showToast('error', 'Invalid URL', 'Please enter a valid HTTP, HTTPS, or Data URI image address.');
      Alert.alert('Invalid URL', 'Please enter a valid HTTP, HTTPS, or Data URI image address.');
      return;
    }

    try {
      setIsSaving(true);
      const updated = [...bannerUrls, cleanUrl];
      setBannerUrls(updated);
      setCustomBannerUrl('');
      setShowUrlModal(false);
      const bannerPayload = updated.length > 0 ? JSON.stringify(updated) : '';

      await updateSettings({
        banner_url: bannerPayload,
        banner_urls: updated,
        gallery_urls: updated,
      });

      if (activeRestaurantId) {
        await Promise.all([
          supabase.from('restaurants').update({ banner_url: bannerPayload }).eq('id', activeRestaurantId),
          supabase.from('restaurant_public_profiles').update({ banner_url: bannerPayload }).eq('restaurant_id', activeRestaurantId),
        ]);
      }

      setIsDirty(false);
      showToast('success', 'Image Added', 'Image URL added to restaurant showcase carousel.');
      Alert.alert('Image Added', 'Image URL added to restaurant showcase carousel.');
    } catch (err: any) {
      showToast('error', 'Error', err.message || 'Failed to save image URL.');
      Alert.alert('Error', err.message || 'Failed to save image URL.');
    } finally {
      setIsSaving(false);
    }
  };

  // Sync banner position when selected banner or list changes
  useEffect(() => {
    if (bannerUrls.length > 0) {
      const idx = Math.min(selectedBannerIdx, bannerUrls.length - 1);
      if (idx !== selectedBannerIdx) {
        setSelectedBannerIdx(idx);
      }
      setBannerPosY(extractBannerPosY(bannerUrls[idx]));
    }
  }, [selectedBannerIdx, bannerUrls]);

  const handlePointerDown = (e: any) => {
    isDraggingRef.current = true;
    setIsDraggingBanner(true);
    const clientY = e.clientY ?? e.nativeEvent?.pageY ?? e.nativeEvent?.touches?.[0]?.pageY ?? 0;
    dragStartYRef.current = clientY;
    dragStartPosYRef.current = bannerPosY;
  };

  const handlePointerMove = (e: any) => {
    if (!isDraggingRef.current) return;
    const clientY = e.clientY ?? e.nativeEvent?.pageY ?? e.nativeEvent?.touches?.[0]?.pageY ?? 0;
    const deltaY = clientY - dragStartYRef.current;
    // Dragging down shifts image focal point up; dragging up shifts focal point down
    const percentDelta = (deltaY / 220) * 100;
    const newPos = Math.min(100, Math.max(0, Math.round(dragStartPosYRef.current - percentDelta)));
    setBannerPosY(newPos);
  };

  const handlePointerUp = () => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDraggingBanner(false);
    }
  };

  const handleSaveBannerPosition = async (customY?: number) => {
    if (!canManage || bannerUrls.length === 0) return;
    const targetY = customY !== undefined ? customY : bannerPosY;
    const idx = Math.min(selectedBannerIdx, bannerUrls.length - 1);
    const current = bannerUrls[idx];
    const updatedUrl = formatBannerWithPosY(current, targetY);
    const updated = [...bannerUrls];
    updated[idx] = updatedUrl;
    setBannerUrls(updated);
    setBannerPosY(targetY);

    try {
      setIsSavingBannerPos(true);
      const bannerPayload = JSON.stringify(updated);
      await updateSettings({
        banner_url: bannerPayload,
        banner_urls: updated,
        gallery_urls: updated,
      });
      if (activeRestaurantId) {
        await Promise.all([
          supabase.from('restaurants').update({ banner_url: bannerPayload }).eq('id', activeRestaurantId),
          supabase.from('restaurant_public_profiles').update({ banner_url: bannerPayload }).eq('restaurant_id', activeRestaurantId),
        ]);
      }
      showToast('success', 'Banner Position Saved', `Focal alignment saved at ${targetY}%. Changes are live in customer storefront.`);
      Alert.alert('Banner Position Saved', `Banner focal alignment saved at ${targetY}%. The customer panel will now display this focal area.`);
    } catch (err: any) {
      showToast('error', 'Save Failed', err.message || 'Failed to save banner position.');
      Alert.alert('Save Failed', err.message || 'Failed to save banner position.');
    } finally {
      setIsSavingBannerPos(false);
    }
  };

  const handleRemoveBanner = async (index: number) => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can manage restaurant banners.');
      Alert.alert('Permission Denied', 'Only ADMIN users can manage restaurant banners.');
      return;
    }
    try {
      setIsSaving(true);
      const updated = bannerUrls.filter((_, idx) => idx !== index);
      setBannerUrls(updated);
      const bannerPayload = updated.length > 0 ? JSON.stringify(updated) : '';

      await updateSettings({
        banner_url: bannerPayload,
        banner_urls: updated,
        gallery_urls: updated,
      });

      if (activeRestaurantId) {
        await Promise.all([
          supabase.from('restaurants').update({ banner_url: bannerPayload || null }).eq('id', activeRestaurantId),
          supabase.from('restaurant_public_profiles').update({ banner_url: bannerPayload || null }).eq('restaurant_id', activeRestaurantId),
        ]);
      }

      setIsDirty(false);
      showToast('success', 'Banner Removed', 'Image removed from restaurant carousel.');
      Alert.alert('Banner Removed', 'Image removed from restaurant carousel.');
    } catch (err: any) {
      showToast('error', 'Error', err.message || 'Failed to remove banner image.');
      Alert.alert('Error', err.message || 'Failed to remove banner image.');
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Save Profile & Branding Info Only (updates restaurants and restaurant_settings profile fields)
  const handleSaveProfileInfo = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can save restaurant profile info.');
      Alert.alert('Permission Denied', 'Only ADMIN users can save restaurant profile info.');
      return;
    }
    if (!name.trim()) {
      showToast('error', 'Validation Error', 'Restaurant Name cannot be empty.');
      Alert.alert('Validation Error', 'Restaurant Name cannot be empty.');
      return;
    }

    if (email.trim() && !isValidEmail(email)) {
      showToast('error', 'Validation Error', 'Enter a valid email address.');
      Alert.alert('Validation Error', 'Enter a valid email address.');
      return;
    }

    if (phone.trim() && !isValidIndianPhone(phone)) {
      showToast('error', 'Validation Error', 'Enter a valid 10-digit Indian mobile number.');
      Alert.alert('Validation Error', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }

    const cleanPhone = phone.trim() ? normalizeIndianPhone(phone) : '';
    const cleanEmail = email.trim() ? normalizeEmail(email) : '';

    try {
      setIsSaving(true);
      const bannerPayload = bannerUrls.length > 0 ? JSON.stringify(bannerUrls) : '';

      const persisted = await updateSettings({
        name: name.trim(),
        legal_name: legalName.trim(),
        address: address.trim(),
        phone: cleanPhone,
        email: cleanEmail,
        logo_url: logoUrl,
        banner_url: bannerPayload,
        banner_urls: bannerUrls,
        gallery_urls: bannerUrls,
      });

      if (activeRestaurantId) {
        await Promise.all([
          supabase.from('restaurants').update({
            name: name.trim(),
            legal_name: legalName.trim(),
            address: address.trim(),
            phone: cleanPhone,
            email: cleanEmail,
            logo_url: logoUrl || null,
            banner_url: bannerPayload || null,
          }).eq('id', activeRestaurantId),
          supabase.from('restaurant_public_profiles').update({
            banner_url: bannerPayload || null,
          }).eq('restaurant_id', activeRestaurantId),
        ]);
      }

      if (persisted) {
        setName(persisted.name);
        setLegalName(persisted.legal_name || '');
        setAddress(persisted.address || '');
        setPhone(persisted.phone || '');
        setEmail(persisted.email || '');
        setLogoUrl(persisted.logo_url || '');
        setBannerUrls(parseBannerUrls(persisted.banner_url || persisted.banner_urls));
      }

      setIsDirty(false);
      showToast('success', 'Profile Saved', 'Restaurant profile and branding updated successfully.');
      Alert.alert('Profile Saved', 'Restaurant profile and branding information updated successfully.');
    } catch (err: any) {
      showToast('error', 'Save Failed', err.message || 'Failed to save restaurant profile.');
      Alert.alert('Save Failed', err.message || 'Failed to save restaurant profile.');
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Save GST & Tax Settings Only (updates public.restaurant_settings only, NO restaurants PATCH)
  const handleSaveGstSettings = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only ADMIN users can save GST settings.');
      Alert.alert('Permission Denied', 'Only ADMIN users can save GST settings.');
      return;
    }

    const numRate = parseFloat(taxRate);
    const validatedRate = !isNaN(numRate) && numRate >= 0 ? numRate : 0.0;

    try {
      setIsSavingGst(true);

      const persisted = await updateSettings({
        gstin: gstin.trim(),
        default_tax_rate: validatedRate,
        tax_rate: validatedRate,
        gst_registered: gstRegistered,
        is_gst_enabled: isGstEnabled,
        tax_invoice_enabled: taxInvoiceEnabled,
      });

      if (persisted) {
        setGstin(persisted.gstin || '');
        setTaxRate(
          persisted.default_tax_rate !== undefined && persisted.default_tax_rate !== null
            ? persisted.default_tax_rate.toString()
            : '0.0'
        );
        setGstRegistered(
          persisted.gst_registered !== undefined ? Boolean(persisted.gst_registered) : Boolean(persisted.gstin?.trim())
        );
        setIsGstEnabled(
          persisted.is_gst_enabled !== undefined
            ? Boolean(persisted.is_gst_enabled)
            : false
        );
        setTaxInvoiceEnabled(
          persisted.tax_invoice_enabled !== undefined
            ? Boolean(persisted.tax_invoice_enabled)
            : false
        );
      }

      setIsDirty(false);
      const summary = `GSTIN: ${gstin.trim() || 'None'} • Rate: ${validatedRate}% • Status: ${isGstEnabled ? 'Active' : 'Disabled'}`;
      showToast('success', 'GST Settings Saved', summary);
      Alert.alert(
        'GST Settings Saved',
        `GSTIN: ${gstin.trim() || 'None'}\nGST Rate: ${validatedRate}%\nCGST: ${(validatedRate / 2).toFixed(1)}% | SGST: ${(validatedRate / 2).toFixed(1)}%\nStatus: ${isGstEnabled ? 'Active' : 'Disabled'}`
      );
    } catch (err: any) {
      showToast('error', 'Save Failed', err.message || 'Failed to save GST settings.');
      Alert.alert('Save Failed', err.message || 'Failed to save GST settings.');
    } finally {
      setIsSavingGst(false);
    }
  };

  const handleCreateNewAccount = async () => {
    if (!canManage) {
      showToast('error', 'Permission Denied', 'Only authenticated ADMIN users can create staff or admin accounts.');
      Alert.alert('Permission Denied', 'Only authenticated ADMIN users can create staff or admin accounts.');
      return;
    }

    if (!accountEmail || !accountPassword || !accountName) {
      showToast('error', 'Missing Fields', 'Please fill in Email, Full Name, and Password.');
      Alert.alert('Missing Fields', 'Please fill in Email, Full Name, and Password.');
      return;
    }

    if (!isValidEmail(accountEmail)) {
      showToast('error', 'Invalid Email', 'Enter a valid email address.');
      Alert.alert('Invalid Email', 'Enter a valid email address.');
      return;
    }

    if (accountPhone.trim() && !isValidIndianPhone(accountPhone)) {
      showToast('error', 'Invalid Phone', 'Enter a valid 10-digit Indian mobile number.');
      Alert.alert('Invalid Phone', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (accountPassword.length < 6) {
      showToast('error', 'Weak Password', 'Password must be at least 6 characters long.');
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    const cleanAccountEmail = normalizeEmail(accountEmail);
    const cleanAccountPhone = accountPhone.trim() ? normalizeIndianPhone(accountPhone) : undefined;

    try {
      setIsCreatingAccount(true);
      const targetRestId = activeRestaurantId || settings.restaurant_id || settings.id;
      const newUser = await authService.createAdminUser(
        cleanAccountEmail,
        accountPassword,
        accountName.trim(),
        cleanAccountPhone,
        accountRole,
        targetRestId
      );
      showToast(
        'success',
        'Account Created!',
        `New ${accountRole} account (${newUser.email}) created successfully.`
      );
      Alert.alert(
        'Account Created!',
        `New ${accountRole} account (${newUser.email}) created successfully and recorded in Audit Logs.`
      );
      setAccountEmail('');
      setAccountName('');
      setAccountPhone('');
      setAccountPassword('');
    } catch (e: any) {
      showToast('error', 'Account Creation Error', e.message || 'Failed to create account.');
      Alert.alert('Account Creation Error', e.message || 'Failed to create account.');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: isDesktop ? 20 : 12 },
        ]}
      >
        <View style={styles.contentWrapper}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>Restaurant Settings & Administration</Text>
            <Text style={styles.subTitleText}>
              Manage restaurant branding, tax & GST rules, printer paper sizes, online marketplace status, and staff access.
            </Text>
          </View>

          {/* Responsive Multi-Column Flex Grid */}
          <View style={[styles.dashboardGrid, isDesktop ? styles.dashboardGridRow : styles.dashboardGridCol]}>
            {/* LEFT COLUMN */}
            <View style={[styles.gridCol, isDesktop ? styles.gridColDesktop : styles.gridColMobile]}>
              {/* 1. Restaurant Profile & Basic Info */}
              <View style={styles.card}>
                <Text style={styles.cardHeader}>🏢 Restaurant Profile & Branding</Text>
                <Text style={styles.cardSubHeader}>Basic business identity, logo, showcase banners, and contact information.</Text>

                {/* Logo & Banner Controls Row */}
                <View style={[styles.brandingRow, isDesktop ? styles.brandingRowDesktop : styles.brandingRowMobile]}>
                  {/* Logo Box */}
                  <View style={[styles.logoBox, isDesktop ? styles.logoBoxDesktop : styles.logoBoxMobile]}>
                    <View style={styles.logoHeaderRow}>
                      <Text style={styles.logoHeaderTitle}>Brand Logo</Text>
                      <Text style={styles.logoHeaderHint}>Square 1:1</Text>
                    </View>

                    <View style={styles.logoContentRow}>
                      {logoUrl ? (
                        <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="contain" />
                      ) : (
                        <View style={styles.logoPlaceholder}>
                          <Text style={{ fontSize: 20 }}>🍽️</Text>
                          <Text style={{ fontSize: 8, color: '#94a3b8', fontWeight: '700', marginTop: 2 }}>NO LOGO</Text>
                        </View>
                      )}

                      <View style={{ gap: 4, flex: 1 }}>
                        <TouchableOpacity
                          style={[styles.logoBtn, isUploadingLogo && { opacity: 0.6 }]}
                          onPress={handleUploadLogo}
                          disabled={isUploadingLogo || !canManage}
                        >
                          {isUploadingLogo ? (
                            <ActivityIndicator size="small" color="#2563eb" />
                          ) : (
                            <Text style={styles.logoBtnText}>📷 {logoUrl ? 'Change Logo' : 'Upload Logo'}</Text>
                          )}
                        </TouchableOpacity>

                        {logoUrl && canManage ? (
                          <TouchableOpacity
                            style={styles.logoRemoveBtn}
                            onPress={handleRemoveLogo}
                          >
                            <Text style={styles.logoRemoveBtnText}>✕ Remove</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* Banner Add Box */}
                  <View style={[styles.bannerBox, isDesktop ? styles.bannerBoxDesktop : styles.bannerBoxMobile]}>
                    <View style={styles.bannerHeaderRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.bannerHeaderTitle}>Showcase Banners</Text>
                        <View style={styles.bannerCountBadge}>
                          <Text style={styles.bannerCountBadgeText}>{bannerUrls.length}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.bannerAddBtn, isUploadingBanner && { opacity: 0.6 }]}
                          onPress={handleUploadBanner}
                          disabled={isUploadingBanner || !canManage}
                        >
                          {isUploadingBanner ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.bannerAddBtnText}>📷 Photo</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.bannerAddBtn, { backgroundColor: '#475569' }]}
                          onPress={() => setShowUrlModal(!showUrlModal)}
                          disabled={!canManage}
                        >
                          <Text style={styles.bannerAddBtnText}>🔗 URL</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {showUrlModal && (
                      <View style={styles.urlInputBox}>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TextInput
                            style={[styles.input, { flex: 1, paddingVertical: 5 }]}
                            placeholder="https://..."
                            placeholderTextColor="#94a3b8"
                            value={customBannerUrl}
                            onChangeText={setCustomBannerUrl}
                            autoCapitalize="none"
                          />
                          <TouchableOpacity
                            style={[styles.bannerAddBtn, { justifyContent: 'center' }]}
                            onPress={handleAddBannerByUrl}
                          >
                            <Text style={styles.bannerAddBtnText}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Banner Previews */}
                    {bannerUrls.length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          {bannerUrls.map((url, idx) => {
                            const isSelected = idx === selectedBannerIdx;
                            return (
                              <TouchableOpacity
                                key={`banner-${idx}`}
                                style={[
                                  styles.bannerThumbWrap,
                                  isSelected && styles.bannerThumbWrapSelected,
                                ]}
                                onPress={() => setSelectedBannerIdx(idx)}
                                activeOpacity={0.8}
                              >
                                <OptimizedImage
                                  source={url}
                                  type="banner"
                                  style={styles.bannerThumb}
                                  contentFit="cover"
                                />
                                {canManage && (
                                  <TouchableOpacity
                                    style={styles.bannerDeleteBtn}
                                    onPress={(e) => {
                                      e.stopPropagation?.();
                                      handleRemoveBanner(idx);
                                    }}
                                  >
                                    <Text style={styles.bannerDeleteBtnText}>✕</Text>
                                  </TouchableOpacity>
                                )}
                                <View
                                  style={[
                                    styles.bannerIndexBadge,
                                    isSelected && { backgroundColor: '#2563eb' },
                                  ]}
                                >
                                  <Text style={styles.bannerIndexText}>
                                    {isSelected ? `✓ #${idx + 1} Selected` : `#${idx + 1}`}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    ) : (
                      <View style={styles.bannerEmptyBox}>
                        <Text style={{ fontSize: 13 }}>🖼️</Text>
                        <Text style={styles.bannerEmptyText}>No showcase banners uploaded. Tap Photo or URL to add.</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Form Fields */}
                <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile]}>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Restaurant Name *</Text>
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={(v) => {
                        setName(v);
                        setIsDirty(true);
                      }}
                      placeholder="Ratnadeep Restaurant"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Legal Entity Name</Text>
                    <TextInput
                      style={styles.input}
                      value={legalName}
                      onChangeText={(v) => {
                        setLegalName(v);
                        setIsDirty(true);
                      }}
                      placeholder="e.g. Ratnadeep Foods Pvt Ltd"
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>

                <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile]}>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Phone Number</Text>
                    <TextInput
                      style={[styles.input, Boolean(phone && !isValidIndianPhone(phone)) && { borderColor: '#dc2626' }]}
                      value={phone}
                      onChangeText={(v) => {
                        setPhone(v);
                        setIsDirty(true);
                      }}
                      placeholder="+91 98765 43210"
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                    />
                    {Boolean(phone && !isValidIndianPhone(phone)) && (
                      <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600', marginTop: 3 }}>
                        ⚠️ Enter a valid 10-digit Indian mobile number
                      </Text>
                    )}
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                      style={[styles.input, Boolean(email && !isValidEmail(email)) && { borderColor: '#dc2626' }]}
                      value={email}
                      onChangeText={(v) => {
                        setEmail(v);
                        setIsDirty(true);
                      }}
                      placeholder="contact@restaurant.com"
                      placeholderTextColor="#94a3b8"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    {Boolean(email && !isValidEmail(email)) && (
                      <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600', marginTop: 3 }}>
                        ⚠️ Enter a valid email address
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Address</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 48, paddingVertical: 8 }]}
                    value={address}
                    onChangeText={(v) => {
                      setAddress(v);
                      setIsDirty(true);
                    }}
                    multiline
                    placeholder="Restaurant physical address, street, area, city"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, (isSaving || !canManage) && { opacity: 0.6 }]}
                  onPress={handleSaveProfileInfo}
                  disabled={isSaving || !canManage}
                >
                  {isSaving ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator color="#ffffff" size="small" />
                      <Text style={styles.saveBtnText}>Saving Profile...</Text>
                    </View>
                  ) : (
                    <Text style={styles.saveBtnText}>Save Profile Info</Text>
                  )}
                </TouchableOpacity>

                {/* Interactive Banner Drag & Focal Adjuster with Exact Customer Storefront Preview */}
                {bannerUrls.length > 0 && (
                  <View style={styles.bannerAdjusterCard}>
                    {/* Adjuster Header & Responsive View Toggles */}
                    <View style={styles.adjusterHeaderRow}>
                      <View style={styles.adjusterTitleCol}>
                        <Text style={styles.adjusterTitle}>
                          🎯 Banner Focal Area & Customer Preview
                        </Text>
                        <Text style={styles.adjusterSubTitle}>
                          Drag banner up/down or tap presets to align the focal area for customers.
                        </Text>
                      </View>

                      <View style={styles.adjusterActionsWrap}>
                        {/* Device Mode Switcher */}
                        <View style={styles.previewToggleGroup}>
                          <TouchableOpacity
                            style={[
                              styles.previewToggleBtn,
                              previewDeviceMode === 'desktop' && styles.previewToggleBtnActive,
                            ]}
                            onPress={() => setPreviewDeviceMode('desktop')}
                          >
                            <Text
                              style={[
                                styles.previewToggleBtnText,
                                previewDeviceMode === 'desktop' && styles.previewToggleBtnTextActive,
                              ]}
                            >
                              🖥️ Desktop
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.previewToggleBtn,
                              previewDeviceMode === 'mobile' && styles.previewToggleBtnActive,
                            ]}
                            onPress={() => setPreviewDeviceMode('mobile')}
                          >
                            <Text
                              style={[
                                styles.previewToggleBtnText,
                                previewDeviceMode === 'mobile' && styles.previewToggleBtnTextActive,
                              ]}
                            >
                              📱 Mobile
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Overlays Toggle */}
                        <TouchableOpacity
                          style={[
                            styles.previewOptionBtn,
                            showOverlaysInPreview && styles.previewOptionBtnActive,
                          ]}
                          onPress={() => setShowOverlaysInPreview(!showOverlaysInPreview)}
                        >
                          <Text
                            style={[
                              styles.previewOptionBtnText,
                              showOverlaysInPreview && styles.previewOptionBtnTextActive,
                            ]}
                          >
                            {showOverlaysInPreview ? '👁️ UI: ON' : '👁️ UI: OFF'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Customer Storefront Browser Mockup Shell */}
                    <View style={styles.storefrontBrowserShell}>
                      {/* Browser Mockup Top Navbar */}
                      <View style={styles.storefrontTopNav}>
                        <View style={styles.storefrontBrandWrap}>
                          <Text style={styles.storefrontFlameLogo}>🔥</Text>
                          <View>
                            <Text style={styles.storefrontBrandName}>RestroZ</Text>
                            <Text style={styles.storefrontBrandTag}>Every flavor. one place</Text>
                          </View>
                        </View>
                        <View style={styles.storefrontNavLinks}>
                          <Text style={styles.storefrontNavLink}>🏠 Explore</Text>
                          <Text style={styles.storefrontNavLink}>🛍️ Cart</Text>
                          {previewDeviceMode === 'desktop' && isDesktop && (
                            <>
                              <Text style={styles.storefrontNavLink}>📋 Orders</Text>
                              <Text style={styles.storefrontNavLink}>👤 Profile</Text>
                            </>
                          )}
                        </View>
                      </View>

                      {/* Storefront Subheader (Back & Title) */}
                      <View style={styles.storefrontSubHeader}>
                        <Text style={styles.storefrontBackLink}>← Restaurants</Text>
                        <Text style={styles.storefrontCenterTitle} numberOfLines={1}>
                          {name || 'Crunchy Dosa'}
                        </Text>
                        <Text style={styles.storefrontCartIcon}>🛍️</Text>
                      </View>

                      {/* Interactive Drag & Preview Banner Frame */}
                      <View
                        style={[
                          styles.bannerPreviewFrame,
                          {
                            aspectRatio: previewDeviceMode === 'desktop' ? (isDesktop ? 16 / 5 : 16 / 7) : 16 / 9,
                            minHeight: previewDeviceMode === 'desktop' ? 140 : 185,
                            cursor: (Platform.OS === 'web' ? (isDraggingBanner ? 'grabbing' : 'grab') : undefined) as any,
                          },
                        ]}
                        {...(Platform.OS === 'web'
                          ? {
                              onMouseDown: handlePointerDown,
                              onMouseMove: handlePointerMove,
                              onMouseUp: handlePointerUp,
                              onMouseLeave: handlePointerUp,
                            }
                          : {
                              onTouchStart: handlePointerDown,
                              onTouchMove: handlePointerMove,
                              onTouchEnd: handlePointerUp,
                            })}
                      >
                        {/* Background Banner Image with focal position */}
                        <OptimizedImage
                          key={`preview-banner-${selectedBannerIdx}-${extractBannerCleanUrl(bannerUrls[selectedBannerIdx])}-${bannerPosY}`}
                          source={formatBannerWithPosY(bannerUrls[selectedBannerIdx], bannerPosY)}
                          type="banner"
                          style={StyleSheet.absoluteFill}
                          contentFit="cover"
                        />

                        {/* Dark gradient overlay matching customer panel */}
                        <View style={styles.bannerDarkGradient} pointerEvents="none" />

                        {/* Floating Drag Guide Badge */}
                        <View style={styles.focalBadge} pointerEvents="none">
                          <Text style={styles.focalBadgeText}>
                            ↕️ Drag • Focal: {bannerPosY}%
                          </Text>
                        </View>

                        {/* Customer Panel Overlays (Matching Customer Storefront) */}
                        {showOverlaysInPreview && (
                          <View style={styles.customerOverlayMockup} pointerEvents="none">
                            {/* Top row with status */}
                            <View style={[styles.mockupStatusPill, !isOnlineOrdersEnabled && styles.mockupStatusPillClosed]}>
                              <View style={[styles.mockupStatusDot, !isOnlineOrdersEnabled && styles.mockupStatusDotClosed]} />
                              <Text style={[styles.mockupStatusText, !isOnlineOrdersEnabled && styles.mockupStatusTextClosed]}>
                                {isOnlineOrdersEnabled ? 'Open' : 'Closed'}
                              </Text>
                            </View>

                            {/* Bottom info section */}
                            <View style={styles.mockupBottomInfo}>
                              <View style={styles.mockupTitleRow}>
                                {logoUrl ? (
                                  <Image source={{ uri: logoUrl }} style={styles.mockupLogo} resizeMode="contain" />
                                ) : null}
                                <Text style={styles.mockupTitle} numberOfLines={1}>
                                  {name || 'Crunchy Dosa'}
                                </Text>
                                <Text style={{ fontSize: 11 }}>🎖️</Text>
                              </View>

                              <Text style={styles.mockupCuisine} numberOfLines={1}>
                                Multi-Cuisine • Indian • Fast Food
                              </Text>

                              <View style={styles.mockupRatingPill}>
                                <Text style={styles.mockupRatingStar}>★</Text>
                                <Text style={styles.mockupRatingScore}>4.6</Text>
                                <Text style={styles.mockupRatingReviews}>50+ reviews</Text>
                              </View>

                              <View style={styles.mockupMetaRow}>
                                <View style={styles.mockupCapsule}>
                                  <Text style={{ fontSize: 9 }}>⏱️</Text>
                                  <Text style={styles.mockupCapsuleMain}>35 mins</Text>
                                </View>

                                <View style={styles.mockupCapsule}>
                                  <Text style={{ fontSize: 9 }}>₹</Text>
                                  <Text style={styles.mockupCapsuleMain}>₹{minimumOrderValue || '0'} Min</Text>
                                </View>

                                <View style={styles.mockupCapsule}>
                                  <Text style={{ fontSize: 9 }}>🛵</Text>
                                  <Text style={styles.mockupCapsuleMain}>
                                    {Number(deliveryChargeBase || 0) === 0
                                      ? 'Free Delivery'
                                      : Number(freeDeliveryAbove || 0) > 0
                                      ? `₹${deliveryChargeBase} • Free > ₹${freeDeliveryAbove}`
                                      : `₹${deliveryChargeBase} Delivery`}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        )}

                        {/* Carousel Navigation Mockup Elements */}
                        <View style={styles.mockupCarouselArrowLeft} pointerEvents="none">
                          <Text style={styles.mockupCarouselArrowText}>‹</Text>
                        </View>
                        <View style={styles.mockupCarouselArrowRight} pointerEvents="none">
                          <Text style={styles.mockupCarouselArrowText}>›</Text>
                        </View>
                        <View style={styles.mockupDotsContainer} pointerEvents="none">
                          <View style={styles.mockupActiveDot} />
                          <View style={styles.mockupInactiveDot} />
                          <View style={styles.mockupInactiveDot} />
                        </View>
                      </View>

                      {/* Mockup Storefront Categories & Search Strip */}
                      <View style={styles.storefrontFilterRow}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.mockupCategoryScroll}
                        >
                          <View style={[styles.mockupCatChip, styles.mockupCatChipActive]}>
                            <Text style={styles.mockupCatTextActive}>All Items</Text>
                          </View>
                          <View style={styles.mockupCatChip}>
                            <Text style={styles.mockupCatText}>Dosa</Text>
                          </View>
                          <View style={styles.mockupCatChip}>
                            <Text style={styles.mockupCatText}>Uttapam</Text>
                          </View>
                          <View style={styles.mockupCatChip}>
                            <Text style={styles.mockupCatText}>Add Ons</Text>
                          </View>
                          <View style={styles.mockupCatChip}>
                            <Text style={styles.mockupCatText}>Starters</Text>
                          </View>
                          <View style={styles.mockupCatChip}>
                            <Text style={styles.mockupCatText}>Breakfast</Text>
                          </View>
                        </ScrollView>
                        <View style={styles.mockupSearchBox}>
                          <Text style={{ fontSize: 9.5, color: '#94A3B8' }}>🔍 Search...</Text>
                        </View>
                      </View>
                    </View>

                    {/* Quick Presets and Adjustment Steppers */}
                    <View style={styles.adjusterControlsRow}>
                      <View style={styles.presetsWrap}>
                        <Text style={styles.controlSectionLabel}>Presets:</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 5, paddingVertical: 2 }}
                        >
                          {[
                            { label: 'Top 10%', val: 10 },
                            { label: 'Upper 30%', val: 30 },
                            { label: 'Center 50%', val: 50 },
                            { label: 'Lower 70%', val: 70 },
                            { label: 'Bottom 90%', val: 90 },
                          ].map((p) => (
                            <TouchableOpacity
                              key={`preset-${p.val}`}
                              style={[
                                styles.presetChip,
                                bannerPosY === p.val && styles.presetChipActive,
                              ]}
                              onPress={() => setBannerPosY(p.val)}
                            >
                              <Text
                                style={[
                                  styles.presetChipText,
                                  bannerPosY === p.val && styles.presetChipTextActive,
                                ]}
                              >
                                {p.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>

                      <View style={styles.fineTuneRow}>
                        <View style={styles.stepperGroup}>
                          <Text style={styles.controlSectionLabel}>Fine Tune:</Text>
                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => setBannerPosY((prev) => Math.max(0, prev - 5))}
                          >
                            <Text style={styles.stepBtnText}>-5%</Text>
                          </TouchableOpacity>

                          <View style={styles.posValueBadge}>
                            <Text style={styles.posValueDisplay}>{bannerPosY}%</Text>
                          </View>

                          <TouchableOpacity
                            style={styles.stepBtn}
                            onPress={() => setBannerPosY((prev) => Math.min(100, prev + 5))}
                          >
                            <Text style={styles.stepBtnText}>+5%</Text>
                          </TouchableOpacity>
                        </View>

                        {canManage && (
                          <TouchableOpacity
                            style={[styles.savePosBtn, isSavingBannerPos && { opacity: 0.6 }]}
                            onPress={() => handleSaveBannerPosition()}
                            disabled={isSavingBannerPos}
                          >
                            {isSavingBannerPos ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.savePosBtnText}>
                                💾 Save Alignment ({bannerPosY}%)
                              </Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* 3. Marketplace Online Ordering */}
              <View style={styles.card}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.cardHeader}>🌐 Marketplace Online Ordering</Text>
                    <Text style={styles.cardSubHeader}>
                      Toggle customer online food ordering availability in the marketplace.
                    </Text>
                  </View>
                  <TouchableOpacity
                    testID="settings-online-orders-toggle"
                    disabled={isTogglingOnline || !canManage}
                    style={[
                      styles.toggleBadge,
                      isOnlineOrdersEnabled ? styles.toggleBadgeOn : styles.toggleBadgeOff,
                      (isTogglingOnline || !canManage) && { opacity: 0.6 },
                    ]}
                    onPress={async () => {
                      if (!canManage) {
                        showToast('error', 'Permission Denied', 'Only Restaurant Admins can change online ordering status.');
                        Alert.alert('Permission Denied', 'Only Restaurant Admins can change online ordering status.');
                        return;
                      }
                      setIsTogglingOnline(true);
                      try {
                        const next = !isOnlineOrdersEnabled;
                        await toggleOnlineOrders(next);
                        const statusTitle = next ? 'Online Orders Enabled' : 'Online Orders Disabled';
                        const statusDesc = next
                          ? 'Restaurant is now OPEN for customer marketplace orders.'
                          : 'Restaurant is now CLOSED in customer marketplace. Delivery checkout is blocked.';
                        showToast('success', statusTitle, statusDesc);
                        Alert.alert(statusTitle, statusDesc);
                      } catch (e: any) {
                        showToast('error', 'Error', e.message || 'Failed to update online ordering status');
                        Alert.alert('Error', e.message || 'Failed to update online ordering status');
                      } finally {
                        setIsTogglingOnline(false);
                      }
                    }}
                  >
                    <Text style={[styles.toggleBadgeText, !isOnlineOrdersEnabled && styles.toggleBadgeTextOff]}>
                      {isOnlineOrdersEnabled ? '● OPEN' : '○ CLOSED'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 3.1. Online Delivery & Payment Settings */}
              <View style={styles.card}>
                <Text style={styles.cardHeader}>🚚 Online Delivery & Payment Settings</Text>
                <Text style={styles.cardSubHeader}>
                  Configure restaurant UPI payments, QR code, verification sample screenshot, Cash on Delivery, and delivery charges.
                </Text>

                {/* COD Availability Toggle */}
                <View style={styles.toggleCard}>
                  <View style={styles.toggleHeaderRow}>
                    <Text style={styles.toggleTitle}>Cash on Delivery (COD)</Text>
                    <TouchableOpacity
                      testID="settings-enable-cod-toggle"
                      disabled={!canManage}
                      style={[
                        styles.toggleBadge,
                        enableCod ? styles.toggleBadgeOn : styles.toggleBadgeOff,
                        !canManage && { opacity: 0.6 },
                      ]}
                      onPress={() => {
                        if (!canManage) return;
                        setEnableCod(!enableCod);
                        setIsDirty(true);
                      }}
                    >
                      <Text style={[styles.toggleBadgeText, !enableCod && styles.toggleBadgeTextOff]}>
                        {enableCod ? '● COD ENABLED' : '○ COD DISABLED'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.toggleDesc}>
                    {enableCod
                      ? 'Customers can place delivery orders with Cash on Delivery.'
                      : 'Customers can only pay online via UPI/QR code.'}
                  </Text>
                </View>

                {/* Delivery Charges, Minimum Order Value and Free Delivery Threshold */}
                <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile]}>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Min. Order Value (₹)</Text>
                    <TextInput
                      style={styles.input}
                      value={minimumOrderValue}
                      onChangeText={(v) => {
                        setMinimumOrderValue(v);
                        setIsDirty(true);
                      }}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      editable={canManage}
                    />
                    <Text style={styles.helperText}>
                      Minimum order subtotal to place online delivery orders. Shown as "Min. Order" on your storefront.
                    </Text>
                  </View>

                  <View style={styles.formCol}>
                    <Text style={styles.label}>Standard Delivery Charge (₹)</Text>
                    <TextInput
                      style={styles.input}
                      value={deliveryChargeBase}
                      onChangeText={(v) => {
                        setDeliveryChargeBase(v);
                        setIsDirty(true);
                      }}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      editable={canManage}
                    />
                    <Text style={styles.helperText}>
                      Delivery fee applied to customer orders.
                    </Text>
                  </View>

                  <View style={styles.formCol}>
                    <Text style={styles.label}>Free Delivery Above (₹)</Text>
                    <TextInput
                      style={styles.input}
                      value={freeDeliveryAbove}
                      onChangeText={(v) => {
                        setFreeDeliveryAbove(v);
                        setIsDirty(true);
                      }}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor="#94a3b8"
                      editable={canManage}
                    />
                    <Text style={styles.helperText}>
                      Orders above this amount get FREE delivery. Set 0 if not offering free delivery.
                    </Text>
                  </View>
                </View>

                {/* UPI ID */}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Restaurant UPI ID</Text>
                  <TextInput
                    style={styles.input}
                    value={deliveryUpiId}
                    onChangeText={(v) => {
                      setDeliveryUpiId(v);
                      setIsDirty(true);
                    }}
                    placeholder="e.g. restaurant@okhdfcbank"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    editable={canManage}
                  />
                  <Text style={styles.helperText}>
                    Displayed at checkout for customers to pay directly via UPI apps.
                  </Text>
                </View>

                {/* Payment QR Code & Sample Screenshot Uploads */}
                <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile, { marginTop: 8 }]}>
                  {/* Payment QR Code */}
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Payment QR Code</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      {deliveryPaymentQrUrl ? (
                        <Image source={{ uri: deliveryPaymentQrUrl }} style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }} resizeMode="contain" />
                      ) : (
                        <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 20 }}>📱</Text>
                          <Text style={{ fontSize: 8, color: '#94a3b8', fontWeight: '700' }}>NO QR</Text>
                        </View>
                      )}
                      <View style={{ gap: 4 }}>
                        <TouchableOpacity
                          style={[styles.logoBtn, isUploadingPaymentQr && { opacity: 0.6 }]}
                          onPress={handleUploadPaymentQr}
                          disabled={isUploadingPaymentQr || !canManage}
                        >
                          {isUploadingPaymentQr ? (
                            <ActivityIndicator size="small" color="#2563eb" />
                          ) : (
                            <Text style={styles.logoBtnText}>📷 {deliveryPaymentQrUrl ? 'Change QR' : 'Upload QR'}</Text>
                          )}
                        </TouchableOpacity>
                        {deliveryPaymentQrUrl && canManage ? (
                          <TouchableOpacity
                            style={styles.logoRemoveBtn}
                            onPress={async () => {
                              setDeliveryPaymentQrUrl('');
                              await updateSettings({ delivery_payment_qr_url: '' });
                            }}
                          >
                            <Text style={styles.logoRemoveBtnText}>✕ Remove</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  {/* Sample / Reference Payment Screenshot */}
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Sample Payment Screenshot</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      {deliverySampleScreenshotUrl ? (
                        <Image source={{ uri: deliverySampleScreenshotUrl }} style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }} resizeMode="cover" />
                      ) : (
                        <View style={{ width: 64, height: 64, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 20 }}>🖼️</Text>
                          <Text style={{ fontSize: 8, color: '#94a3b8', fontWeight: '700' }}>NO SAMPLE</Text>
                        </View>
                      )}
                      <View style={{ gap: 4 }}>
                        <TouchableOpacity
                          style={[styles.logoBtn, isUploadingPaymentSample && { opacity: 0.6 }]}
                          onPress={handleUploadPaymentSample}
                          disabled={isUploadingPaymentSample || !canManage}
                        >
                          {isUploadingPaymentSample ? (
                            <ActivityIndicator size="small" color="#2563eb" />
                          ) : (
                            <Text style={styles.logoBtnText}>📷 {deliverySampleScreenshotUrl ? 'Change' : 'Upload'}</Text>
                          )}
                        </TouchableOpacity>
                        {deliverySampleScreenshotUrl && canManage ? (
                          <TouchableOpacity
                            style={styles.logoRemoveBtn}
                            onPress={async () => {
                              setDeliverySampleScreenshotUrl('');
                              await updateSettings({ delivery_sample_screenshot_url: '' });
                            }}
                          >
                            <Text style={styles.logoRemoveBtnText}>✕ Remove</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Visual Confirmation Banner (Success / Error) */}
                {deliveryStatusMessage && (
                  <View
                    style={{
                      marginTop: 14,
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      backgroundColor: deliveryStatusMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                      borderColor: deliveryStatusMessage.type === 'success' ? '#86efac' : '#fca5a5',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: deliveryStatusMessage.type === 'success' ? '#15803d' : '#b91c1c',
                        marginBottom: 2,
                      }}
                    >
                      {deliveryStatusMessage.title}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: deliveryStatusMessage.type === 'success' ? '#166534' : '#991b1b',
                        lineHeight: 16,
                      }}
                    >
                      {deliveryStatusMessage.text}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  testID="save-delivery-settings-btn"
                  style={[styles.saveBtn, { marginTop: 16 }, (isSavingDeliverySettings || !canManage) && { opacity: 0.6 }]}
                  onPress={handleSaveDeliverySettings}
                  disabled={isSavingDeliverySettings || !canManage}
                >
                  {isSavingDeliverySettings ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator color="#ffffff" size="small" />
                      <Text style={styles.saveBtnText}>Saving Delivery Settings...</Text>
                    </View>
                  ) : (
                    <Text style={styles.saveBtnText}>Save Delivery & Payment Settings</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* 4. Printer Settings */}
              <View style={styles.card}>
                <Text style={styles.cardHeader}>🖨️ Printer Settings</Text>
                <Text style={styles.cardSubHeader}>
                  Configure thermal receipt dimensions and automatic printing per restaurant.
                </Text>

                <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile]}>
                  {/* KOT Paper Size */}
                  <View style={styles.formCol}>
                    <Text style={styles.label}>KOT Paper Size</Text>
                    <View style={styles.segmentedRow}>
                      {(['58mm', '80mm', 'A4'] as PaperSize[]).map((size) => (
                        <TouchableOpacity
                          key={`kot-${size}`}
                          testID={`kot-paper-${size}`}
                          style={[
                            styles.segmentBtn,
                            kotPaperSize === size && styles.segmentBtnActive,
                          ]}
                          onPress={() => setKotPaperSize(size)}
                        >
                          <Text
                            style={[
                              styles.segmentBtnText,
                              kotPaperSize === size && styles.segmentBtnTextActive,
                            ]}
                          >
                            {size}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Bill Paper Size */}
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Bill Paper Size</Text>
                    <View style={styles.segmentedRow}>
                      {(['58mm', '80mm', 'A4'] as PaperSize[]).map((size) => (
                        <TouchableOpacity
                          key={`bill-${size}`}
                          testID={`bill-paper-${size}`}
                          style={[
                            styles.segmentBtn,
                            billPaperSize === size && styles.segmentBtnActive,
                          ]}
                          onPress={() => setBillPaperSize(size)}
                        >
                          <Text
                            style={[
                              styles.segmentBtnText,
                              billPaperSize === size && styles.segmentBtnTextActive,
                            ]}
                          >
                            {size}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                {/* Auto Print KOT Toggle */}
                <View style={[styles.toggleCard, { marginTop: 4 }]}>
                  <View style={styles.toggleHeaderRow}>
                    <Text style={styles.toggleTitle}>Auto Print KOT</Text>
                    <TouchableOpacity
                      testID="toggle-auto-print-kot"
                      style={[
                        styles.toggleBadge,
                        autoPrintKot ? styles.toggleBadgeOn : styles.toggleBadgeOff,
                      ]}
                      onPress={() => setAutoPrintKot(!autoPrintKot)}
                    >
                      <Text style={[styles.toggleBadgeText, !autoPrintKot && styles.toggleBadgeTextOff]}>
                        {autoPrintKot ? '● ON' : '○ OFF'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.toggleDesc}>
                    {autoPrintKot
                      ? 'Clicking KOT triggers the kitchen thermal printer immediately with zero extra steps.'
                      : 'Clicking KOT follows manual confirmation & print flow.'}
                  </Text>
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
                    <Text style={styles.saveBtnText}>Save Printer Settings</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* RIGHT COLUMN */}
            <View style={[styles.gridCol, isDesktop ? styles.gridColDesktop : styles.gridColMobile]}>
              {/* 2. GST & Tax Settings */}
              <View style={styles.card}>
                <Text style={styles.cardHeader}>🧾 GST & Tax Settings</Text>
                <Text style={styles.cardSubHeader}>
                  Configure GST registration, tax collection rules, GSTIN, and tax invoice printing.
                </Text>

                {/* GST Registered Toggle */}
                <View style={styles.toggleCard}>
                  <View style={styles.toggleHeaderRow}>
                    <Text style={styles.toggleTitle}>GST Registered Business</Text>
                    <TouchableOpacity
                      testID="settings-gst-registered-toggle"
                      disabled={!canManage}
                      style={[
                        styles.toggleBadge,
                        gstRegistered ? styles.toggleBadgeOn : styles.toggleBadgeOff,
                        !canManage && { opacity: 0.6 },
                      ]}
                      onPress={() => {
                        if (!canManage) return;
                        if (gstRegistered) {
                          setGstRegistered(false);
                          setIsGstEnabled(false);
                          setTaxInvoiceEnabled(false);
                        } else {
                          setGstRegistered(true);
                        }
                        setIsDirty(true);
                      }}
                    >
                      <Text style={[styles.toggleBadgeText, !gstRegistered && styles.toggleBadgeTextOff]}>
                        {gstRegistered ? '● REGISTERED' : '○ UNREGISTERED'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.toggleDesc}>
                    Turning OFF disables GST collection and Tax Invoices across all order channels.
                  </Text>
                </View>

                {/* Include GST Toggle */}
                <View style={styles.toggleCard}>
                  <View style={styles.toggleHeaderRow}>
                    <Text style={styles.toggleTitle}>Include GST / Tax on Orders</Text>
                    <TouchableOpacity
                      testID="settings-include-gst-toggle"
                      disabled={!canManage}
                      style={[
                        styles.toggleBadge,
                        isGstEnabled ? styles.toggleBadgeOn : styles.toggleBadgeOff,
                        !canManage && { opacity: 0.6 },
                      ]}
                      onPress={() => {
                        if (!canManage) return;
                        if (!isGstEnabled) {
                          if (!gstin.trim()) {
                            Alert.alert(
                              'GSTIN Required',
                              'Please enter a valid GSTIN before enabling GST billing.'
                            );
                            return;
                          }
                          setGstRegistered(true);
                          setIsGstEnabled(true);
                        } else {
                          setIsGstEnabled(false);
                        }
                        setIsDirty(true);
                      }}
                    >
                      <Text style={[styles.toggleBadgeText, !isGstEnabled && styles.toggleBadgeTextOff]}>
                        {isGstEnabled ? '● GST ON' : '○ GST OFF'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.toggleDesc}>
                    Calculates CGST & SGST on Dine-In, Takeaway, Delivery, and QR Menu.
                  </Text>
                </View>

                {/* Tax Invoice Toggle */}
                <View style={styles.toggleCard}>
                  <View style={styles.toggleHeaderRow}>
                    <Text style={styles.toggleTitle}>Tax Invoice Labeling</Text>
                    <TouchableOpacity
                      testID="settings-tax-invoice-toggle"
                      disabled={!canManage}
                      style={[
                        styles.toggleBadge,
                        taxInvoiceEnabled ? styles.toggleBadgeOn : styles.toggleBadgeOff,
                        !canManage && { opacity: 0.6 },
                      ]}
                      onPress={() => {
                        if (!canManage) return;
                        if (!taxInvoiceEnabled) {
                          setGstRegistered(true);
                          setTaxInvoiceEnabled(true);
                        } else {
                          setTaxInvoiceEnabled(false);
                        }
                        setIsDirty(true);
                      }}
                    >
                      <Text style={[styles.toggleBadgeText, !taxInvoiceEnabled && styles.toggleBadgeTextOff]}>
                        {taxInvoiceEnabled ? '● TAX INVOICE' : '○ RETAIL BILL'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.toggleDesc}>
                    Label receipts as official Tax Invoices. When OFF, receipts are labeled Retail Bills.
                  </Text>
                </View>

                {/* GSTIN & Tax Rate Inputs */}
                <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile]}>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>GSTIN (GST Number)</Text>
                    <TextInput
                      style={styles.input}
                      value={gstin}
                      onChangeText={(v) => {
                        setGstin(v.toUpperCase());
                        setIsDirty(true);
                      }}
                      placeholder="e.g. 36AAAAA0000A1Z5"
                      placeholderTextColor="#94a3b8"
                      autoCapitalize="characters"
                    />
                    <Text style={styles.helperText}>
                      15-digit GSTIN on receipts.
                    </Text>
                  </View>

                  <View style={styles.formCol}>
                    <Text style={styles.label}>GST Rate (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={taxRate}
                      onChangeText={(v) => {
                        setTaxRate(v);
                        setIsDirty(true);
                      }}
                      keyboardType="numeric"
                      placeholder="5.0"
                      placeholderTextColor="#94a3b8"
                    />
                    <Text style={styles.helperText}>
                      Splits into equal CGST & SGST.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, (isSavingGst || !canManage) && { opacity: 0.6 }]}
                  onPress={handleSaveGstSettings}
                  disabled={isSavingGst || !canManage}
                >
                  {isSavingGst ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator color="#ffffff" size="small" />
                      <Text style={styles.saveBtnText}>Saving...</Text>
                    </View>
                  ) : (
                    <Text style={styles.saveBtnText}>Save GST Settings</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* 5. Staff & Admin Management */}
              {canManage ? (
                <View style={styles.card}>
                  <Text style={styles.cardHeader}>🔐 Staff & Admin Management</Text>
                  <Text style={styles.cardSubHeader}>
                    Create official STAFF or ADMIN accounts with server-side credentials.
                  </Text>

                  <Text style={styles.label}>Account Role *</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                    <TouchableOpacity
                      style={[styles.roleSelectBtn, accountRole === 'STAFF' && styles.roleSelectBtnActive]}
                      onPress={() => setAccountRole('STAFF')}
                    >
                      <Text style={[styles.roleSelectText, accountRole === 'STAFF' && styles.roleSelectTextActive]}>
                        👨‍🍳 STAFF Account
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.roleSelectBtn, accountRole === 'ADMIN' && styles.roleSelectBtnActive]}
                      onPress={() => setAccountRole('ADMIN')}
                    >
                      <Text style={[styles.roleSelectText, accountRole === 'ADMIN' && styles.roleSelectTextActive]}>
                        👑 ADMIN Account
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile]}>
                    <View style={styles.formCol}>
                      <Text style={styles.label}>Email *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="staff@restaurant.com"
                        placeholderTextColor="#94a3b8"
                        value={accountEmail}
                        onChangeText={setAccountEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={styles.formCol}>
                      <Text style={styles.label}>Full Name *</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Rahul Sharma"
                        placeholderTextColor="#94a3b8"
                        value={accountName}
                        onChangeText={setAccountName}
                      />
                    </View>
                  </View>

                  <View style={[styles.formRow, isDesktop ? styles.formRowDesktop : styles.formRowMobile]}>
                    <View style={styles.formCol}>
                      <Text style={styles.label}>Phone Number</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="+91 98765 43210"
                        placeholderTextColor="#94a3b8"
                        value={accountPhone}
                        onChangeText={setAccountPhone}
                        keyboardType="phone-pad"
                      />
                    </View>
                    <View style={styles.formCol}>
                      <Text style={styles.label}>Password * (Min 6 chars)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor="#94a3b8"
                        value={accountPassword}
                        onChangeText={setAccountPassword}
                        secureTextEntry
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: '#16a34a' }, isCreatingAccount && { backgroundColor: '#cbd5e1' }]}
                    onPress={handleCreateNewAccount}
                    disabled={isCreatingAccount}
                  >
                    {isCreatingAccount ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>+ Create {accountRole} Account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scroll: {
    paddingVertical: 14,
    width: '100%',
  },
  contentWrapper: {
    width: '100%',
    gap: 12,
  },
  headerTitleWrap: {
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subTitleText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  dashboardGrid: {
    width: '100%',
  },
  dashboardGridRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  dashboardGridCol: {
    flexDirection: 'column',
    gap: 12,
  },
  gridCol: {
    gap: 12,
  },
  gridColDesktop: {
    flex: 1,
  },
  gridColMobile: {
    width: '100%',
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  cardSubHeader: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginBottom: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
    marginTop: 2,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 12.5,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  formGroup: {
    marginBottom: 10,
    width: '100%',
  },
  formRow: {
    width: '100%',
  },
  formRowDesktop: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  formRowMobile: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 10,
  },
  formCol: {
    flex: 1,
    width: '100%',
  },
  saveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    minWidth: 140,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  roleSelectBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  roleSelectBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  roleSelectText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  roleSelectTextActive: {
    color: '#FFFFFF',
  },
  brandingRow: {
    width: '100%',
    marginBottom: 14,
  },
  brandingRowDesktop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  brandingRowMobile: {
    flexDirection: 'column',
    gap: 12,
  },
  logoBox: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
  },
  logoBoxDesktop: {
    flex: 1,
  },
  logoBoxMobile: {
    width: '100%',
  },
  logoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  logoHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  logoHeaderHint: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  logoContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoPreview: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  logoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBtnText: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '800',
  },
  logoRemoveBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  logoRemoveBtnText: {
    color: '#E11D48',
    fontSize: 10.5,
    fontWeight: '700',
  },
  bannerBox: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'space-between',
  },
  bannerBoxDesktop: {
    flex: 1.4,
  },
  bannerBoxMobile: {
    width: '100%',
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bannerHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  bannerCountBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  bannerCountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  bannerAddBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  bannerAddBtnText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  urlInputBox: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 8,
    width: '100%',
  },
  bannerEmptyBox: {
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  bannerEmptyText: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
    lineHeight: 14,
  },
  bannerThumbWrap: {
    width: 90,
    height: 52,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  bannerThumbWrapSelected: {
    borderColor: '#2563EB',
    borderWidth: 2.5,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  bannerThumb: {
    width: '100%',
    height: '100%',
  },
  bannerAdjusterCard: {
    marginTop: 12,
    marginBottom: 14,
    backgroundColor: '#0B1329',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  adjusterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  adjusterTitleCol: {
    flex: 1,
    minWidth: 200,
  },
  adjusterTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  adjusterSubTitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 14,
  },
  adjusterActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  previewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 4,
  },
  previewToggleBtnActive: {
    backgroundColor: '#2563EB',
  },
  previewToggleBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  previewToggleBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  previewOptionBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewOptionBtnActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
    borderColor: '#3B82F6',
  },
  previewOptionBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  previewOptionBtnTextActive: {
    color: '#93C5FD',
    fontWeight: '800',
  },
  storefrontBrowserShell: {
    width: '100%',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  storefrontTopNav: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  storefrontBrandWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  storefrontFlameLogo: {
    fontSize: 15,
  },
  storefrontBrandName: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#EA580C',
    letterSpacing: -0.2,
  },
  storefrontBrandTag: {
    fontSize: 7.5,
    color: '#64748B',
    fontWeight: '500',
  },
  storefrontNavLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storefrontNavLink: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#334155',
  },
  storefrontSubHeader: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  storefrontBackLink: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#EA580C',
  },
  storefrontCenterTitle: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#0F172A',
    maxWidth: '55%',
  },
  storefrontCartIcon: {
    fontSize: 12,
  },
  bannerPreviewFrame: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#020617',
    overflow: 'hidden',
  },
  bannerDarkGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  customerOverlayMockup: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'space-between',
    zIndex: 5,
  },
  mockupStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22, 101, 52, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 3.5,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.5)',
  },
  mockupStatusPillClosed: {
    backgroundColor: 'rgba(185, 28, 28, 0.9)',
    borderColor: 'rgba(248, 113, 113, 0.5)',
  },
  mockupStatusDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#4ADE80',
  },
  mockupStatusDotClosed: {
    backgroundColor: '#F87171',
  },
  mockupStatusText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#DCFCE7',
  },
  mockupStatusTextClosed: {
    color: '#FEE2E2',
  },
  mockupBottomInfo: {
    gap: 2,
  },
  mockupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mockupLogo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  mockupTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    maxWidth: '75%',
  },
  mockupCuisine: {
    fontSize: 8.5,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  mockupRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22, 101, 52, 0.88)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    gap: 3,
    marginTop: 1,
  },
  mockupRatingStar: {
    color: '#4ADE80',
    fontSize: 8.5,
    fontWeight: '800',
  },
  mockupRatingScore: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
  },
  mockupRatingReviews: {
    color: '#E2E8F0',
    fontSize: 7.5,
    fontWeight: '500',
  },
  mockupMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  mockupCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 0.8,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  mockupCapsuleMain: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  mockupCarouselArrowLeft: {
    position: 'absolute',
    top: '50%',
    marginTop: -10,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 6,
  },
  mockupCarouselArrowRight: {
    position: 'absolute',
    top: '50%',
    marginTop: -10,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 6,
  },
  mockupCarouselArrowText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '300',
    marginTop: -2,
  },
  mockupDotsContainer: {
    position: 'absolute',
    bottom: 5,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3.5,
    zIndex: 6,
  },
  mockupActiveDot: {
    width: 10,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#EA580C',
  },
  mockupInactiveDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  focalBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(234, 88, 12, 0.7)',
    zIndex: 7,
  },
  focalBadgeText: {
    color: '#FDBA74',
    fontSize: 8.5,
    fontWeight: '800',
  },
  storefrontFilterRow: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  mockupCategoryScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingRight: 6,
  },
  mockupCatChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
  },
  mockupCatChipActive: {
    backgroundColor: '#EA580C',
  },
  mockupCatText: {
    fontSize: 8,
    color: '#475569',
    fontWeight: '700',
  },
  mockupCatTextActive: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  mockupSearchBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 10,
  },
  adjusterControlsRow: {
    marginTop: 10,
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  presetsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  controlSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
  },
  presetChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetChipActive: {
    backgroundColor: '#EA580C',
    borderColor: '#FB923C',
  },
  presetChipText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94A3B8',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  fineTuneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepBtnText: {
    color: '#F8FAFC',
    fontSize: 10.5,
    fontWeight: '800',
  },
  posValueBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#38BDF8',
    minWidth: 42,
    alignItems: 'center',
  },
  posValueDisplay: {
    color: '#38BDF8',
    fontSize: 11.5,
    fontWeight: '900',
  },
  savePosBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePosBtnText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  bannerDeleteBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(225, 29, 72, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 10,
  },
  bannerIndexBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  bannerIndexText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    padding: 2,
    marginBottom: 2,
    gap: 3,
    width: '100%',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 5,
  },
  segmentBtnActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
  },
  helperText: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 14,
    marginTop: 3,
  },
  toggleCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    width: '100%',
  },
  toggleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  toggleTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  toggleDesc: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 14,
    marginTop: 3,
  },
  toggleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBadgeOn: {
    backgroundColor: '#16A34A',
  },
  toggleBadgeOff: {
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  toggleBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  toggleBadgeTextOff: {
    color: '#475569',
  },
});
