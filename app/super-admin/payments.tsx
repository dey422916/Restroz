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

      {/* Filter and Search */}
      <View style={[styles.searchBar, isMobile && styles.searchBarMobile]}>
        <View style={styles.searchInputWrap}>
          <Text style={{ fontSize: 14 }}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by restaurant name, reference ID..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#94A3B8"
          />
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
                </View>
              ))}
            </View>
          ) : (
            /* Desktop Table */
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>RESTAURANT</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>METHOD</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>REFERENCE ID</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>DATE</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>AMOUNT</Text>
              </View>

              {filteredPayments.map((p) => (
                <View key={p.id} style={styles.tableRow}>
                  <View style={[styles.tdWrap, { flex: 2 }]}>
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

                  <View style={{ flex: 1.2 }}>
                    <View style={styles.methodBadge}>
                      <Text style={styles.methodBadgeText}>{p.payment_method.toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={[styles.tdText, { flex: 1.5, fontFamily: 'monospace' }]} numberOfLines={1}>
                    {p.payment_reference || 'N/A'}
                  </Text>

                  <Text style={[styles.tdText, { flex: 1.5, color: '#64748B' }]}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </Text>

                  <Text style={[styles.amountText, { flex: 1.2 }]}>
                    ₹{Number(p.amount).toLocaleString('en-IN')}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
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
  searchBar: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  searchBarMobile: {
    flexDirection: 'column',
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
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
  },
  mobileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
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
});
