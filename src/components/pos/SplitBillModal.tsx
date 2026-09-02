import React, { useState } from 'react';
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
import { OrderItem, SplitPerson, PaymentMethod } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface SplitBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  grandTotal: number;
  items: OrderItem[];
  onCompleteSplitPayment?: (splits: SplitPerson[]) => void;
}

export const SplitBillModal: React.FC<SplitBillModalProps> = ({
  isOpen,
  onClose,
  grandTotal,
  onCompleteSplitPayment,
}) => {
  const insets = useSafeAreaInsets();
  const [numPeople, setNumPeople] = useState<number>(2);
  const [persons, setPersons] = useState<SplitPerson[]>([
    { id: 'p-1', name: 'Person 1', amount: grandTotal / 2, items: [], is_paid: false },
    { id: 'p-2', name: 'Person 2', amount: grandTotal / 2, items: [], is_paid: false },
  ]);

  const windowHeight = Dimensions.get('window').height;

  const updateCount = (cnt: number) => {
    setNumPeople(cnt);
    const amt = Math.round((grandTotal / cnt) * 100) / 100;
    const list: SplitPerson[] = [];
    for (let i = 0; i < cnt; i++) {
      list.push({ id: `p-${i + 1}`, name: `Person ${i + 1}`, amount: amt, items: [], is_paid: false });
    }
    setPersons(list);
  };

  const markPaid = (id: string, method: PaymentMethod) => {
    setPersons((prev) => prev.map((p) => (p.id === id ? { ...p, is_paid: true, payment_method: method } : p)));
  };

  const allPaid = persons.every((p) => p.is_paid);

  return (
    <Modal visible={isOpen} animationType="slide" transparent>
      <View style={[styles.overlay, { paddingBottom: insets.bottom + 19, paddingTop: insets.top + 19 }]}>
        <View style={[styles.content, { maxHeight: windowHeight * 0.85 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Split Bill Settlement</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.totalText}>Total Bill: {formatCurrency(grandTotal)}</Text>

          <View style={styles.peopleRow}>
            <Text style={styles.label}>Guests:</Text>
            {[2, 3, 4, 5].map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.numBtn, numPeople === c && styles.numBtnActive]}
                onPress={() => updateCount(c)}
              >
                <Text style={[styles.numText, numPeople === c && styles.numTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={true}>
            {persons.map((p) => (
              <View key={p.id} style={styles.personCard}>
                <Text style={styles.pName}>
                  {p.name}: {formatCurrency(p.amount)}
                </Text>
                {p.is_paid ? (
                  <Text style={styles.paidText}>✓ Paid via {p.payment_method?.toUpperCase()}</Text>
                ) : (
                  <View style={styles.btnGroup}>
                    <TouchableOpacity style={styles.cashBtn} onPress={() => markPaid(p.id, 'cash')}>
                      <Text style={styles.btnText}>Cash</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.upiBtn} onPress={() => markPaid(p.id, 'upi')}>
                      <Text style={styles.btnText}>UPI/Card</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            disabled={!allPaid}
            style={[styles.confirmBtn, !allPaid && styles.disabledBtn]}
            onPress={() => {
              if (onCompleteSplitPayment) onCompleteSplitPayment(persons);
              onClose();
            }}
          >
            <Text style={styles.confirmText}>COMPLETE SPLIT SETTLEMENT</Text>
          </TouchableOpacity>
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
  totalText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#16a34a',
    marginBottom: 12,
  },
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  numBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  numBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  numText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#334155',
  },
  numTextActive: {
    color: '#ffffff',
  },
  list: {
    maxHeight: 220,
    marginBottom: 14,
  },
  personCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  paidText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  cashBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  upiBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  confirmBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledBtn: {
    backgroundColor: '#cbd5e1',
  },
  confirmText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
});
