import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { couponService } from '../../src/services/api/couponService';
import { loyaltyService } from '../../src/services/api/loyaltyService';
import { useAuth } from '../../src/context/AuthContext';
import { Coupon, DiscountType, CustomerWalletInfo } from '../../src/types';
import { formatCurrency } from '../../src/utils/currency';
import { isValidIndianPhone, normalizeIndianPhone } from '../../src/utils/validation';

export default function CouponsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { user, role, isAdmin: authIsAdmin, isSuperAdmin, activeRestaurantId } = useAuth();

  // Tab State: 'coupons' | 'rewards'
  const [activeTab, setActiveTab] = useState<'coupons' | 'rewards'>('coupons');

  // Coupons State
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Rewards Program State
  const [rewardsEnabled, setRewardsEnabled] = useState(false);
  const [spendAmount, setSpendAmount] = useState('100');
  const [rewardAmount, setRewardAmount] = useState('1');
  const [minRedeemBalance, setMinRedeemBalance] = useState('50');
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [savingRewards, setSavingRewards] = useState(false);

  // Customer Wallet Lookup & Directory State
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupWallet, setLookupWallet] = useState<CustomerWalletInfo | null>(null);
  const [lookupTransactions, setLookupTransactions] = useState<Array<{
    id: string;
    transaction_type: string;
    amount: number;
    order_id?: string;
    notes?: string;
    created_at: string;
  }>>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Active Customer Wallets List State
  const [customerWallets, setCustomerWallets] = useState<Array<{
    id: string;
    customer_mobile: string;
    balance: number;
    total_earned: number;
    total_redeemed: number;
    updated_at: string;
  }>>([]);
  const [loadingWallets, setLoadingWallets] = useState(false);

  // Coupon Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Coupon Form Fields
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [minOrderValue, setMinOrderValue] = useState('0');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Authoritative Role check: Admin or Super Admin only
  const normalizedRole = (role || user?.role || '').toUpperCase();
  const isAdmin = isSuperAdmin || authIsAdmin || normalizedRole === 'ADMIN' || normalizedRole === 'SUPER_ADMIN';

  const loadCoupons = useCallback(async () => {
    if (!activeRestaurantId) return;
    try {
      setLoading(true);
      const data = await couponService.getCoupons(activeRestaurantId);
      setCoupons(data);
    } catch (e: any) {
      console.warn('Error loading coupons:', e);
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId]);

  const loadRewardsSettings = useCallback(async () => {
    if (!activeRestaurantId) return;
    try {
      setLoadingRewards(true);
      const settings = await loyaltyService.getLoyaltySettings(activeRestaurantId);
      setRewardsEnabled(settings.is_enabled);
      setSpendAmount(String(settings.spend_amount));
      setRewardAmount(String(settings.reward_amount));
      setMinRedeemBalance(String(settings.min_redeem_balance));
    } catch (e: any) {
      console.warn('Error loading rewards settings:', e);
    } finally {
      setLoadingRewards(false);
    }
  }, [activeRestaurantId]);

  const loadCustomerWallets = useCallback(async () => {
    if (!activeRestaurantId) return;
    try {
      setLoadingWallets(true);
      const wallets = await loyaltyService.getRestaurantCustomerWallets(activeRestaurantId);
      setCustomerWallets(wallets);
    } catch (e: any) {
      console.warn('Error loading customer wallets:', e);
    } finally {
      setLoadingWallets(false);
    }
  }, [activeRestaurantId]);

  const handleLookupCustomer = async (targetPhone?: string) => {
    const query = (targetPhone || lookupPhone).trim();
    if (!query) {
      Alert.alert('Phone Required', 'Please enter a customer mobile number to check balance.');
      return;
    }
    if (!activeRestaurantId) return;

    const normalized = normalizeIndianPhone(query);
    setLookupLoading(true);
    setHasSearched(true);
    try {
      const [wallet, transactions] = await Promise.all([
        loyaltyService.getCustomerWallet(activeRestaurantId, normalized),
        loyaltyService.getCustomerWalletTransactions(activeRestaurantId, normalized),
      ]);
      setLookupWallet(wallet);
      setLookupTransactions(transactions);
    } catch (e: any) {
      console.warn('Error looking up customer wallet:', e);
      Alert.alert('Lookup Error', e.message || 'Failed to fetch customer wallet details.');
    } finally {
      setLookupLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadCoupons();
      loadRewardsSettings();
      loadCustomerWallets();
    }, [loadCoupons, loadRewardsSettings, loadCustomerWallets])
  );

  const openCreateModal = () => {
    setEditingCoupon(null);
    setCode('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValue('10');
    setMinOrderValue('0');
    setMaxDiscount('');
    setUsageLimit('');
    setStartDate(new Date().toISOString().split('T')[0]);
    // Default 30 days expiry
    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    setExpiryDate(exp.toISOString().split('T')[0]);
    setIsActive(true);
    setModalVisible(true);
  };

  const openEditModal = (cpn: Coupon) => {
    setEditingCoupon(cpn);
    setCode(cpn.code);
    setDescription(cpn.description || '');
    setDiscountType(cpn.discount_type);
    setDiscountValue(String(cpn.discount_value));
    setMinOrderValue(String(cpn.min_order_value || 0));
    setMaxDiscount(cpn.max_discount ? String(cpn.max_discount) : '');
    setUsageLimit(cpn.usage_limit ? String(cpn.usage_limit) : '');
    setStartDate(cpn.start_date ? cpn.start_date.split('T')[0] : '');
    setExpiryDate(cpn.expiry_date ? cpn.expiry_date.split('T')[0] : '');
    setIsActive(cpn.is_active);
    setModalVisible(true);
  };

  const handleSaveCoupon = async () => {
    if (!code.trim()) {
      Alert.alert('Validation Error', 'Coupon code is required.');
      return;
    }

    const val = Number(discountValue);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid discount value greater than 0.');
      return;
    }

    if (discountType === 'percentage' && val > 100) {
      Alert.alert('Validation Error', 'Percentage discount cannot exceed 100%.');
      return;
    }

    setSaving(true);
    try {
      await couponService.saveCoupon(
        {
          id: editingCoupon?.id,
          restaurant_id: activeRestaurantId || undefined,
          code: code.trim().toUpperCase(),
          description: description.trim(),
          discount_type: discountType,
          discount_value: val,
          min_order_value: Number(minOrderValue) || 0,
          max_discount: maxDiscount ? Number(maxDiscount) : undefined,
          usage_limit: usageLimit ? Number(usageLimit) : undefined,
          used_count: editingCoupon?.used_count || 0,
          start_date: startDate ? new Date(startDate).toISOString() : undefined,
          expiry_date: expiryDate ? new Date(expiryDate).toISOString() : undefined,
          is_active: isActive,
        },
        activeRestaurantId || undefined
      );

      Alert.alert(
        'Success',
        editingCoupon ? `Coupon ${code.toUpperCase()} updated.` : `Coupon ${code.toUpperCase()} created successfully!`
      );
      setModalVisible(false);
      loadCoupons();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save coupon.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRewards = async () => {
    if (!activeRestaurantId) return;
    const spend = parseFloat(spendAmount);
    const reward = parseFloat(rewardAmount);
    const minRedeem = parseFloat(minRedeemBalance);

    if (isNaN(spend) || spend <= 0) {
      Alert.alert('Validation Error', 'Spend amount must be greater than 0.');
      return;
    }
    if (isNaN(reward) || reward < 0) {
      Alert.alert('Validation Error', 'Reward amount cannot be negative.');
      return;
    }
    if (isNaN(minRedeem) || minRedeem < 0) {
      Alert.alert('Validation Error', 'Minimum redeem balance cannot be negative.');
      return;
    }

    setSavingRewards(true);
    try {
      await loyaltyService.saveLoyaltySettings({
        restaurant_id: activeRestaurantId,
        is_enabled: rewardsEnabled,
        spend_amount: spend,
        reward_amount: reward,
        min_redeem_balance: minRedeem,
      });
      Alert.alert('Success', 'Loyalty Rewards program settings saved successfully!');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save rewards settings.');
    } finally {
      setSavingRewards(false);
    }
  };

  const handleToggleActive = async (cpn: Coupon) => {
    try {
      await couponService.saveCoupon(
        {
          id: cpn.id,
          restaurant_id: cpn.restaurant_id,
          code: cpn.code,
          discount_type: cpn.discount_type,
          discount_value: cpn.discount_value,
          is_active: !cpn.is_active,
        },
        activeRestaurantId || undefined
      );
      loadCoupons();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to toggle coupon status.');
    }
  };

  const handleDelete = (cpn: Coupon) => {
    const isArchiving = (cpn.used_count || 0) > 0;
    const title = isArchiving ? 'Archive Coupon' : 'Delete Coupon';
    const message = isArchiving
      ? `Coupon "${cpn.code}" has been redeemed ${cpn.used_count} time(s). It will be archived and deactivated.`
      : `Are you sure you want to permanently delete coupon "${cpn.code}"?`;

    const doDelete = async () => {
      try {
        await couponService.deleteCoupon(cpn.id, activeRestaurantId || undefined);
        Alert.alert('Success', isArchiving ? `Coupon "${cpn.code}" archived.` : `Coupon "${cpn.code}" deleted.`);
        loadCoupons();
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to delete coupon.');
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
        doDelete();
      }
      return;
    }

    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isArchiving ? 'Archive' : 'Delete',
          style: 'destructive',
          onPress: doDelete,
        },
      ]
    );
  };

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.restrictedBox}>
          <Text style={{ fontSize: 44 }}>🔒</Text>
          <Text style={styles.restrictedTitle}>Admin Access Required</Text>
          <Text style={styles.restrictedSub}>
            Only Restaurant Admins and Super Admins can manage coupon discounts and loyalty rewards.
          </Text>
        </View>
      </View>
    );
  }

  // Example Calculation for Preview
  const numSpend = parseFloat(spendAmount) || 100;
  const numReward = parseFloat(rewardAmount) || 1;
  const previewExampleSpend = 550;
  const previewCalculatedReward = numSpend > 0 ? ((previewExampleSpend / numSpend) * numReward).toFixed(2) : '0.00';

  return (
    <View style={styles.container}>
      {/* Header & Tabs */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Coupons & Loyalty Rewards</Text>
          <Text style={styles.subTitle}>Manage promo deals, discount coupons & customer wallet cashbacks</Text>
        </View>

        {activeTab === 'coupons' && (
          <TouchableOpacity
            style={[styles.createBtn, isMobile && styles.createBtnMobile]}
            onPress={openCreateModal}
            activeOpacity={0.8}
          >
            <Text style={styles.createBtnText}>+ Create Coupon</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Segmented Tab Navigation */}
      <View style={styles.tabNavRow}>
        <TouchableOpacity
          style={[styles.tabNavItem, activeTab === 'coupons' && styles.tabNavItemActive]}
          onPress={() => setActiveTab('coupons')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabNavText, activeTab === 'coupons' && styles.tabNavTextActive]}>
            🎟️ Coupons ({coupons.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabNavItem, activeTab === 'rewards' && styles.tabNavItemActive]}
          onPress={() => setActiveTab('rewards')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabNavText, activeTab === 'rewards' && styles.tabNavTextActive]}>
            🎁 Loyalty Rewards & Wallet {rewardsEnabled ? '• ON' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB CONTENT: COUPONS */}
      {activeTab === 'coupons' && (
        <>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={{ marginTop: 10, color: '#64748B' }}>Loading coupons...</Text>
            </View>
          ) : coupons.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 44 }}>🏷️</Text>
              <Text style={styles.emptyTitle}>No Coupons Created Yet</Text>
              <Text style={styles.emptySub}>
                Create flat or percentage discount coupons to delight customers and drive orders.
              </Text>
              <TouchableOpacity style={styles.createBtnEmpty} onPress={openCreateModal}>
                <Text style={styles.createBtnText}>+ Create First Coupon</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 40 }]}>
              {coupons.map((c) => {
                const now = new Date();
                const isExpired = c.expiry_date && new Date(c.expiry_date) < now;
                const notStarted = c.start_date && new Date(c.start_date) > now;
                const isExhausted = c.usage_limit !== undefined && c.usage_limit !== null && (c.used_count || 0) >= c.usage_limit;

                let statusLabel = 'ACTIVE';
                let statusBg = '#DCFCE7';
                let statusColor = '#15803D';

                if (!c.is_active) {
                  statusLabel = 'INACTIVE';
                  statusBg = '#F1F5F9';
                  statusColor = '#64748B';
                } else if (isExpired) {
                  statusLabel = 'EXPIRED';
                  statusBg = '#FEE2E2';
                  statusColor = '#B91C1C';
                } else if (notStarted) {
                  statusLabel = 'UPCOMING';
                  statusBg = '#FEF3C7';
                  statusColor = '#B45309';
                } else if (isExhausted) {
                  statusLabel = 'EXHAUSTED';
                  statusBg = '#F3E8FF';
                  statusColor = '#7E22CE';
                }

                return (
                  <View key={c.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.codeBadge}>
                        <Text style={styles.codeText}>{c.code}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                    </View>

                    <Text style={styles.discountHighlight}>
                      {c.discount_type === 'percentage'
                        ? `${c.discount_value}% OFF`
                        : `₹${c.discount_value} FLAT OFF`}
                    </Text>

                    {c.description ? <Text style={styles.descText}>{c.description}</Text> : null}

                    <View style={styles.metaRow}>
                      {c.min_order_value ? (
                        <Text style={styles.metaText}>Min Order: {formatCurrency(c.min_order_value)}</Text>
                      ) : null}
                      {c.max_discount ? (
                        <Text style={styles.metaText}>Max Disc: {formatCurrency(c.max_discount)}</Text>
                      ) : null}
                      {c.usage_limit ? (
                        <Text style={styles.metaText}>
                          Usage: {c.used_count || 0} / {c.usage_limit}
                        </Text>
                      ) : (
                        <Text style={styles.metaText}>Used: {c.used_count || 0} times</Text>
                      )}
                    </View>

                    {c.expiry_date && (
                      <Text style={styles.expiryText}>
                        Expires: {new Date(c.expiry_date).toLocaleDateString()}
                      </Text>
                    )}

                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.toggleBtn, c.is_active ? styles.toggleBtnActive : styles.toggleBtnInactive]}
                        onPress={() => handleToggleActive(c)}
                      >
                        <Text style={c.is_active ? styles.toggleTextActive : styles.toggleTextInactive}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(c)}>
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(c)}>
                        <Text style={styles.deleteBtnText}>
                          {(c.used_count || 0) > 0 ? 'Archive' : 'Delete'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </>
      )}

      {/* TAB CONTENT: REWARDS SETTINGS */}
      {activeTab === 'rewards' && (
        <ScrollView contentContainerStyle={[styles.rewardsContainer, { paddingBottom: 60 }]}>
          {loadingRewards ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={{ marginTop: 10, color: '#64748B' }}>Loading rewards configuration...</Text>
            </View>
          ) : (
            <>
              <View style={styles.rewardsCard}>
              <View style={styles.rewardsCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rewardsTitle}>🎁 Loyalty Cashback & Customer Wallet</Text>
                  <Text style={styles.rewardsSubtitle}>
                    Automatically reward repeat customers with wallet cash balance on every settled order.
                  </Text>
                </View>
                <View style={styles.rewardsSwitchWrap}>
                  <Text style={[styles.rewardsSwitchLabel, rewardsEnabled && styles.rewardsSwitchLabelActive]}>
                    {rewardsEnabled ? 'ENABLED' : 'DISABLED'}
                  </Text>
                  <Switch
                    value={rewardsEnabled}
                    onValueChange={setRewardsEnabled}
                    trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                    thumbColor={rewardsEnabled ? '#2563EB' : '#FFFFFF'}
                  />
                </View>
              </View>

              <View style={styles.rewardsDivider} />

              {/* Earn Rule Inputs */}
              <Text style={styles.rewardsSectionTitle}>💰 Cashback Earning Rule</Text>
              <Text style={styles.rewardsSectionSub}>
                Set how much a customer must spend to earn wallet cashback on settled orders.
              </Text>

              <View style={[styles.rewardsInputGrid, isMobile && styles.rewardsInputGridMobile]}>
                <View style={styles.rewardsInputCol}>
                  <Text style={styles.rewardsInputLabel}>Spend Amount (₹)</Text>
                  <View style={styles.currencyInputWrap}>
                    <Text style={styles.currencyPrefix}>₹</Text>
                    <TextInput
                      style={styles.currencyInput}
                      value={spendAmount}
                      onChangeText={setSpendAmount}
                      keyboardType="numeric"
                      placeholder="100"
                    />
                  </View>
                  <Text style={styles.rewardsInputHint}>Base spend benchmark</Text>
                </View>

                <View style={styles.rewardsInputCol}>
                  <Text style={styles.rewardsInputLabel}>Earn Reward Amount (₹)</Text>
                  <View style={styles.currencyInputWrap}>
                    <Text style={styles.currencyPrefix}>₹</Text>
                    <TextInput
                      style={styles.currencyInput}
                      value={rewardAmount}
                      onChangeText={setRewardAmount}
                      keyboardType="numeric"
                      placeholder="1"
                    />
                  </View>
                  <Text style={styles.rewardsInputHint}>Wallet credit earned per spend</Text>
                </View>
              </View>

              <View style={styles.rewardsDivider} />

              {/* Redemption Rule */}
              <Text style={styles.rewardsSectionTitle}>💳 Wallet Balance Redemption Rule</Text>
              <Text style={styles.rewardsSectionSub}>
                Customer can redeem their accumulated wallet balance at POS checkout once they meet this threshold.
              </Text>

              <View style={[styles.rewardsInputGrid, isMobile && styles.rewardsInputGridMobile]}>
                <View style={styles.rewardsInputCol}>
                  <Text style={styles.rewardsInputLabel}>Minimum Wallet Balance to Redeem (₹)</Text>
                  <View style={styles.currencyInputWrap}>
                    <Text style={styles.currencyPrefix}>₹</Text>
                    <TextInput
                      style={styles.currencyInput}
                      value={minRedeemBalance}
                      onChangeText={setMinRedeemBalance}
                      keyboardType="numeric"
                      placeholder="50"
                    />
                  </View>
                  <Text style={styles.rewardsInputHint}>
                    Prevents tiny partial redemptions before loyalty threshold is reached
                  </Text>
                </View>
              </View>

              {/* Live Rule Simulation Box */}
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>🔍 Live Rule Simulation</Text>
                <Text style={styles.previewText}>
                  • Customer spends <Text style={styles.previewBold}>₹{previewExampleSpend}</Text> on a meal.
                </Text>
                <Text style={styles.previewText}>
                  • Reward earned: <Text style={styles.previewBold}>₹{previewCalculatedReward}</Text> added to their wallet upon settlement.
                </Text>
                <Text style={styles.previewText}>
                  • Redemption unlocked when wallet balance reaches <Text style={styles.previewBold}>₹{minRedeemBalance || '0'}</Text>.
                </Text>
                <Text style={styles.previewSubtext}>
                  * Customer is uniquely identified across visits by their normalized 10-digit mobile number.
                </Text>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveRewardsBtn, savingRewards && styles.saveRewardsBtnDisabled]}
                onPress={handleSaveRewards}
                disabled={savingRewards}
                activeOpacity={0.8}
              >
                {savingRewards ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveRewardsBtnText}>💾 Save Rewards Settings</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* CUSTOMER WALLET BALANCE LOOKUP TOOL */}
            <View style={styles.walletLookupCard}>
              <View style={styles.walletLookupHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletLookupTitle}>🔍 Customer Wallet Balance Lookup</Text>
                  <Text style={styles.walletLookupSubtitle}>
                    Search by 10-digit mobile number to view live wallet balance, redemption status, and transaction history.
                  </Text>
                </View>
              </View>

              <View style={[styles.lookupInputRow, isMobile && styles.lookupInputRowMobile]}>
                <View style={styles.phoneInputWrap}>
                  <Text style={styles.phoneInputPrefix}>🇮🇳 +91</Text>
                  <TextInput
                    style={styles.phoneInput}
                    value={lookupPhone}
                    onChangeText={(val) => setLookupPhone(val.replace(/[^\d]/g, ''))}
                    placeholder="Enter 10-digit customer mobile"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    maxLength={10}
                    onSubmitEditing={() => handleLookupCustomer()}
                  />
                  {Boolean(lookupPhone) && (
                    <TouchableOpacity
                      style={styles.clearPhoneBtn}
                      onPress={() => {
                        setLookupPhone('');
                        setLookupWallet(null);
                        setLookupTransactions([]);
                        setHasSearched(false);
                      }}
                    >
                      <Text style={{ fontSize: 13, color: '#94A3B8' }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.lookupBtn, lookupLoading && styles.lookupBtnDisabled]}
                  onPress={() => handleLookupCustomer()}
                  disabled={lookupLoading}
                  activeOpacity={0.8}
                >
                  {lookupLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.lookupBtnText}>Check Balance</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Lookup Result Box */}
              {hasSearched && (
                <View style={styles.lookupResultContainer}>
                  {lookupLoading ? (
                    <View style={styles.lookupLoadingBox}>
                      <ActivityIndicator size="small" color="#2563EB" />
                      <Text style={styles.lookupLoadingText}>Fetching customer wallet data...</Text>
                    </View>
                  ) : lookupWallet ? (
                    <View style={styles.walletDetailCard}>
                      <View style={styles.walletDetailHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={styles.phoneBadge}>
                            <Text style={styles.phoneBadgeText}>📱 {lookupWallet.customer_mobile || lookupPhone}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: '#DCFCE7' }]}>
                            <Text style={[styles.statusText, { color: '#15803D' }]}>LOYALTY MEMBER</Text>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.eligibilityBadge,
                            lookupWallet.can_redeem ? styles.eligibilityBadgeGreen : styles.eligibilityBadgeAmber,
                          ]}
                        >
                          <Text
                            style={[
                              styles.eligibilityText,
                              lookupWallet.can_redeem ? styles.eligibilityTextGreen : styles.eligibilityTextAmber,
                            ]}
                          >
                            {lookupWallet.can_redeem
                              ? '✓ Eligible to Redeem at POS'
                              : `⚠️ Min ₹${lookupWallet.min_redeem_balance} needed to redeem`}
                          </Text>
                        </View>
                      </View>

                      {/* Prominent Balance Row */}
                      <View style={styles.balanceHighlightRow}>
                        <View>
                          <Text style={styles.balanceHighlightLabel}>Available Wallet Balance</Text>
                          <Text style={styles.balanceHighlightAmount}>
                            {formatCurrency(lookupWallet.balance || 0)}
                          </Text>
                        </View>
                        <View style={styles.walletMiniStats}>
                          <View style={styles.miniStatCol}>
                            <Text style={styles.miniStatLabel}>Total Earned</Text>
                            <Text style={[styles.miniStatValue, { color: '#15803D' }]}>
                              +{formatCurrency(lookupWallet.total_earned || 0)}
                            </Text>
                          </View>
                          <View style={styles.miniStatDivider} />
                          <View style={styles.miniStatCol}>
                            <Text style={styles.miniStatLabel}>Total Redeemed</Text>
                            <Text style={[styles.miniStatValue, { color: '#2563EB' }]}>
                              -{formatCurrency(lookupWallet.total_redeemed || 0)}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Transaction Ledger History */}
                      <View style={styles.ledgerHeaderRow}>
                        <Text style={styles.ledgerTitle}>
                          📜 Recent Activity ({lookupTransactions.length})
                        </Text>
                      </View>

                      {lookupTransactions.length === 0 ? (
                        <View style={styles.emptyLedgerBox}>
                          <Text style={styles.emptyLedgerText}>
                            No wallet transactions recorded yet for this mobile number.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.ledgerList}>
                          {lookupTransactions.map((tx) => {
                            const isEarn = tx.transaction_type === 'earn';
                            return (
                              <View key={tx.id} style={styles.ledgerItem}>
                                <View style={styles.ledgerLeft}>
                                  <View
                                    style={[
                                      styles.txTypeBadge,
                                      isEarn ? styles.txTypeEarn : styles.txTypeRedeem,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.txTypeText,
                                        isEarn ? styles.txTypeTextEarn : styles.txTypeTextRedeem,
                                      ]}
                                    >
                                      {isEarn ? 'EARNED' : 'REDEEMED'}
                                    </Text>
                                  </View>
                                  <View style={{ marginLeft: 8 }}>
                                    <Text style={styles.txNotes}>
                                      {tx.notes || (isEarn ? 'Cashback from settled order' : 'Redeemed on bill payment')}
                                    </Text>
                                    <Text style={styles.txDate}>
                                      {new Date(tx.created_at).toLocaleString()}
                                    </Text>
                                  </View>
                                </View>
                                <Text
                                  style={[
                                    styles.txAmount,
                                    isEarn ? styles.txAmountEarn : styles.txAmountRedeem,
                                  ]}
                                >
                                  {isEarn ? '+' : '-'}{formatCurrency(tx.amount)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.lookupNotFoundBox}>
                      <Text style={{ fontSize: 24, marginBottom: 6 }}>🔍</Text>
                      <Text style={styles.lookupNotFoundTitle}>No Wallet Found</Text>
                      <Text style={styles.lookupNotFoundText}>
                        No customer wallet found for mobile number "{lookupPhone}". A wallet is automatically created when an order is settled with their phone number.
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* CUSTOMER WALLETS DIRECTORY TABLE */}
            <View style={styles.walletDirectoryCard}>
              <View style={styles.walletDirectoryHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.walletDirectoryTitle}>
                    👥 Customer Loyalty Directory ({customerWallets.length})
                  </Text>
                  <Text style={styles.walletDirectorySubtitle}>
                    Overview of active customer wallet balances for your restaurant.
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.refreshWalletsBtn}
                  onPress={loadCustomerWallets}
                  disabled={loadingWallets}
                  activeOpacity={0.8}
                >
                  {loadingWallets ? (
                    <ActivityIndicator size="small" color="#2563EB" />
                  ) : (
                    <Text style={styles.refreshWalletsBtnText}>🔄 Refresh</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Directory Summary Metrics */}
              {customerWallets.length > 0 && (
                <View style={[styles.directorySummaryRow, isMobile && styles.directorySummaryRowMobile]}>
                  <View style={styles.directoryStatBox}>
                    <Text style={styles.directoryStatLabel}>Total Customers</Text>
                    <Text style={styles.directoryStatVal}>{customerWallets.length}</Text>
                  </View>
                  <View style={styles.directoryStatBox}>
                    <Text style={styles.directoryStatLabel}>Total Wallet Balance</Text>
                    <Text style={[styles.directoryStatVal, { color: '#059669' }]}>
                      {formatCurrency(customerWallets.reduce((acc, w) => acc + (w.balance || 0), 0))}
                    </Text>
                  </View>
                  <View style={styles.directoryStatBox}>
                    <Text style={styles.directoryStatLabel}>Total Rewards Issued</Text>
                    <Text style={[styles.directoryStatVal, { color: '#2563EB' }]}>
                      {formatCurrency(customerWallets.reduce((acc, w) => acc + (w.total_earned || 0), 0))}
                    </Text>
                  </View>
                </View>
              )}

              {loadingWallets ? (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color="#2563EB" />
                  <Text style={{ marginTop: 10, color: '#64748B' }}>Loading customer wallets...</Text>
                </View>
              ) : customerWallets.length === 0 ? (
                <View style={styles.emptyWalletsBox}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>💳</Text>
                  <Text style={styles.emptyWalletsTitle}>No Customer Wallets Yet</Text>
                  <Text style={styles.emptyWalletsSub}>
                    When orders are settled at POS with customer mobile numbers, cashbacks will automatically accrue and appear here.
                  </Text>
                </View>
              ) : (
                <View style={styles.walletsTable}>
                  <View style={styles.walletsTableHeader}>
                    <Text style={[styles.thCell, { flex: 2 }]}>CUSTOMER MOBILE</Text>
                    <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>BALANCE</Text>
                    <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>EARNED</Text>
                    <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>REDEEMED</Text>
                    <Text style={[styles.thCell, { flex: 1.5, textAlign: 'center' }]}>ACTION</Text>
                  </View>

                  {customerWallets.map((w) => (
                    <View key={w.id} style={styles.walletsTableRow}>
                      <View style={[styles.tdCell, { flex: 2 }]}>
                        <Text style={styles.tdMobileText}>📱 {w.customer_mobile}</Text>
                        <Text style={styles.tdDateText}>
                          Updated: {new Date(w.updated_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={[styles.tdCell, { flex: 1.5, alignItems: 'flex-end' }]}>
                        <View style={styles.tableBalanceBadge}>
                          <Text style={styles.tableBalanceText}>{formatCurrency(w.balance)}</Text>
                        </View>
                      </View>
                      <View style={[styles.tdCell, { flex: 1.5, alignItems: 'flex-end' }]}>
                        <Text style={styles.tdEarnedText}>+{formatCurrency(w.total_earned)}</Text>
                      </View>
                      <View style={[styles.tdCell, { flex: 1.5, alignItems: 'flex-end' }]}>
                        <Text style={styles.tdRedeemedText}>-{formatCurrency(w.total_redeemed)}</Text>
                      </View>
                      <View style={[styles.tdCell, { flex: 1.5, alignItems: 'center' }]}>
                        <TouchableOpacity
                          style={styles.inspectBtn}
                          onPress={() => {
                            setLookupPhone(w.customer_mobile);
                            handleLookupCustomer(w.customer_mobile);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.inspectBtnText}>Inspect</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
        </ScrollView>
      )}

      {/* CREATE / EDIT COUPON MODAL */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create New Coupon'}
              </Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B', fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              <Text style={styles.label}>Coupon Code *</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="e.g. FLAT50, FESTIVE10"
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Special flat discount for weekend diners"
              />

              <Text style={styles.label}>Discount Type</Text>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, discountType === 'percentage' && styles.typeBtnSelected]}
                  onPress={() => setDiscountType('percentage')}
                >
                  <Text style={[styles.typeBtnText, discountType === 'percentage' && styles.typeBtnTextSelected]}>
                    % Percentage
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeBtn, discountType === 'fixed' && styles.typeBtnSelected]}
                  onPress={() => setDiscountType('fixed')}
                >
                  <Text style={[styles.typeBtnText, discountType === 'fixed' && styles.typeBtnTextSelected]}>
                    ₹ Flat Amount
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>
                {discountType === 'percentage' ? 'Discount Percentage (%) *' : 'Discount Amount (₹) *'}
              </Text>
              <TextInput
                style={styles.input}
                value={discountValue}
                onChangeText={setDiscountValue}
                keyboardType="numeric"
                placeholder={discountType === 'percentage' ? '10' : '50'}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Min Order Value (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={minOrderValue}
                    onChangeText={setMinOrderValue}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                </View>

                {discountType === 'percentage' && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Max Cap (₹)</Text>
                    <TextInput
                      style={styles.input}
                      value={maxDiscount}
                      onChangeText={setMaxDiscount}
                      keyboardType="numeric"
                      placeholder="Optional"
                    />
                  </View>
                )}
              </View>

              <Text style={styles.label}>Total Usage Limit</Text>
              <TextInput
                style={styles.input}
                value={usageLimit}
                onChangeText={setUsageLimit}
                keyboardType="numeric"
                placeholder="Leave blank for unlimited"
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Start Date</Text>
                  <TextInput
                    style={styles.input}
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Expiry Date</Text>
                  <TextInput
                    style={styles.input}
                    value={expiryDate}
                    onChangeText={setExpiryDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Active Status</Text>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
                  thumbColor={isActive ? '#2563EB' : '#FFFFFF'}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveCoupon}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>{editingCoupon ? 'Update Coupon' : 'Create Coupon'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerMobile: { flexDirection: 'column', alignItems: 'flex-start', gap: 12 },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  subTitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  createBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createBtnMobile: { width: '100%', alignItems: 'center' },
  createBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  tabNavRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  tabNavItem: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  tabNavItemActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  tabNavText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabNavTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  restrictedBox: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  restrictedTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 12 },
  restrictedSub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, maxWidth: 360 },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#FFFFFF',
    margin: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, maxWidth: 380 },
  createBtnEmpty: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
  },
  list: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: Platform.OS === 'web' ? 340 : '100%',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  codeText: { fontSize: 13, fontWeight: '900', color: '#1D4ED8', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  discountHighlight: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginBottom: 4 },
  descText: { fontSize: 12, color: '#64748B', marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  metaText: { fontSize: 11, color: '#475569', backgroundColor: '#F8FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  expiryText: { fontSize: 11, color: '#94A3B8', marginBottom: 12 },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  toggleBtnActive: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  toggleBtnInactive: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  toggleTextActive: { fontSize: 11, fontWeight: '800', color: '#059669' },
  toggleTextInactive: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  editBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editBtnText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },
  deleteBtn: {
    backgroundColor: '#FFF1F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  deleteBtnText: { fontSize: 11, fontWeight: '800', color: '#E11D48' },
  rewardsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  rewardsCard: {
    width: '100%',
    maxWidth: 680,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  rewardsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  rewardsTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  rewardsSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  rewardsSwitchWrap: {
    alignItems: 'center',
  },
  rewardsSwitchLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 4,
  },
  rewardsSwitchLabelActive: {
    color: '#2563EB',
  },
  rewardsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 20,
  },
  rewardsSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  rewardsSectionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  rewardsInputGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  rewardsInputGridMobile: {
    flexDirection: 'column',
  },
  rewardsInputCol: {
    flex: 1,
  },
  rewardsInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  currencyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  currencyPrefix: {
    paddingLeft: 12,
    paddingRight: 6,
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
  },
  currencyInput: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  rewardsInputHint: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 20,
    marginBottom: 24,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  previewText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
    marginBottom: 4,
  },
  previewBold: {
    fontWeight: '800',
    color: '#2563EB',
  },
  previewSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 8,
    fontStyle: 'italic',
  },
  saveRewardsBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveRewardsBtnDisabled: {
    opacity: 0.6,
  },
  saveRewardsBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  closeBtn: { padding: 4 },
  modalForm: { padding: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  typeSelectorRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  typeBtnSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  typeBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  typeBtnTextSelected: { color: '#FFFFFF' },
  formRow: { flexDirection: 'row' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
    paddingVertical: 4,
  },
  switchLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  saveBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 20,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  // Wallet Lookup Card Styles
  walletLookupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 24,
  },
  walletLookupHeader: {
    marginBottom: 16,
  },
  walletLookupTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  walletLookupSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  lookupInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lookupInputRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  phoneInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  phoneInputPrefix: {
    paddingLeft: 12,
    paddingRight: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 10,
    paddingRight: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  clearPhoneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lookupBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupBtnDisabled: {
    opacity: 0.6,
  },
  lookupBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  lookupResultContainer: {
    marginTop: 18,
  },
  lookupLoadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  lookupLoadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#64748B',
  },
  walletDetailCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  walletDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  phoneBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  phoneBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  eligibilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  eligibilityBadgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  eligibilityBadgeAmber: {
    backgroundColor: '#FEF3C7',
  },
  eligibilityText: {
    fontSize: 11,
    fontWeight: '800',
  },
  eligibilityTextGreen: {
    color: '#15803D',
  },
  eligibilityTextAmber: {
    color: '#B45309',
  },
  balanceHighlightRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  balanceHighlightLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  balanceHighlightAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },
  walletMiniStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  miniStatCol: {
    alignItems: 'flex-start',
  },
  miniStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  miniStatValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  miniStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  ledgerHeaderRow: {
    marginTop: 16,
    marginBottom: 8,
  },
  ledgerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyLedgerBox: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyLedgerText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  ledgerList: {
    gap: 8,
  },
  ledgerItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ledgerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  txTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  txTypeEarn: {
    backgroundColor: '#DCFCE7',
  },
  txTypeRedeem: {
    backgroundColor: '#DBEAFE',
  },
  txTypeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  txTypeTextEarn: {
    color: '#15803D',
  },
  txTypeTextRedeem: {
    color: '#1D4ED8',
  },
  txNotes: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  txDate: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  txAmountEarn: {
    color: '#15803D',
  },
  txAmountRedeem: {
    color: '#2563EB',
  },
  lookupNotFoundBox: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  lookupNotFoundTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  lookupNotFoundText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 380,
  },

  // Wallet Directory Table Styles
  walletDirectoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 24,
  },
  walletDirectoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletDirectoryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  walletDirectorySubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  refreshWalletsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  refreshWalletsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  directorySummaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  directorySummaryRowMobile: {
    flexDirection: 'column',
  },
  directoryStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  directoryStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  directoryStatVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  emptyWalletsBox: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyWalletsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptyWalletsSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 420,
  },
  walletsTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  walletsTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  thCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  walletsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  tdCell: {
    justifyContent: 'center',
  },
  tdMobileText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  tdDateText: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  tableBalanceBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tableBalanceText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  tdEarnedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  tdRedeemedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  inspectBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  inspectBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
});

