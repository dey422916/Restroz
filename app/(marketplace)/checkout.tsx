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
import { useCustomerCart } from '../../src/context/CustomerCartContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { CustomerAddress } from '../../src/types';
import { customerColors } from '../../src/utils/colors';

export default function DeliveryCheckoutScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { cart, clearCart, removeCoupon } = useCustomerCart();

  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);

  // Add Address Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const [newLabel, setNewLabel] = useState('Home');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newLine1, setNewLine1] = useState('');
  const [newLandmark, setNewLandmark] = useState('');
  const [newCity, setNewCity] = useState('Mumbai');
  const [newState, setNewState] = useState('Maharashtra');
  const [newPostal, setNewPostal] = useState('400001');

  useEffect(() => {
    if (user) {
      setCustomerName(user.full_name || '');
      setCustomerPhone(user.phone || '');
      setNewFullName(user.full_name || '');
      setNewPhone(user.phone || '');
      loadAddresses();
    }
  }, [user]);

  const loadAddresses = async () => {
    try {
      const data = await marketplaceService.getCustomerAddresses();
      setAddresses(data);
      if (data.length > 0) {
        const defaultAddr = data.find((a) => a.is_default) || data[0];
        setSelectedAddressId(defaultAddr.id);
      }
    } catch (e) {
      console.warn('Error loading addresses:', e);
    } finally {
      setLoadingAddresses(false);
    }
  };

  const handleSaveNewAddress = async () => {
    if (!newLine1.trim() || !newFullName.trim() || !newPhone.trim()) {
      Alert.alert('Validation Error', 'Full Name, Phone, and Street Address are required.');
      return;
    }

    setSavingAddr(true);
    try {
      const created = await marketplaceService.createCustomerAddress({
        label: newLabel,
        full_name: newFullName.trim(),
        phone: newPhone.trim(),
        address_line1: newLine1.trim(),
        landmark: newLandmark.trim() || undefined,
        city: newCity.trim(),
        state: newState.trim(),
        postal_code: newPostal.trim(),
        is_default: addresses.length === 0,
      });

      setAddresses([created, ...addresses]);
      setSelectedAddressId(created.id);
      setAddModalVisible(false);
      setNewLine1('');
      setNewLandmark('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save address.');
    } finally {
      setSavingAddr(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (!user) {
      Alert.alert('Login Required', 'Please log in to place a delivery order.', [
        { text: 'Log In', onPress: () => router.push('/(auth)/login') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    if (!cart.restaurantId || cart.items.length === 0) {
      Alert.alert('Empty Cart', 'Your cart is empty.');
      return;
    }

    const selectedAddr = addresses.find((a) => a.id === selectedAddressId);
    if (!selectedAddr) {
      Alert.alert('Address Required', 'Please select or add a delivery address.');
      return;
    }

    if (!customerPhone.trim()) {
      Alert.alert('Phone Required', 'Please provide a valid contact number.');
      return;
    }

    setPlacingOrder(true);
    try {
      const orderPayload = {
        restaurant_id: cart.restaurantId,
        items: cart.items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          notes: i.notes,
        })),
        delivery_address: selectedAddr,
        customer_name: customerName.trim() || user.full_name || 'Customer',
        customer_phone: customerPhone.trim() || selectedAddr.phone,
        payment_method: paymentMethod,
        coupon_code: cart.couponCode,
        delivery_notes: deliveryNotes.trim() || undefined,
      };

      const placed = await marketplaceService.placeDeliveryOrder(orderPayload);
      clearCart();

      // Immediately navigate to Orders page to show the latest order
      router.replace('/(marketplace)/orders');
    } catch (e: any) {
      Alert.alert('Order Failed', e.message || 'Could not complete order.');
    } finally {
      setPlacingOrder(false);
    }
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={customerColors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ fontSize: 18, color: '#0F172A' }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Delivery & Payment</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Authentication Notice if Guest */}
        {!user && (
          <View style={styles.loginBanner}>
            <Text style={{ fontSize: 20 }}>🔐</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.loginBannerTitle}>Account Login Required</Text>
              <Text style={styles.loginBannerSub}>
                Please log in to save addresses and track your live deliveries.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.loginBtnSmall}
              onPress={() => router.push('/(auth)/login')}
            >
              <Text style={styles.loginBtnSmallText}>Log In</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Delivery Address Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📍 Delivery Address</Text>
            {user && (
              <TouchableOpacity onPress={() => setAddModalVisible(true)}>
                <Text style={styles.linkText}>+ Add New</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingAddresses ? (
            <ActivityIndicator size="small" color={customerColors.primary} />
          ) : addresses.length === 0 ? (
            <View style={styles.noAddressBox}>
              <Text style={styles.noAddressText}>No saved delivery addresses found.</Text>
              <TouchableOpacity
                style={styles.addAddrBtn}
                onPress={() => setAddModalVisible(true)}
              >
                <Text style={styles.addAddrBtnText}>+ Add Delivery Address</Text>
              </TouchableOpacity>
            </View>
          ) : (
            addresses.map((addr) => {
              const isSelected = addr.id === selectedAddressId;
              return (
                <TouchableOpacity
                  key={addr.id}
                  style={[styles.addrOption, isSelected && styles.addrOptionSelected]}
                  onPress={() => setSelectedAddressId(addr.id)}
                >
                  <View style={styles.radioCircle}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.addrLabel}>{addr.label.toUpperCase()}</Text>
                      <Text style={styles.addrName}>• {addr.full_name}</Text>
                    </View>
                    <Text style={styles.addrLine}>
                      {addr.address_line1}
                      {addr.landmark ? `, Near ${addr.landmark}` : ''}
                    </Text>
                    <Text style={styles.addrCity}>
                      {addr.city}, {addr.postal_code} • Phone: {addr.phone}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Contact Info */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>📞 Contact Details for Delivery</Text>
          <View style={styles.inputRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Full Name"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.inputLabel}>Phone *</Text>
              <TextInput
                style={styles.input}
                value={customerPhone}
                onChangeText={setCustomerPhone}
                placeholder="+91 98765 43210"
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <Text style={[styles.inputLabel, { marginTop: 10 }]}>Delivery Instructions</Text>
          <TextInput
            style={styles.input}
            value={deliveryNotes}
            onChangeText={setDeliveryNotes}
            placeholder="e.g. Leave at door, call on arrival, extra spicy..."
          />
        </View>

        {/* Order & Coupon Summary Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🧾 Order & Price Summary</Text>

          <View style={styles.summaryItemRow}>
            <Text style={styles.summaryLabel}>Subtotal ({cart.items.length} items)</Text>
            <Text style={styles.summaryValue}>₹{cart.subtotal}</Text>
          </View>

          {cart.couponCode && cart.discount > 0 ? (
            <View style={[styles.summaryItemRow, { backgroundColor: '#ECFDF5', padding: 8, borderRadius: 8, marginVertical: 4 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryLabel, { color: '#065F46', fontWeight: '700' }]}>
                  🏷️ Coupon ({cart.couponCode})
                </Text>
                <Text style={{ fontSize: 11, color: '#059669' }}>Discount applied</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.summaryValue, { color: '#065F46', fontWeight: '800' }]}>
                  -₹{cart.discount}
                </Text>
                <TouchableOpacity onPress={removeCoupon}>
                  <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700', marginTop: 2 }}>✕ Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.summaryItemRow}>
            <Text style={styles.summaryLabel}>Taxes & GST (5%)</Text>
            <Text style={styles.summaryValue}>₹{Math.round(cart.taxTotal)}</Text>
          </View>

          <View style={styles.summaryItemRow}>
            <Text style={styles.summaryLabel}>Delivery Fee</Text>
            <Text style={[styles.summaryValue, { color: '#16A34A', fontWeight: '700' }]}>FREE</Text>
          </View>

          <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 }} />

          <View style={styles.summaryItemRow}>
            <Text style={[styles.summaryLabel, { fontSize: 15, fontWeight: '800', color: '#0F172A' }]}>
              Final Payable Amount
            </Text>
            <Text style={[styles.summaryValue, { fontSize: 16, fontWeight: '900', color: '#0F172A' }]}>
              ₹{cart.payableAmount}
            </Text>
          </View>
        </View>

        {/* Payment Method Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>💳 Payment Method</Text>

          {/* Cash on Delivery (COD) Option */}
          <TouchableOpacity
            style={[styles.payOption, paymentMethod === 'cod' && styles.payOptionSelected]}
            onPress={() => setPaymentMethod('cod')}
          >
            <View style={styles.radioCircle}>
              {paymentMethod === 'cod' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payTitle}>💵 Cash on Delivery (COD)</Text>
              <Text style={styles.paySub}>Pay cash or UPI directly to delivery agent on arrival</Text>
            </View>
            <View style={styles.badgeActive}>
              <Text style={styles.badgeTextActive}>RECOMMENDED</Text>
            </View>
          </TouchableOpacity>

          {/* Online Payment (Phase 6 placeholder) */}
          <TouchableOpacity
            style={[styles.payOption, paymentMethod === 'online' && styles.payOptionSelected]}
            onPress={() => setPaymentMethod('online')}
          >
            <View style={styles.radioCircle}>
              {paymentMethod === 'online' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payTitle}>💳 Online Payment (UPI / Cards / NetBanking)</Text>
              <Text style={styles.paySub}>
                Gateway integration scheduled for Phase 6 (creates pending payment order)
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Place Order Bar */}
      <View style={styles.footerBar}>
        <View>
          <Text style={styles.footerSubLabel}>TOTAL AMOUNT</Text>
          <Text style={styles.footerAmount}>₹{cart.payableAmount}</Text>
        </View>

        <TouchableOpacity
          style={[styles.placeOrderBtn, placingOrder && styles.placeOrderBtnDisabled]}
          onPress={handlePlaceOrder}
          disabled={placingOrder}
        >
          {placingOrder ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.placeOrderBtnText}>Place Order Now ✓</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Add Address Modal */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Delivery Address</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.label}>Address Label</Text>
              <View style={styles.labelPicker}>
                {['Home', 'Work', 'Other'].map((l) => (
                  <TouchableOpacity
                    key={l}
                    style={[styles.labelChip, newLabel === l && styles.labelChipActive]}
                    onPress={() => setNewLabel(l)}
                  >
                    <Text
                      style={[
                        styles.labelChipText,
                        newLabel === l && styles.labelChipTextActive,
                      ]}
                    >
                      {l}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={newFullName}
                onChangeText={setNewFullName}
                placeholder="Receiver name"
              />

              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={newPhone}
                onChangeText={setNewPhone}
                placeholder="10-digit mobile number"
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Flat / House No. / Street Address *</Text>
              <TextInput
                style={styles.input}
                value={newLine1}
                onChangeText={setNewLine1}
                placeholder="e.g. Flat 302, Palm Heights, Link Road"
              />

              <Text style={styles.label}>Landmark (Optional)</Text>
              <TextInput
                style={styles.input}
                value={newLandmark}
                onChangeText={setNewLandmark}
                placeholder="e.g. Near City Hospital"
              />

              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>City *</Text>
                  <TextInput style={styles.input} value={newCity} onChangeText={setNewCity} />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.label}>PIN Code *</Text>
                  <TextInput
                    style={styles.input}
                    value={newPostal}
                    onChangeText={setNewPostal}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveNewAddress}
                disabled={savingAddr}
              >
                {savingAddr ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Address</Text>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 30,
  },
  loginBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  loginBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
  },
  loginBannerSub: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 2,
  },
  loginBtnSmall: {
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  loginBtnSmallText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.primary,
  },
  noAddressBox: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 10,
  },
  noAddressText: {
    fontSize: 13,
    color: customerColors.textSecondary,
  },
  addAddrBtn: {
    backgroundColor: customerColors.primaryBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addAddrBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.primary,
  },
  addrOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 8,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  addrOptionSelected: {
    borderColor: customerColors.primary,
    backgroundColor: customerColors.primaryBg,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: customerColors.primary,
  },
  addrLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: customerColors.primary,
  },
  addrName: {
    fontSize: 13,
    fontWeight: '600',
    color: customerColors.text,
  },
  addrLine: {
    fontSize: 13,
    color: customerColors.text,
    marginTop: 2,
  },
  addrCity: {
    fontSize: 11,
    color: customerColors.textSecondary,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: customerColors.textSecondary,
    marginBottom: 4,
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
  payOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 8,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  payOptionSelected: {
    borderColor: customerColors.primary,
    backgroundColor: customerColors.primaryBg,
  },
  payTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.text,
  },
  paySub: {
    fontSize: 11,
    color: customerColors.textSecondary,
    marginTop: 2,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeTextActive: {
    color: '#15803D',
    fontSize: 9,
    fontWeight: '800',
  },
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  footerSubLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: customerColors.textSecondary,
  },
  footerAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.text,
  },
  placeOrderBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  placeOrderBtnDisabled: {
    opacity: 0.6,
  },
  placeOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
    color: '#0F172A',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
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
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  modalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: customerColors.primary,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#475569',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
});
