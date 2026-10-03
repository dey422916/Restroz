import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';

const WORKFLOW_STEPS = [
  {
    step: '1',
    icon: '🏢',
    title: 'Configure Outlet',
    desc: 'Set up tables, upload menu catalog, define taxes, and assign staff credentials in minutes.',
  },
  {
    step: '2',
    icon: '📱',
    title: 'Punch Orders',
    desc: 'Take orders from counter POS, table-side waiter phones, or contactless customer QR scans.',
  },
  {
    step: '3',
    icon: '👨‍🍳',
    title: 'Instant KOT',
    desc: 'Kitchen tickets route automatically to category thermal printers or live kitchen displays.',
  },
  {
    step: '4',
    icon: '⚡',
    title: 'Fast Checkout',
    desc: 'Settle bills in seconds with Cash, UPI, Card, split payments, coupons, or loyalty wallets.',
  },
  {
    step: '5',
    icon: '📊',
    title: 'Track & Scale',
    desc: 'Analyze live item sales, raw material consumption, day registers, and multi-outlet profits.',
  },
];

export function EcosystemWorkflow() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionInner}>
        <View style={styles.headerBlock}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>HOW RESTROZ WORKS</Text>
          </View>
          <Text style={styles.sectionTitle}>Effortless 5-Step Restaurant Operating Cycle</Text>
          <Text style={styles.sectionSubtitle}>
            From the moment a customer arrives until the end-of-day register closure, every step is synchronized.
          </Text>
        </View>

        <View style={[styles.stepsRow, isMobile && styles.stepsRowMobile]}>
          {WORKFLOW_STEPS.map((s, index) => (
            <View key={`step-${s.step}`} style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepNum}>{s.step}</Text>
                </View>
                <Text style={styles.stepIcon}>{s.icon}</Text>
              </View>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepDesc}>{s.desc}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    backgroundColor: '#FAF9F6',
    paddingVertical: 72,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  sectionInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 48,
  },
  headerBlock: {
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 12,
    maxWidth: 750,
    alignSelf: 'center',
  },
  tagBadge: {
    backgroundColor: '#FFF4EB',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagBadgeText: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  stepsRowMobile: {
    flexDirection: 'column',
    gap: 16,
  },
  stepCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FC8019',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  stepIcon: {
    fontSize: 22,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  stepDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
});
