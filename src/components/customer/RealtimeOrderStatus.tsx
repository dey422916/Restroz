import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { OrderStatus } from '../../types';

interface RealtimeOrderStatusProps {
  status: OrderStatus;
  kotStatus?: string;
}

export const RealtimeOrderStatus: React.FC<RealtimeOrderStatusProps> = ({ status }) => {
  const steps = [
    { key: 'ordered', label: 'Ordered' },
    { key: 'out_for_delivery', label: 'Out for Delivery' },
    { key: 'delivered', label: 'Delivered' },
  ];

  // Map internal status to 3 customer-facing states
  const getStepIndex = (): number => {
    if (status === 'delivered' || status === 'completed') return 2;
    if (status === 'out_for_delivery' || status === 'served' || status === 'ready') return 1;
    return 0; // 'confirmed', 'kot_generated', 'preparing', etc. => ORDERED
  };

  const currentIndex = getStepIndex();
  const badgeColor =
    currentIndex === 2 ? '#16a34a' : currentIndex === 1 ? '#ea580c' : '#2563eb';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>DELIVERY PROGRESS</Text>
        <Text style={[styles.statusBadge, { color: badgeColor }]}>
          {currentIndex === 2
            ? '✅ Delivered'
            : currentIndex === 1
            ? '🛵 Out for Delivery'
            : '📦 Order Placed'}
        </Text>
      </View>

      <View style={styles.stepperContainer}>
        {steps.map((s, idx) => {
          const isDone = idx <= currentIndex;
          const isCurrent = idx === currentIndex;
          const isLast = idx === steps.length - 1;

          return (
            <React.Fragment key={s.key}>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.dot,
                    isDone && styles.dotDone,
                    isCurrent && styles.dotCurrent,
                  ]}
                >
                  {isDone ? (
                    <Text style={styles.checkIcon}>✓</Text>
                  ) : (
                    <Text style={styles.dotNumber}>{idx + 1}</Text>
                  )}
                </View>
                <Text style={[styles.stepText, isDone && styles.stepTextActive]}>{s.label}</Text>
              </View>
              {!isLast && <View style={[styles.line, idx < currentIndex && styles.lineActive]} />}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '800',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
    width: 80,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#f1f5f9',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dotDone: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  dotCurrent: {
    borderColor: '#2563eb',
    borderWidth: 2,
  },
  checkIcon: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  dotNumber: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  stepText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '600',
    textAlign: 'center',
  },
  stepTextActive: {
    color: '#0f172a',
    fontWeight: '800',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 4,
    marginBottom: 16,
  },
  lineActive: {
    backgroundColor: '#2563eb',
  },
});
