import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCustomerCart } from '../../src/context/CustomerCartContext';
import { couponService } from '../../src/services/api/couponService';
import { Coupon } from '../../src/types';
import { customerColors } from '../../src/utils/colors';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { formatPrice } from '../../src/utils/currency';

export default function CustomerCartScreen() {
  const router = useRouter();
  const { cart, updateQuantity, clearCart, applyCoupon, removeCoupon } = useCustomerCart();
  const [couponInput, setCouponInput] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponValidationMsg, setCouponValidationMsg] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  const [minOrderValue, setMinOrderValue] = useState<number>(0);

  useEffect(() => {
    if (cart.restaurantId) {
      couponService.getValidMarketplaceCoupons(cart.restaurantId).then(setAvailableCoupons);
      marketplaceService.getRestaurantPublicDetails(cart.restaurantId).then((details) => {
        if (details?.public_profile?.minimum_order_value) {
          setMinOrderValue(Number(details.public_profile.minimum_order_value) || 0);
        } else {
          setMinOrderValue(0);
        }
      }).catch(console.warn);
    }
  }, [cart.restaurantId]);

  useEffect(() => {
    if (!cart.couponCode) {
      setCouponValidationMsg(null);
    }
  }, [cart.couponCode]);

  const isBelowMinOrder = minOrderValue > 0 && cart.subtotal < minOrderValue;
  const remainingForMinOrder = isBelowMinOrder ? Math.max(0, minOrderValue - cart.subtotal) : 0;

  const handleRemoveCoupon = () => {
    removeCoupon();
    setCouponValidationMsg(null);
    setCouponInput('');
  };

  if (!cart.restaurantId || cart.items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Text style={{ fontSize: 44 }}>🛍️</Text>
        </View>
        <Text style={styles.emptyTitle}>Your Cart is Empty</Text>
        <Text style={styles.emptySub}>
          Explore our top restaurants and add your favorite dishes to start an order.
        </Text>
        <TouchableOpacity
          style={styles.browseBtn}
          onPress={() => router.push('/(marketplace)')}
        >
          <Text style={styles.browseBtnText}>Explore Restaurants →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleApplyCoupon = async (codeToApply?: string) => {
    const code = (codeToApply || couponInput).trim().toUpperCase();
    if (!code) {
      setCouponValidationMsg({ type: 'error', text: 'Invalid coupon code' });
      Alert.alert('Cannot Apply Coupon', 'Invalid coupon code');
      return;
    }

    setValidatingCoupon(true);
    setCouponValidationMsg(null);
    try {
      const res = await couponService.validateCouponCode(code, cart.subtotal, cart.restaurantId!);
      if (res.isValid && res.coupon) {
        applyCoupon(res.coupon.code, res.discountAmount, res.coupon);
        setCouponInput('');
        setCouponValidationMsg({ type: 'success', text: res.message });
        Alert.alert('Coupon Applied 🎉', res.message);
      } else {
        setCouponValidationMsg({ type: 'error', text: res.message || 'Cannot apply coupon' });
        Alert.alert('Cannot Apply Coupon', res.message || 'Cannot apply coupon');
      }
    } catch (e: any) {
      setCouponValidationMsg({ type: 'error', text: e.message || 'Invalid coupon code' });
      Alert.alert('Cannot Apply Coupon', e.message || 'Invalid coupon code');
    } finally {
      setValidatingCoupon(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ fontSize: 18, color: '#0F172A' }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Your Cart</Text>
        <TouchableOpacity onPress={clearCart} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Restaurant Scoped Badge */}
        <View style={styles.restaurantBanner}>
          <View style={styles.restAvatar}>
            <Text style={styles.restAvatarText}>
              {(cart.restaurantName || 'R').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.restName}>{cart.restaurantName}</Text>
            <Text style={styles.restSub}>Single-restaurant scoped order</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push(`/(marketplace)/restaurant/${cart.restaurantId}` as any)}
          >
            <Text style={styles.addMoreText}>+ Add items</Text>
          </TouchableOpacity>
        </View>

        {/* Cart Items List */}
        <View style={styles.itemsCard}>
          {cart.items.map((item, idx) => (
            <View
              key={item.product_id}
              style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}
            >
              <View style={styles.itemInfo}>
                <View style={styles.foodTypeBadge}>
                  <Text style={{ fontSize: 10 }}>
                    {item.food_type === 'veg' ? '🟢' : '🔴'}
                  </Text>
                  <Text style={styles.foodTypeName}>
                    {item.food_type === 'veg' ? 'VEG' : 'NON-VEG'}
                  </Text>
                </View>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemUnitPrice}>₹{formatPrice(item.price)} each</Text>
              </View>

              <View style={styles.itemActions}>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => updateQuantity(item.product_id, item.quantity - 1)}
                  >
                    <Text style={styles.stepperBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperQty}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => updateQuantity(item.product_id, item.quantity + 1)}
                  >
                    <Text style={styles.stepperBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.itemTotalPrice}>₹{formatPrice(item.price * item.quantity)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Coupon Box */}
        <View style={styles.couponCard}>
          <Text style={styles.couponTitle}>🏷️ Apply Coupon Code (1 per order)</Text>
          {cart.couponCode ? (
            <View style={styles.appliedCouponRow}>
              <View>
                <Text style={styles.appliedCode}>✓ {cart.couponCode}</Text>
                <Text style={styles.appliedDisc}>₹{formatPrice(cart.discount)} saved on this order</Text>
              </View>
              <TouchableOpacity onPress={handleRemoveCoupon} style={styles.removeCouponBtn}>
                <Text style={styles.removeCouponText}>✕ Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.couponInputRow}>
                <TextInput
                  style={styles.couponInput}
                  placeholder="Enter coupon code..."
                  value={couponInput}
                  onChangeText={setCouponInput}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.applyBtn, validatingCoupon && { opacity: 0.6 }]}
                  onPress={() => handleApplyCoupon()}
                  disabled={validatingCoupon}
                >
                  <Text style={styles.applyBtnText}>
                    {validatingCoupon ? '...' : 'APPLY'}
                  </Text>
                </TouchableOpacity>
              </View>

              {couponValidationMsg && (
                <View
                  style={[
                    styles.validationBanner,
                    couponValidationMsg.type === 'error'
                      ? styles.validationBannerError
                      : styles.validationBannerSuccess,
                  ]}
                >
                  <Text
                    style={[
                      styles.validationBannerText,
                      couponValidationMsg.type === 'error'
                        ? styles.validationTextError
                        : styles.validationTextSuccess,
                    ]}
                  >
                    {couponValidationMsg.type === 'error' ? '⚠️ ' : '🎉 '}
                    {couponValidationMsg.text}
                  </Text>
                </View>
              )}

              {availableCoupons.length > 0 && (
                <View style={styles.availableCouponsWrap}>
                  <Text style={styles.availableCouponsLabel}>Available Deals for this Restaurant:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.couponChipsRow}>
                    {availableCoupons.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.couponChip}
                        onPress={() => handleApplyCoupon(c.code)}
                      >
                        <Text style={styles.couponChipCode}>{c.code}</Text>
                        <Text style={styles.couponChipTag}>
                          {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          )}
        </View>

        {/* Minimum Order Value Alert Card */}
        {isBelowMinOrder && (
          <View style={styles.minOrderCard}>
            <View style={styles.minOrderCardHeader}>
              <Text style={{ fontSize: 16 }}>⚠️</Text>
              <Text style={styles.minOrderCardTitle}>
                Minimum Order Value: ₹{minOrderValue}
              </Text>
            </View>
            <Text style={styles.minOrderCardSub}>
              Your current subtotal is ₹{formatPrice(cart.subtotal)}. Add items worth{' '}
              <Text style={styles.minOrderCardHighlight}>₹{formatPrice(remainingForMinOrder)}</Text>{' '}
              more to place your order.
            </Text>
          </View>
        )}

        {/* Bill Breakdown Details */}
        <View style={styles.billCard}>
          <Text style={styles.billTitle}>Bill Summary</Text>

          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Item Subtotal</Text>
            <Text style={styles.billVal}>₹{formatPrice(cart.subtotal)}</Text>
          </View>

          {cart.discount > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, { color: '#059669' }]}>Coupon Discount</Text>
              <Text style={[styles.billVal, { color: '#059669' }]}>−₹{formatPrice(cart.discount)}</Text>
            </View>
          )}

          {cart.discount > 0 && (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Taxable Amount</Text>
              <Text style={styles.billVal}>₹{formatPrice(cart.taxableAmount)}</Text>
            </View>
          )}

          <View style={styles.billRow}>
            <Text style={styles.billLabel}>CGST 2.5%</Text>
            <Text style={styles.billVal}>₹{formatPrice(cart.cgst)}</Text>
          </View>

          <View style={styles.billRow}>
            <Text style={styles.billLabel}>SGST 2.5%</Text>
            <Text style={styles.billVal}>₹{formatPrice(cart.sgst)}</Text>
          </View>

          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery Fee</Text>
            <Text style={styles.billValFree}>FREE</Text>
          </View>

          <View style={styles.billDivider} />

          <View style={styles.billTotalRow}>
            <Text style={styles.billTotalLabel}>Grand Total</Text>
            <Text style={styles.billTotalVal}>₹{formatPrice(cart.payableAmount)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Checkout Footer Bar */}
      <View style={styles.footerBar}>
        <View>
          <Text style={styles.footerSubLabel}>TO PAY</Text>
          <Text style={styles.footerAmount}>₹{formatPrice(cart.payableAmount)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.checkoutBtn, isBelowMinOrder && styles.checkoutBtnWarning]}
          onPress={async () => {
            if (isBelowMinOrder) {
              Alert.alert(
                'Minimum Order Value Required',
                `The minimum order amount for ${cart.restaurantName || 'this restaurant'} is ₹${minOrderValue}. Please add items worth ₹${formatPrice(remainingForMinOrder)} more to place your order.`
              );
              return;
            }
            if (cart.restaurantId) {
              const isOpen = await marketplaceService.getRestaurantOnlineStatus(cart.restaurantId);
              if (!isOpen) {
                Alert.alert(
                  'Restaurant Offline',
                  'Restaurant is currently closed for online orders. Please try again later.'
                );
                return;
              }
            }
            router.push('/(marketplace)/checkout');
          }}
        >
          <Text style={styles.checkoutBtnText}>
            {isBelowMinOrder ? `Add ₹${formatPrice(remainingForMinOrder)} More` : 'Select Address & Pay →'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#FFFFFF',
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  browseBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: customerColors.text,
  },
  clearBtn: {
    padding: 4,
  },
  clearBtnText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  restaurantBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    gap: 12,
  },
  restAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: customerColors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: customerColors.primary,
  },
  restName: {
    fontSize: 15,
    fontWeight: '700',
    color: customerColors.text,
  },
  restSub: {
    fontSize: 11,
    color: customerColors.textSecondary,
  },
  addMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: customerColors.primary,
  },
  itemsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F8F9FA',
  },
  itemInfo: {
    flex: 1,
    paddingRight: 10,
  },
  foodTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  foodTypeName: {
    fontSize: 9,
    fontWeight: '700',
    color: customerColors.textSecondary,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: customerColors.text,
    marginBottom: 2,
  },
  itemUnitPrice: {
    fontSize: 12,
    color: customerColors.textSecondary,
  },
  itemActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: customerColors.primary,
    borderRadius: 6,
    overflow: 'hidden',
  },
  stepperBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepperBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  stepperQty: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  itemTotalPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: customerColors.text,
  },
  couponCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  couponTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.text,
    marginBottom: 10,
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  couponInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: customerColors.text,
    backgroundColor: '#F8F9FA',
  },
  applyBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  appliedCouponRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
  },
  appliedCode: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  appliedDisc: {
    fontSize: 11,
    color: '#065F46',
  },
  removeCouponBtn: {
    padding: 4,
  },
  removeCouponText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  availableCouponsWrap: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  availableCouponsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
  },
  couponChipsRow: {
    gap: 8,
    paddingRight: 8,
  },
  couponChip: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  couponChipCode: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C2410C',
  },
  couponChipTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  billTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: customerColors.text,
    marginBottom: 12,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  billLabel: {
    fontSize: 13,
    color: customerColors.textSecondary,
  },
  billVal: {
    fontSize: 13,
    fontWeight: '600',
    color: customerColors.text,
  },
  billValFree: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  billDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 10,
  },
  billTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: customerColors.text,
  },
  billTotalVal: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.primary,
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
  checkoutBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  checkoutBtnWarning: {
    backgroundColor: '#EA580C',
  },
  checkoutBtnText: {
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
    gap: 8,
    marginBottom: 4,
  },
  minOrderCardTitle: {
    fontSize: 14,
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
  validationBanner: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  validationBannerError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  validationBannerSuccess: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  validationBannerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  validationTextError: {
    color: '#DC2626',
  },
  validationTextSuccess: {
    color: '#16A34A',
  },
});
