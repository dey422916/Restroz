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
import { Order, PaymentMethod } from '../../types';
import { formatCurrency, numberToWords } from '../../utils/currency';
import { calculateOrderTotals, getOrderSubtotal } from '../../utils/gst';
import { formatOrderDateTime } from '../../utils/dateUtils';
import { validateGSTIN } from '../../utils/validators';
import { useSettings } from '../../context/SettingsContext';

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

  const isGstEnabled = settings?.is_gst_enabled ?? (settings?.gst_registered ?? Boolean(settings?.gstin?.trim()));
  const taxRate = settings?.default_tax_rate !== undefined ? settings.default_tax_rate : 5.0;

  // Discount configuration state
  const [discountType, setDiscountType] = useState<'none' | 'fixed' | 'percentage'>(
    order.discount_type || (order.discount_amount > 0 ? 'fixed' : 'none')
  );
  const [discountInput, setDiscountInput] = useState<string>(
    order.discount_value !== undefined
      ? String(order.discount_value)
      : order.discount_amount > 0
      ? String(order.discount_amount)
      : ''
  );

  const [customerGstinInput, setCustomerGstinInput] = useState<string>(order.customer_gstin || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [refNo, setRefNo] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

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

  const [tendered, setTendered] = useState<string>(totals.payableAmount.toString());

  // Keep tendered synchronized with recalculated total unless manually customized
  useEffect(() => {
    setTendered(totals.payableAmount.toString());
  }, [totals.payableAmount]);

  const numTendered = parseFloat(tendered) || 0;
  const isEnough = numTendered >= totals.payableAmount;
  const isGstinValid = gstinValidation.isValid;

  const handleSubmit = async () => {
    if (!isEnough || isProcessing || !isGstinValid) return;
    try {
      setIsProcessing(true);
      await onProcessPayment(
        paymentMethod,
        Math.min(numTendered, totals.payableAmount),
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
                  Order #{order.order_number} • {order.table_number ? `Table ${order.table_number}` : order.order_type.toUpperCase()} • 🕒 {formatOrderDateTime(order.created_at)}
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

                {totals.totalTax > 0 && (
                  <>
                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>Taxable Amount:</Text>
                      <Text style={styles.billVal}>{formatCurrency(totals.taxableSubtotal)}</Text>
                    </View>

                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>CGST ({((taxRate || 5) / 2).toFixed(1)}%):</Text>
                      <Text style={styles.billVal}>{formatCurrency(totals.cgstAmount)}</Text>
                    </View>

                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>SGST ({((taxRate || 5) / 2).toFixed(1)}%):</Text>
                      <Text style={styles.billVal}>{formatCurrency(totals.sgstAmount)}</Text>
                    </View>
                  </>
                )}

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
              </View>

              {/* 3. PAYMENT MODE SELECTION */}
              <Text style={styles.fieldLabel}>Select Payment Mode *</Text>
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

              {/* 4. TENDERED / REFERENCE AMOUNT */}
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

              {/* B2B Customer GSTIN (Optional) */}
              {isGstEnabled && (
                <View style={{ marginBottom: 8 }}>
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

              {/* 5. SUBMIT ACTION */}
              <TouchableOpacity
                testID="payment-modal-submit-btn"
                disabled={!isEnough || isProcessing}
                style={[styles.payBtn, (!isEnough || isProcessing) && styles.payBtnDisabled]}
                onPress={handleSubmit}
              >
                <Text style={styles.payBtnText}>
                  COLLECT {formatCurrency(Math.min(numTendered, totals.payableAmount))} & CLOSE ORDER
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
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    elevation: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  subTitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  close: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748b',
  },
  sectionBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  discountTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  discTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  discTypeBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  discTypeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  discTypeTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  discInputWrapper: {
    marginTop: 10,
  },
  discInputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 4,
  },
  discInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#93c5fd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  billBreakdownBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  billLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  billVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  billTotalRow: {
    borderTopWidth: 1,
    borderColor: '#cbd5e1',
    paddingTop: 6,
    marginTop: 4,
    alignItems: 'center',
  },
  billTotalLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  billTotalVal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#16a34a',
  },
  wordsText: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#64748b',
    marginTop: 3,
    textAlign: 'right',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
    marginTop: 2,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  mBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  mBtnActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  mText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  mTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0f172a',
    marginBottom: 12,
  },
  payBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
    elevation: 3,
  },
  payBtnDisabled: {
    backgroundColor: '#cbd5e1',
    elevation: 0,
    opacity: 0.6,
  },
  payBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
