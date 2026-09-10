import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { supabase } from '../../src/services/supabase';
import { Order } from '../../src/types';
import { customerColors } from '../../src/utils/colors';
import { formatPrice } from '../../src/utils/currency';
import { formatOrderDateTime } from '../../src/utils/dateUtils';

export default function CustomerOrdersScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [liveOrders, setLiveOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyHasMore, setHistoryHasMore] = useState<boolean>(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrders = async () => {
    setErrorMessage(null);
    try {
      // 1. Fetch all live active orders
      const allOrders = await marketplaceService.getCustomerOrders();
      const live = allOrders.filter(
        (o) => !['delivered', 'completed', 'cancelled'].includes(o.status)
      );
      setLiveOrders(live);

      // 2. Fetch paginated order history (first 15 records)
      const histResult = await marketplaceService.getCustomerOrderHistoryPaginated({
        page: 1,
        pageSize: 15,
      });
      setHistoryOrders(histResult.orders);
      setHistoryHasMore(histResult.hasMore);
      setHistoryPage(1);
    } catch (e: any) {
      console.warn('Error loading orders:', e);
      setErrorMessage(e?.message || 'Failed to fetch customer orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMoreHistory = async () => {
    if (loadingMoreHistory || !historyHasMore) return;
    try {
      setLoadingMoreHistory(true);
      const nextPage = historyPage + 1;
      const result = await marketplaceService.getCustomerOrderHistoryPaginated({
        page: nextPage,
        pageSize: 15,
      });

      setHistoryOrders((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        const newOnes = result.orders.filter((o) => !existingIds.has(o.id));
        return [...prev, ...newOnes];
      });
      setHistoryPage(nextPage);
      setHistoryHasMore(result.hasMore);
    } catch (e) {
      console.warn('Failed to load more order history:', e);
    } finally {
      setLoadingMoreHistory(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadOrders();
        setActiveTab('live');
      }
    }, [user])
  );

  useEffect(() => {
    if (user) {
      loadOrders();

      // Realtime subscription for customer's orders with unique channel name
      const channelName = `customer-orders-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `customer_id=eq.${user.id}`,
          },
          () => {
            loadOrders();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setLoading(false);
    }
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={customerColors.primary} />
        <Text style={styles.loadingText}>Fetching your orders...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.authRequiredWrap}>
        <Text style={{ fontSize: 44 }}>📋</Text>
        <Text style={styles.authRequiredTitle}>Log In to Track Orders</Text>
        <Text style={styles.authRequiredSub}>
          Sign in to view your live deliveries and historical meal orders.
        </Text>
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginBtnText}>Log In to Your Account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayOrders = activeTab === 'live' ? liveOrders : historyOrders;

  const render3StageProgress = (status: string) => {
    const isStage1Active = true; // Ordered is always done if active
    const isStage2Active = ['out_for_delivery', 'served', 'delivered', 'completed'].includes(status);
    const isStage3Active = ['delivered', 'completed'].includes(status);

    return (
      <View style={styles.trackerWrap}>
        <View style={styles.trackRow}>
          {/* Stage 1: Ordered */}
          <View style={styles.trackStep}>
            <View style={[styles.stepDot, isStage1Active && styles.stepDotActive]}>
              <Text style={{ fontSize: 10 }}>✓</Text>
            </View>
            <Text style={[styles.stepLabel, isStage1Active && styles.stepLabelActive]}>
              Ordered
            </Text>
          </View>

          <View style={[styles.trackLine, isStage2Active && styles.trackLineActive]} />

          {/* Stage 2: Out for Delivery */}
          <View style={styles.trackStep}>
            <View style={[styles.stepDot, isStage2Active && styles.stepDotActive]}>
              <Text style={{ fontSize: 10 }}>{isStage2Active ? '✓' : '2'}</Text>
            </View>
            <Text style={[styles.stepLabel, isStage2Active && styles.stepLabelActive]}>
              Out for Delivery
            </Text>
          </View>

          <View style={[styles.trackLine, isStage3Active && styles.trackLineActive]} />

          {/* Stage 3: Delivered */}
          <View style={styles.trackStep}>
            <View style={[styles.stepDot, isStage3Active && styles.stepDotActive]}>
              <Text style={{ fontSize: 10 }}>{isStage3Active ? '✓' : '3'}</Text>
            </View>
            <Text style={[styles.stepLabel, isStage3Active && styles.stepLabelActive]}>
              Delivered
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.pageInner}>
          {/* Header Bar */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Image
                source={require('../../assets/images/restroz_logo.png')}
                style={styles.headerLogo}
                resizeMode="contain"
              />
              <View>
                <Text style={styles.headerTitle}>My Orders</Text>
                <Text style={styles.headerSubtitle}>Track live orders and view order history</Text>
              </View>
            </View>

            {/* Segmented Pill Tabs */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'live' && styles.tabBtnActive]}
                onPress={() => setActiveTab('live')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>
                  🔥 Live ({liveOrders.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
                onPress={() => setActiveTab('history')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
                  📜 History ({historyOrders.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {errorMessage ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 48 }}>⚠️</Text>
              <Text style={styles.emptyTitle}>Unable to Load Orders</Text>
              <Text style={styles.emptySub}>{errorMessage}</Text>
              <TouchableOpacity style={styles.exploreBtn} onPress={loadOrders} activeOpacity={0.8}>
                <Text style={styles.exploreBtnText}>🔄 Retry</Text>
              </TouchableOpacity>
            </View>
          ) : displayOrders.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 48 }}>{activeTab === 'live' ? '🛵' : '📦'}</Text>
              <Text style={styles.emptyTitle}>
                {activeTab === 'live' ? 'No Active Deliveries' : 'No Past Orders'}
              </Text>
              <Text style={styles.emptySub}>
                {activeTab === 'live'
                  ? 'When you place an order, live 3-stage delivery tracking will appear here in real time.'
                  : 'Your delivered and completed meal orders will be safely archived here.'}
              </Text>
              {activeTab === 'live' && (
                <TouchableOpacity
                  style={styles.exploreBtn}
                  onPress={() => router.push('/(marketplace)')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.exploreBtnText}>Browse Restaurants</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            displayOrders.map((order) => {
              const rest = (order as any).restaurant;
              const progress = marketplaceService.mapOrderToCustomerStage(order.status);
              const isLive = activeTab === 'live';

              return (
                <View key={order.id} style={styles.orderCard}>
                  {/* Order Header */}
                  <View style={styles.orderCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.restName}>{rest?.name || 'Restaurant'}</Text>
                      <Text style={styles.orderNum}>
                        Order #{order.order_number} • 🕒 {formatOrderDateTime(order.created_at)}
                      </Text>
                    </View>

                    <View style={[styles.statusBadge, { backgroundColor: `${progress.badgeColor}18` }]}>
                      <Text style={[styles.statusBadgeText, { color: progress.badgeColor }]}>
                        {progress.label}
                      </Text>
                    </View>
                  </View>

                  {/* 3-Stage Tracker for Live Orders */}
                  {isLive && render3StageProgress(order.status)}

                  {/* Items Summary */}
                  <View style={styles.itemsSummary}>
                    {(order.items || []).map((item, idx) => (
                      <View key={item.id || idx} style={styles.itemRow}>
                        <View style={styles.qtyBadge}>
                          <Text style={styles.itemQty}>{item.quantity}x</Text>
                        </View>
                        <Text style={styles.itemName}>{item.product_name || 'Item'}</Text>
                        <Text style={styles.itemPrice}>₹{formatPrice(item.total || item.unit_price * item.quantity)}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Delivery & Payment Note */}
                  <View style={styles.metaBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.payMethod}>
                        Payment: {order.payment_method ? order.payment_method.toUpperCase() : 'COD'} (
                        {order.payment_status ? order.payment_status.toUpperCase() : 'UNPAID'})
                      </Text>
                      {order.delivery_address && (
                        <Text style={styles.addressLine} numberOfLines={1}>
                          📍 {order.delivery_address}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.totalLabel}>TOTAL</Text>
                      <Text style={styles.totalAmount}>₹{formatPrice(order.payable_amount || order.grand_total || 0)}</Text>
                    </View>
                  </View>

                  {/* Card Action Row */}
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.detailBtn}
                      onPress={() => router.push(`/order/${order.id}` as any)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.detailBtnText}>View Details & Receipt ›</Text>
                    </TouchableOpacity>

                    {!((order.kots && order.kots.length > 0) || order.status === 'kot_generated') && !['cancelled', 'delivered', 'completed'].includes(order.status) && (
                      <TouchableOpacity
                        style={styles.cancelCardBtn}
                        onPress={() => router.push(`/order/${order.id}` as any)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.cancelCardBtnText}>Cancel Order</Text>
                      </TouchableOpacity>
                    )}

                    {['completed', 'delivered'].includes(order.status) && (
                      <TouchableOpacity
                        style={styles.reorderCardBtn}
                        onPress={() => router.push(`/order/${order.id}` as any)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.reorderCardBtnText}>🔄 Reorder</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {/* Load More Past Orders Button */}
          {activeTab === 'history' && historyHasMore && (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={loadMoreHistory}
                disabled={loadingMoreHistory}
                activeOpacity={0.8}
              >
                {loadingMoreHistory ? (
                  <ActivityIndicator size="small" color={customerColors.primary} />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: customerColors.primary }}>
                    ⬇️ Load More Past Orders
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
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
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  authRequiredWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  authRequiredTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  authRequiredSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  loginBtn: {
    backgroundColor: customerColors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  pageInner: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLogo: {
    width: 38,
    height: 38,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: customerColors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: customerColors.primary,
    fontWeight: '800',
  },
  scrollArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 70,
  },
  emptyWrap: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.text,
  },
  emptySub: {
    fontSize: 13,
    color: customerColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 420,
    marginBottom: 8,
  },
  exploreBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: customerColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  exploreBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  restName: {
    fontSize: 17,
    fontWeight: '800',
    color: customerColors.text,
  },
  orderNum: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  trackerWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackStep: {
    alignItems: 'center',
    width: 85,
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepDotActive: {
    backgroundColor: customerColors.primary,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: customerColors.primary,
    fontWeight: '800',
  },
  trackLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 6,
    marginTop: -18,
  },
  trackLineActive: {
    backgroundColor: customerColors.primary,
  },
  itemsSummary: {
    paddingVertical: 8,
    gap: 8,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBadge: {
    backgroundColor: customerColors.primaryBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemQty: {
    fontSize: 11,
    fontWeight: '800',
    color: customerColors.primary,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  metaBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  payMethod: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  addressLine: {
    fontSize: 12,
    color: '#334155',
    marginTop: 3,
    maxWidth: 360,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  totalAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: customerColors.primary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    gap: 10,
  },
  detailBtn: {
    flex: 1,
    paddingVertical: 8,
  },
  detailBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.primary,
  },
  cancelCardBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  cancelCardBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  reorderCardBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  reorderCardBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  loadMoreBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: customerColors.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
