import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView, Alert, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettings } from '../../src/context/SettingsContext';
import { useAuth } from '../../src/context/AuthContext';
import { authService } from '../../src/services/api/authService';
import { storageService } from '../../src/services/api/storageService';
import { supabase } from '../../src/services/supabase';
import { UserRole, PaperSize } from '../../src/types';

import { parseBannerUrls } from '../../src/utils/mediaUtils';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, isOnlineOrdersEnabled, toggleOnlineOrders, loading: settingsLoading } = useSettings();
  const { user, role, isSuperAdmin, isAdmin, activeRestaurantId } = useAuth();
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);

  const [name, setName] = useState(settings.name);
  const [legalName, setLegalName] = useState(settings.legal_name || '');
  const [address, setAddress] = useState(settings.address || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [email, setEmail] = useState(settings.email || '');
  const [gstin, setGstin] = useState(settings.gstin || '');
  const [taxRate, setTaxRate] = useState(settings.default_tax_rate?.toString() || '5.0');
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
      setTaxRate(settings.default_tax_rate?.toString() || '5.0');
      setLogoUrl(settings.logo_url || '');
      setBannerUrls(parseBannerUrls(settings.banner_url || settings.banner_urls));
    }
    setKotPaperSize(settings.kot_paper_size || '80mm');
    setBillPaperSize(settings.bill_paper_size || '80mm');
    setAutoPrintKot(Boolean(settings.auto_print_kot));
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

  const handleSave = async () => {
    if (!canManage) {
      Alert.alert('Permission Denied', 'Only ADMIN users can save restaurant settings.');
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
        gstin: gstin.trim(),
        logo_url: logoUrl,
        banner_url: bannerPayload,
        banner_urls: bannerUrls,
        gallery_urls: bannerUrls,
        default_tax_rate: parseFloat(taxRate) || 5.0,
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
        setGstin(persisted.gstin || '');
        setTaxRate(persisted.default_tax_rate?.toString() || '5.0');
        setLogoUrl(persisted.logo_url || '');
        setBannerUrls(parseBannerUrls(persisted.banner_url || persisted.banner_urls));
      }

      setIsDirty(false);
      Alert.alert('Success', 'Restaurant information updated successfully.');
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Failed to save restaurant settings to database.');
    } finally {
      setIsSaving(false);
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}>
        <Text style={styles.title}>Restaurant Settings & Administration</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>🏢 Restaurant Info & GST</Text>

          {/* Restaurant Logo Section */}
          <Text style={styles.label}>Restaurant Logo (Header Branding)</Text>
          <View style={styles.logoRow}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="contain" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={{ fontSize: 24 }}>🍽️</Text>
                <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '700', marginTop: 2 }}>NO LOGO</Text>
              </View>
            )}

            <View style={{ flex: 1, gap: 6 }}>
              <TouchableOpacity
                style={[styles.logoBtn, isUploadingLogo && { opacity: 0.6 }]}
                onPress={handleUploadLogo}
                disabled={isUploadingLogo || !canManage}
              >
                {isUploadingLogo ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <Text style={styles.logoBtnText}>📷 {logoUrl ? 'CHANGE LOGO' : 'UPLOAD LOGO'}</Text>
                )}
              </TouchableOpacity>

              {logoUrl && canManage ? (
                <TouchableOpacity
                  style={styles.logoRemoveBtn}
                  onPress={handleRemoveLogo}
                >
                  <Text style={styles.logoRemoveBtnText}>✕ Remove Logo</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Restaurant Showcase / Banner Carousel Section */}
          <View style={{ marginTop: 16, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
              <Text style={styles.label}>Showcase Banner Images (Marketplace Carousel)</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.bannerAddBtn, isUploadingBanner && { opacity: 0.6 }]}
                  onPress={handleUploadBanner}
                  disabled={isUploadingBanner || !canManage}
                >
                  {isUploadingBanner ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.bannerAddBtnText}>📷 Choose Photo</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bannerAddBtn, { backgroundColor: '#475569' }]}
                  onPress={() => setShowUrlModal(!showUrlModal)}
                  disabled={!canManage}
                >
                  <Text style={styles.bannerAddBtnText}>🔗 Paste URL</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Optional URL Paste Input Box */}
            {showUrlModal && (
              <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', marginBottom: 4 }}>Paste Image Web URL:</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 6 }]}
                    placeholder="https://images.unsplash.com/..."
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

            {bannerUrls.length === 0 ? (
              <View style={styles.bannerEmptyBox}>
                <Text style={{ fontSize: 18 }}>🖼️</Text>
                <Text style={styles.bannerEmptyText}>No custom banners yet. Choose a photo or paste a URL to showcase your restaurant ambiance.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                {bannerUrls.map((bUrl, idx) => (
                  <View key={idx} style={styles.bannerThumbWrap}>
                    <Image source={{ uri: bUrl }} style={styles.bannerThumb} resizeMode="cover" />
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
              </ScrollView>
            )}
          </View>

          <Text style={styles.label}>Restaurant Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setIsDirty(true);
            }}
            placeholder="e.g. Ratnadeep Restaurant"
          />

          <Text style={styles.label}>Legal Entity Name</Text>
          <TextInput
            style={styles.input}
            value={legalName}
            onChangeText={(v) => {
              setLegalName(v);
              setIsDirty(true);
            }}
            placeholder="e.g. Ratnadeep Foods Pvt Ltd"
          />

          <Text style={styles.label}>Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={(v) => {
              setAddress(v);
              setIsDirty(true);
            }}
            multiline
            placeholder="Restaurant physical address"
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setIsDirty(true);
            }}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setIsDirty(true);
            }}
            placeholder="contact@restaurant.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>GSTIN</Text>
          <TextInput
            style={styles.input}
            value={gstin}
            onChangeText={(v) => {
              setGstin(v);
              setIsDirty(true);
            }}
            placeholder="36AAAAA0000A1Z5"
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Default Tax Rate (%)</Text>
          <TextInput
            style={styles.input}
            value={taxRate}
            onChangeText={(v) => {
              setTaxRate(v);
              setIsDirty(true);
            }}
            keyboardType="numeric"
            placeholder="5.0"
          />

          <TouchableOpacity
            style={[styles.saveBtn, (isSaving || !canManage) && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={isSaving || !canManage}
          >
            {isSaving ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.saveBtnText}>SAVING TO SUPABASE...</Text>
              </View>
            ) : (
              <Text style={styles.saveBtnText}>SAVE RESTAURANT SETTINGS</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Marketplace Online Ordering Status Section */}
        <View style={[styles.card, { marginTop: 20 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.cardHeader}>🌐 Marketplace Online Ordering</Text>
              <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Control whether this restaurant is open or closed for customer online delivery orders in the Marketplace.
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
              <Text style={styles.toggleBadgeText}>
                {isOnlineOrdersEnabled ? '● OPEN' : '○ CLOSED'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Printer Settings Section */}
        <View style={[styles.card, { marginTop: 20 }]}>
          <Text style={styles.cardHeader}>🖨️ Printer Settings</Text>
          <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 14 }}>
            Configure thermal receipt dimensions and automatic printing per restaurant. Settings are saved per restaurant in the database.
          </Text>

          {/* KOT Paper Size */}
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
          <Text style={styles.helperText}>
            {kotPaperSize === '58mm'
              ? 'Compact narrow format (48-52mm printable area) for mini thermal printers.'
              : kotPaperSize === '80mm'
              ? 'Standard POS kitchen thermal receipt format (74mm printable area).'
              : 'Full-width structured invoice layout suitable for A4 office or kitchen printers.'}
          </Text>

          {/* Auto Print KOT Toggle */}
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.label}>Auto Print KOT</Text>
              <TouchableOpacity
                testID="toggle-auto-print-kot"
                style={[
                  styles.toggleBadge,
                  autoPrintKot ? styles.toggleBadgeOn : styles.toggleBadgeOff,
                ]}
                onPress={() => setAutoPrintKot(!autoPrintKot)}
              >
                <Text style={styles.toggleBadgeText}>
                  {autoPrintKot ? '● ON' : '○ OFF'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              {autoPrintKot
                ? 'ON: Newly generated KOTs (Dine-In, Takeaway, Online Delivery, and Delta items) automatically trigger printing.'
                : 'OFF: KOT is generated and saved to DB; cashier manually clicks KOT Print when ready.'}
            </Text>
          </View>

          {/* Bill Paper Size */}
          <View style={{ marginTop: 14 }}>
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
            <Text style={styles.helperText}>
              Final customer bill receipt formatting adapts to selected size.
            </Text>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            testID="save-printer-settings-btn"
            style={[styles.saveBtn, (isSavingPrinter || !canManage) && { opacity: 0.6 }, { marginTop: 18 }]}
            onPress={handleSavePrinterSettings}
            disabled={isSavingPrinter || !canManage}
          >
            {isSavingPrinter ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color="#ffffff" size="small" />
                <Text style={styles.saveBtnText}>SAVING PRINTER SETTINGS...</Text>
              </View>
            ) : (
              <Text style={styles.saveBtnText}>SAVE PRINTER SETTINGS</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Staff & Admin Management Section (Visible to ADMIN & SUPER_ADMIN) */}
        {canManage ? (
          <View style={[styles.card, { marginTop: 20 }]}>
            <Text style={styles.cardHeader}>🔐 Staff & Admin Management (Admin Only)</Text>
            <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
              Create official STAFF or ADMIN accounts with server-side security. Public signups cannot create privileged roles.
            </Text>

            <Text style={styles.label}>Account Role *</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
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

            <Text style={styles.label}>Account Email *</Text>
            <TextInput
              style={styles.input}
              placeholder="staff@ratnadeep.com"
              value={accountEmail}
              onChangeText={setAccountEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Rahul Sharma"
              value={accountName}
              onChangeText={setAccountName}
            />

            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="+91 9876543210"
              value={accountPhone}
              onChangeText={setAccountPhone}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>Password * (Min 6 chars)</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              value={accountPassword}
              onChangeText={setAccountPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: '#16a34a', marginTop: 14 }, isCreatingAccount && { backgroundColor: '#cbd5e1' }]}
              onPress={handleCreateNewAccount}
              disabled={isCreatingAccount}
            >
              {isCreatingAccount ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveBtnText}>+ CREATE NEW {accountRole} ACCOUNT</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 20 },
  title: { fontSize: 20, fontWeight: '900', color: '#0f172a', marginBottom: 16 },
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0f172a', backgroundColor: '#ffffff' },
  saveBtn: { backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  roleSelectBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', backgroundColor: '#f8fafc' },
  roleSelectBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  roleSelectText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  roleSelectTextActive: { color: '#ffffff' },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 8,
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  logoPreview: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  logoBtnText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
  },
  logoRemoveBtn: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignItems: 'flex-start',
  },
  logoRemoveBtnText: {
    color: '#e11d48',
    fontSize: 11,
    fontWeight: '700',
  },
  bannerAddBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bannerAddBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  bannerEmptyBox: {
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerEmptyText: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
    lineHeight: 16,
  },
  bannerThumbWrap: {
    width: 130,
    height: 75,
    borderRadius: 8,
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
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(225, 29, 72, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerDeleteBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 12,
  },
  bannerIndexBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  bannerIndexText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
    marginBottom: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
  },
  helperText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 2,
  },
  toggleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  toggleBadgeOn: {
    backgroundColor: '#16A34A',
  },
  toggleBadgeOff: {
    backgroundColor: '#64748B',
  },
  toggleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
