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
  Image,
  Platform,
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useCustomerCart } from '../../src/context/CustomerCartContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { storageService } from '../../src/services/api/storageService';
import { CustomerAddress } from '../../src/types';
import { customerColors } from '../../src/utils/colors';
import { isValidPhoneNumber, normalizePhoneNumber } from '../../src/utils/phone';
import { isValidIndianPhone, normalizeIndianPhone, getIndianPhoneValidationError } from '../../src/utils/validation';
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

  // Online Payment & Proof State
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [sampleModalVisible, setSampleModalVisible] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  // Sync payment method if restaurant has COD disabled
  useEffect(() => {
    if (cart.enable_cod === false && paymentMethod === 'cod') {
      setPaymentMethod('online');
    }
  }, [cart.enable_cod]);

  const handleCopyUpi = async (upiStr: string) => {
    if (!upiStr) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(upiStr);
        } else if (typeof document !== 'undefined') {
          const textArea = document.createElement('textarea');
          textArea.value = upiStr;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
      }
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2500);
    } catch (e) {
      console.warn('Clipboard copy error:', e);
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2500);
    }
  };

  const handleUploadPaymentProof = async () => {
    try {
      setUploadingProof(true);
      setProofError(null);
      const res = await storageService.pickAndUploadPaymentProof({
        restaurantId: cart.restaurantId || undefined,
        customerId: user?.id,
      });
      if (res && res.url) {
        setPaymentProofUrl(res.url);
        setProofError(null);
      }
    } catch (e: any) {
      setProofError(e.message || 'Failed to upload payment screenshot.');
      Alert.alert('Upload Failed', e.message || 'Could not upload payment screenshot.');
    } finally {
      setUploadingProof(false);
    }
  };

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
  const [newAddrErrors, setNewAddrErrors] = useState<{
    fullName?: string;
    phone?: string;
    line1?: string;
    city?: string;
    postal?: string;
  }>({});

  useEffect(() => {
    if (user) {
      setCustomerName(user.full_name || '');
      setCustomerPhone(user.phone || '');
      setNewFullName(user.full_name || '');
      setNewPhone(user.phone || '');
      loadAddresses();
    }
  }, [user]);

  const openAddAddressModal = () => {
    setNewLabel('Home');
    setNewFullName(user?.full_name || '');
    setNewPhone(user?.phone || '');
    setNewLine1('');
    setNewLandmark('');
    setNewCity('Mumbai');
    setNewState('Maharashtra');
    setNewPostal('400001');
    setNewAddrErrors({});
    setAddModalVisible(true);
  };

  const validateNewAddress = () => {
    const errors: {
      fullName?: string;
      phone?: string;
      line1?: string;
      city?: string;
      postal?: string;
    } = {};

    if (!newFullName.trim()) {
      errors.fullName = 'Full Name is required';
    } else if (newFullName.trim().length < 2) {
      errors.fullName = 'Please enter a valid full name';
    }

    if (!newPhone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!isValidIndianPhone(newPhone.trim())) {
      errors.phone = 'Enter a valid 10-digit Indian mobile number';
    }

    if (!newLine1.trim()) {
      errors.line1 = 'Street address is required';
    } else if (newLine1.trim().length < 3) {
      errors.line1 = 'Please enter a detailed street address';
    }

    if (!newCity.trim()) {
      errors.city = 'City is required';
    }

    if (!newPostal.trim()) {
      errors.postal = 'PIN code is required';
    } else if (!/^\d{6}$/.test(newPostal.trim())) {
      errors.postal = 'Please enter a valid 6-digit PIN code';
    }

    setNewAddrErrors(errors);
    return Object.keys(errors).length === 0;
  };

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
    if (!validateNewAddress()) {
      return;
    }

    setSavingAddr(true);
    try {
      const created = await marketplaceService.createCustomerAddress({
        label: newLabel,
        full_name: newFullName.trim(),
        phone: normalizeIndianPhone(newPhone.trim()),
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

    const rawTargetPhone = customerPhone.trim() || selectedAddr.phone;
    if (!rawTargetPhone || !isValidIndianPhone(rawTargetPhone)) {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
      Alert.alert('Invalid Phone Number', 'Please provide a valid 10-digit Indian mobile number for order delivery updates.');
      return;
    }
    const cleanTargetPhone = normalizeIndianPhone(rawTargetPhone);

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

    // Enforce payment proof if online payment is selected
    if (paymentMethod === 'online' && !paymentProofUrl) {
      isSubmittingRef.current = false;
      setPlacingOrder(false);
      setProofError('Payment screenshot is required for online payments. Please upload proof before placing order.');
      Alert.alert(
        'Payment Screenshot Required',
        'Please upload your payment screenshot/receipt before placing your order.'
      );
      return;
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
        customer_phone: cleanTargetPhone,
        payment_method: paymentMethod,
        payment_proof_url: paymentMethod === 'online' ? (paymentProofUrl || undefined) : undefined,
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
                    <TouchableOpacity onPress={openAddAddressModal} activeOpacity={0.7}>
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
                      onPress={openAddAddressModal}
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

              {/* Contact Information */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>📞 Contact Information</Text>
                <Text style={styles.label}>Receiver Name *</Text>
                <TextInput
                  style={styles.input}
                  value={customerName}
                  onChangeText={setCustomerName}
                  placeholder="Your full name"
                />

                <Text style={styles.label}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={customerPhone}
                  onChangeText={(v) => setCustomerPhone(v.replace(/[^\d+]/g, ''))}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#64748b"
                  keyboardType="phone-pad"
                  maxLength={13}
                />
                {Boolean(customerPhone && !isValidIndianPhone(customerPhone)) && (
                  <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700', marginTop: 3 }}>
                    ⚠️ Enter a valid 10-digit Indian mobile number
                  </Text>
                )}
              </View>

              {/* Delivery Instructions (Optional) */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>📝 Delivery Instructions (Optional)</Text>
                <TextInput
                  style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                  value={deliveryNotes}
                  onChangeText={setDeliveryNotes}
                  placeholder="e.g. Leave at door, call when arrived..."
                  multiline
                />
              </View>

              {/* Payment Method Section */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>💳 Payment Method</Text>

                {/* Cash on Delivery (COD) Option - only shown if restaurant enabled COD */}
                {cart.enable_cod !== false ? (
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
                      <Text style={styles.paySub}>Pay cash or scan on delivery directly to rider</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.codDisabledNotice}>
                    <Text style={styles.codDisabledText}>ℹ️ Cash on Delivery is currently unavailable for this restaurant.</Text>
                  </View>
                )}

                {/* Online Payment (UPI / QR / Screenshot Verification) */}
                <TouchableOpacity
                  style={[styles.payOption, paymentMethod === 'online' && styles.payOptionSelected]}
                  onPress={() => setPaymentMethod('online')}
                  activeOpacity={0.8}
                >
                  <View style={styles.radioCircle}>
                    {paymentMethod === 'online' && <View style={styles.radioInner} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payTitle}>📱 Pay via UPI / QR Code</Text>
                    <Text style={styles.paySub}>
                      Scan QR, pay via UPI, and upload payment screenshot proof
                    </Text>
                  </View>
                  <View style={styles.badgeOnline}>
                    <Text style={styles.badgeTextOnline}>DIRECT UPI</Text>
                  </View>
                </TouchableOpacity>

                {/* Online Payment Details Container (Visible only when Online Payment is selected) */}
                {paymentMethod === 'online' && (
                  <View style={styles.onlineDetailsContainer}>
                    <View style={styles.onlineNoticeHeader}>
                      <Text style={styles.onlineNoticeTitle}>📲 Complete Your UPI Payment</Text>
                      <Text style={styles.onlineNoticeSub}>
                        Pay the exact order amount (₹{formatPrice(cart.payableAmount)}) and attach the screenshot below.
                      </Text>
                    </View>

                    {/* QR Code and UPI ID Row */}
                    <View style={styles.qrUpiWrapper}>
                      {cart.delivery_payment_qr_url ? (
                        <View style={styles.qrCodeBox}>
                          <TouchableOpacity
                            onPress={() => setQrModalVisible(true)}
                            activeOpacity={0.85}
                            style={styles.qrTouchable}
                          >
                            <Image
                              source={{ uri: cart.delivery_payment_qr_url }}
                              style={styles.qrImage}
                              resizeMode="contain"
                            />
                            <Text style={styles.qrTapHint}>🔍 Tap to view full screen</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.noQrPlaceholder}>
                          <Text style={{ fontSize: 24 }}>📱</Text>
                          <Text style={styles.noQrText}>Scan restaurant QR or use UPI ID</Text>
                        </View>
                      )}

                      <View style={styles.upiInfoBox}>
                        {cart.delivery_upi_id ? (
                          <View style={styles.upiIdCard}>
                            <Text style={styles.upiIdLabel}>RESTAURANT UPI ID</Text>
                            <Text style={styles.upiIdValue} numberOfLines={1} selectable>
                              {cart.delivery_upi_id}
                            </Text>
                            <TouchableOpacity
                              style={[styles.copyUpiBtn, copiedUpi && styles.copyUpiBtnSuccess]}
                              onPress={() => handleCopyUpi(cart.delivery_upi_id || '')}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.copyUpiBtnText, copiedUpi && styles.copyUpiBtnTextSuccess]}>
                                {copiedUpi ? '✓ Copied!' : '📋 Copy UPI ID'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}

                        {cart.delivery_sample_screenshot_url ? (
                          <TouchableOpacity
                            style={styles.samplePreviewBtn}
                            onPress={() => setSampleModalVisible(true)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.samplePreviewBtnText}>🖼️ View Sample Screenshot</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>

                    {/* Customer Payment Proof Upload Box */}
                    <View style={styles.proofUploadCard}>
                      <View style={styles.proofHeaderRow}>
                        <Text style={styles.proofTitle}>
                          📷 Upload Payment Screenshot <Text style={styles.requiredStar}>*</Text>
                        </Text>
                        {paymentProofUrl ? (
                          <View style={styles.proofVerifiedBadge}>
                            <Text style={styles.proofVerifiedText}>✓ Attached</Text>
                          </View>
                        ) : (
                          <View style={styles.proofRequiredBadge}>
                            <Text style={styles.proofRequiredText}>Mandatory</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.proofDesc}>
                        After completing payment in GPay, PhonePe, Paytm, etc., upload the transaction receipt screenshot.
                      </Text>

                      {paymentProofUrl ? (
                        <View style={styles.uploadedProofContainer}>
                          <Image
                            source={{ uri: paymentProofUrl }}
                            style={styles.uploadedProofThumbnail}
                            resizeMode="cover"
                          />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.uploadedProofLabel}>Payment Proof Attached</Text>
                            <Text style={styles.uploadedProofSub}>Ready for restaurant verification</Text>
                            <TouchableOpacity
                              style={styles.changeProofBtn}
                              onPress={handleUploadPaymentProof}
                              disabled={uploadingProof}
                              activeOpacity={0.8}
                            >
                              {uploadingProof ? (
                                <ActivityIndicator size="small" color={customerColors.primary} />
                              ) : (
                                <Text style={styles.changeProofBtnText}>🔄 Replace Screenshot</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[styles.uploadProofBtn, proofError ? styles.uploadProofBtnError : null]}
                          onPress={handleUploadPaymentProof}
                          disabled={uploadingProof}
                          activeOpacity={0.8}
                        >
                          {uploadingProof ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <ActivityIndicator size="small" color="#FFFFFF" />
                              <Text style={styles.uploadProofBtnText}>Uploading Screenshot...</Text>
                            </View>
                          ) : (
                            <View style={{ alignItems: 'center', gap: 4 }}>
                              <Text style={{ fontSize: 20 }}>📤</Text>
                              <Text style={styles.uploadProofBtnText}>Select & Upload Payment Screenshot</Text>
                              <Text style={styles.uploadProofBtnSub}>Supports JPG, PNG, WebP (Max 5MB)</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      )}

                      {proofError ? (
                        <Text style={styles.proofErrorText}>⚠️ {proofError}</Text>
                      ) : null}
                    </View>
                  </View>
                )}
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

                {/* Authoritative Delivery Fee Display */}
                <View style={styles.summaryItemRow}>
                  <View>
                    <Text style={styles.summaryLabel}>Delivery Fee</Text>
                    {cart.free_delivery_above && cart.free_delivery_above > 0 ? (
                      cart.deliveryFee === 0 ? (
                        <Text style={styles.freeDeliveryApplied}>🎉 Free above ₹{formatPrice(cart.free_delivery_above)}</Text>
                      ) : (
                        <Text style={styles.freeDeliveryHint}>
                          Add ₹{formatPrice(Math.max(0, cart.free_delivery_above - cart.subtotal))} for FREE delivery
                        </Text>
                      )
                    ) : null}
                  </View>
                  <Text style={[styles.summaryValue, cart.deliveryFee === 0 && { color: '#16A34A', fontWeight: '800' }]}>
                    {cart.deliveryFee === 0 ? 'FREE' : `₹${formatPrice(cart.deliveryFee)}`}
                  </Text>
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
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Delivery Address</Text>
                <TouchableOpacity
                  onPress={() => setAddModalVisible(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{ fontSize: 18, color: '#64748B', fontWeight: '700' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
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

                <View style={styles.labelHeaderRow}>
                  <Text style={styles.label}>
                    Full Name <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  {newAddrErrors.fullName ? (
                    <Text style={styles.requiredBadge}>Required</Text>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.input, Boolean(newAddrErrors.fullName) && styles.inputError]}
                  value={newFullName}
                  onChangeText={(v) => {
                    setNewFullName(v);
                    if (newAddrErrors.fullName) setNewAddrErrors((prev) => ({ ...prev, fullName: undefined }));
                  }}
                  placeholder="Receiver name"
                  placeholderTextColor="#94A3B8"
                />
                {Boolean(newAddrErrors.fullName) && (
                  <Text style={styles.fieldErrorText}>⚠️ {newAddrErrors.fullName}</Text>
                )}

                <View style={styles.labelHeaderRow}>
                  <Text style={styles.label}>
                    Phone Number <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  {newAddrErrors.phone ? (
                    <Text style={styles.requiredBadge}>Required</Text>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.input, Boolean(newAddrErrors.phone) && styles.inputError]}
                  value={newPhone}
                  onChangeText={(v) => {
                    const cleaned = v.replace(/[^\d+]/g, '');
                    setNewPhone(cleaned);
                    if (newAddrErrors.phone) setNewAddrErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  maxLength={13}
                />
                {Boolean(newAddrErrors.phone) ? (
                  <Text style={styles.fieldErrorText}>⚠️ {newAddrErrors.phone}</Text>
                ) : Boolean(newPhone && !isValidIndianPhone(newPhone)) ? (
                  <Text style={styles.fieldErrorText}>
                    ⚠️ Enter a valid 10-digit Indian mobile number
                  </Text>
                ) : null}

                <View style={styles.labelHeaderRow}>
                  <Text style={styles.label}>
                    Flat / House / Street Address <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  {newAddrErrors.line1 ? (
                    <Text style={styles.requiredBadge}>Required</Text>
                  ) : null}
                </View>
                <TextInput
                  style={[styles.input, Boolean(newAddrErrors.line1) && styles.inputError]}
                  value={newLine1}
                  onChangeText={(v) => {
                    setNewLine1(v);
                    if (newAddrErrors.line1) setNewAddrErrors((prev) => ({ ...prev, line1: undefined }));
                  }}
                  placeholder="e.g. Flat 302, Palm Heights, Link Road"
                  placeholderTextColor="#94A3B8"
                />
                {Boolean(newAddrErrors.line1) && (
                  <Text style={styles.fieldErrorText}>⚠️ {newAddrErrors.line1}</Text>
                )}

                <Text style={styles.label}>Landmark (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newLandmark}
                  onChangeText={setNewLandmark}
                  placeholder="e.g. Near City Hospital"
                  placeholderTextColor="#94A3B8"
                />

                <View style={styles.inputRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.labelHeaderRow}>
                      <Text style={styles.label}>
                        City <Text style={styles.requiredStar}>*</Text>
                      </Text>
                      {newAddrErrors.city ? <Text style={styles.requiredBadge}>Required</Text> : null}
                    </View>
                    <TextInput
                      style={[styles.input, Boolean(newAddrErrors.city) && styles.inputError]}
                      value={newCity}
                      onChangeText={(v) => {
                        setNewCity(v);
                        if (newAddrErrors.city) setNewAddrErrors((prev) => ({ ...prev, city: undefined }));
                      }}
                      placeholder="e.g. Mumbai"
                      placeholderTextColor="#94A3B8"
                    />
                    {Boolean(newAddrErrors.city) && (
                      <Text style={styles.fieldErrorText}>⚠️ {newAddrErrors.city}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <View style={styles.labelHeaderRow}>
                      <Text style={styles.label}>
                        PIN Code <Text style={styles.requiredStar}>*</Text>
                      </Text>
                      {newAddrErrors.postal ? <Text style={styles.requiredBadge}>Required</Text> : null}
                    </View>
                    <TextInput
                      style={[styles.input, Boolean(newAddrErrors.postal) && styles.inputError]}
                      value={newPostal}
                      onChangeText={(v) => {
                        const cleaned = v.replace(/\D/g, '').slice(0, 6);
                        setNewPostal(cleaned);
                        if (newAddrErrors.postal) setNewAddrErrors((prev) => ({ ...prev, postal: undefined }));
                      }}
                      keyboardType="numeric"
                      maxLength={6}
                      placeholder="6-digit PIN"
                      placeholderTextColor="#94A3B8"
                    />
                    {Boolean(newAddrErrors.postal) && (
                      <Text style={styles.fieldErrorText}>⚠️ {newAddrErrors.postal}</Text>
                    )}
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
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* QR Code Zoom Modal */}
      <Modal visible={qrModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'center', maxWidth: 380 }]}>
            <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>Scan QR Code</Text>
              <TouchableOpacity onPress={() => setQrModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>
            {cart.delivery_payment_qr_url ? (
              <Image
                source={{ uri: cart.delivery_payment_qr_url }}
                style={{ width: 280, height: 280, borderRadius: 12, backgroundColor: '#F8FAFC' }}
                resizeMode="contain"
              />
            ) : null}
            {cart.delivery_upi_id ? (
              <View style={{ marginTop: 12, alignItems: 'center', width: '100%', gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                  UPI ID: {cart.delivery_upi_id}
                </Text>
                <TouchableOpacity
                  style={[styles.copyUpiBtn, copiedUpi && styles.copyUpiBtnSuccess, { paddingHorizontal: 16 }]}
                  onPress={() => handleCopyUpi(cart.delivery_upi_id || '')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.copyUpiBtnText, copiedUpi && styles.copyUpiBtnTextSuccess]}>
                    {copiedUpi ? '✓ Copied to Clipboard!' : '📋 Copy UPI ID'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.modalSaveBtn, { width: '100%', alignItems: 'center', marginTop: 16 }]}
              onPress={() => setQrModalVisible(false)}
            >
              <Text style={styles.modalSaveText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sample Payment Screenshot Preview Modal */}
      <Modal visible={sampleModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'center', maxWidth: 420 }]}>
            <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modalTitle}>Sample Payment Screenshot</Text>
              <TouchableOpacity onPress={() => setSampleModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 10, alignSelf: 'flex-start' }}>
              Reference screenshot of what a successful payment confirmation looks like:
            </Text>
            {cart.delivery_sample_screenshot_url ? (
              <Image
                source={{ uri: cart.delivery_sample_screenshot_url }}
                style={{ width: 320, height: 380, borderRadius: 12, backgroundColor: '#F8FAFC' }}
                resizeMode="contain"
              />
            ) : null}
            <TouchableOpacity
              style={[styles.modalSaveBtn, { width: '100%', alignItems: 'center', marginTop: 16 }]}
              onPress={() => setSampleModalVisible(false)}
            >
              <Text style={styles.modalSaveText}>Close Preview</Text>
            </TouchableOpacity>
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
  badgeOnline: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  badgeTextOnline: {
    color: '#1D4ED8',
    fontSize: 10,
    fontWeight: '800',
  },
  codDisabledNotice: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  codDisabledText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  onlineDetailsContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  onlineNoticeHeader: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  onlineNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  onlineNoticeSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 18,
  },
  qrUpiWrapper: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
    width: '100%',
  },
  qrCodeBox: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  qrTouchable: {
    alignItems: 'center',
    width: '100%',
  },
  qrImage: {
    width: 250,
    height: 250,
    maxWidth: '100%',
    borderRadius: 10,
  },
  qrTapHint: {
    fontSize: 12,
    fontWeight: '700',
    color: customerColors.primary,
    marginTop: 8,
  },
  noQrPlaceholder: {
    width: '100%',
    maxWidth: 320,
    height: 200,
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    alignSelf: 'center',
  },
  noQrText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  upiInfoBox: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    gap: 10,
  },
  upiIdCard: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  upiIdLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  upiIdValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    marginBottom: 8,
  },
  copyUpiBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  copyUpiBtnSuccess: {
    backgroundColor: '#DCFCE7',
  },
  copyUpiBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  copyUpiBtnTextSuccess: {
    color: '#15803D',
  },
  samplePreviewBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  samplePreviewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  proofUploadCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  proofHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  proofTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  proofVerifiedBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proofVerifiedText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '800',
  },
  proofRequiredBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proofRequiredText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '800',
  },
  proofDesc: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 16,
  },
  uploadedProofContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  uploadedProofThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  uploadedProofLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  uploadedProofSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    marginBottom: 4,
  },
  changeProofBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  changeProofBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: customerColors.primary,
  },
  uploadProofBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: customerColors.primary,
    borderRadius: 10,
    backgroundColor: customerColors.primaryBg,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadProofBtnError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  uploadProofBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: customerColors.primary,
  },
  uploadProofBtnSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  proofErrorText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
    marginTop: 6,
  },
  freeDeliveryApplied: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '700',
    marginTop: 2,
  },
  freeDeliveryHint: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '600',
    marginTop: 2,
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
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'web' ? 24 : 12,
  },
  keyboardAvoidingView: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '94%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxHeight: '100%',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexShrink: 0,
  },
  modalScroll: {
    flexShrink: 1,
  },
  modalScrollContent: {
    paddingBottom: 10,
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
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    flexShrink: 0,
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
