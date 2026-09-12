import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { CustomerAddress } from '../../src/types';
import { customerColors } from '../../src/utils/colors';
import { isValidPhoneNumber } from '../../src/utils/phone';

export default function CustomerAddressesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { user, loading: authLoading } = useAuth();

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  // Add / Edit Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('Home');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [state, setState] = useState('Maharashtra');
  const [postalCode, setPostalCode] = useState('400001');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    fullName?: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    postalCode?: string;
  }>({});

  const loadAddresses = async () => {
    try {
      const data = await marketplaceService.getCustomerAddresses();
      setAddresses(data);
    } catch (e) {
      console.warn('Error loading addresses:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadAddresses();
    } else {
      setLoading(false);
    }
  }, [user]);

  const openAddModal = () => {
    setEditingId(null);
    setLabel('Home');
    setFullName(user?.full_name || '');
    setPhone(user?.phone || '');
    setAddressLine1('');
    setLandmark('');
    setCity('Mumbai');
    setState('Maharashtra');
    setPostalCode('400001');
    setIsDefault(addresses.length === 0);
    setFormErrors({});
    setModalVisible(true);
  };

  const openEditModal = (addr: CustomerAddress) => {
    setEditingId(addr.id);
    setLabel(addr.label);
    setFullName(addr.full_name);
    setPhone(addr.phone);
    setAddressLine1(addr.address_line1);
    setLandmark(addr.landmark || '');
    setCity(addr.city);
    setState(addr.state);
    setPostalCode(addr.postal_code);
    setIsDefault(addr.is_default);
    setFormErrors({});
    setModalVisible(true);
  };

  const validateForm = () => {
    const errors: {
      fullName?: string;
      phone?: string;
      addressLine1?: string;
      city?: string;
      postalCode?: string;
    } = {};

    if (!fullName.trim()) {
      errors.fullName = 'Full Name is required';
    } else if (fullName.trim().length < 2) {
      errors.fullName = 'Please enter a valid full name';
    }

    if (!phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!isValidPhoneNumber(phone.trim())) {
      errors.phone = 'Please enter a valid 10-digit mobile number';
    }

    if (!addressLine1.trim()) {
      errors.addressLine1 = 'Street address is required';
    } else if (addressLine1.trim().length < 3) {
      errors.addressLine1 = 'Please enter a detailed street address';
    }

    if (!city.trim()) {
      errors.city = 'City is required';
    }

    if (!postalCode.trim()) {
      errors.postalCode = 'PIN code is required';
    } else if (!/^\d{6}$/.test(postalCode.trim())) {
      errors.postalCode = 'Please enter a valid 6-digit PIN code';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSetDefault = async (id: string) => {
    // 1. Optimistic UI update (0ms immediate feedback)
    setAddresses((prev) =>
      prev.map((a) => ({
        ...a,
        is_default: a.id === id,
      }))
    );

    try {
      await marketplaceService.setDefaultCustomerAddress(id);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to set default address.');
      loadAddresses();
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updated = await marketplaceService.updateCustomerAddress(editingId, {
          label,
          full_name: fullName.trim(),
          phone: phone.trim(),
          address_line1: addressLine1.trim(),
          landmark: landmark.trim() || undefined,
          city: city.trim(),
          state: state.trim(),
          postal_code: postalCode.trim(),
          is_default: isDefault,
        });
        setAddresses((prev) =>
          prev.map((a) => (a.id === editingId ? updated : isDefault ? { ...a, is_default: false } : a))
        );
      } else {
        const created = await marketplaceService.createCustomerAddress({
          label,
          full_name: fullName.trim(),
          phone: phone.trim(),
          address_line1: addressLine1.trim(),
          landmark: landmark.trim() || undefined,
          city: city.trim(),
          state: state.trim(),
          postal_code: postalCode.trim(),
          is_default: isDefault,
        });
        setAddresses((prev) => [created, ...(isDefault ? prev.map((a) => ({ ...a, is_default: false })) : prev)]);
      }

      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save address.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    console.log('[DEV_LOG] Delete clicked for address ID:', id);

    const executeDelete = async () => {
      console.log('[DEV_LOG] Confirmation accepted for address ID:', id);
      // Optimistic remove
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      try {
        console.log('[DEV_LOG] deleteAddress called for address ID:', id);
        await marketplaceService.deleteCustomerAddress(id);
        console.log('[DEV_LOG] Supabase response received successfully for address ID:', id);
      } catch (e: any) {
        console.error('[DEV_LOG] Error deleting address:', e);
        Alert.alert('Error', e.message || 'Failed to remove address.');
        loadAddresses();
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm('Are you sure you want to remove this delivery address?');
        if (confirmed) {
          executeDelete();
        } else {
          console.log('[DEV_LOG] Delete cancelled by user on Web');
        }
      } else {
        executeDelete();
      }
    } else {
      Alert.alert('Delete Address', 'Are you sure you want to remove this delivery address?', [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => console.log('[DEV_LOG] Delete cancelled by user on Mobile'),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: executeDelete,
        },
      ]);
    }
  };

  const getLabelIcon = (lbl: string) => {
    const l = lbl.toLowerCase();
    if (l === 'home') return '🏠';
    if (l === 'work') return '🏢';
    return '📍';
  };

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={customerColors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 36 }}>📍</Text>
        <Text style={styles.authTitle}>Delivery Address Book</Text>
        <Text style={styles.authSub}>Please log in to manage your delivery addresses.</Text>
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginBtnText}>Log In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageInner}>
          {/* Header Banner Box */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>My Delivery Addresses</Text>
              <Text style={styles.headerSubtitle}>
                Manage your delivery locations for fast 1-tap ordering
              </Text>
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={openAddModal} activeOpacity={0.8}>
              <Text style={styles.addBtnText}>+ Add Address</Text>
            </TouchableOpacity>
          </View>

          {addresses.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 48 }}>📍</Text>
              <Text style={styles.emptyTitle}>No Addresses Saved Yet</Text>
              <Text style={styles.emptySub}>
                Save your home, work, or frequently visited addresses for quick ordering and checkout.
              </Text>
              <TouchableOpacity style={styles.addBtnPrimary} onPress={openAddModal} activeOpacity={0.8}>
                <Text style={styles.addBtnPrimaryText}>+ Add First Address</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.addressGrid}>
              {addresses.map((addr) => (
                <View key={addr.id} style={[styles.addressCard, isDesktop && styles.addressCardDesktop]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.labelRow}>
                      <Text style={{ fontSize: 16 }}>{getLabelIcon(addr.label)}</Text>
                      <Text style={styles.labelBadge}>{addr.label.toUpperCase()}</Text>
                      {addr.is_default && (
                        <View style={styles.defaultBadge}>
                          <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.actionRow}>
                      {!addr.is_default && (
                        <TouchableOpacity
                          style={styles.setDefaultBtn}
                          onPress={() => handleSetDefault(addr.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.setDefaultBtnText}>★ Set Default</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => openEditModal(addr)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 13 }}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(addr.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 13 }}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.recipientName}>{addr.full_name}</Text>
                  <Text style={styles.streetLine}>
                    {addr.address_line1}
                    {addr.landmark ? `, Near ${addr.landmark}` : ''}
                  </Text>
                  <Text style={styles.cityLine}>
                    {addr.city}, {addr.state} - {addr.postal_code}
                  </Text>
                  <View style={styles.phoneBadge}>
                    <Text style={styles.phoneLine}>📞 {addr.phone}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Address' : 'Add Delivery Address'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.labelTitle}>Label</Text>
              <View style={styles.labelPicker}>
                {['Home', 'Work', 'Other'].map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.labelChip, label === l && styles.labelChipActive]}
                    onPress={() => setLabel(l)}
                  >
                    <Text
                      style={[styles.labelChipText, label === l && styles.labelChipTextActive]}
                    >
                      {l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.labelHeaderRow}>
                <Text style={styles.labelTitle}>
                  Full Name <Text style={styles.requiredStar}>*</Text>
                </Text>
                {formErrors.fullName ? (
                  <Text style={styles.requiredBadge}>Required</Text>
                ) : null}
              </View>
              <TextInput
                style={[styles.input, Boolean(formErrors.fullName) && styles.inputError]}
                value={fullName}
                onChangeText={(v) => {
                  setFullName(v);
                  if (formErrors.fullName) setFormErrors((prev) => ({ ...prev, fullName: undefined }));
                }}
                placeholder="Receiver name"
                placeholderTextColor="#94A3B8"
              />
              {Boolean(formErrors.fullName) && (
                <Text style={styles.fieldErrorText}>⚠️ {formErrors.fullName}</Text>
              )}

              <View style={styles.labelHeaderRow}>
                <Text style={styles.labelTitle}>
                  Phone <Text style={styles.requiredStar}>*</Text>
                </Text>
                {formErrors.phone ? (
                  <Text style={styles.requiredBadge}>Required</Text>
                ) : null}
              </View>
              <TextInput
                style={[styles.input, Boolean(formErrors.phone) && styles.inputError]}
                value={phone}
                onChangeText={(v) => {
                  const cleaned = v.replace(/[^\d+]/g, '');
                  setPhone(cleaned);
                  if (formErrors.phone) setFormErrors((prev) => ({ ...prev, phone: undefined }));
                }}
                placeholder="10-digit mobile number"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                maxLength={13}
              />
              {Boolean(formErrors.phone) ? (
                <Text style={styles.fieldErrorText}>⚠️ {formErrors.phone}</Text>
              ) : Boolean(phone && !isValidPhoneNumber(phone)) ? (
                <Text style={styles.fieldErrorText}>
                  ⚠️ Please enter a valid 10-digit mobile number
                </Text>
              ) : null}

              <View style={styles.labelHeaderRow}>
                <Text style={styles.labelTitle}>
                  Flat / House / Street Address <Text style={styles.requiredStar}>*</Text>
                </Text>
                {formErrors.addressLine1 ? (
                  <Text style={styles.requiredBadge}>Required</Text>
                ) : null}
              </View>
              <TextInput
                style={[styles.input, Boolean(formErrors.addressLine1) && styles.inputError]}
                value={addressLine1}
                onChangeText={(v) => {
                  setAddressLine1(v);
                  if (formErrors.addressLine1) setFormErrors((prev) => ({ ...prev, addressLine1: undefined }));
                }}
                placeholder="Detailed street address"
                placeholderTextColor="#94A3B8"
              />
              {Boolean(formErrors.addressLine1) && (
                <Text style={styles.fieldErrorText}>⚠️ {formErrors.addressLine1}</Text>
              )}

              <Text style={styles.labelTitle}>Landmark (Optional)</Text>
              <TextInput
                style={styles.input}
                value={landmark}
                onChangeText={setLandmark}
                placeholder="e.g. Opposite Metro Station"
                placeholderTextColor="#94A3B8"
              />

              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.labelHeaderRow}>
                    <Text style={styles.labelTitle}>
                      City <Text style={styles.requiredStar}>*</Text>
                    </Text>
                    {formErrors.city ? <Text style={styles.requiredBadge}>Required</Text> : null}
                  </View>
                  <TextInput
                    style={[styles.input, Boolean(formErrors.city) && styles.inputError]}
                    value={city}
                    onChangeText={(v) => {
                      setCity(v);
                      if (formErrors.city) setFormErrors((prev) => ({ ...prev, city: undefined }));
                    }}
                    placeholder="e.g. Mumbai"
                    placeholderTextColor="#94A3B8"
                  />
                  {Boolean(formErrors.city) && (
                    <Text style={styles.fieldErrorText}>⚠️ {formErrors.city}</Text>
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <View style={styles.labelHeaderRow}>
                    <Text style={styles.labelTitle}>
                      PIN Code <Text style={styles.requiredStar}>*</Text>
                    </Text>
                    {formErrors.postalCode ? <Text style={styles.requiredBadge}>Required</Text> : null}
                  </View>
                  <TextInput
                    style={[styles.input, Boolean(formErrors.postalCode) && styles.inputError]}
                    value={postalCode}
                    onChangeText={(v) => {
                      const cleaned = v.replace(/\D/g, '').slice(0, 6);
                      setPostalCode(cleaned);
                      if (formErrors.postalCode) setFormErrors((prev) => ({ ...prev, postalCode: undefined }));
                    }}
                    keyboardType="numeric"
                    maxLength={6}
                    placeholder="6-digit PIN"
                    placeholderTextColor="#94A3B8"
                  />
                  {Boolean(formErrors.postalCode) && (
                    <Text style={styles.fieldErrorText}>⚠️ {formErrors.postalCode}</Text>
                  )}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Address</Text>
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
    backgroundColor: '#F8FAFC',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  authTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  authSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
  },
  loginBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  pageInner: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: customerColors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: customerColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 70,
  },
  addressGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  emptyWrap: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.text,
  },
  emptySub: {
    fontSize: 13,
    color: customerColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 420,
    marginBottom: 8,
  },
  addBtnPrimary: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: customerColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  addBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  addressCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  addressCardDesktop: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 320,
    maxWidth: 530,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: customerColors.primary,
    backgroundColor: customerColors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  defaultBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setDefaultBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  setDefaultBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  editBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  recipientName: {
    fontSize: 15,
    fontWeight: '800',
    color: customerColors.text,
    marginBottom: 4,
  },
  streetLine: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 4,
  },
  cityLine: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },
  phoneBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  phoneLine: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 480,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: customerColors.text,
  },
  labelTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: customerColors.textSecondary,
    marginBottom: 4,
    marginTop: 8,
  },
  labelPicker: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  labelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  labelChipActive: {
    borderColor: customerColors.primary,
    backgroundColor: customerColors.primary,
  },
  labelChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: customerColors.textSecondary,
  },
  labelChipTextActive: {
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: customerColors.text,
    backgroundColor: '#F8F9FA',
  },
  inputRow: {
    flexDirection: 'row',
  },
  labelHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 8,
  },
  requiredStar: {
    color: '#EF4444',
    fontWeight: '700',
  },
  requiredBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
  },
  fieldErrorText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
    marginTop: 3,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: customerColors.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
