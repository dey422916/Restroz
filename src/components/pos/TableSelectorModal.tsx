import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DiningTable, TableSection } from '../../types';
import { tableService } from '../../services/api/tableService';
import { useAuth } from '../../context/AuthContext';
import { naturalTableCompare } from '../../utils/sortUtils';

interface TableSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTable: (table: DiningTable) => void;
  selectedTableId?: string;
  restaurantId?: string;
}

export const TableSelectorModal: React.FC<TableSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectTable,
  selectedTableId,
  restaurantId,
}) => {
  const insets = useSafeAreaInsets();
  const { activeRestaurantId } = useAuth();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<TableSection | 'All'>('All');

  const targetRestId = restaurantId || activeRestaurantId;

  useEffect(() => {
    if (isOpen && targetRestId) {
      setLoading(true);
      tableService
        .getTables(targetRestId)
        .then((data) => {
          setTables(data);
        })
        .catch((err) => {
          console.warn('Failed to load tables:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, targetRestId]);

  const sections: (TableSection | 'All')[] = [
    'All',
    'Ground Floor',
    'First Floor',
    'Outdoor',
    'AC Section',
    'VIP Section',
  ];

  const filtered = (
    activeSection === 'All'
      ? tables
      : tables.filter((t) => {
          if (activeSection === 'VIP Section' || activeSection === 'VIP') {
            return t.section === 'VIP' || t.section === 'VIP Section';
          }
          return t.section === activeSection;
        })
  ).sort(naturalTableCompare);
  const windowHeight = Dimensions.get('window').height;

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View style={[styles.overlay, { paddingBottom: insets.bottom + 19, paddingTop: insets.top + 19 }]}>
        <View style={[styles.content, { maxHeight: windowHeight * 0.85, flex: 1 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Select Dining Table</Text>
              <Text style={styles.subtitle}>Choose a table to assign this Dine-In order</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Section Filter Pills */}
          <View style={styles.secScrollWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.secScroll}>
              {sections.map((sec) => (
                <TouchableOpacity
                  key={sec}
                  style={[styles.secPill, activeSection === sec && styles.secPillActive]}
                  onPress={() => setActiveSection(sec)}
                >
                  <Text style={[styles.secText, activeSection === sec && styles.secTextActive]}>
                    {sec}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.sectionHeading}>
            Available Tables {filtered.length > 0 ? `(${filtered.length})` : ''}
          </Text>

          {/* Vertical Table List Area */}
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>Loading tables...</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={{ fontSize: 30 }}>🪑</Text>
              <Text style={styles.emptyTitle}>No tables found in this section</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.tableScroll}
              contentContainerStyle={[styles.tableGrid, { paddingBottom: insets.bottom + 19 + 20 }]}
              showsVerticalScrollIndicator={true}
            >
              {filtered.map((t) => {
                const isSelected = selectedTableId === t.id;
                const isOccupied = t.status === 'occupied';
                const isReserved = t.status === 'reserved';

                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.tableCard,
                      isSelected && styles.tableCardSelected,
                      isOccupied && styles.tableCardOccupied,
                      isReserved && styles.tableCardReserved,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      onSelectTable(t);
                      onClose();
                    }}
                  >
                    <View style={styles.cardTopRow}>
                      <Text style={styles.tableName}>{t.table_number}</Text>
                      <View
                        style={[
                          styles.statusDot,
                          isOccupied
                            ? styles.statusDotOccupied
                            : isReserved
                            ? styles.statusDotReserved
                            : styles.statusDotAvailable,
                        ]}
                      />
                    </View>

                    <Text style={styles.tableSectionText}>{t.section}</Text>
                    <Text style={styles.tableInfo}>👥 {t.seating_capacity} Seats</Text>

                    <View style={styles.cardBottomRow}>
                      <Text
                        style={[
                          styles.statusBadgeText,
                          isOccupied
                            ? styles.statusBadgeOccupied
                            : isReserved
                            ? styles.statusBadgeReserved
                            : styles.statusBadgeAvailable,
                        ]}
                      >
                        {isOccupied ? 'Occupied' : isReserved ? 'Reserved' : 'Available'}
                      </Text>
                      {isSelected && <Text style={styles.selectedCheck}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  close: {
    fontSize: 16,
    fontWeight: '900',
    color: '#64748b',
  },
  secScrollWrapper: {
    maxHeight: 42,
    marginBottom: 8,
  },
  secScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secPillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  secText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  secTextActive: {
    color: '#ffffff',
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tableScroll: {
    flex: 1,
  },
  tableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  tableCard: {
    width: '48%',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    marginBottom: 4,
  },
  tableCardSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#2563eb',
  },
  tableCardOccupied: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  tableCardReserved: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tableName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotAvailable: {
    backgroundColor: '#16a34a',
  },
  statusDotOccupied: {
    backgroundColor: '#d97706',
  },
  statusDotReserved: {
    backgroundColor: '#0284c7',
  },
  tableSectionText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  tableInfo: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.4)',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadgeAvailable: {
    color: '#16a34a',
  },
  statusBadgeOccupied: {
    color: '#d97706',
  },
  statusBadgeReserved: {
    color: '#0284c7',
  },
  selectedCheck: {
    fontSize: 12,
    fontWeight: '900',
    color: '#2563eb',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginTop: 8,
  },
});
