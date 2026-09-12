import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image, useWindowDimensions } from 'react-native';
import { useSettings } from '../../src/context/SettingsContext';
import { useAuth } from '../../src/context/AuthContext';
import { authService } from '../../src/services/api/authService';
import { storageService } from '../../src/services/api/storageService';
import { supabase } from '../../src/services/supabase';
import { UserRole, PaperSize } from '../../src/types';

import { parseBannerUrls } from '../../src/utils/mediaUtils';

export default function SettingsScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = windowWidth >= 860;
  const { settings, updateSettings, isOnlineOrdersEnabled, toggleOnlineOrders, loading: settingsLoading } = useSettings();
  const { user, role, isSuperAdmin, isAdmin, activeRestaurantId } = useAuth();
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
      : (settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim()))
  );
  const [taxInvoiceEnabled, setTaxInvoiceEnabled] = useState<boolean>(
    settings.tax_invoice_enabled !== undefined
      ? Boolean(settings.tax_invoice_enabled)
      : (settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim()))
  );
  const [logoUrl, setLogoUrl] = useState(settings.logo_url || '');
  const [bannerUrls, setBannerUrls] = useState<string[]>(() =>
    parseBannerUrls(settings.banner_url || settings.banner_urls)
  );

  // Printer settings state
  const [kotPaperSize, setKotPaperSize] = useState<PaperSize>(settings.kot_paper_size || '80mm');
  const [billPaperSize, setBillPaperSize] = useState<PaperSize>(settings.bill_paper_size || '80mm');
  const [autoPrintKot, setAutoPrintKot] = useState<boolean>(Boolean(settings.auto_print_kot));
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);

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
          : (settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim()))
      );
      setTaxInvoiceEnabled(
        settings.tax_invoice_enabled !== undefined
          ? Boolean(settings.tax_invoice_enabled)
          : (settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim()))
      );
      setLogoUrl(settings.logo_url || '');
      setBannerUrls(parseBannerUrls(settings.banner_url || settings.banner_urls));
      setKotPaperSize(settings.kot_paper_size || '80mm');
      setBillPaperSize(settings.bill_paper_size || '80mm');
      setAutoPrintKot(Boolean(settings.auto_print_kot));
    }
  }, [settings, isDirty, activeRestaurantId]);

  const handleSavePrinterSettings = async () => {
    if (!canManage) {
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
      Alert.alert(
        'Printer Settings Saved',
        `KOT Paper: ${kotPaperSize}\nBill Paper: ${billPaperSize}\nAuto-Print KOT: ${autoPrintKot ? 'ON' : 'OFF'}`
      );
    } catch (e: any) {
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
        Alert.alert('Logo Updated', 'Restaurant logo uploaded and saved successfully.');
      }
    } catch (err: any) {
      Alert.alert('Logo Upload Failed', err.message || 'Failed to upload logo.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!canManage) {
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
      Alert.alert('Logo Removed', 'Restaurant logo has been removed.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to remove logo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadBanner = async () => {
    if (!canManage) {
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
        Alert.alert('Banner Added', 'New banner image added to restaurant showcase carousel.');
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload banner image. You can also paste an image URL directly.');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleAddBannerByUrl = async () => {
    if (!canManage) {
      Alert.alert('Permission Denied', 'Only ADMIN users can manage restaurant banners.');
      return;
    }
    const cleanUrl = customBannerUrl.trim();
    if (!cleanUrl || (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('data:'))) {
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
      Alert.alert('Image Added', 'Image URL added to restaurant showcase carousel.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save image URL.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveBanner = async (index: number) => {
    if (!canManage) {
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
      Alert.alert('Banner Removed', 'Image removed from restaurant carousel.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to remove banner image.');
    } finally {
      setIsSaving(false);
    }
  };

  // 1. Save Profile & Branding Info Only (updates restaurants and restaurant_settings profile fields)
  const handleSaveProfileInfo = async () => {
    if (!canManage) {
      Alert.alert('Permission Denied', 'Only ADMIN users can save restaurant profile info.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Restaurant Name cannot be empty.');
      return;
    }

    try {
      setIsSaving(true);
      const bannerPayload = bannerUrls.length > 0 ? JSON.stringify(bannerUrls) : '';

      const persisted = await updateSettings({
        name: name.trim(),
        legal_name: legalName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
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
            phone: phone.trim(),
            email: email.trim(),
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
      Alert.alert('Profile Saved', 'Restaurant profile and branding information updated successfully.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Failed to save restaurant profile.');
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Save GST & Tax Settings Only (updates public.restaurant_settings only, NO restaurants PATCH)
  const handleSaveGstSettings = async () => {
    if (!canManage) {
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
            : (persisted.gst_registered !== undefined ? Boolean(persisted.gst_registered) : Boolean(persisted.gstin?.trim()))
        );
        setTaxInvoiceEnabled(
          persisted.tax_invoice_enabled !== undefined
            ? Boolean(persisted.tax_invoice_enabled)
            : (persisted.gst_registered !== undefined ? Boolean(persisted.gst_registered) : Boolean(persisted.gstin?.trim()))
        );
      }

      setIsDirty(false);
      Alert.alert(
        'GST Settings Saved',
        `GSTIN: ${gstin.trim() || 'None'}\nGST Rate: ${validatedRate}%\nCGST: ${(validatedRate / 2).toFixed(1)}% | SGST: ${(validatedRate / 2).toFixed(1)}%\nStatus: ${isGstEnabled ? 'Active' : 'Disabled'}`
      );
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Failed to save GST settings.');
    } finally {
      setIsSavingGst(false);
    }
  };

  const handleCreateNewAccount = async () => {
    if (!canManage) {
      Alert.alert('Permission Denied', 'Only authenticated ADMIN users can create staff or admin accounts.');
      return;
    }

    if (!accountEmail || !accountPassword || !accountName) {
      Alert.alert('Missing Fields', 'Please fill in Email, Full Name, and Password.');
      return;
    }

    if (accountPassword.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    try {
      setIsCreatingAccount(true);
      const targetRestId = activeRestaurantId || settings.restaurant_id || settings.id;
      const newUser = await authService.createAdminUser(
        accountEmail,
        accountPassword,
        accountName,
        accountPhone,
        accountRole,
        targetRestId
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
                    {logoUrl ? (
                      <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="contain" />
                    ) : (
                      <View style={styles.logoPlaceholder}>
                        <Text style={{ fontSize: 18 }}>🍽️</Text>
                        <Text style={{ fontSize: 8, color: '#94a3b8', fontWeight: '700', marginTop: 1 }}>NO LOGO</Text>
                      </View>
                    )}

                    <View style={{ gap: 4, flexShrink: 1 }}>
                      <TouchableOpacity
                        style={[styles.logoBtn, isUploadingLogo && { opacity: 0.6 }]}
                        onPress={handleUploadLogo}
                        disabled={isUploadingLogo || !canManage}
                      >
                        {isUploadingLogo ? (
                          <ActivityIndicator size="small" color="#2563eb" />
                        ) : (
                          <Text style={styles.logoBtnText}>📷 {logoUrl ? 'Change' : 'Upload'}</Text>
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

                  {/* Banner Add Box */}
                  <View style={[styles.bannerBox, isDesktop ? styles.bannerBoxDesktop : styles.bannerBoxMobile]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>Showcase Banners</Text>
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
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {bannerUrls.map((url, idx) => (
                            <View key={`banner-${idx}`} style={styles.bannerThumbWrap}>
                              <Image source={{ uri: url }} style={styles.bannerThumb} resizeMode="cover" />
                              {canManage && (
                                <TouchableOpacity
                                  style={styles.bannerDeleteBtn}
                                  onPress={() => handleRemoveBanner(idx)}
                                >
                                  <Text style={styles.bannerDeleteBtnText}>✕</Text>
                                </TouchableOpacity>
                              )}
                              <View style={styles.bannerIndexBadge}>
                                <Text style={styles.bannerIndexText}>#{idx + 1}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      </ScrollView>
                    ) : (
                      <View style={styles.bannerEmptyBox}>
                        <Text style={{ fontSize: 13 }}>🖼️</Text>
                        <Text style={styles.bannerEmptyText}>No showcase banners uploaded.</Text>
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
                      style={styles.input}
                      value={phone}
                      onChangeText={(v) => {
                        setPhone(v);
                        setIsDirty(true);
                      }}
                      placeholder="+91 98765 43210"
                      placeholderTextColor="#94a3b8"
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                      style={styles.input}
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
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Address</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 38 }]}
                    value={address}
                    onChangeText={(v) => {
                      setAddress(v);
                      setIsDirty(true);
                    }}
                    multiline
                    placeholder="Restaurant physical address"
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
                      <Text style={styles.saveBtnText}>Saving...</Text>
                    </View>
                  ) : (
                    <Text style={styles.saveBtnText}>Save Profile Info</Text>
                  )}
                </TouchableOpacity>
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
                        Alert.alert('Permission Denied', 'Only Restaurant Admins can change online ordering status.');
                        return;
                      }
                      setIsTogglingOnline(true);
                      try {
                        const next = !isOnlineOrdersEnabled;
                        await toggleOnlineOrders(next);
                        Alert.alert(
                          next ? 'Online Orders Enabled' : 'Online Orders Disabled',
                          next
                            ? 'Restaurant is now OPEN for customer marketplace orders.'
                            : 'Restaurant is now CLOSED in customer marketplace. Delivery checkout is blocked.'
                        );
                      } catch (e: any) {
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
                      ? 'Newly generated KOTs automatically trigger the kitchen thermal printer.'
                      : 'Cashier manually clicks Print KOT when ready.'}
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
    marginBottom: 10,
  },
  brandingRowDesktop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  brandingRowMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  logoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logoBoxDesktop: {
    flex: 1,
  },
  logoBoxMobile: {
    width: '100%',
  },
  logoPreview: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  logoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
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
    fontSize: 10,
    fontWeight: '700',
  },
  bannerBox: {
    width: '100%',
  },
  bannerBoxDesktop: {
    flex: 1.3,
  },
  bannerBoxMobile: {
    width: '100%',
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
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 8,
    width: '100%',
  },
  bannerEmptyBox: {
    padding: 10,
    backgroundColor: '#F8FAFC',
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
  bannerThumb: {
    width: '100%',
    height: '100%',
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
