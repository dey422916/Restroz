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
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useCustomerCart } from '../../src/context/CustomerCartContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { CustomerAddress } from '../../src/types';
import { customerColors } from '../../src/utils/colors';
import { isValidPhoneNumber } from '../../src/utils/phone';
import { formatPrice } from '../../src/utils/currency';

export default function DeliveryCheckoutScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;
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
  const [minOrderValue, setMinOrderValue] = useState<number>(0);

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

  useEffect(() => {
    if (cart.restaurantId) {
      marketplaceService.getRestaurantPublicDetails(cart.restaurantId).then((details) => {
        if (details?.public_profile?.minimum_order_value) {
          setMinOrderValue(Number(details.public_profile.minimum_order_value) || 0);
        } else {
          setMinOrderValue(0);
        }
      }).catch(console.warn);
    }
  }, [cart.restaurantId]);

  const isBelowMinOrder = minOrderValue > 0 && cart.subtotal < minOrderValue;
  const remainingForMinOrder = isBelowMinOrder ? Math.max(0, minOrderValue - cart.subtotal) : 0;

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

    if (!isValidPhoneNumber(newPhone)) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid 10-digit mobile number for this address.');
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

  const isSubmittingRef = React.useRef(false);
  const hasSucceededRef = React.useRef(false);

  const handlePlaceOrder = async () => {
    if (isSubmittingRef.current || placingOrder || hasSucceededRef.current) return;
    isSubmittingRef.current = true;
    setPlacingOrder(true);

    if (!user) {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
      Alert.alert('Login Required', 'Please log in to place a delivery order.', [
        { text: 'Log In', onPress: () => router.push('/(auth)/login') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    if (!cart.restaurantId || cart.items.length === 0) {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
      Alert.alert('Empty Cart', 'Your cart is empty.');
      return;
    }

    const selectedAddr = addresses.find((a) => a.id === selectedAddressId);
    if (!selectedAddr) {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
      Alert.alert('Address Required', 'Please select or add a delivery address.');
      return;
    }

    const targetPhone = customerPhone.trim() || selectedAddr.phone;
    if (!targetPhone || !isValidPhoneNumber(targetPhone)) {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
      Alert.alert('Invalid Phone Number', 'Please provide a valid 10-digit mobile number for order delivery updates.');
      return;
    }

    // Verify minimum order value requirement
    if (minOrderValue > 0 && cart.subtotal < minOrderValue) {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
      const diff = minOrderValue - cart.subtotal;
      Alert.alert(
        'Minimum Order Value Required',
        `The minimum order amount for this restaurant is ₹${minOrderValue}. Please add items worth ₹${formatPrice(diff)} more to place your order.`
      );
      return;
    }

    // Verify restaurant is currently online before placing order
    try {
      const isRestOnline = await marketplaceService.getRestaurantOnlineStatus(cart.restaurantId);
      if (!isRestOnline) {
        isSubmittingRef.current = false;
        setPlacingOrder(false);
        Alert.alert(
          'Restaurant Offline',
          'Restaurant is currently closed for online orders. Please try again later.'
        );
        return;
      }
    } catch (onlineErr) {
      console.warn('Online status check error:', onlineErr);
    }

    try {
      const idempotencyKey = `idem-${user.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
        idempotency_key: idempotencyKey,
      };

      const placed = await marketplaceService.placeDeliveryOrder(orderPayload);
      hasSucceededRef.current = true;
      clearCart();
      removeCoupon();

      // Immediately navigate customer to My Orders page to view the placed order
      router.replace('/(marketplace)/orders');
    } catch (e: any) {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
      const errMsg = e.message || 'Could not complete order.';
      if (errMsg.toLowerCase().includes('minimum order') || errMsg.toLowerCase().includes('below the minimum')) {
        Alert.alert('Minimum Order Value Required', errMsg);
      } else {
        Alert.alert('Order Failed', errMsg);
      }
    } finally {
      if (!hasSucceededRef.current) {
        isSubmittingRef.current = false;
        setPlacingOrder(false);
      }
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
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageInner}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
              <Text style={{ fontSize: 18, color: '#0F172A' }}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.headerTitle}>Delivery & Payment</Text>
              <Text style={styles.headerSubtitle}>Complete your order details and delivery address</Text>
            </View>
          </View>

          {/* Desktop Dual-Column or Mobile Stack */}
          <View style={[styles.mainLayout, isDesktop && styles.mainLayoutDesktop]}>
            {/* Left Column: Delivery Address, Contact & Payment Mode */}
            <View style={[styles.leftColumn, isDesktop && styles.leftColumnDesktop]}>
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
                    activeOpacity={0.8}
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
                    <TouchableOpacity onPress={() => setAddModalVisible(true)} activeOpacity={0.7}>
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
                      activeOpacity={0.8}
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
                        activeOpacity={0.8}
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
                      onChangeText={(v) => setCustomerPhone(v.replace(/[^\d+]/g, ''))}
                      placeholder="10-digit mobile number"
                      placeholderTextColor="#64748b"
                      keyboardType="phone-pad"
                      maxLength={13}
                    />
                    {Boolean(customerPhone && !isValidPhoneNumber(customerPhone)) && (
                      <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700', marginTop: 3 }}>
                        ⚠️ Invalid mobile number
                      </Text>
                    )}
                  </View>
                </View>

                <Text style={[styles.inputLabel, { marginTop: 12 }]}>Delivery Instructions</Text>
                <TextInput
                  style={styles.input}
                  value={deliveryNotes}
                  onChangeText={setDeliveryNotes}
                  placeholder="e.g. Leave at door, call on arrival, extra spicy..."
                />
              </View>

              {/* Payment Method Section */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>💳 Payment Method</Text>

                {/* Cash on Delivery (COD) Option */}
                <TouchableOpacity
                  style={[styles.payOption, paymentMethod === 'cod' && styles.payOptionSelected]}
                  onPress={() => setPaymentMethod('cod')}
                  activeOpacity={0.8}
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
                  activeOpacity={0.8}
                >
                  <View style={styles.radioCircle}>
                    {paymentMethod === 'online' && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payTitle}>💳 Online Payment (UPI / Cards / NetBanking)</Text>
                    <Text style={styles.paySub}>
                      Online gateway integration (creates confirmed pending payment order)
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Right Column: Order Summary & Place Order */}
            <View style={[styles.rightColumn, isDesktop && styles.rightColumnDesktop]}>
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>🧾 Order & Price Summary</Text>

                {isBelowMinOrder && (
                  <View style={styles.minOrderCard}>
                    <View style={styles.minOrderCardHeader}>
                      <Text style={{ fontSize: 15 }}>⚠️</Text>
                      <Text style={styles.minOrderCardTitle}>
                        Minimum Order: ₹{minOrderValue}
                      </Text>
                    </View>
                    <Text style={styles.minOrderCardSub}>
                      Your order subtotal is ₹{formatPrice(cart.subtotal)}. Add items worth{' '}
                      <Text style={styles.minOrderCardHighlight}>₹{formatPrice(remainingForMinOrder)}</Text>{' '}
                      more to place this order.
                    </Text>
                  </View>
                )}

                <View style={styles.summaryItemRow}>
                  <Text style={styles.summaryLabel}>Item Subtotal ({cart.items.length} items)</Text>
                  <Text style={styles.summaryValue}>₹{formatPrice(cart.subtotal)}</Text>
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
                        -₹{formatPrice(cart.discount)}
                      </Text>
                      <TouchableOpacity onPress={removeCoupon}>
                        <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700', marginTop: 2 }}>✕ Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {cart.discount > 0 && (
                  <View style={styles.summaryItemRow}>
                    <Text style={styles.summaryLabel}>Taxable Amount</Text>
                    <Text style={styles.summaryValue}>₹{formatPrice(cart.taxableAmount)}</Text>
                  </View>
                )}

                {cart.isGstEnabled && (cart.cgst > 0 || cart.sgst > 0) ? (
                  <>
                    <View style={styles.summaryItemRow}>
                      <Text style={styles.summaryLabel}>CGST ({((cart.taxRate || 5) / 2).toFixed(1)}%)</Text>
                      <Text style={styles.summaryValue}>₹{formatPrice(cart.cgst)}</Text>
                    </View>

                    <View style={styles.summaryItemRow}>
                      <Text style={styles.summaryLabel}>SGST ({((cart.taxRate || 5) / 2).toFixed(1)}%)</Text>
                      <Text style={styles.summaryValue}>₹{formatPrice(cart.sgst)}</Text>
                    </View>
                  </>
                ) : null}

                <View style={styles.summaryItemRow}>
                  <Text style={styles.summaryLabel}>Delivery Fee</Text>
                  <Text style={[styles.summaryValue, { color: '#16A34A', fontWeight: '800' }]}>FREE</Text>
                </View>

                <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 12 }} />

                <View style={styles.summaryItemRow}>
                  <Text style={[styles.summaryLabel, { fontSize: 16, fontWeight: '800', color: '#0F172A' }]}>
                    Grand Total
                  </Text>
                  <Text style={[styles.summaryValue, { fontSize: 20, fontWeight: '900', color: customerColors.primary }]}>
                    ₹{formatPrice(cart.payableAmount)}
                  </Text>
                </View>

                {/* Desktop Place Order Button */}
                {isDesktop && (
                  <TouchableOpacity
                    style={[
                      styles.desktopPlaceOrderBtn,
                      isBelowMinOrder && styles.placeOrderBtnWarning,
                      (placingOrder || hasSucceededRef.current) && styles.placeOrderBtnDisabled,
                    ]}
                    onPress={handlePlaceOrder}
                    disabled={placingOrder || hasSucceededRef.current}
                    activeOpacity={0.85}
                  >
                    {placingOrder ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.desktopPlaceOrderBtnText}>
                        {isBelowMinOrder ? `Min Order ₹${minOrderValue}` : 'Place Order Now ✓'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Mobile Place Order Bar (hidden on desktop) */}
      {!isDesktop && (
        <View style={styles.footerBar}>
          <View>
            <Text style={styles.footerSubLabel}>TOTAL AMOUNT</Text>
            <Text style={styles.footerAmount}>₹{formatPrice(cart.payableAmount)}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.placeOrderBtn,
              isBelowMinOrder && styles.placeOrderBtnWarning,
              (placingOrder || hasSucceededRef.current) && styles.placeOrderBtnDisabled,
            ]}
            onPress={handlePlaceOrder}
            disabled={placingOrder || hasSucceededRef.current}
            activeOpacity={0.85}
          >
            {placingOrder ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.placeOrderBtnText}>
                {isBelowMinOrder ? `Min Order ₹${minOrderValue}` : 'Place Order Now ✓'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

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
                onChangeText={(v) => setNewPhone(v.replace(/[^\d+]/g, ''))}
                placeholder="10-digit mobile number"
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
                maxLength={13}
              />
              {Boolean(newPhone && !isValidPhoneNumber(newPhone)) && (
                <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700', marginTop: 3 }}>
                  ⚠️ Invalid mobile number
                </Text>
              )}

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
  pageInner: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
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
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
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
    marginTop: 2,
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  mainLayout: {
    flexDirection: 'column',
    gap: 16,
  },
  mainLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  leftColumn: {
    width: '100%',
  },
  leftColumnDesktop: {
    flex: 1,
  },
  rightColumn: {
    width: '100%',
  },
  rightColumnDesktop: {
    width: 380,
    flexShrink: 0,
  },
  loginBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  loginBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  loginBannerSub: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 2,
  },
  loginBtnSmall: {
    backgroundColor: '#D97706',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  loginBtnSmallText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: customerColors.text,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.primary,
  },
  noAddressBox: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 12,
  },
  noAddressText: {
    fontSize: 13,
    color: customerColors.textSecondary,
  },
  addAddrBtn: {
    backgroundColor: customerColors.primaryBg,
    paddingHorizontal: 16,
    paddingVertical: 9,
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
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  addrOptionSelected: {
    borderColor: customerColors.primary,
    backgroundColor: customerColors.primaryBg,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: customerColors.primary,
  },
  addrLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: customerColors.primary,
  },
  addrName: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.text,
  },
  addrLine: {
    fontSize: 13,
    color: '#334155',
    marginTop: 3,
  },
  addrCity: {
    fontSize: 12,
    color: customerColors.textSecondary,
    marginTop: 2,
  },
  inputRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: customerColors.text,
    backgroundColor: '#F8FAFC',
  },
  payOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  payOptionSelected: {
    borderColor: customerColors.primary,
    backgroundColor: customerColors.primaryBg,
  },
  payTitle: {
    fontSize: 14,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeTextActive: {
    color: '#15803D',
    fontSize: 10,
    fontWeight: '800',
  },
  desktopPlaceOrderBtn: {
    backgroundColor: customerColors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: customerColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  desktopPlaceOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
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
  placeOrderBtnWarning: {
    backgroundColor: '#EA580C',
  },
  placeOrderBtnDisabled: {
    opacity: 0.6,
  },
  placeOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  minOrderCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  minOrderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  minOrderCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },
  minOrderCardSub: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 18,
  },
  minOrderCardHighlight: {
    fontWeight: '800',
    color: '#B45309',
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
    marginBottom: 10,
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
