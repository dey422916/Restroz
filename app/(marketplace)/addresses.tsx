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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { CustomerAddress } from '../../src/types';
import { customerColors } from '../../src/utils/colors';
import { isValidPhoneNumber } from '../../src/utils/phone';

export default function CustomerAddressesScreen() {
  const router = useRouter();
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
    setModalVisible(true);
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
    if (!addressLine1.trim() || !fullName.trim() || !phone.trim()) {
      Alert.alert('Validation Error', 'Full Name, Phone, and Street Address are required.');
      return;
    }

    if (!isValidPhoneNumber(phone)) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid 10-digit mobile number for this address.');
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
    Alert.alert('Delete Address', 'Are you sure you want to remove this delivery address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Optimistic remove
          setAddresses((prev) => prev.filter((a) => a.id !== id));
          try {
            await marketplaceService.deleteCustomerAddress(id);
          } catch (e) {
            loadAddresses();
          }
        },
      },
    ]);
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Delivery Addresses</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Text style={styles.addBtnText}>➕ Add Address</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {addresses.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={{ fontSize: 40 }}>📍</Text>
            <Text style={styles.emptyTitle}>No Addresses Saved</Text>
            <Text style={styles.emptySub}>
              Save your home, work, or favorite addresses for fast 1-tap checkout.
            </Text>
            <TouchableOpacity style={styles.addBtnPrimary} onPress={openAddModal}>
              <Text style={styles.addBtnPrimaryText}>+ Add First Address</Text>
            </TouchableOpacity>
          </View>
        ) : (
          addresses.map((addr) => (
            <View key={addr.id} style={styles.addressCard}>
              <View style={styles.cardHeader}>
                <View style={styles.labelRow}>
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
                    >
                      <Text style={styles.setDefaultBtnText}>★ Set Default</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => openEditModal(addr)}
                  >
                    <Text style={{ fontSize: 13 }}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(addr.id)}
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
              <Text style={styles.phoneLine}>📞 {addr.phone}</Text>
            </View>
          ))
        )}
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

              <Text style={styles.labelTitle}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Receiver name"
              />

              <Text style={styles.labelTitle}>Phone *</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/[^\d+]/g, ''))}
                placeholder="10-digit mobile number"
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
                maxLength={13}
              />
              {Boolean(phone && !isValidPhoneNumber(phone)) && (
                <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700', marginTop: 3 }}>
                  ⚠️ Invalid mobile number
                </Text>
              )}

              <Text style={styles.labelTitle}>Flat / House / Street Address *</Text>
              <TextInput
                style={styles.input}
                value={addressLine1}
                onChangeText={setAddressLine1}
                placeholder="Detailed street address"
              />

              <Text style={styles.labelTitle}>Landmark</Text>
              <TextInput
                style={styles.input}
                value={landmark}
                onChangeText={setLandmark}
                placeholder="e.g. Opposite Metro Station"
              />

              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.labelTitle}>City *</Text>
                  <TextInput style={styles.input} value={city} onChangeText={setCity} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.labelTitle}>PIN Code *</Text>
                  <TextInput
                    style={styles.input}
                    value={postalCode}
                    onChangeText={setPostalCode}
                    keyboardType="numeric"
                  />
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.text,
  },
  addBtn: {
    backgroundColor: customerColors.primaryBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.primary,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 70,
  },
  emptyWrap: {
    padding: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: customerColors.text,
  },
  emptySub: {
    fontSize: 13,
    color: customerColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  addBtnPrimary: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  addressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labelBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: customerColors.primary,
    backgroundColor: customerColors.primaryBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  setDefaultBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  deleteBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#FEF2F2',
  },
  recipientName: {
    fontSize: 14,
    fontWeight: '700',
    color: customerColors.text,
    marginBottom: 2,
  },
  streetLine: {
    fontSize: 13,
    color: customerColors.text,
    marginBottom: 2,
  },
  cityLine: {
    fontSize: 12,
    color: customerColors.textSecondary,
    marginBottom: 4,
  },
  phoneLine: {
    fontSize: 12,
    color: customerColors.textSecondary,
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
