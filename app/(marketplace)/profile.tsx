import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useStorefront } from '../../src/context/StorefrontContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { storageService } from '../../src/services/api/storageService';
import { loyaltyService } from '../../src/services/api/loyaltyService';
import { customerColors } from '../../src/utils/colors';
import { formatCurrency } from '../../src/utils/currency';
import { isValidIndianPhone, normalizeIndianPhone } from '../../src/utils/validation';
import { CustomerMarketplaceWalletsResponse } from '../../src/types';

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { user, logout, loading: authLoading, updateUserProfileState } = useAuth();
  const { isDedicated, dedicatedRestaurantId, dedicatedRestaurant } = useStorefront();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Customer Loyalty Wallet State
  const [walletData, setWalletData] = useState<CustomerMarketplaceWalletsResponse>({
    wallets: [],
    transactions: [],
  });
  const [loadingWallet, setLoadingWallet] = useState(false);

  const loadWallets = () => {
    if (user?.phone) {
      setLoadingWallet(true);
      loyaltyService
        .getCustomerMarketplaceWallets(user.phone)
        .then((data) => setWalletData(data))
        .catch((e) => console.warn('[CustomerProfile] Error loading marketplace wallets:', e))
        .finally(() => setLoadingWallet(false));
    }
  };

  useEffect(() => {
    loadWallets();
  }, [user?.phone]);

  const handlePickAndUploadAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const result = await storageService.pickAndUploadAvatar({ userId: user.id });
      if (result?.url) {
        setAvatarUrl(result.url);
        updateUserProfileState({ avatar_url: result.url });
        await marketplaceService.updateCustomerProfile(user.id, {
          avatar_url: result.url,
        });
        Alert.alert('Success', 'Profile photo updated successfully.');
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err.message || 'Failed to upload profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      setAvatarUrl('');
      updateUserProfileState({ avatar_url: undefined });
      await marketplaceService.updateCustomerProfile(user.id, {
        avatar_url: '',
      });
      Alert.alert('Removed', 'Profile photo removed.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to remove profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Full Name cannot be empty.');
      return;
    }

    if (phone.trim() && !isValidIndianPhone(phone)) {
      Alert.alert('Invalid Phone Number', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }

    const cleanPhone = phone.trim() ? normalizeIndianPhone(phone.trim()) : undefined;

    setSaving(true);
    try {
      await marketplaceService.updateCustomerProfile(user.id, {
        full_name: fullName.trim(),
        phone: cleanPhone,
        avatar_url: avatarUrl || undefined,
      });
      updateUserProfileState({
        full_name: fullName.trim(),
        phone: cleanPhone,
        avatar_url: avatarUrl || undefined,
      });
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully.');
      if (cleanPhone) {
        loyaltyService.getCustomerMarketplaceWallets(cleanPhone).then(setWalletData);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out?') : true;
      if (!confirmed) return;
      await logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login' as any);
      }
      return;
    }

    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login' as any);
        },
      },
    ]);
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={customerColors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 44 }}>👤</Text>
        <Text style={styles.authTitle}>Customer Account</Text>
        <Text style={styles.authSub}>Sign in to view your profile, manage addresses, and track rewards.</Text>
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginBtnText}>Log In to Your Account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Compute scoped metrics across restaurant wallets (scoped to dedicated restaurant if in dedicated mode)
  const scopedWallets = isDedicated && dedicatedRestaurantId
    ? walletData.wallets.filter((w) => w.restaurant_id === dedicatedRestaurantId)
    : walletData.wallets;

  const scopedTransactions = isDedicated && dedicatedRestaurantId
    ? walletData.transactions.filter((t) => t.restaurant_id === dedicatedRestaurantId)
    : walletData.transactions;

  const totalWalletBalance = scopedWallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
  const totalEarnedAll = scopedWallets.reduce((sum, w) => sum + Number(w.total_earned || 0), 0);
  const totalRedeemedAll = scopedWallets.reduce((sum, w) => sum + Number(w.total_redeemed || 0), 0);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageInner}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {isDedicated && dedicatedRestaurant?.logo_url ? (
                <Image
                  source={{ uri: dedicatedRestaurant.logo_url }}
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
              ) : isDedicated ? (
                <View style={[styles.headerLogo, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 8 }]}>
                  <Text style={{ fontSize: 20 }}>🍽️</Text>
                </View>
              ) : (
                <Image
                  source={require('../../assets/images/restroz_logo.png')}
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>
                  {isDedicated ? `${dedicatedRestaurant?.name || 'Restaurant'} Profile` : 'My Profile'}
                </Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {isDedicated ? 'Account details & loyalty cashback balance' : 'Account details, preferences & loyalty wallet'}
                </Text>
              </View>
            </View>
            {!isEditing ? (
              <TouchableOpacity
                style={styles.editHeaderBtn}
                onPress={() => setIsEditing(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.editHeaderBtnText}>✏️ Edit Profile</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.saveHeaderBtn}
                onPress={handleSaveProfile}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveHeaderBtnText}>✓ Save</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Profile Card */}
          <View style={styles.profileCard}>
            {/* Avatar Section */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrap}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>
                    {(fullName || user.email || 'U').charAt(0).toUpperCase()}
                  </Text>
                )}

                {uploadingAvatar && (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}

                {/* Camera Click Badge */}
                <TouchableOpacity
                  style={styles.avatarCameraBadge}
                  onPress={handlePickAndUploadAvatar}
                  disabled={uploadingAvatar}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13 }}>📷</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.avatarButtonsRow}>
                <TouchableOpacity
                  style={styles.changePhotoBtn}
                  onPress={handlePickAndUploadAvatar}
                  disabled={uploadingAvatar}
                  activeOpacity={0.8}
                >
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color={customerColors.primary} />
                  ) : (
                    <Text style={styles.changePhotoText}>
                      {avatarUrl ? 'Change Photo' : 'Upload Photo'}
                    </Text>
                  )}
                </TouchableOpacity>

                {Boolean(avatarUrl) && (
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.removePhotoText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.formWrap}>
              <Text style={styles.fieldLabel}>Full Name</Text>
              {isEditing ? (
                <TextInput
                  style={styles.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your Name"
                />
              ) : (
                <Text style={styles.fieldValue}>{fullName || 'Not provided'}</Text>
              )}

              <Text style={styles.fieldLabel}>Mobile Phone</Text>
              {isEditing ? (
                <View>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/[^\d+]/g, ''))}
                    placeholder="10-digit mobile number"
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                    maxLength={13}
                  />
                  {Boolean(phone && !isValidIndianPhone(phone)) && (
                    <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700', marginTop: 3 }}>
                      ⚠️ Enter a valid 10-digit Indian mobile number
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={styles.fieldValue}>{phone || 'Not provided'}</Text>
              )}

              <Text style={styles.fieldLabel}>Email Address</Text>
              <Text style={[styles.fieldValue, { color: '#64748B' }]}>{user.email}</Text>

              {isEditing && (
                <TouchableOpacity
                  style={styles.cancelEditBtn}
                  onPress={() => {
                    setFullName(user.full_name || '');
                    setPhone(user.phone || '');
                    setAvatarUrl(user.avatar_url || '');
                    setIsEditing(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.cancelEditText}>Cancel Editing</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* CUSTOMER LOYALTY WALLET SECTION */}
          <Text style={styles.sectionTitle}>🎁 Loyalty Rewards & Cashback Wallet</Text>

          <View style={styles.walletCard}>
            <View style={styles.walletCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.walletCardTitle}>Customer Rewards Balance</Text>
                <Text style={styles.walletCardSubtitle}>
                  {user.phone
                    ? `Linked to verified mobile: +91 ${normalizeIndianPhone(user.phone)}`
                    : 'Add your 10-digit mobile phone above to link your loyalty rewards.'}
                </Text>
              </View>
              <View style={styles.walletTotalBadge}>
                <Text style={styles.walletTotalBadgeText}>{formatCurrency(totalWalletBalance)}</Text>
              </View>
            </View>

            {/* Metrics Breakdown */}
            <View style={styles.walletMetricsRow}>
              <View style={styles.walletMetricBox}>
                <Text style={styles.walletMetricLabel}>Available Balance</Text>
                <Text style={[styles.walletMetricVal, { color: '#059669' }]}>
                  {formatCurrency(totalWalletBalance)}
                </Text>
              </View>
              <View style={styles.walletMetricBox}>
                <Text style={styles.walletMetricLabel}>Lifetime Earned</Text>
                <Text style={[styles.walletMetricVal, { color: '#2563EB' }]}>
                  {formatCurrency(totalEarnedAll)}
                </Text>
              </View>
              <View style={styles.walletMetricBox}>
                <Text style={styles.walletMetricLabel}>Total Redeemed</Text>
                <Text style={[styles.walletMetricVal, { color: '#D97706' }]}>
                  {formatCurrency(totalRedeemedAll)}
                </Text>
              </View>
            </View>

            {loadingWallet ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={customerColors.primary} />
                <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>Loading wallet details...</Text>
              </View>
            ) : scopedWallets.length === 0 ? (
              <View style={styles.walletEmptyBox}>
                <Text style={{ fontSize: 24 }}>🪙</Text>
                <Text style={styles.walletEmptyTitle}>No Cashback Balance Yet</Text>
                <Text style={styles.walletEmptySub}>
                  {isDedicated
                    ? `Dine in or order from ${dedicatedRestaurant?.name || 'our restaurant'} to automatically accumulate reward cash on your settled orders!`
                    : 'Dine in or order from partner restaurants to automatically accumulate reward cash on your settled orders!'}
                </Text>
              </View>
            ) : (
              <>
                {/* Per-Restaurant Wallets */}
                <View style={styles.restaurantWalletsWrap}>
                  <Text style={styles.walletSubHeader}>
                    {isDedicated ? `${dedicatedRestaurant?.name || 'Restaurant'} Wallet Balance` : 'Restaurant Wallet Breakdown'}
                  </Text>
                  {scopedWallets.map((w) => (
                    <View key={w.id} style={styles.restWalletItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.restWalletName}>{w.restaurant_name}</Text>
                        <Text style={styles.restWalletMeta}>
                          Min. Redeem: {formatCurrency(w.min_redeem_balance)} • Lifetime Earned: {formatCurrency(w.total_earned)}
                        </Text>
                      </View>
                      <View style={styles.restWalletBalWrap}>
                        <Text style={styles.restWalletBalVal}>{formatCurrency(w.balance)}</Text>
                        <Text style={styles.restWalletBalLabel}>Balance</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Recent Transactions Ledger */}
                {scopedTransactions.length > 0 && (
                  <View style={styles.txnsWrap}>
                    <Text style={styles.walletSubHeader}>
                      {isDedicated ? `Recent ${dedicatedRestaurant?.name || 'Restaurant'} Reward Activity` : 'Recent Reward Activity'}
                    </Text>
                    {scopedTransactions.slice(0, 8).map((t) => {
                      const isEarn = t.transaction_type === 'earn';
                      return (
                        <View key={t.id} style={styles.txnItem}>
                          <View style={[styles.txnIconWrap, isEarn ? styles.txnIconEarn : styles.txnIconRedeem]}>
                            <Text style={{ fontSize: 12 }}>{isEarn ? '➕' : '➖'}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.txnTitle}>
                              {isEarn ? 'Cashback Earned' : 'Wallet Redeemed'} • {t.restaurant_name}
                            </Text>
                            <Text style={styles.txnSub}>
                              {t.notes || `Order ${t.order_id || ''}`} • {new Date(t.created_at).toLocaleDateString()}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.txnAmt, isEarn ? styles.txnAmtEarn : styles.txnAmtRedeem]}>
                              {isEarn ? '+' : '-'}{formatCurrency(t.amount)}
                            </Text>
                            <Text style={styles.txnBalAfter}>Bal: {formatCurrency(t.balance_after)}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Quick Menu Shortcuts */}
          <Text style={styles.sectionTitle}>Account Shortcuts</Text>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/(marketplace)/addresses')}
            activeOpacity={0.8}
          >
            <View style={styles.menuIconWrap}>
              <Text style={{ fontSize: 18 }}>📍</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Saved Delivery Addresses</Text>
              <Text style={styles.menuSub}>Manage home, work & other delivery locations</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/(marketplace)/orders')}
            activeOpacity={0.8}
          >
            <View style={styles.menuIconWrap}>
              <Text style={{ fontSize: 18 }}>📋</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>My Orders & Live Tracking</Text>
              <Text style={styles.menuSub}>View live food tracking and past order receipts</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.logoutBtnText}>🚪 Sign Out</Text>
          </TouchableOpacity>

          <Text style={styles.versionFooter}>
            RestroZ SaaS Marketplace • v4.0.0 (Tenant Isolated)
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  authSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  loginBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  pageInner: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EDEBE6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 10,
  },
  headerLogo: {
    width: 36,
    height: 36,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  editHeaderBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 0,
    shadowColor: customerColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  editHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  saveHeaderBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 0,
  },
  saveHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EDEBE6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarWrap: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: customerColors.primary,
  },
  avatarLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  avatarButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  changePhotoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  changePhotoText: {
    fontSize: 11,
    fontWeight: '700',
    color: customerColors.primary,
  },
  removePhotoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#FFF1F2',
  },
  removePhotoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E11D48',
  },
  formWrap: {
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  cancelEditBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelEditText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    marginTop: 8,
    letterSpacing: -0.2,
  },
  walletCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  walletCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  walletCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  walletCardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  walletTotalBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  walletTotalBadgeText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#15803D',
  },
  walletMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  walletMetricBox: {
    flex: 1,
    alignItems: 'center',
  },
  walletMetricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  walletMetricVal: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  walletEmptyBox: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  walletEmptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginTop: 6,
  },
  walletEmptySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  restaurantWalletsWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  walletSubHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  restWalletItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  restWalletName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  restWalletMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  restWalletBalWrap: {
    alignItems: 'flex-end',
  },
  restWalletBalVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
  },
  restWalletBalLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  txnsWrap: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  txnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  txnIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txnIconEarn: {
    backgroundColor: '#DCFCE7',
  },
  txnIconRedeem: {
    backgroundColor: '#FEF3C7',
  },
  txnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  txnSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  txnAmt: {
    fontSize: 12,
    fontWeight: '800',
  },
  txnAmtEarn: {
    color: '#16A34A',
  },
  txnAmtRedeem: {
    color: '#D97706',
  },
  txnBalAfter: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDEBE6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '700',
  },
  logoutBtn: {
    marginTop: 8,
    paddingVertical: 14,
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  logoutBtnText: {
    color: '#E11D48',
    fontWeight: '800',
    fontSize: 13,
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 20,
    marginBottom: 10,
  },
});
