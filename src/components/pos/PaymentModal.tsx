import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Order, PaymentMethod, CustomerWalletInfo } from '../../types';
import { formatCurrency, numberToWords } from '../../utils/currency';
import { calculateOrderTotals, getOrderSubtotal } from '../../utils/gst';
import { formatOrderDateTime } from '../../utils/dateUtils';
import { validateGSTIN } from '../../utils/validators';
import { useSettings } from '../../context/SettingsContext';
import { resolveOrderDiscounts } from '../../services/api/orderService';
import { loyaltyService } from '../../services/api/loyaltyService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onProcessPayment: (
    paymentMethod: PaymentMethod,
    amount: number,
    ref?: string,
    discountData?: {
      discount_type: 'none' | 'fixed' | 'percentage';
      discount_value: number;
      discount_amount: number;
      taxable_amount: number;
      cgst_amount: number;
      sgst_amount: number;
      grand_total: number;
      round_off: number;
      payable_amount: number;
      customer_gstin?: string;
      wallet_redeem_amount?: number;
    }
  ) => Promise<void>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  onProcessPayment,
}) => {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;
  const { settings } = useSettings();

  const isGstEnabled = settings?.is_gst_enabled !== undefined && settings?.is_gst_enabled !== null
    ? Boolean(settings.is_gst_enabled)
    : false;
  const taxRate = settings?.default_tax_rate !== undefined ? settings.default_tax_rate : 5.0;

  // Discount configuration state
  const resolvedInitialDiscounts = resolveOrderDiscounts(order);
  const [discountType, setDiscountType] = useState<'none' | 'fixed' | 'percentage'>(
    resolvedInitialDiscounts.discount_type
  );
  const [discountInput, setDiscountInput] = useState<string>(
    resolvedInitialDiscounts.discount_value > 0 ? String(resolvedInitialDiscounts.discount_value) : ''
  );

  const [customerGstinInput, setCustomerGstinInput] = useState<string>(order.customer_gstin || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    order.payment_method === 'online' || order.payment_method === 'upi'
      ? 'upi'
      : order.payment_method === 'card'
      ? 'card'
      : order.payment_method === 'room'
      ? 'room'
      : 'cash'
  );
  const [refNo, setRefNo] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Customer Loyalty Wallet State
  const [walletInfo, setWalletInfo] = useState<CustomerWalletInfo | null>(null);
  const [isRedeemWallet, setIsRedeemWallet] = useState<boolean>(false);

  useEffect(() => {
    if (order) {
      setPaymentMethod(
        order.payment_method === 'online' || order.payment_method === 'upi'
          ? 'upi'
          : order.payment_method === 'card'
          ? 'card'
          : order.payment_method === 'room'
          ? 'room'
          : 'cash'
      );
      setCustomerGstinInput(order.customer_gstin || '');
      const resolvedModalDiscounts = resolveOrderDiscounts(order);
      setDiscountType(resolvedModalDiscounts.discount_type);
      setDiscountInput(
        resolvedModalDiscounts.discount_value > 0 ? String(resolvedModalDiscounts.discount_value) : ''
      );

      // Fetch customer wallet info if customer mobile and restaurant are available
      if (order.restaurant_id && order.customer_phone) {
        loyaltyService
          .getCustomerWallet(order.restaurant_id, order.customer_phone)
          .then((info) => setWalletInfo(info))
          .catch((e) => console.warn('[PaymentModal] Error loading wallet info:', e));
      } else {
        setWalletInfo(null);
        setIsRedeemWallet(false);
      }
    }
  }, [order?.id, order?.restaurant_id, order?.customer_phone]);

  // Centralized real-time calculation
  const subtotal = useMemo(() => getOrderSubtotal(order), [order]);

  const numDiscount = useMemo(() => {
    const val = parseFloat(discountInput);
    return isNaN(val) || val < 0 ? 0 : val;
  }, [discountInput]);

  const validatedDiscount = useMemo(() => {
    if (discountType === 'percentage') {
      return Math.min(numDiscount, 100);
    }
    if (discountType === 'fixed') {
      return Math.min(numDiscount, subtotal);
    }
    return 0;
  }, [discountType, numDiscount, subtotal]);

  const gstinValidation = useMemo(() => {
    if (!customerGstinInput.trim()) return { isValid: true, error: null };
    return validateGSTIN(customerGstinInput);
  }, [customerGstinInput]);

  const totals = useMemo(() => {
    return calculateOrderTotals({
      items: order.items || [],
      discountType: discountType === 'none' ? undefined : discountType,
      discountValue: validatedDiscount,
      coupon: order.coupon_code
        ? {
            code: order.coupon_code,
            discount_type: 'percentage',
            discount_value: order.coupon_discount || 0,
          }
        : undefined,
      deliveryCharge: order.delivery_charge || 0,
      isGstEnabled,
      taxRate,
    });
  }, [order, discountType, validatedDiscount, isGstEnabled, taxRate]);

  const alreadyPaid = Number(order?.paid_amount || 0);
  const remainingBalance = Math.max(0, totals.payableAmount - alreadyPaid);

  // Wallet redemption calculation
  const walletBalance = walletInfo?.balance || 0;
  const minRequired = walletInfo?.min_redeem_balance || 50;
  const isRewardsEnabled = Boolean(walletInfo?.is_enabled);
  const canRedeem = Boolean(isRewardsEnabled && walletBalance >= minRequired && walletBalance > 0);

  const walletRedeemAmount = useMemo(() => {
    if (!isRedeemWallet || !canRedeem) return 0;
    return Math.min(walletBalance, remainingBalance);
  }, [isRedeemWallet, canRedeem, walletBalance, remainingBalance]);

  const netPayable = Math.max(0, remainingBalance - walletRedeemAmount);

  const [tendered, setTendered] = useState<string>(netPayable.toString());

  // Keep tendered synchronized with recalculated net payable balance
  useEffect(() => {
    setTendered(netPayable.toString());
  }, [netPayable]);

  const numTendered = parseFloat(tendered) || 0;
  const isEnough = netPayable <= 0 || numTendered >= netPayable;
  const isGstinValid = gstinValidation.isValid;

  const handleSubmit = async () => {
    if (!isEnough || isProcessing || !isGstinValid) return;
    try {
      setIsProcessing(true);
      await onProcessPayment(
        netPayable > 0 ? paymentMethod : 'cash',
        netPayable > 0 ? Math.min(numTendered, netPayable) : 0,
        refNo,
        {
          discount_type: discountType,
          discount_value: validatedDiscount,
          discount_amount: totals.discountAmount,
          taxable_amount: totals.taxableSubtotal,
          cgst_amount: totals.cgstAmount,
          sgst_amount: totals.sgstAmount,
          grand_total: totals.rawTotal,
          round_off: totals.roundOff,
          payable_amount: totals.payableAmount,
          customer_gstin: customerGstinInput.trim().toUpperCase() || undefined,
          wallet_redeem_amount: walletRedeemAmount,
        }
      );
      onClose();
    } catch (err: any) {
      Alert.alert('Settlement Error', err?.message || 'Unable to process settlement. Please retry.');
    } finally {
      setIsProcessing(false);
    }
  };

  const methods: { method: PaymentMethod; label: string }[] = [
    { method: 'cash', label: '💵 Cash' },
    { method: 'upi', label: '📱 UPI / QR' },
    { method: 'card', label: '💳 Card' },
    { method: 'room', label: '🏨 Room' },
  ];

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
            paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 8,
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: '100%', maxWidth: 520, maxHeight: windowHeight * 0.9 }}
        >
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>Close Order & Settlement</Text>
                <Text style={styles.subTitle}>
                  Order #{order.order_number} • {order.table_number ? (/^table\b/i.test(order.table_number.trim()) ? order.table_number.trim() : `Table ${order.table_number.trim()}`) : order.order_type.toUpperCase()} • 🕒 {formatOrderDateTime(order.created_at)}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
              {/* 1. DISCOUNT SELECTION */}
              <View style={styles.sectionBox}>
                <Text style={styles.sectionLabel}>Apply Bill Discount</Text>
                <View style={styles.discountTypeRow}>
                  <TouchableOpacity
                    style={[styles.discTypeBtn, discountType === 'none' && styles.discTypeBtnActive]}
                    onPress={() => {
                      setDiscountType('none');
                      setDiscountInput('');
                    }}
                  >
                    <Text style={[styles.discTypeText, discountType === 'none' && styles.discTypeTextActive]}>
                      No Discount
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.discTypeBtn, discountType === 'fixed' && styles.discTypeBtnActive]}
                    onPress={() => setDiscountType('fixed')}
                  >
                    <Text style={[styles.discTypeText, discountType === 'fixed' && styles.discTypeTextActive]}>
                      ₹ Rupees
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.discTypeBtn, discountType === 'percentage' && styles.discTypeBtnActive]}
                    onPress={() => setDiscountType('percentage')}
                  >
                    <Text style={[styles.discTypeText, discountType === 'percentage' && styles.discTypeTextActive]}>
                      % Percentage
                    </Text>
                  </TouchableOpacity>
                </View>

                {discountType !== 'none' && (
                  <View style={styles.discInputWrapper}>
                    <Text style={styles.discInputLabel}>
                      {discountType === 'fixed'
                        ? `Discount Amount in ₹ (Max: ₹${subtotal.toFixed(2)})`
                        : 'Discount Percentage (0 – 100%)'}
                    </Text>
                    <TextInput
                      style={styles.discInput}
                      placeholder={discountType === 'fixed' ? 'e.g. 100' : 'e.g. 10'}
                      placeholderTextColor="#64748b"
                      value={discountInput}
                      onChangeText={(val) => {
                        const clean = val.replace(/[^0-9.]/g, '');
                        if (discountType === 'percentage') {
                          const parsed = parseFloat(clean);
                          if (!isNaN(parsed) && parsed > 100) return;
                        }
                        setDiscountInput(clean);
                      }}
                      keyboardType="numeric"
                    />
                  </View>
                )}
              </View>

              {/* 2. REAL-TIME ITEMIZED BILL BREAKDOWN */}
              <View style={styles.billBreakdownBox}>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Item Subtotal:</Text>
                  <Text style={styles.billVal}>{formatCurrency(totals.subtotal)}</Text>
                </View>

                {totals.discountAmount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={[styles.billLabel, { color: '#16a34a', fontWeight: '800' }]}>
                      Discount {discountType === 'percentage' ? `(${validatedDiscount}%)` : `(₹${validatedDiscount})`}:
                    </Text>
                    <Text style={[styles.billVal, { color: '#16a34a', fontWeight: '900' }]}>
                      -{formatCurrency(totals.discountAmount)}
                    </Text>
                  </View>
                )}

                {totals.couponDiscount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={[styles.billLabel, { color: '#16a34a' }]}>
                      Coupon ({order.coupon_code}):
                    </Text>
                    <Text style={[styles.billVal, { color: '#16a34a' }]}>
                      -{formatCurrency(totals.couponDiscount)}
                    </Text>
                  </View>
                )}

                {totals.totalTax > 0 && (() => {
                  const effectiveTaxRate = taxRate !== undefined && taxRate !== null ? Number(taxRate) : 5.0;
                  const halfTaxRate = effectiveTaxRate / 2;
                  const halfTaxRateStr = halfTaxRate % 1 === 0 ? `${halfTaxRate}` : `${halfTaxRate.toFixed(1)}`;
                  return (
                    <>
                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>Taxable Amount:</Text>
                        <Text style={styles.billVal}>{formatCurrency(totals.taxableSubtotal)}</Text>
                      </View>

                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>CGST ({halfTaxRateStr}%):</Text>
                        <Text style={styles.billVal}>{formatCurrency(totals.cgstAmount)}</Text>
                      </View>

                      <View style={styles.billRow}>
                        <Text style={styles.billLabel}>SGST ({halfTaxRateStr}%):</Text>
                        <Text style={styles.billVal}>{formatCurrency(totals.sgstAmount)}</Text>
                      </View>
                    </>
                  );
                })()}

                {totals.deliveryCharge > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Delivery Charge:</Text>
                    <Text style={styles.billVal}>{formatCurrency(totals.deliveryCharge)}</Text>
                  </View>
                )}

                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Round Off:</Text>
                  <Text style={styles.billVal}>
                    {totals.roundOff > 0 ? '+' : ''}{formatCurrency(totals.roundOff)}
                  </Text>
                </View>

                <View style={[styles.billRow, styles.billTotalRow]}>
                  <Text style={styles.billTotalLabel}>Grand Total:</Text>
                  <Text style={styles.billTotalVal}>{formatCurrency(totals.payableAmount)}</Text>
                </View>

                <Text style={styles.wordsText}>
                  ({numberToWords(totals.payableAmount)})
                </Text>

                {alreadyPaid > 0 && (
                  <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f0fdf4', padding: 8, borderRadius: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534' }}>Already Paid:</Text>
                      <Text style={{ fontSize: 11, fontWeight: '900', color: '#15803d' }}>{formatCurrency(alreadyPaid)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: remainingBalance > 0 ? '#b45309' : '#15803d' }}>
                        Remaining Due:
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '900', color: remainingBalance > 0 ? '#b45309' : '#15803d' }}>
                        {formatCurrency(remainingBalance)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* 3. CUSTOMER LOYALTY WALLET REDEMPTION SECTION */}
              {isRewardsEnabled && order.customer_phone ? (
                <View style={styles.walletSectionBox}>
                  <View style={styles.walletHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 16 }}>🎁</Text>
                      <Text style={styles.walletHeaderTitle}>Customer Loyalty Wallet</Text>
                    </View>
                    <View style={styles.walletBalanceBadge}>
                      <Text style={styles.walletBalanceBadgeText}>
                        Balance: {formatCurrency(walletBalance)}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.walletCheckboxRow, !canRedeem && styles.walletCheckboxRowDisabled]}
                    disabled={!canRedeem}
                    onPress={() => setIsRedeemWallet(!isRedeemWallet)}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        isRedeemWallet && styles.checkboxBoxChecked,
                        !canRedeem && styles.checkboxBoxDisabled,
                      ]}
                    >
                      {isRedeemWallet && <Text style={styles.checkboxCheck}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.checkboxLabel, !canRedeem && styles.checkboxLabelDisabled]}>
                        Redeem Wallet Balance
                      </Text>
                      {!canRedeem && (
                        <Text style={styles.walletHintText}>
                          {walletBalance > 0
                            ? `Minimum ${formatCurrency(minRequired)} wallet balance required for redemption.`
                            : `Customer has ₹0.00 wallet balance.`}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {isRedeemWallet && canRedeem && (
                    <View style={styles.walletBreakdownBox}>
                      <View style={styles.walletBreakdownRow}>
                        <Text style={styles.walletBreakdownLabel}>Wallet Available:</Text>
                        <Text style={styles.walletBreakdownVal}>{formatCurrency(walletBalance)}</Text>
                      </View>
                      <View style={styles.walletBreakdownRow}>
                        <Text style={styles.walletBreakdownLabel}>Order Due:</Text>
                        <Text style={styles.walletBreakdownVal}>{formatCurrency(remainingBalance)}</Text>
                      </View>
                      <View style={styles.walletBreakdownRow}>
                        <Text style={[styles.walletBreakdownLabel, { color: '#059669', fontWeight: '800' }]}>
                          Wallet Used:
                        </Text>
                        <Text style={[styles.walletBreakdownVal, { color: '#059669', fontWeight: '900' }]}>
                          - {formatCurrency(walletRedeemAmount)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.walletBreakdownRow,
                          { borderTopWidth: 1, borderTopColor: '#CBD5E1', paddingTop: 4, marginTop: 2 },
                        ]}
                      >
                        <Text style={[styles.walletBreakdownLabel, { fontWeight: '900', color: '#0F172A' }]}>
                          Remaining to Pay:
                        </Text>
                        <Text
                          style={[
                            styles.walletBreakdownVal,
                            { fontWeight: '900', color: '#2563EB', fontSize: 14 },
                          ]}
                        >
                          {formatCurrency(netPayable)}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}

              {/* 4. PAYMENT MODE SELECTION */}
              {netPayable > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Select Payment Mode for Remaining Due *</Text>
                  <View style={styles.methodRow}>
                    {methods.map((m) => (
                      <TouchableOpacity
                        key={m.method}
                        style={[styles.mBtn, paymentMethod === m.method && styles.mBtnActive]}
                        onPress={() => setPaymentMethod(m.method)}
                      >
                        <Text style={[styles.mText, paymentMethod === m.method && styles.mTextActive]}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* 5. TENDERED / REFERENCE AMOUNT */}
                  <Text style={styles.fieldLabel}>Tendered Amount (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={tendered}
                    onChangeText={setTendered}
                    placeholderTextColor="#64748b"
                    keyboardType="numeric"
                  />

                  {paymentMethod !== 'cash' && (
                    <>
                      <Text style={styles.fieldLabel}>Transaction / Reference # (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        value={refNo}
                        onChangeText={setRefNo}
                        placeholder="e.g. UPI-998811 or Card Auth #4411"
                        placeholderTextColor="#64748b"
                      />
                    </>
                  )}
                </>
              )}

              {/* B2B Customer GSTIN (Optional) */}
              {isGstEnabled && (
                <View style={{ marginBottom: 8, marginTop: netPayable <= 0 ? 12 : 0 }}>
                  <Text style={styles.fieldLabel}>Customer GSTIN (Optional for B2B Invoice)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      !isGstinValid && { borderColor: '#ef4444', borderWidth: 1.5 },
                    ]}
                    value={customerGstinInput}
                    onChangeText={(v) => setCustomerGstinInput(v.toUpperCase().trim())}
                    placeholder="15-digit GSTIN (e.g. 19AAAAA0000A1Z5)"
                    placeholderTextColor="#64748b"
                    maxLength={15}
                    autoCapitalize="characters"
                  />
                  {!isGstinValid && gstinValidation.error && (
                    <Text style={{ color: '#ef4444', fontSize: 10, marginTop: -8, marginBottom: 8, fontWeight: '700' }}>
                      ⚠️ {gstinValidation.error}
                    </Text>
                  )}
                </View>
              )}

              {/* 6. SUBMIT ACTION */}
              <TouchableOpacity
                testID="payment-modal-submit-btn"
                disabled={!isEnough || isProcessing}
                style={[styles.payBtn, (!isEnough || isProcessing) && styles.payBtnDisabled]}
                onPress={handleSubmit}
              >
                <Text style={styles.payBtnText}>
                  {remainingBalance <= 0 || (walletRedeemAmount > 0 && netPayable <= 0)
                    ? walletRedeemAmount > 0
                      ? `SETTLE ORDER WITH WALLET (${formatCurrency(walletRedeemAmount)})`
                      : 'SETTLE ORDER & RELEASE TABLE (₹0 DUE)'
                    : walletRedeemAmount > 0
                    ? `REDEEM ${formatCurrency(walletRedeemAmount)} + COLLECT ${formatCurrency(Math.min(numTendered, netPayable))}`
                    : `COLLECT ${formatCurrency(Math.min(numTendered, remainingBalance))} & CLOSE ORDER`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  subTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  close: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  sectionBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  discountTypeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  discTypeBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  discTypeBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  discTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  discTypeTextActive: {
    color: '#2563eb',
    fontWeight: '800',
  },
  discInputWrapper: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  discInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  discInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  billBreakdownBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  billLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  billVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  billTotalRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  billTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  billTotalVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2563eb',
  },
  wordsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 2,
    textAlign: 'right',
  },
  walletSectionBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 14,
  },
  walletHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  walletHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  walletBalanceBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  walletBalanceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
  },
  walletCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
  },
  walletCheckboxRowDisabled: {
    opacity: 0.7,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#16A34A',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxBoxChecked: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  checkboxBoxDisabled: {
    borderColor: '#94A3B8',
    backgroundColor: '#F1F5F9',
  },
  checkboxCheck: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  checkboxLabelDisabled: {
    color: '#64748B',
  },
  walletHintText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
    marginTop: 2,
  },
  walletBreakdownBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginTop: 10,
    gap: 4,
  },
  walletBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletBreakdownLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  walletBreakdownVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 4,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  mBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  mBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  mText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  mTextActive: {
    color: '#2563eb',
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  payBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  payBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  payBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
