import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { couponService } from '../../src/services/api/couponService';
import { useAuth } from '../../src/context/AuthContext';
import { Coupon, DiscountType } from '../../src/types';
import { formatCurrency } from '../../src/utils/currency';

export default function CouponsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { user, role, isAdmin: authIsAdmin, isSuperAdmin, activeRestaurantId } = useAuth();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Form Fields
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

  useFocusEffect(
    useCallback(() => {
      loadCoupons();
    }, [loadCoupons])
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

  const handleToggleActive = async (cpn: Coupon) => {
    try {
      await couponService.saveCoupon(
        {
          ...cpn,
          is_active: !cpn.is_active,
        },
        activeRestaurantId || undefined
      );
      loadCoupons();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update coupon status.');
    }
  };

  const handleDelete = (cpn: Coupon) => {
    const isArchiving = (cpn.used_count || 0) > 0;
    Alert.alert(
      isArchiving ? 'Archive Coupon' : 'Delete Coupon',
      isArchiving
        ? `Coupon "${cpn.code}" has been used ${cpn.used_count} time(s). It will be deactivated and archived to preserve order history.`
        : `Are you sure you want to permanently delete coupon "${cpn.code}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isArchiving ? 'Archive' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await couponService.deleteCoupon(cpn.id, activeRestaurantId || undefined);
              loadCoupons();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to remove coupon.');
            }
          },
        },
      ]
    );
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.restrictedBox}>
          <Text style={{ fontSize: 44 }}>🔒</Text>
          <Text style={styles.restrictedTitle}>Admin Access Required</Text>
          <Text style={styles.restrictedSub}>
            Only Restaurant Admins and Super Admins can manage coupon discounts.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Coupons & Deals ({coupons.length})</Text>
          <Text style={styles.subTitle}>Manage promo codes, usage limits & marketplace offers</Text>
        </View>
        <TouchableOpacity
          style={[styles.createBtn, isMobile && styles.createBtnMobile]}
          onPress={openCreateModal}
          activeOpacity={0.8}
        >
          <Text style={styles.createBtnText}>+ Create Coupon</Text>
        </TouchableOpacity>
      </View>

      {/* Main List */}
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
            } else if (isExhausted) {
              statusLabel = 'EXHAUSTED';
              statusBg = '#FFEDD5';
              statusColor = '#C2410C';
            } else if (notStarted) {
              statusLabel = 'SCHEDULED';
              statusBg = '#EFF6FF';
              statusColor = '#1D4ED8';
            }

            return (
              <View key={c.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.codeRow}>
                    <Text style={styles.codeText}>{c.code}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.discountBadge}>
                    <Text style={styles.discountBadgeText}>
                      {c.discount_type === 'percentage'
                        ? `${c.discount_value}% OFF`
                        : `₹${c.discount_value} FLAT OFF`}
                    </Text>
                  </View>
                </View>

                {c.description ? <Text style={styles.descText}>{c.description}</Text> : null}

                {/* Details Grid */}
                <View style={styles.metaGrid}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>MIN. ORDER</Text>
                    <Text style={styles.metaVal}>{formatCurrency(c.min_order_value || 0)}</Text>
                  </View>

                  {c.discount_type === 'percentage' && c.max_discount ? (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>MAX DISCOUNT</Text>
                      <Text style={styles.metaVal}>₹{c.max_discount}</Text>
                    </View>
                  ) : null}

                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>REDEMPTIONS</Text>
                    <Text style={styles.metaVal}>
                      {c.used_count || 0} {c.usage_limit ? `/ ${c.usage_limit} limit` : 'used'}
                    </Text>
                  </View>
                </View>

                {/* Dates Row */}
                <View style={styles.dateRow}>
                  <Text style={styles.dateText}>
                    📅 {c.start_date ? new Date(c.start_date).toLocaleDateString() : 'Immediate'} →{' '}
                    {c.expiry_date ? new Date(c.expiry_date).toLocaleDateString() : 'No expiry'}
                  </Text>
                </View>

                {/* Card Actions */}
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
                    <Text style={styles.editBtnText}>✏️ Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(c)}>
                    <Text style={styles.deleteBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Create / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCoupon ? `Edit Coupon #${editingCoupon.code}` : 'Create New Coupon'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Coupon Code *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. FESTIVE20"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 20% off on all items above ₹500"
                value={description}
                onChangeText={setDescription}
              />

              {/* Discount Type Selector */}
              <Text style={styles.label}>Discount Type *</Text>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeBtn, discountType === 'percentage' && styles.typeBtnSelected]}
                  onPress={() => setDiscountType('percentage')}
                >
                  <Text style={[styles.typeBtnText, discountType === 'percentage' && styles.typeBtnTextSelected]}>
                    Percentage (%)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.typeBtn, discountType === 'fixed' && styles.typeBtnSelected]}
                  onPress={() => setDiscountType('fixed')}
                >
                  <Text style={[styles.typeBtnText, discountType === 'fixed' && styles.typeBtnTextSelected]}>
                    Flat Amount (₹)
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>
                    {discountType === 'percentage' ? 'Discount Percentage (%) *' : 'Flat Discount (₹) *'}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 20"
                    keyboardType="numeric"
                    value={discountValue}
                    onChangeText={setDiscountValue}
                  />
                </View>

                {discountType === 'percentage' ? (
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.label}>Max Cap (₹)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 150 (Optional)"
                      keyboardType="numeric"
                      value={maxDiscount}
                      onChangeText={setMaxDiscount}
                    />
                  </View>
                ) : null}
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Min Order Value (₹)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0 for no minimum"
                    keyboardType="numeric"
                    value={minOrderValue}
                    onChangeText={setMinOrderValue}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.label}>Max Total Coupons</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 100 (Optional)"
                    keyboardType="numeric"
                    value={usageLimit}
                    onChangeText={setUsageLimit}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={startDate}
                    onChangeText={setStartDate}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={expiryDate}
                    onChangeText={setExpiryDate}
                  />
                </View>
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Active & Redeemable</Text>
                <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: '#2563EB', false: '#CBD5E1' }} />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveCoupon}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingCoupon ? 'Update Coupon' : 'Save & Publish Coupon'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  subTitle: { fontSize: 11, color: '#64748B', marginTop: 2, lineHeight: 16 },
  createBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  createBtnMobile: {
    width: '100%',
    paddingVertical: 10,
  },
  createBtnEmpty: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  createBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  restrictedBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  restrictedTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 12 },
  restrictedSub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeText: { fontSize: 16, fontWeight: '900', color: '#0F172A', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  discountBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  discountBadgeText: { fontSize: 12, fontWeight: '900', color: '#15803D' },
  descText: { fontSize: 12, color: '#475569', marginBottom: 10, lineHeight: 16 },
  metaGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    gap: 12,
    marginBottom: 8,
  },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 9, fontWeight: '700', color: '#64748B' },
  metaVal: { fontSize: 12, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  dateRow: { marginBottom: 12 },
  dateText: { fontSize: 11, color: '#64748B' },
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
});

