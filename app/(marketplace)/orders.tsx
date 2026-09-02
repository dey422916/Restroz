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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { supabase } from '../../src/services/supabase';
import { Order } from '../../src/types';
import { customerColors } from '../../src/utils/colors';

export default function CustomerOrdersScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = async () => {
    try {
      const data = await marketplaceService.getCustomerOrders();
      setOrders(data);
    } catch (e) {
      console.warn('Error loading orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
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
      const channelName = `customer-orders-${user.id}-${Date.now()}`;
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

  const liveOrders = orders.filter((o) =>
    ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'served'].includes(o.status)
  );

  const historyOrders = orders.filter((o) =>
    ['delivered', 'completed', 'cancelled'].includes(o.status)
  );

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
      {/* Header Bar */}
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/restroz_logo.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <Text style={styles.headerTitle}>My Orders</Text>
      </View>

      {/* 2 Tabs: Live Orders vs Order History */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'live' && styles.tabBtnActive]}
          onPress={() => setActiveTab('live')}
        >
          <Text style={[styles.tabText, activeTab === 'live' && styles.tabTextActive]}>
            🔥 Live Deliveries ({liveOrders.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            📜 Order History ({historyOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {displayOrders.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={{ fontSize: 40 }}>{activeTab === 'live' ? '🛵' : '📦'}</Text>
            <Text style={styles.emptyTitle}>
              {activeTab === 'live' ? 'No Active Deliveries' : 'No Past Orders'}
            </Text>
            <Text style={styles.emptySub}>
              {activeTab === 'live'
                ? 'When you place an order, live 3-stage tracking will appear here in real time.'
                : 'Your delivered and completed orders will be archived here.'}
            </Text>
            {activeTab === 'live' && (
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => router.push('/(marketplace)')}
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
                      Order #{order.order_number} • {new Date(order.created_at).toLocaleDateString()}
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
                      <Text style={styles.itemQty}>{item.quantity}x</Text>
                      <Text style={styles.itemName}>{item.product_name || 'Item'}</Text>
                      <Text style={styles.itemPrice}>₹{item.total || item.unit_price * item.quantity}</Text>
                    </View>
                  ))}
                </View>

                {/* Footer / Total */}
                <View style={styles.orderCardFooter}>
                  <View>
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

                  <Text style={styles.totalAmount}>₹{order.payable_amount || order.grand_total || 0}</Text>
                </View>

                {/* Card Action Row */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.detailBtn}
                    onPress={() => router.push(`/order/${order.id}` as any)}
                  >
                    <Text style={styles.detailBtnText}>View Details & Receipt ›</Text>
                  </TouchableOpacity>

                  {order.status === 'confirmed' && (
                    <TouchableOpacity
                      style={styles.cancelCardBtn}
                      onPress={() => router.push(`/order/${order.id}` as any)}
                    >
                      <Text style={styles.cancelCardBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  )}

                  {['completed', 'delivered'].includes(order.status) && (
                    <TouchableOpacity
                      style={styles.reorderCardBtn}
                      onPress={() => router.push(`/order/${order.id}` as any)}
                    >
                      <Text style={styles.reorderCardBtnText}>🔄 Reorder</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
  },
  headerLogo: {
    width: 34,
    height: 34,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    marginTop: 5,
    paddingTop: 5,
    paddingBottom: 10,
    gap: 10,
  },
  tabBtn: {
    flex: 1,
    marginTop: 5,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: customerColors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: customerColors.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 70,
  },
  emptyWrap: {
    padding: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: customerColors.text,
  },
  emptySub: {
    fontSize: 12,
    color: customerColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  exploreBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  exploreBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  restName: {
    fontSize: 16,
    fontWeight: '800',
    color: customerColors.text,
  },
  orderNum: {
    fontSize: 11,
    color: customerColors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  trackerWrap: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackStep: {
    alignItems: 'center',
    width: 75,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepDotActive: {
    backgroundColor: customerColors.primary,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: customerColors.primary,
    fontWeight: '700',
  },
  trackLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#EEEEEE',
    marginHorizontal: 4,
    marginTop: -14,
  },
  trackLineActive: {
    backgroundColor: customerColors.primary,
  },
  itemsSummary: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F8F9FA',
    paddingVertical: 10,
    gap: 6,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemQty: {
    fontSize: 12,
    fontWeight: '700',
    color: customerColors.primary,
    width: 24,
  },
  itemName: {
    fontSize: 13,
    color: customerColors.text,
    flex: 1,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: customerColors.text,
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  payMethod: {
    fontSize: 11,
    color: customerColors.textSecondary,
    fontWeight: '600',
  },
  addressLine: {
    fontSize: 11,
    color: customerColors.textSecondary,
    marginTop: 2,
    maxWidth: 220,
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: customerColors.primary,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  detailBtn: {
    flex: 1,
    paddingVertical: 6,
  },
  detailBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: customerColors.primary,
  },
  cancelCardBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  reorderCardBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
});
