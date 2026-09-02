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
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { couponService } from '../../src/services/api/couponService';
import { superAdminService } from '../../src/services/api/superAdminService';
import { useAuth } from '../../src/context/AuthContext';
import { Coupon, DiscountType, Restaurant } from '../../src/types';
import { formatCurrency } from '../../src/utils/currency';

export default function SuperAdminCouponsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { isSuperAdmin } = useAuth();

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestFilter, setSelectedRestFilter] = useState<string>('all');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Form Fields
  const [targetRestaurantId, setTargetRestaurantId] = useState('');
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rests, allCpns] = await Promise.all([
        superAdminService.getAllRestaurants(),
        couponService.getCoupons(),
      ]);
      setRestaurants(rests);
      setCoupons(allCpns);
    } catch (e: any) {
      console.warn('Error loading super admin coupons data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const filteredCoupons = coupons.filter((c) => {
    if (selectedRestFilter !== 'all' && c.restaurant_id !== selectedRestFilter) return false;
    return true;
  });

  const openCreateModal = () => {
    setEditingCoupon(null);
    setTargetRestaurantId(selectedRestFilter !== 'all' ? selectedRestFilter : (restaurants[0]?.id || ''));
    setCode('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValue('10');
    setMinOrderValue('0');
    setMaxDiscount('');
    setUsageLimit('');
    setStartDate(new Date().toISOString().split('T')[0]);
    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    setExpiryDate(exp.toISOString().split('T')[0]);
    setIsActive(true);
    setModalVisible(true);
  };

  const openEditModal = (cpn: Coupon) => {
    setEditingCoupon(cpn);
    setTargetRestaurantId(cpn.restaurant_id || '');
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
    if (!targetRestaurantId) {
      Alert.alert('Validation Error', 'Please select a restaurant.');
      return;
    }

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
          restaurant_id: targetRestaurantId,
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
        targetRestaurantId
      );

      Alert.alert(
        'Success',
        editingCoupon ? `Coupon ${code.toUpperCase()} updated.` : `Coupon ${code.toUpperCase()} created successfully!`
      );
      setModalVisible(false);
      loadData();
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
        cpn.restaurant_id
      );
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update coupon status.');
    }
  };

  const handleDelete = (cpn: Coupon) => {
    const isArchiving = (cpn.used_count || 0) > 0;
    Alert.alert(
      isArchiving ? 'Archive Coupon' : 'Delete Coupon',
      isArchiving
        ? `Coupon "${cpn.code}" has ${cpn.used_count} historical redemptions. It will be deactivated to preserve order history.`
        : `Permanently delete coupon "${cpn.code}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isArchiving ? 'Archive' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await couponService.deleteCoupon(cpn.id);
              loadData();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to remove coupon.');
            }
          },
        },
      ]
    );
  };

  const getRestName = (restId?: string) => {
    if (!restId) return 'General';
    const found = restaurants.find((r) => r.id === restId);
    return found ? found.name : restId.substring(0, 8);
  };

  return (
    <View style={styles.container}>
      {/* Top Controls */}
      <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.pageTitle}>Global Coupon Center</Text>
          <Text style={styles.pageSubtitle}>
            Super Admin management of promo codes & offers across all tenant restaurants
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createBtn, isMobile && styles.createBtnMobile]}
          onPress={openCreateModal}
          activeOpacity={0.8}
        >
          <Text style={styles.createBtnText}>+ Create Coupon</Text>
        </TouchableOpacity>
      </View>

      {/* Restaurant Filter Tabs */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          <TouchableOpacity
            style={[styles.filterChip, selectedRestFilter === 'all' && styles.filterChipActive]}
            onPress={() => setSelectedRestFilter('all')}
          >
            <Text style={[styles.filterChipText, selectedRestFilter === 'all' && styles.filterChipTextActive]}>
              All Restaurants ({coupons.length})
            </Text>
          </TouchableOpacity>

          {restaurants.map((r) => {
            const count = coupons.filter((c) => c.restaurant_id === r.id).length;
            const isSelected = selectedRestFilter === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedRestFilter(r.id)}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {r.name} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Coupons List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={{ marginTop: 10, color: '#64748B' }}>Loading platform coupons...</Text>
        </View>
      ) : filteredCoupons.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={{ fontSize: 44 }}>🎟️</Text>
          <Text style={styles.emptyTitle}>No Coupons Found</Text>
          <Text style={styles.emptySub}>
            No coupons match the selected filter. Create promotional deals to boost platform sales.
          </Text>
          <TouchableOpacity style={styles.createBtnEmpty} onPress={openCreateModal}>
            <Text style={styles.createBtnText}>+ Create Coupon</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContainer}>
          <View style={styles.grid}>
            {filteredCoupons.map((c) => {
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
                    <View>
                      <Text style={styles.restBadge}>🏢 {getRestName(c.restaurant_id)}</Text>
                      <Text style={styles.codeText}>{c.code}</Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.discountRow}>
                    <Text style={styles.discountText}>
                      {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} FLAT OFF`}
                    </Text>
                    {c.max_discount ? <Text style={styles.maxDiscText}>Cap: ₹{c.max_discount}</Text> : null}
                  </View>

                  {c.description ? <Text style={styles.descText}>{c.description}</Text> : null}

                  <View style={styles.statsBox}>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>MIN ORDER</Text>
                      <Text style={styles.statVal}>{formatCurrency(c.min_order_value || 0)}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>REDEMPTIONS</Text>
                      <Text style={styles.statVal}>
                        {c.used_count || 0} {c.usage_limit ? `/ ${c.usage_limit}` : 'uses'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.dateText}>
                    📅 {c.start_date ? new Date(c.start_date).toLocaleDateString() : 'Immediate'} →{' '}
                    {c.expiry_date ? new Date(c.expiry_date).toLocaleDateString() : 'No expiry'}
                  </Text>

                  {/* Actions */}
                  <View style={styles.cardActions}>
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
          </View>
        </ScrollView>
      )}

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingCoupon ? `Edit Coupon #${editingCoupon.code}` : 'Create Platform Coupon'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Target Restaurant *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {restaurants.map((r) => {
                    const isTarget = targetRestaurantId === r.id;
                    return (
                      <TouchableOpacity
                        key={r.id}
                        style={[styles.restSelectChip, isTarget && styles.restSelectChipActive]}
                        onPress={() => setTargetRestaurantId(r.id)}
                      >
                        <Text style={[styles.restSelectText, isTarget && styles.restSelectTextActive]}>
                          {r.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <Text style={styles.label}>Coupon Code *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. MEGA50"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                autoCapitalize="characters"
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. ₹50 flat discount on orders above ₹300"
                value={description}
                onChangeText={setDescription}
              />

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
                      placeholder="e.g. 150"
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
                    placeholder="0 for no min"
                    keyboardType="numeric"
                    value={minOrderValue}
                    onChangeText={setMinOrderValue}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.label}>Max Allotted Redemptions</Text>
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
                  <Text style={styles.label}>Start Date</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="YYYY-MM-DD"
                    value={startDate}
                    onChangeText={setStartDate}
                  />
                </View>

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.label}>Expiry Date</Text>
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
                <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: '#4F46E5', false: '#CBD5E1' }} />
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
                    {editingCoupon ? 'Update Coupon' : 'Create Platform Coupon'}
                  </Text>
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
  container: { flex: 1, backgroundColor: '#0B132B' },
  topBar: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 16,
  },
  topBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: 16,
    gap: 12,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  pageTitle: { fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  pageSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 16 },
  createBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  createBtnMobile: {
    width: '100%',
    paddingVertical: 12,
  },
  createBtnEmpty: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  createBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  filterBar: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  filterChipsRow: { gap: 10 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterChipText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  filterChipTextActive: { color: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginTop: 12 },
  emptySub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 6, maxWidth: 400 },
  listContainer: { padding: 20, paddingBottom: 60 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1C2541',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  restBadge: { fontSize: 11, fontWeight: '700', color: '#38BDF8', marginBottom: 2 },
  codeText: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '800' },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  discountText: { fontSize: 14, fontWeight: '900', color: '#4ADE80' },
  maxDiscText: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  descText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 12, lineHeight: 16 },
  statsBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  statItem: { flex: 1 },
  statLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  statVal: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },
  dateText: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 14 },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  toggleBtnActive: { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: '#22C55E' },
  toggleBtnInactive: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.15)' },
  toggleTextActive: { fontSize: 11, fontWeight: '800', color: '#4ADE80' },
  toggleTextInactive: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  editBtn: {
    backgroundColor: 'rgba(79,70,229,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  editBtnText: { fontSize: 11, fontWeight: '800', color: '#818CF8' },
  deleteBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  deleteBtnText: { fontSize: 11, fontWeight: '800', color: '#F87171' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: '#1C2541',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  closeBtn: { padding: 4 },
  modalForm: { padding: 16 },
  label: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#FFFFFF',
    backgroundColor: '#0B132B',
  },
  restSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  restSelectChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  restSelectText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  restSelectTextActive: { color: '#FFFFFF', fontWeight: '800' },
  typeSelectorRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    backgroundColor: '#0B132B',
  },
  typeBtnSelected: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  typeBtnText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
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
  switchLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  saveBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 20,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
