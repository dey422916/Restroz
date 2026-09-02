import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { superAdminService } from '../../src/services/api/superAdminService';
import {
  SuperAdminDashboardMetrics,
  Restaurant,
  RestaurantSubscription,
  SubscriptionPayment,
} from '../../src/types';
import { colors } from '../../src/utils/colors';

export default function SuperAdminDashboardScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<SuperAdminDashboardMetrics | null>(null);
  const [recentRestaurants, setRecentRestaurants] = useState<Restaurant[]>([]);
  const [recentPayments, setRecentPayments] = useState<SubscriptionPayment[]>([]);
  const [expiringSubs, setExpiringSubs] = useState<RestaurantSubscription[]>([]);
  const [suspendedRests, setSuspendedRests] = useState<Restaurant[]>([]);

  const loadDashboardData = async () => {
    try {
      const [m, rests, payments, subs] = await Promise.all([
        superAdminService.getDashboardMetrics(),
        superAdminService.getAllRestaurants(),
        superAdminService.getAllPayments(),
        superAdminService.getRestaurantSubscriptions(),
      ]);

      setMetrics(m);
      setRecentRestaurants(rests.slice(0, 5));
      setSuspendedRests(rests.filter((r) => r.status === 'SUSPENDED').slice(0, 5));
      setRecentPayments(payments.slice(0, 5));

      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const expiring = subs.filter((s) => {
        const end = new Date(s.end_date);
        return s.status === 'active' && end >= now && end <= in7Days;
      });
      setExpiringSubs(expiring.slice(0, 5));
    } catch (err) {
      console.warn('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading SaaS Platform Intelligence...</Text>
      </View>
    );
  }

  // Determine card width
  const getMetricCardWidth = () => {
    if (isMobile) return '100%';
    if (isTablet) return '47%';
    return '18.5%';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.contentContainer,
        { padding: isMobile ? 16 : 24, paddingBottom: isMobile ? 100 : 40 },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header Bar */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.pageTitle}>Platform Control Center</Text>
          <Text style={styles.pageSubtitle}>
            Global SaaS metrics, multi-tenant status, and subscription financials
          </Text>
        </View>

        <View style={[styles.headerActionRow, isMobile && styles.headerActionRowMobile]}>
          <TouchableOpacity
            style={[styles.primaryBtn, isMobile && { width: '100%', justifyContent: 'center' }]}
            onPress={() => router.push('/super-admin/restaurants')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>➕ Onboard Restaurant</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Metric Cards Grid */}
      <View style={styles.metricGrid}>
        {/* Card 1: Total Restaurants */}
        <View style={[styles.metricCard, { width: getMetricCardWidth() }]}>
          <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
            <Text style={{ fontSize: 18 }}>🏢</Text>
          </View>
          <Text style={styles.metricValue}>{metrics?.totalRestaurants || 0}</Text>
          <Text style={styles.metricLabel}>Total Restaurants</Text>
        </View>

        {/* Card 2: Active Restaurants */}
        <View style={[styles.metricCard, { width: getMetricCardWidth() }]}>
          <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
            <Text style={{ fontSize: 18 }}>✅</Text>
          </View>
          <Text style={styles.metricValue}>{metrics?.activeRestaurants || 0}</Text>
          <Text style={styles.metricLabel}>Active Tenants</Text>
        </View>

        {/* Card 3: Suspended Tenants */}
        <View style={[styles.metricCard, { width: getMetricCardWidth() }]}>
          <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
            <Text style={{ fontSize: 18 }}>🚫</Text>
          </View>
          <Text style={styles.metricValue}>{metrics?.suspendedRestaurants || 0}</Text>
          <Text style={styles.metricLabel}>Suspended Tenants</Text>
        </View>

        {/* Card 4: Restaurant Admins */}
        <View style={[styles.metricCard, { width: getMetricCardWidth() }]}>
          <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
            <Text style={{ fontSize: 18 }}>👥</Text>
          </View>
          <Text style={styles.metricValue}>{metrics?.totalAdmins || 0}</Text>
          <Text style={styles.metricLabel}>Restaurant Admins</Text>
        </View>

        {/* Card 5: MRR Revenue */}
        <View style={[styles.metricCard, { width: getMetricCardWidth() }]}>
          <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
            <Text style={{ fontSize: 18 }}>💰</Text>
          </View>
          <Text style={[styles.metricValue, { color: '#059669' }]}>
            ₹{(metrics?.monthlyRevenue || 0).toLocaleString('en-IN')}
          </Text>
          <Text style={styles.metricLabel}>Monthly Revenue (MRR)</Text>
        </View>
      </View>

      {/* 2-Column Dashboard Panels */}
      <View style={[styles.twoColLayout, { flexDirection: isMobile ? 'column' : 'row' }]}>
        {/* Left Column: Recent Tenants */}
        <View style={styles.col}>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Recent Restaurants</Text>
              <TouchableOpacity onPress={() => router.push('/super-admin/restaurants')}>
                <Text style={styles.viewAllText}>View All →</Text>
              </TouchableOpacity>
            </View>

            {recentRestaurants.length === 0 ? (
              <Text style={styles.emptyText}>No restaurants onboarded yet.</Text>
            ) : (
              recentRestaurants.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.listItem}
                  onPress={() => router.push(`/super-admin/restaurant/${r.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.restAvatar}>
                    <Text style={styles.restAvatarText}>{r.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.restName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.restSlug} numberOfLines={1}>
                      {r.slug} • {r.city || 'Location N/A'}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      r.status === 'ACTIVE' ? styles.statusActive : styles.statusSuspended,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        r.status === 'ACTIVE'
                          ? styles.statusActiveText
                          : styles.statusSuspendedText,
                      ]}
                    >
                      {r.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>

        {/* Right Column: Platform Revenue & Expiring */}
        <View style={styles.col}>
          {/* Recent Payments */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Recent Subscriptions Paid</Text>
              <TouchableOpacity onPress={() => router.push('/super-admin/payments')}>
                <Text style={styles.viewAllText}>Ledger →</Text>
              </TouchableOpacity>
            </View>

            {recentPayments.length === 0 ? (
              <Text style={styles.emptyText}>No payment records found.</Text>
            ) : (
              recentPayments.map((p) => (
                <View key={p.id} style={styles.listItem}>
                  <View
                    style={[
                      styles.payIcon,
                      { backgroundColor: 'rgba(16, 185, 129, 0.12)', marginRight: 12 },
                    ]}
                  >
                    <Text style={{ fontSize: 14 }}>💳</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.restName} numberOfLines={1}>
                      {p.restaurant?.name || 'Restaurant'}
                    </Text>
                    <Text style={styles.restSlug} numberOfLines={1}>
                      {p.payment_method.toUpperCase()} • {p.payment_reference || 'REF-N/A'}
                    </Text>
                  </View>
                  <Text style={styles.payAmount}>₹{Number(p.amount).toLocaleString('en-IN')}</Text>
                </View>
              ))
            )}
          </View>

          {/* Expiring Subscriptions Alert */}
          <View style={[styles.panel, { marginTop: 16 }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>⚠️ Expiring in 7 Days</Text>
            </View>

            {expiringSubs.length === 0 ? (
              <Text style={[styles.emptyText, { color: '#059669' }]}>
                No subscriptions expiring this week. All active tenants healthy.
              </Text>
            ) : (
              expiringSubs.map((s) => (
                <View key={s.id} style={styles.listItem}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.restName}>{s.restaurant?.name || 'Restaurant'}</Text>
                    <Text style={styles.restSlug}>
                      Ends: {new Date(s.end_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.actionBtnSmall}
                    onPress={() => router.push(`/super-admin/restaurant/${s.restaurant_id}` as any)}
                  >
                    <Text style={styles.actionBtnSmallText}>Extend</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  contentContainer: {
    padding: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    gap: 16,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    flexWrap: 'wrap',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
    flexWrap: 'wrap',
  },
  headerActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  headerActionRowMobile: {
    width: '100%',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  twoColLayout: {
    gap: 16,
  },
  col: {
    flex: 1,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  restAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EEF2F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  restAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  restName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  restSlug: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: '#DCFCE7',
  },
  statusActiveText: {
    color: '#15803D',
  },
  statusSuspended: {
    backgroundColor: '#FEE2E2',
  },
  statusSuspendedText: {
    color: '#B91C1C',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  payIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#059669',
  },
  actionBtnSmall: {
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionBtnSmallText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
});
