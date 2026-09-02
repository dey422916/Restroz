import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { superAdminService } from '../../src/services/api/superAdminService';
import { SubscriptionPlan, SubscriptionPlanBillingCycle } from '../../src/types';
import { colors } from '../../src/utils/colors';

export default function SubscriptionPlansScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCycle, setFormCycle] = useState<SubscriptionPlanBillingCycle>('monthly');
  const [formPrice, setFormPrice] = useState('');
  const [formMaxStaff, setFormMaxStaff] = useState('5');
  const [formMaxTables, setFormMaxTables] = useState('20');
  const [formMaxProducts, setFormMaxProducts] = useState('100');
  const [qrOrdering, setQrOrdering] = useState(true);
  const [inventory, setInventory] = useState(false);
  const [reports, setReports] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadPlans = async () => {
    try {
      const data = await superAdminService.getSubscriptionPlans();
      setPlans(data);
    } catch (e) {
      console.warn('Error loading plans:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setFormCycle('monthly');
    setFormPrice('');
    setFormMaxStaff('5');
    setFormMaxTables('20');
    setFormMaxProducts('100');
    setQrOrdering(true);
    setInventory(false);
    setReports(true);
    setAnalytics(false);
    setModalVisible(true);
  };

  const openEditModal = (p: SubscriptionPlan) => {
    setEditingPlan(p);
    setFormName(p.name);
    setFormCode(p.code);
    setFormDescription(p.description || '');
    setFormCycle(p.billing_cycle);
    setFormPrice(p.price.toString());
    setFormMaxStaff(p.max_staff ? p.max_staff.toString() : '999');
    setFormMaxTables(p.max_tables ? p.max_tables.toString() : '999');
    setFormMaxProducts(p.max_products ? p.max_products.toString() : '9999');
    setQrOrdering(!!p.features?.qr_ordering);
    setInventory(!!p.features?.inventory);
    setReports(!!p.features?.reports);
    setAnalytics(!!p.features?.analytics);
    setModalVisible(true);
  };

  const handleSavePlan = async () => {
    if (!formName.trim() || !formCode.trim() || !formPrice.trim()) {
      Alert.alert('Validation Error', 'Name, unique code, and price are required.');
      return;
    }

    setSaving(true);
    try {
      const planPayload = {
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        description: formDescription.trim(),
        billing_cycle: formCycle,
        price: parseFloat(formPrice) || 0,
        currency: 'INR',
        max_staff: parseInt(formMaxStaff) || 5,
        max_tables: parseInt(formMaxTables) || 20,
        max_products: parseInt(formMaxProducts) || 100,
        features: {
          qr_ordering: qrOrdering,
          inventory: inventory,
          reports: reports,
          analytics: analytics,
        },
        is_active: true,
      };

      if (editingPlan) {
        await superAdminService.updateSubscriptionPlan(editingPlan.id, planPayload);
        Alert.alert('Success', 'Subscription Plan updated successfully.');
      } else {
        await superAdminService.createSubscriptionPlan(planPayload);
        Alert.alert('Success', 'New Subscription Plan created successfully.');
      }

      setModalVisible(false);
      loadPlans();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save plan.');
    } finally {
      setSaving(false);
    }
  };

  const getPlanCardWidth = () => {
    if (isMobile) return '100%';
    if (isTablet) return '48%';
    return '31.5%';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Subscription Plans</Text>
          <Text style={styles.subtitle}>
            Manage SaaS tiers, feature flags, resource quotas, and pricing
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isMobile && { width: '100%', justifyContent: 'center' }]}
          onPress={openCreateModal}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>➕ Add New Plan</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.cardsGrid, { paddingBottom: isMobile ? 100 : 40 }]}>
          {plans.map((p) => (
            <View key={p.id} style={[styles.planCard, { width: getPlanCardWidth() }]}>
              <View style={styles.planCardHeader}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.planName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.planCode} numberOfLines={1}>
                    Code: {p.code}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => openEditModal(p)} style={styles.editBtn}>
                  <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '700' }}>✏️ Edit</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.planPrice}>
                ₹{p.price.toLocaleString('en-IN')}{' '}
                <Text style={styles.planCycle}>/ {p.billing_cycle}</Text>
              </Text>

              {p.description ? <Text style={styles.planDesc}>{p.description}</Text> : null}

              <View style={styles.divider} />

              <Text style={styles.featureHeader}>RESOURCE QUOTAS</Text>
              <View style={styles.quotaRow}>
                <Text style={{ fontSize: 14 }}>👥</Text>
                <Text style={styles.quotaText}>
                  {p.max_staff ? `Max ${p.max_staff} Staff Members` : 'Unlimited Staff Members'}
                </Text>
              </View>
              <View style={styles.quotaRow}>
                <Text style={{ fontSize: 14 }}>🪑</Text>
                <Text style={styles.quotaText}>
                  {p.max_tables ? `Max ${p.max_tables} Dine-In Tables` : 'Unlimited Dining Tables'}
                </Text>
              </View>
              <View style={styles.quotaRow}>
                <Text style={{ fontSize: 14 }}>🍔</Text>
                <Text style={styles.quotaText}>
                  {p.max_products ? `Max ${p.max_products} Menu Items` : 'Unlimited Menu Products'}
                </Text>
              </View>

              <View style={styles.divider} />

              <Text style={styles.featureHeader}>FEATURES INCLUDED</Text>
              <View style={styles.featureGrid}>
                <View style={styles.featureItem}>
                  <Text style={{ fontSize: 14 }}>{p.features?.qr_ordering ? '✅' : '❌'}</Text>
                  <Text
                    style={[
                      styles.featureText,
                      !p.features?.qr_ordering && styles.featureTextDisabled,
                    ]}
                  >
                    Guest QR Menu
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={{ fontSize: 14 }}>{p.features?.inventory ? '✅' : '❌'}</Text>
                  <Text
                    style={[
                      styles.featureText,
                      !p.features?.inventory && styles.featureTextDisabled,
                    ]}
                  >
                    Inventory Tracking
                  </Text>
                </View>
                <View style={styles.featureItem}>
                  <Text style={{ fontSize: 14 }}>{p.features?.reports ? '✅' : '❌'}</Text>
                  <Text
                    style={[
                      styles.featureText,
                      !p.features?.reports && styles.featureTextDisabled,
                    ]}
                  >
                    Reports & Analytics
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Plan Create/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingPlan ? 'Edit Subscription Plan' : 'Create Subscription Plan'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Plan Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Standard Monthly"
                value={formName}
                onChangeText={(v) => {
                  setFormName(v);
                  if (!editingPlan && !formCode) {
                    setFormCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '_'));
                  }
                }}
              />

              <Text style={styles.label}>Unique Code Identifier *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. STANDARD_MONTHLY"
                value={formCode}
                onChangeText={setFormCode}
                autoCapitalize="characters"
              />

              <View style={[styles.inputRow, isMobile && { flexDirection: 'column' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Price (₹) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1999"
                    value={formPrice}
                    onChangeText={setFormPrice}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[{ flex: 1, marginLeft: isMobile ? 0 : 12 }]}>
                  <Text style={styles.label}>Billing Cycle</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    {(['monthly', 'quarterly', 'yearly'] as SubscriptionPlanBillingCycle[]).map(
                      (c) => (
                        <TouchableOpacity
                          key={c}
                          style={[
                            styles.cyclePill,
                            formCycle === c && styles.cyclePillActive,
                          ]}
                          onPress={() => setFormCycle(c)}
                        >
                          <Text
                            style={[
                              styles.cyclePillText,
                              formCycle === c && styles.cyclePillTextActive,
                            ]}
                          >
                            {c.slice(0, 1).toUpperCase() + c.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                </View>
              </View>

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="Brief plan summary"
                value={formDescription}
                onChangeText={setFormDescription}
              />

              <Text style={[styles.featureHeader, { marginTop: 16 }]}>RESOURCE LIMITS</Text>
              <View style={[styles.inputRow, isMobile && { flexDirection: 'column' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Max Staff</Text>
                  <TextInput
                    style={styles.input}
                    value={formMaxStaff}
                    onChangeText={setFormMaxStaff}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[{ flex: 1, marginHorizontal: isMobile ? 0 : 8 }]}>
                  <Text style={styles.label}>Max Tables</Text>
                  <TextInput
                    style={styles.input}
                    value={formMaxTables}
                    onChangeText={setFormMaxTables}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Max Products</Text>
                  <TextInput
                    style={styles.input}
                    value={formMaxProducts}
                    onChangeText={setFormMaxProducts}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={[styles.featureHeader, { marginTop: 16 }]}>FEATURE GATES</Text>
              <View style={{ gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setQrOrdering(!qrOrdering)}
                >
                  <Text style={{ fontSize: 16 }}>{qrOrdering ? '☑️' : '⬜'}</Text>
                  <Text style={styles.toggleLabel}>Guest Dine-In QR Ordering</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setInventory(!inventory)}
                >
                  <Text style={{ fontSize: 16 }}>{inventory ? '☑️' : '⬜'}</Text>
                  <Text style={styles.toggleLabel}>Inventory & Stock Management</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setReports(!reports)}
                >
                  <Text style={{ fontSize: 16 }}>{reports ? '☑️' : '⬜'}</Text>
                  <Text style={styles.toggleLabel}>Advanced Reports & Export</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.toggleRow}
                  onPress={() => setAnalytics(!analytics)}
                >
                  <Text style={{ fontSize: 16 }}>{analytics ? '☑️' : '⬜'}</Text>
                  <Text style={styles.toggleLabel}>Financial & Growth Analytics</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSavePlan}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Plan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    flexWrap: 'wrap',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingBottom: 24,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  planName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  planCode: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  editBtn: {
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  planCycle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  planDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  featureHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  quotaText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  featureGrid: {
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  featureTextDisabled: {
    color: '#94A3B8',
    textDecorationLine: 'line-through',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 580,
    maxHeight: '90%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  inputRow: {
    flexDirection: 'row',
  },
  cyclePill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  cyclePillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  cyclePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  cyclePillTextActive: {
    color: '#FFFFFF',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
  },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
