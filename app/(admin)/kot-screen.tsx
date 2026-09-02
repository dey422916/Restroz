import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kotService } from '../../src/services/api/kotService';
import { printService } from '../../src/services/printService';
import { KOT, RestaurantSettings } from '../../src/types';
import { useSettings } from '../../src/context/SettingsContext';
import { useAuth } from '../../src/context/AuthContext';

export default function KotScreen() {
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { activeRestaurantId } = useAuth();
  const [kots, setKots] = useState<KOT[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'active' | 'in_progress' | 'ready' | 'served' | 'all'>('active');
  const [search, setSearch] = useState<string>('');

  const loadKots = async () => {
    try {
      setLoading(true);
      const list = await kotService.getKots(activeRestaurantId);
      setKots(list);
    } catch (err: any) {
      console.warn('Failed to load KOTs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKots();
    const interval = setInterval(async () => {
      if (activeRestaurantId) {
        const refreshed = await kotService.getKots(activeRestaurantId);
        setKots(refreshed);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeRestaurantId]);

  const handleUpdateStatus = async (kotId: string, status: 'pending' | 'in_progress' | 'ready' | 'served') => {
    await kotService.updateKotStatus(kotId, status);
    const refreshed = await kotService.getKots(activeRestaurantId);
    setKots(refreshed);
  };

  const filteredKots = kots.filter((k) => {
    if (filter === 'active' && k.status === 'served') return false;
    if (filter === 'in_progress' && k.status !== 'in_progress') return false;
    if (filter === 'ready' && k.status !== 'ready') return false;
    if (filter === 'served' && k.status !== 'served') return false;

    if (search) {
      const q = search.toLowerCase();
      return (
        k.kot_number.toLowerCase().includes(q) ||
        (k.order_number && k.order_number.toLowerCase().includes(q)) ||
        (k.table_number && k.table_number.toLowerCase().includes(q)) ||
        (k.customer_name && k.customer_name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Kitchen Display & KOT Station ({kots.length})</Text>
          <Text style={styles.subTitle}>Live kitchen tokens, cooking dispatch, and item updates</Text>
        </View>

        {/* Search */}
        <TextInput
          style={styles.search}
          placeholder="Search KOT #, Order #, Table..."
          value={search}
          onChangeText={setSearch}
        />

        {/* Tabs */}
        <View style={styles.tabRow}>
          {[
            { id: 'active', label: `🔥 Active (${kots.filter((k) => k.status !== 'served').length})` },
            { id: 'in_progress', label: `👨‍🍳 Cooking (${kots.filter((k) => k.status === 'in_progress').length})` },
            { id: 'ready', label: `🛎️ Ready (${kots.filter((k) => k.status === 'ready').length})` },
            { id: 'served', label: `✓ Served (${kots.filter((k) => k.status === 'served').length})` },
            { id: 'all', label: `All (${kots.length})` },
          ].map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tabBtn, filter === t.id && styles.tabBtnActive]}
              onPress={() => setFilter(t.id as any)}
            >
              <Text style={[styles.tabText, filter === t.id && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#ea580c" />
          <Text style={styles.loadingText}>Fetching kitchen order tokens...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={true}
        >
          {filteredKots.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 36 }}>👨‍🍳</Text>
              <Text style={styles.emptyTitle}>No Kitchen Tokens Found</Text>
              <Text style={styles.emptySub}>
                {filter === 'active' ? 'All kitchen orders have been prepared and served!' : 'No tokens matched your filter.'}
              </Text>
            </View>
          ) : (
            filteredKots.map((kot) => {
              const isSupplementary = kot.kot_number.includes('-SUP');
              const isCancellation = kot.kot_number.includes('-CNL');
              const timeString = kot.created_at ? new Date(kot.created_at).toLocaleTimeString() : 'Just now';

              return (
                <View
                  key={kot.id}
                  style={[
                    styles.card,
                    isCancellation && styles.cardCancellation,
                    isSupplementary && styles.cardSupplementary,
                    kot.status === 'ready' && styles.cardReady,
                    kot.status === 'served' && styles.cardServed,
                  ]}
                >
                  {/* KOT Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.kotNum}>#{kot.kot_number}</Text>
                      {isSupplementary && (
                        <View style={styles.supBadge}>
                          <Text style={styles.supBadgeText}>➕ SUPPLEMENTARY</Text>
                        </View>
                      )}
                      {isCancellation && (
                        <View style={styles.cnlBadge}>
                          <Text style={styles.cnlBadgeText}>⚠️ CANCELLED</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.tableBadge}>
                      <Text style={styles.tableBadgeText}>
                        {kot.table_number ? `🪑 ${kot.table_number}` : kot.order_type.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Order Meta */}
                  <View style={styles.metaRow}>
                    <Text style={styles.orderRef}>Order: <Text style={{ fontWeight: '800', color: '#0f172a' }}>#{kot.order_number}</Text></Text>
                    <Text style={styles.timeText}>🕒 {timeString}</Text>
                  </View>

                  {kot.customer_name && (
                    <Text style={styles.custText}>Guest: {kot.customer_name}</Text>
                  )}

                  {/* Item List */}
                  <View style={styles.itemList}>
                    {kot.items.map((item, i) => {
                      const isItemCancelled = item.quantity < 0 || item.product_name.includes('[CANCELLED]');
                      return (
                        <View
                          key={i}
                          style={[
                            styles.itemRow,
                            isItemCancelled && styles.itemRowCancelled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.itemQty,
                              isItemCancelled ? styles.itemQtyCancelled : styles.itemQtyNormal,
                            ]}
                          >
                            {Math.abs(item.quantity)}x
                          </Text>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.itemName,
                                isItemCancelled && styles.itemNameCancelled,
                              ]}
                            >
                              {item.product_name}
                            </Text>
                            {item.notes && (
                              <Text style={styles.itemNote}>Note: {item.notes}</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {/* Kitchen Notes */}
                  {kot.kitchen_notes && (
                    <View style={styles.kitchenNotesBox}>
                      <Text style={styles.kitchenNotesText}>🔔 {kot.kitchen_notes}</Text>
                    </View>
                  )}

                  {/* Status Progression & Print Action Buttons */}
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.actionBtnPrint}
                      onPress={() => printService.reprintKot(kot.id, settings)}
                    >
                      <Text style={styles.actionBtnPrintText}>🖨️ Print</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        kot.status === 'in_progress' && styles.actionBtnActiveCooking,
                      ]}
                      onPress={() => handleUpdateStatus(kot.id, 'in_progress')}
                    >
                      <Text
                        style={[
                          styles.actionBtnText,
                          kot.status === 'in_progress' && styles.actionBtnTextActive,
                        ]}
                      >
                        👨‍🍳 Cooking
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        kot.status === 'ready' && styles.actionBtnActiveReady,
                      ]}
                      onPress={() => handleUpdateStatus(kot.id, 'ready')}
                    >
                      <Text
                        style={[
                          styles.actionBtnText,
                          kot.status === 'ready' && styles.actionBtnTextActive,
                        ]}
                      >
                        🛎️ Ready
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        kot.status === 'served' && styles.actionBtnActiveServed,
                      ]}
                      onPress={() => handleUpdateStatus(kot.id, 'served')}
                    >
                      <Text
                        style={[
                          styles.actionBtnText,
                          kot.status === 'served' && styles.actionBtnTextActive,
                        ]}
                      >
                        ✓ Served
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerTop: {
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  subTitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  search: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 12,
    marginBottom: 8,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 5,
  },
  tabBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabBtnActive: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#ea580c',
  },
  list: {
    padding: 14,
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardCancellation: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff1f2',
  },
  cardSupplementary: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  cardReady: {
    borderColor: '#a5b4fc',
  },
  cardServed: {
    opacity: 0.65,
    backgroundColor: '#f8fafc',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kotNum: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ea580c',
  },
  supBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  supBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#1e40af',
  },
  cnlBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cnlBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#dc2626',
  },
  tableBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tableBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400e',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  orderRef: {
    fontSize: 11,
    color: '#334155',
  },
  timeText: {
    fontSize: 11,
    color: '#64748b',
  },
  custText: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 4,
  },
  itemList: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    marginVertical: 8,
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  itemRowCancelled: {
    opacity: 0.8,
  },
  itemQty: {
    fontSize: 14,
    fontWeight: '900',
    width: 25,
  },
  itemQtyNormal: {
    color: '#ea580c',
  },
  itemQtyCancelled: {
    color: '#dc2626',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  itemNameCancelled: {
    textDecorationLine: 'line-through',
    color: '#dc2626',
  },
  itemNote: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#d97706',
  },
  kitchenNotesBox: {
    backgroundColor: '#fffbeb',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  kitchenNotesText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    paddingTop: 10,
  },
  actionBtnPrint: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  actionBtnPrintText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#c2410c',
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionBtnActiveCooking: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  actionBtnActiveReady: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  actionBtnActiveServed: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  actionBtnTextActive: {
    color: '#ffffff',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 280,
    marginTop: 4,
  },
});
