import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { useCustomerCart } from '../../../src/context/CustomerCartContext';
import { marketplaceService } from '../../../src/services/api/marketplaceService';
import { supabase } from '../../../src/services/supabase';
import { Order } from '../../../src/types';
import { OrderStatusEvent } from '../../../src/types/marketplace';
import { colors } from '../../../src/utils/colors';
import { formatPrice } from '../../../src/utils/currency';
import { formatOrderDateTime } from '../../../src/utils/dateUtils';

const CANCELLATION_REASONS = [
  'Ordered by mistake',
  'Wrong delivery address',
  'Changed my mind',
  'Duplicate order',
  'Other reason',
];

export default function CustomerOrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;
  const { user } = useAuth();
  const { clearCart, addToCart } = useCustomerCart();

  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderStatusEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Cancellation Modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [selectedReason, setSelectedReason] = useState(CANCELLATION_REASONS[0]);
  const [cancelling, setCancelling] = useState(false);

  // Reorder State
  const [reordering, setReordering] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      const orderData = await marketplaceService.getOrderDetails(id);
      setOrder(orderData);
      if (orderData) {
        const eventsData = await marketplaceService.getOrderStatusEvents(id);
        setEvents(eventsData);
      }
    } catch (e) {
      console.warn('Error loading order details:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    if (id) {
      const orderChName = `sub_order_detail_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const eventsChName = `sub_order_events_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const orderChannel = supabase
        .channel(orderChName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${id}`,
          },
          () => {
            loadData();
          }
        )
        .subscribe();

      const eventsChannel = supabase
        .channel(eventsChName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'order_status_events',
            filter: `order_id=eq.${id}`,
          },
          () => {
            loadData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(orderChannel);
        supabase.removeChannel(eventsChannel);
      };
    }
  }, [id]);

  const handleCancelOrder = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      await marketplaceService.cancelCustomerOrder(order.id, selectedReason);
      setCancelModalVisible(false);
      Alert.alert('Order Cancelled', 'Your order has been cancelled successfully.');
      loadData();
    } catch (e: any) {
      Alert.alert('Cancellation Error', e.message || 'Failed to cancel order.');
    } finally {
      setCancelling(false);
    }
  };

  const handleReorder = async () => {
    if (!order) return;
    setReordering(true);
    try {
      const result = await marketplaceService.prepareReorder(order.id);

      if (result.addedItems.length === 0) {
        Alert.alert(
          'Items Unavailable',
          'None of the items from this historical order are currently available for purchase.'
        );
        return;
      }

      // Add available items to cart
      clearCart();
      for (const item of result.addedItems) {
        addToCart(
          { id: result.restaurantId, name: result.restaurantName },
          {
            id: item.product_id,
            restaurant_id: result.restaurantId,
            category_id: 'cat-general',
            name: item.name,
            price: item.price,
            tax_rate: item.tax_rate,
            food_type: item.food_type,
            image_url: item.image_url,
            is_active: true,
            is_available: true,
            created_at: new Date().toISOString(),
          } as any,
          item.quantity
        );
      }

      if (result.unavailableItems.length > 0) {
        const unavailNames = result.unavailableItems.map((u: any) => u.name).join(', ');
        Alert.alert(
          'Some Items Skipped',
          `The following items are currently unavailable and were not added: ${unavailNames}`,
          [{ text: 'View Cart', onPress: () => router.push('/(marketplace)/cart') }]
        );
      } else {
        router.push('/(marketplace)/cart');
      }
    } catch (e: any) {
      Alert.alert('Reorder Error', e.message || 'Failed to prepare reorder.');
    } finally {
      setReordering(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Fetching order details...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 36 }}>🔍</Text>
        <Text style={styles.errorTitle}>Order Not Found</Text>
        <Text style={styles.errorSub}>
          This order does not exist or you do not have permission to view it.
        </Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.push('/(marketplace)/orders')}
        >
          <Text style={styles.backBtnText}>Back to My Orders</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rest = (order as any).restaurant;
  const progress = marketplaceService.mapOrderToCustomerStage(order.status);
  const hasKot = Boolean((order as any).kots && (order as any).kots.length > 0) || order.status === 'kot_generated';
  const isCancellable = !hasKot && !['cancelled', 'delivered', 'completed'].includes(order.status);
  const isCompleted = ['completed', 'delivered'].includes(order.status);

  // 3-Stage calculation
  const isStage1Active = true;
  const isStage2Active = ['out_for_delivery', 'served', 'delivered', 'completed'].includes(order.status);
  const isStage3Active = ['delivered', 'completed'].includes(order.status);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageInner}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
              <Text style={{ fontSize: 18, color: '#0F172A', fontWeight: '700' }}>←</Text>
            </TouchableOpacity>
            {rest?.logo_url ? (
              <Image
                source={{ uri: rest.logo_url }}
                style={{ width: 38, height: 38, borderRadius: 8, marginLeft: 6 }}
                resizeMode="contain"
              />
            ) : null}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {rest?.name || 'Restaurant'}
              </Text>
              <Text style={styles.headerSub}>Order #{order.order_number} • 🕒 {formatOrderDateTime(order.created_at)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: `${progress.badgeColor}18` }]}>
              <Text style={[styles.statusBadgeText, { color: progress.badgeColor }]}>
                {progress.label}
              </Text>
            </View>
          </View>

          {/* Main Content Layout (2-Column on Desktop, Stacked on Mobile) */}
          <View style={[styles.contentLayout, isDesktop && styles.contentLayoutDesktop]}>
            {/* Left Column: Progress + Items + Actions */}
            <View style={[styles.mainColumn, isDesktop && styles.mainColumnDesktop]}>
              {/* 3-Stage Progress Tracker (Only for non-cancelled) */}
              {order.status !== 'cancelled' ? (
                <View style={styles.trackerCard}>
                  <Text style={styles.cardTitle}>Live Delivery Progress</Text>
                  <View style={styles.trackRow}>
                    {/* Step 1 */}
                    <View style={styles.trackStep}>
                      <View style={[styles.stepDot, isStage1Active && styles.stepDotActive]}>
                        <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '800' }}>✓</Text>
                      </View>
                      <Text style={[styles.stepLabel, isStage1Active && styles.stepLabelActive]}>
                        Ordered
                      </Text>
                    </View>

                    <View style={[styles.trackLine, isStage2Active && styles.trackLineActive]} />

                    {/* Step 2 */}
                    <View style={styles.trackStep}>
                      <View style={[styles.stepDot, isStage2Active && styles.stepDotActive]}>
                        <Text style={{ fontSize: 11, color: isStage2Active ? '#FFFFFF' : '#64748B', fontWeight: '700' }}>
                          {isStage2Active ? '✓' : '2'}
                        </Text>
                      </View>
                      <Text style={[styles.stepLabel, isStage2Active && styles.stepLabelActive]}>
                        Out for Delivery
                      </Text>
                    </View>

                    <View style={[styles.trackLine, isStage3Active && styles.trackLineActive]} />

                    {/* Step 3 */}
                    <View style={styles.trackStep}>
                      <View style={[styles.stepDot, isStage3Active && styles.stepDotActive]}>
                        <Text style={{ fontSize: 11, color: isStage3Active ? '#FFFFFF' : '#64748B', fontWeight: '700' }}>
                          {isStage3Active ? '✓' : '3'}
                        </Text>
                      </View>
                      <Text style={[styles.stepLabel, isStage3Active && styles.stepLabelActive]}>
                        Delivered
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.progressDesc}>{progress.description}</Text>
                </View>
              ) : (
                <View style={styles.cancelledBanner}>
                  <Text style={{ fontSize: 24 }}>❌</Text>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.cancelledTitle}>Order Cancelled</Text>
                    <Text style={styles.cancelledSub}>
                      {order.notes?.includes('[CANCELLED')
                        ? order.notes.split('[CANCELLED')[1].replace(']', '')
                        : 'This order was cancelled.'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Ordered Items Breakdown */}
              <View style={styles.sectionCard}>
                <Text style={styles.cardTitle}>Ordered Items</Text>
                {(order.items || []).map((item, idx) => (
                  <View key={item.id || idx} style={styles.itemRow}>
                    <Text style={styles.itemQty}>{item.quantity}x</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.product_name || 'Item'}</Text>
                      <Text style={styles.itemUnitPrice}>@ ₹{formatPrice(item.unit_price)} each</Text>
                      {item.item_notes ? (
                        <Text style={styles.itemNote}>Note: {item.item_notes}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.itemPrice}>
                      ₹{formatPrice(item.total || item.unit_price * item.quantity)}
                    </Text>
                  </View>
                ))}

                {/* Bill Summary */}
                <View style={styles.billBreakdown}>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Item Subtotal</Text>
                    <Text style={styles.billVal}>₹{formatPrice(order.subtotal)}</Text>
                  </View>

                  {Boolean((order.coupon_discount && order.coupon_discount > 0) || (order.discount_amount && order.discount_amount > 0)) && (
                    <View style={styles.billRow}>
                      <Text style={[styles.billLabel, { color: '#059669', fontWeight: '600' }]}>
                        Coupon Discount {order.coupon_code ? `(${order.coupon_code})` : ''}
                      </Text>
                      <Text style={[styles.billVal, { color: '#059669', fontWeight: '700' }]}>
                        −₹{formatPrice(order.coupon_discount || order.discount_amount || 0)}
                      </Text>
                    </View>
                  )}

                  {Boolean((order.coupon_discount && order.coupon_discount > 0) || (order.discount_amount && order.discount_amount > 0)) && (
                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>Taxable Amount</Text>
                      <Text style={styles.billVal}>
                        ₹{formatPrice(Math.max(0, (order.subtotal || 0) - (order.coupon_discount || order.discount_amount || 0)))}
                      </Text>
                    </View>
                  )}

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>CGST 2.5%</Text>
                    <Text style={styles.billVal}>
                      ₹{formatPrice(order.cgst_amount || 0)}
                    </Text>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>SGST 2.5%</Text>
                    <Text style={styles.billVal}>
                      ₹{formatPrice(order.sgst_amount || 0)}
                    </Text>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Delivery Fee</Text>
                    <Text style={order.delivery_charge ? styles.billVal : styles.billValFree}>
                      {order.delivery_charge ? `₹${formatPrice(order.delivery_charge)}` : 'FREE'}
                    </Text>
                  </View>

                  <View style={[styles.billRow, styles.grandTotalRow]}>
                    <Text style={styles.grandTotalLabel}>Grand Total</Text>
                    <Text style={styles.grandTotalVal}>
                      ₹{formatPrice(order.payable_amount || order.grand_total)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Actions */}
              {isCancellable && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setCancelModalVisible(true)}
                >
                  <Text style={styles.cancelBtnText}>❌ Cancel Order</Text>
                </TouchableOpacity>
              )}

              {isCompleted && (
                <TouchableOpacity
                  style={styles.reorderBtn}
                  onPress={handleReorder}
                  disabled={reordering}
                >
                  {reordering ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.reorderBtnText}>🔄 Reorder This Meal</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Right Column: Delivery Details + Timeline */}
            <View style={[styles.sideColumn, isDesktop && styles.sideColumnDesktop]}>
              {/* Delivery Address Snapshot */}
              <View style={styles.sectionCard}>
                <Text style={styles.cardTitle}>Delivery Details</Text>

                <View style={styles.infoBlock}>
                  <Text style={styles.infoLabel}>Order Placed</Text>
                  <Text style={styles.infoVal}>🕒 {formatOrderDateTime(order.created_at)}</Text>
                </View>

                <View style={styles.infoBlock}>
                  <Text style={styles.infoLabel}>Recipient</Text>
                  <Text style={styles.infoVal}>
                    {order.customer_name} ({order.customer_phone})
                  </Text>
                </View>

                <View style={styles.infoBlock}>
                  <Text style={styles.infoLabel}>Address Snapshot</Text>
                  <Text style={styles.infoVal}>
                    {order.delivery_address || 'No address snapshot saved'}
                  </Text>
                </View>

                <View style={styles.infoBlock}>
                  <Text style={styles.infoLabel}>Payment</Text>
                  <Text style={styles.infoVal}>
                    {order.payment_method?.toUpperCase() || 'CASH ON DELIVERY'} (
                    {order.payment_status === 'paid' ? 'PAID ✅' : 'UNPAID'})
                  </Text>
                </View>
              </View>

              {/* Status Timeline */}
              {events.length > 0 && (
                <View style={styles.sectionCard}>
                  <Text style={styles.cardTitle}>Status History</Text>
                  {events.map((ev, idx) => (
                    <View key={ev.id || idx} style={styles.timelineRow}>
                      <View style={styles.timelineDot} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.timelineTitle}>
                          {ev.new_status.toUpperCase()}
                        </Text>
                        {ev.note ? <Text style={styles.timelineNote}>{ev.note}</Text> : null}
                        <Text style={styles.timelineTime}>
                          {new Date(ev.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Cancellation Modal */}
      <Modal visible={cancelModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel Order?</Text>
            <Text style={styles.modalSub}>
              Please let us know why you need to cancel this order. Any stock reserved will be released immediately.
            </Text>

            {CANCELLATION_REASONS.map((r) => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.reasonOption,
                  selectedReason === r && styles.reasonOptionActive,
                ]}
                onPress={() => setSelectedReason(r)}
              >
                <Text
                  style={[
                    styles.reasonText,
                    selectedReason === r && styles.reasonTextActive,
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelling}
              >
                <Text style={styles.modalCancelText}>Keep Order</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleCancelOrder}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirm Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
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
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 70,
  },
  pageInner: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    gap: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  errorSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 12,
  },
  backBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  headerBack: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
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
  contentLayout: {
    flexDirection: 'column',
    gap: 16,
  },
  contentLayoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  mainColumn: {
    width: '100%',
    gap: 16,
  },
  mainColumnDesktop: {
    flex: 1.25,
  },
  sideColumn: {
    width: '100%',
    gap: 16,
  },
  sideColumnDesktop: {
    flex: 0.95,
  },
  trackerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  trackStep: {
    alignItems: 'center',
    width: 80,
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
    backgroundColor: colors.primary,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  trackLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
    marginTop: -18,
  },
  trackLineActive: {
    backgroundColor: colors.primary,
  },
  progressDesc: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 16,
  },
  cancelledTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#DC2626',
  },
  cancelledSub: {
    fontSize: 12,
    color: '#7F1D1D',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    width: 28,
    marginTop: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  itemUnitPrice: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  itemNote: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
  },
  billBreakdown: {
    paddingTop: 14,
    gap: 8,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  billVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  billValFree: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
    marginTop: 6,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  grandTotalVal: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary,
  },
  infoBlock: {
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoVal: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 2,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  timelineTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  timelineNote: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  timelineTime: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  cancelBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  reorderBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  reorderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 440,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 14,
  },
  reasonOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  reasonOptionActive: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  reasonText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  reasonTextActive: {
    color: '#DC2626',
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
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
  modalConfirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
