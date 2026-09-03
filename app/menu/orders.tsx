import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { orderService } from '../../src/services/api/orderService';
import { Order } from '../../src/types';
import { formatCurrency } from '../../src/utils/currency';
import { getOrderSubtotal } from '../../src/utils/gst';
import { RealtimeOrderStatus } from '../../src/components/customer/RealtimeOrderStatus';
import { useAuth } from '../../src/context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../src/services/supabase';

export default function CustomerOrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isWeb = Platform.OS === 'web';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await orderService.getCustomerOrders(user.id);
      setOrders(data);
    } catch (err) {
      console.warn('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) {
      setOrders([]);
      setLoading(false);
      return;
    }

    fetchOrders();

    // Fast polling fallback for instantaneous delivery status sync
    const pollInterval = setInterval(() => {
      fetchOrders();
    }, 3000);

    let channel: any = null;
    if (isSupabaseConfigured) {
      const channelName = `customer_orders_sync_${user.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${user.id}` },
          () => {
            fetchOrders();
          }
        )
        .subscribe();
    }

    return () => {
      clearInterval(pollInterval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.id, fetchOrders]);

  const activeOrders = orders.filter(
    (o) => !['delivered', 'completed', 'cancelled'].includes(o.status)
  );
  const historyOrders = orders.filter((o) =>
    ['delivered', 'completed', 'cancelled'].includes(o.status)
  );

  const displayedOrders = tab === 'active' ? activeOrders : historyOrders;

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 8 : insets.top, paddingBottom: isWeb ? 0 : insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back to Menu</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'active' && styles.tabBtnActive]}
          onPress={() => setTab('active')}
        >
          <Text style={[styles.tabText, tab === 'active' && styles.tabTextActive]}>
            LIVE ORDERS ({activeOrders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'history' && styles.tabBtnActive]}
          onPress={() => setTab('history')}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>
            ORDER HISTORY ({historyOrders.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading your orders...</Text>
        </View>
      ) : !user ? (
        <View style={styles.centerBox}>
          <Text style={{ fontSize: 32 }}>🔒</Text>
          <Text style={styles.emptyTitle}>Please log in to view your orders</Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.actionBtnText}>Login</Text>
          </TouchableOpacity>
        </View>
      ) : displayedOrders.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={{ fontSize: 36 }}>{tab === 'active' ? '🛵' : '📜'}</Text>
          <Text style={styles.emptyTitle}>
            {tab === 'active' ? 'No active live orders in progress.' : 'No past order history found.'}
          </Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.replace('/(marketplace)')}
          >
            <Text style={styles.actionBtnText}>Browse Marketplace</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollList}
          contentContainerStyle={{ paddingBottom: insets.bottom + 19 + 20 }}
        >
          {displayedOrders.map((ord) => {
            const itemCount = ord.items?.reduce((sum, i) => sum + i.quantity, 0) || ord.items?.length || 0;

            return (
              <View key={ord.id} style={styles.orderCard}>
                <View style={styles.orderCardHeader}>
                  <View>
                    <Text style={styles.orderNumber}>Order #{ord.order_number}</Text>
                    <Text style={styles.orderMeta}>
                      Placed: {new Date(ord.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.orderTotal}>{formatCurrency(ord.payable_amount)}</Text>
                    <Text
                      style={[
                        styles.paymentBadge,
                        { color: ord.payment_status === 'paid' ? '#15803d' : '#b45309' },
                      ]}
                    >
                      COD • {ord.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                    </Text>
                  </View>
                </View>

                {/* Items Summary */}
                <Text style={styles.itemsSummary}>
                  {itemCount} Items: {ord.items?.map((i) => `${i.quantity}x ${i.product_name}`).join(', ')}
                </Text>

                {/* Delivery Address */}
                {ord.delivery_address && (
                  <Text style={styles.addressText} numberOfLines={2}>
                    📍 Deliver To: {ord.delivery_address} {ord.delivery_landmark ? `(Near: ${ord.delivery_landmark})` : ''}
                  </Text>
                )}

                {/* 3-State Delivery Progress */}
                <RealtimeOrderStatus status={ord.status} />

                <TouchableOpacity
                  style={styles.viewDetailBtn}
                  onPress={() => setSelectedOrderDetail(ord)}
                >
                  <Text style={styles.viewDetailBtnText}>VIEW DETAILS</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Itemized Order Detail Modal */}
      <Modal visible={!!selectedOrderDetail} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '88%', paddingBottom: insets.bottom + 24 }]}>
            {selectedOrderDetail && (
              <>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>Order #{selectedOrderDetail.order_number}</Text>
                  <TouchableOpacity onPress={() => setSelectedOrderDetail(null)}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#64748b' }}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ marginVertical: 8 }}>
                  <View style={styles.detailMetaBox}>
                    <Text style={styles.detailMetaRow}>
                      Placed At: {new Date(selectedOrderDetail.created_at).toLocaleString()}
                    </Text>
                    {selectedOrderDetail.delivery_address && (
                      <Text style={styles.detailMetaRow}>
                        Deliver To: {selectedOrderDetail.delivery_address}
                        {selectedOrderDetail.delivery_landmark ? ` (Landmark: ${selectedOrderDetail.delivery_landmark})` : ''}
                      </Text>
                    )}
                    <Text style={styles.detailMetaRow}>
                      Payment Method: COD (Cash on Delivery)
                    </Text>
                    <Text style={styles.detailMetaRow}>
                      Payment Status: {selectedOrderDetail.payment_status.toUpperCase()}
                    </Text>
                  </View>

                  {/* 3-State Delivery Progress */}
                  <RealtimeOrderStatus status={selectedOrderDetail.status} />

                  {/* Order Items Table */}
                  <View style={styles.itemsTable}>
                    <Text style={styles.itemsTableTitle}>ORDER ITEMS</Text>
                    {selectedOrderDetail.items?.map((item) => (
                      <View key={item.id} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>
                            {item.product_name}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#64748b' }}>
                            {item.quantity} × {formatCurrency(item.unit_price)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#0f172a' }}>
                          {formatCurrency(item.total || item.subtotal)}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Receipt Summary */}
                  <View style={styles.receiptSummary}>
                    <View style={styles.receiptSummaryRow}>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>Subtotal</Text>
                      <Text style={{ fontSize: 11, fontWeight: 'bold' }}>
                        {formatCurrency(getOrderSubtotal(selectedOrderDetail))}
                      </Text>
                    </View>
                    {selectedOrderDetail.coupon_discount > 0 && (
                      <View style={styles.receiptSummaryRow}>
                        <Text style={{ fontSize: 11, color: '#16a34a' }}>Coupon Discount</Text>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#16a34a' }}>
                          -{formatCurrency(selectedOrderDetail.coupon_discount)}
                        </Text>
                      </View>
                    )}
                    <View style={styles.receiptSummaryRow}>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>GST (5%)</Text>
                      <Text style={{ fontSize: 11, fontWeight: 'bold' }}>
                        {formatCurrency(selectedOrderDetail.cgst_amount + selectedOrderDetail.sgst_amount)}
                      </Text>
                    </View>
                    <View style={[styles.receiptSummaryRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderColor: '#e2e8f0' }]}>
                      <Text style={{ fontSize: 14, fontWeight: '900' }}>Grand Total</Text>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#16a34a' }}>
                        {formatCurrency(selectedOrderDetail.payable_amount)}
                      </Text>
                    </View>
                  </View>
                </ScrollView>

                <TouchableOpacity style={styles.closeDetailBtn} onPress={() => setSelectedOrderDetail(null)}>
                  <Text style={styles.closeDetailBtnText}>CLOSE</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  backBtn: { paddingVertical: 4 },
  backBtnText: { fontSize: 12, fontWeight: '800', color: '#2563eb' },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    padding: 4,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#ffffff',
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#2563eb',
    fontWeight: '900',
  },
  scrollList: {
    flex: 1,
    padding: 16,
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 12,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  orderMeta: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#16a34a',
  },
  paymentBadge: {
    fontSize: 10,
    fontWeight: '900',
    marginTop: 2,
  },
  itemsSummary: {
    fontSize: 11,
    color: '#475569',
    marginVertical: 4,
  },
  addressText: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 4,
  },
  viewDetailBtn: {
    marginTop: 8,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  viewDetailBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563eb',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748b',
    marginTop: 10,
    textAlign: 'center',
  },
  actionBtn: {
    marginTop: 14,
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
  },
  detailMetaBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detailMetaRow: {
    fontSize: 11,
    color: '#334155',
    marginVertical: 2,
  },
  itemsTable: {
    marginTop: 10,
  },
  itemsTableTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  receiptSummary: {
    marginTop: 10,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    paddingTop: 6,
  },
  receiptSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  closeDetailBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closeDetailBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
});
