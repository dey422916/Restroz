import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Order } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface HoldOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldOrders: Order[];
  onResumeOrder: (orderId: string) => void;
}

export const HoldOrdersModal: React.FC<HoldOrdersModalProps> = ({
  isOpen,
  onClose,
  heldOrders,
  onResumeOrder,
}) => {
  const insets = useSafeAreaInsets();
  const windowHeight = Dimensions.get('window').height;

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View style={[styles.overlay, { paddingBottom: insets.bottom + 19, paddingTop: insets.top + 19 }]}>
        <View style={[styles.content, { maxHeight: windowHeight * 0.85 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Held Orders ({heldOrders.length})</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
            {heldOrders.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 26 }}>⏸️</Text>
                <Text style={styles.empty}>No orders currently placed on hold.</Text>
              </View>
            ) : (
              heldOrders.map((o) => (
                <View key={o.id} style={styles.card}>
                  <View>
                    <Text style={styles.ordNum}>#{o.order_number}</Text>
                    <Text style={styles.ordMeta}>
                      {o.table_number ? `🪑 ${o.table_number}` : o.order_type.toUpperCase()} •{' '}
                      {formatCurrency(o.payable_amount)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.resumeBtn}
                    onPress={() => {
                      onResumeOrder(o.id);
                      onClose();
                    }}
                  >
                    <Text style={styles.resumeText}>Resume ▶</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
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
    paddingHorizontal: 16,
  },
  content: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  close: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#64748b',
  },
  list: {
    maxHeight: 300,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ordNum: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  ordMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  resumeBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resumeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
});
