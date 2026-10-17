import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Modal,
  Platform,
} from 'react-native';
import { superAdminService } from '../../src/services/api/superAdminService';
import { SubscriptionPayment } from '../../src/types';
import { colors } from '../../src/utils/colors';

export default function SubscriptionPaymentsLedgerScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');

  // Delete State
  const [paymentToDelete, setPaymentToDelete] = useState<SubscriptionPayment | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPayments = async () => {
    try {
      const data = await superAdminService.getAllPayments();
      setPayments(data);
    } catch (e) {
      console.warn('Error loading payments:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  // Auto-dismiss feedback message after 4 seconds
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const filteredPayments = payments.filter((p) => {
    const restName = p.restaurant?.name || '';
    const ref = p.payment_reference || '';
    const matchesSearch =
      restName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ref.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (methodFilter === 'ALL') return true;
    return p.payment_method.toUpperCase() === methodFilter;
  });

  const promptDeletePayment = (payment: SubscriptionPayment) => {
    setPaymentToDelete(payment);
  };

  const handleConfirmDelete = async () => {
    if (!paymentToDelete) return;
    setIsDeleting(true);
    try {
      await superAdminService.deletePayment(paymentToDelete.id);
      const deletedId = paymentToDelete.id;
      setPayments((prev) => prev.filter((p) => p.id !== deletedId));
      setPaymentToDelete(null);
      setFeedback({
        type: 'success',
        text: 'Payment deleted successfully.',
      });
    } catch (err: any) {
      console.error('Failed to delete payment:', err);
      setFeedback({
        type: 'error',
        text: err?.message || 'Failed to delete payment record. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Subscription Payment Ledger</Text>
          <Text style={styles.subtitle}>
            Immutable platform revenue transactions and manual offline payment records
          </Text>
        </View>

        <View style={[styles.revenueCard, isMobile && { width: '100%', alignItems: 'flex-start' }]}>
          <Text style={styles.revenueLabel}>TOTAL PLATFORM REVENUE</Text>
          <Text style={styles.revenueValue}>₹{totalCollected.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      {/* Feedback Banner */}
      {feedback && (
        <View
          style={[
            styles.feedbackBanner,
            feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}
        >
          <Text style={styles.feedbackText}>{feedback.text}</Text>
          <TouchableOpacity onPress={() => setFeedback(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.feedbackDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter and Search */}
      <View style={[styles.searchBar, isMobile && styles.searchBarMobile]}>
        <View style={[styles.searchInputWrap, isMobile && styles.searchInputWrapMobile]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[
              styles.searchInput,
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
            ]}
            placeholder="Search by restaurant name, reference ID..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsScroll}
        >
          {['ALL', 'UPI', 'BANK_TRANSFER', 'CASH', 'CARD'].map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.filterPill, methodFilter === m && styles.filterPillActive]}
              onPress={() => setMethodFilter(m)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  methodFilter === m && styles.filterPillTextActive,
                ]}
              >
                {m.replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.tableScroll} contentContainerStyle={{ paddingBottom: isMobile ? 100 : 40 }}>
          {filteredPayments.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 36 }}>💳</Text>
              <Text style={styles.emptyText}>No payment transactions found.</Text>
            </View>
          ) : isMobile ? (
            /* Mobile Cards */
            <View style={styles.mobileCardList}>
              {filteredPayments.map((p) => (
                <View key={p.id} style={styles.mobileCard}>
                  <View style={styles.mobileCardTop}>
                    <View style={styles.payIcon}>
                      <Text style={{ fontSize: 16 }}>💰</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.restName} numberOfLines={1}>
                        {p.restaurant?.name || 'Restaurant'}
                      </Text>
                      <Text style={styles.refText} numberOfLines={1}>
                        Ref: {p.payment_reference || 'N/A'}
                      </Text>
                    </View>
                    <Text style={styles.payAmountBig}>
                      ₹{Number(p.amount).toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={styles.mobileMetaGrid}>
                    <View style={styles.mobileMetaItem}>
                      <Text style={styles.mobileMetaLabel}>PAYMENT METHOD</Text>
                      <View style={styles.methodBadge}>
                        <Text style={styles.methodBadgeText}>{p.payment_method.toUpperCase()}</Text>
                      </View>
                    </View>
                    <View style={styles.mobileMetaItem}>
                      <Text style={styles.mobileMetaLabel}>DATE & TIME</Text>
                      <Text style={styles.mobileMetaValue}>
                        {new Date(p.created_at).toLocaleString()}
                      </Text>
                    </View>
                  </View>

                  {p.notes && (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesText}>📝 {p.notes}</Text>
                    </View>
                  )}

                  {/* Mobile Actions Footer */}
                  <View style={styles.mobileCardFooter}>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      style={styles.mobileDeleteBtn}
                      onPress={() => promptDeletePayment(p)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.mobileDeleteBtnText}>🗑️ Delete Payment</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            /* Desktop & Tablet Table */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexGrow: 1, minWidth: 840 }}
            >
              <View style={[styles.tableCard, { minWidth: 840, flex: 1 }]}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 2, minWidth: 160 }]}>RESTAURANT</Text>
                  <Text style={[styles.th, { flex: 1.2, minWidth: 110 }]}>METHOD</Text>
                  <Text style={[styles.th, { flex: 1.5, minWidth: 140 }]}>REFERENCE ID</Text>
                  <Text style={[styles.th, { flex: 1.5, minWidth: 120 }]}>DATE</Text>
                  <Text style={[styles.th, { flex: 1.2, minWidth: 110, textAlign: 'right' }]}>AMOUNT</Text>
                  <Text style={[styles.th, { width: 80, textAlign: 'center' }]}>ACTION</Text>
                </View>

                {filteredPayments.map((p) => (
                  <View key={p.id} style={styles.tableRow}>
                    <View style={[styles.tdWrap, { flex: 2, minWidth: 160 }]}>
                      <View style={styles.payIcon}>
                        <Text style={{ fontSize: 14 }}>💳</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.restName} numberOfLines={1}>
                          {p.restaurant?.name || 'Restaurant'}
                        </Text>
                        <Text style={styles.notesText} numberOfLines={1}>
                          {p.notes || 'Subscription renewal'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flex: 1.2, minWidth: 110 }}>
                      <View style={styles.methodBadge}>
                        <Text style={styles.methodBadgeText}>{p.payment_method.toUpperCase()}</Text>
                      </View>
                    </View>

                    <Text style={[styles.tdText, { flex: 1.5, minWidth: 140, fontFamily: 'monospace' }]} numberOfLines={1}>
                      {p.payment_reference || 'N/A'}
                    </Text>

                    <Text style={[styles.tdText, { flex: 1.5, minWidth: 120, color: '#64748B' }]}>
                      {new Date(p.created_at).toLocaleDateString()}
                    </Text>

                    <Text style={[styles.amountText, { flex: 1.2, minWidth: 110 }]}>
                      ₹{Number(p.amount).toLocaleString('en-IN')}
                    </Text>

                    <View style={{ width: 80, alignItems: 'center', justifyContent: 'center' }}>
                      <TouchableOpacity
                        style={styles.desktopDeleteBtn}
                        onPress={() => promptDeletePayment(p)}
                        activeOpacity={0.7}
                        accessibilityLabel="Delete payment"
                      >
                        <Text style={styles.desktopDeleteBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </ScrollView>
      )}

      {/* Delete Confirmation Modal */}
      {paymentToDelete && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!isDeleting) setPaymentToDelete(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconWrap}>
                <Text style={styles.modalIcon}>⚠️</Text>
              </View>

              <Text style={styles.modalTitle}>Delete Payment?</Text>
              <Text style={styles.modalMessage}>
                This will permanently remove this payment record from the Payment Ledger. The restaurant subscription and other data will remain unchanged.
              </Text>

              <View style={styles.modalDetailsBox}>
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailKey}>Restaurant:</Text>
                  <Text style={styles.modalDetailVal}>
                    {paymentToDelete.restaurant?.name || 'N/A'}
                  </Text>
                </View>
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailKey}>Amount:</Text>
                  <Text style={[styles.modalDetailVal, { color: '#059669' }]}>
                    ₹{Number(paymentToDelete.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailKey}>Reference:</Text>
                  <Text style={styles.modalDetailVal}>
                    {paymentToDelete.payment_reference || 'N/A'}
                  </Text>
                </View>
              </View>

              <View style={styles.modalFooterButtons}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => setPaymentToDelete(null)}
                  disabled={isDeleting}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalDeleteBtn, isDeleting && { opacity: 0.6 }]}
                  onPress={handleConfirmDelete}
                  disabled={isDeleting}
                  activeOpacity={0.8}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalDeleteBtnText}>Delete Payment</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  revenueCard: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'flex-end',
  },
  revenueLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  revenueValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 2,
  },
  feedbackBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  feedbackSuccess: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  feedbackError: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  feedbackText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  feedbackDismiss: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748B',
    marginLeft: 12,
  },
  searchBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  searchBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    height: 46,
    minHeight: 46,
    gap: 8,
  },
  searchInputWrapMobile: {
    width: '100%',
    minWidth: '100%',
  },
  searchIcon: {
    fontSize: 15,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    height: '100%',
    paddingVertical: 0,
    borderWidth: 0,
  },
  filterPillsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  // Mobile Cards
  mobileCardList: {
    gap: 12,
  },
  mobileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    gap: 10,
  },
  mobileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payAmountBig: {
    fontSize: 17,
    fontWeight: '800',
    color: '#059669',
  },
  refText: {
    fontSize: 12,
    color: '#64748B',
    fontFamily: 'monospace',
    marginTop: 1,
  },
  mobileMetaGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    gap: 12,
  },
  mobileMetaItem: {
    flex: 1,
  },
  mobileMetaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
  },
  mobileMetaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  notesBox: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  mobileDeleteBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  mobileDeleteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  // Desktop Table
  tableScroll: {
    flex: 1,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tdWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tdText: {
    fontSize: 13,
    color: '#0F172A',
  },
  payIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  restName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  notesText: {
    fontSize: 12,
    color: '#64748B',
  },
  methodBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  methodBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  amountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
    textAlign: 'right',
  },
  desktopDeleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  desktopDeleteBtnText: {
    fontSize: 14,
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    gap: 8,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'center',
  },
  modalIcon: {
    fontSize: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalDetailKey: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  modalDetailVal: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  modalFooterButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  modalDeleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDeleteBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
