import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function InventoryFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Restaurant Inventory & Recipe Cost Management — RestroZ',
        description:
          'Control food costs and eliminate wastage with RestroZ inventory management. Automated low-stock alerts, purchase logging, and raw material deduction.',
        canonicalPath: '/info/features/inventory',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>FOOD COST CONTROL</Text>
          </View>
          <Text style={styles.title}>Track Raw Ingredients, Prevent Stockouts & Cut Wastage</Text>
          <Text style={styles.subtitle}>
            Know your exact inventory levels in real time. Automatically track raw material consumption as orders are settled and receive automated low-stock warnings.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Request Inventory Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="REAL-TIME TRACKING"
        title="Automated Stock Deductions & Low-Stock Alerts"
        subtitle="Stay ahead of shortages before a busy weekend rush. RestroZ keeps your kitchen stocked and prevents surprise item shortages."
        bullets={[
          { title: 'Item-Level Stock Depletion', desc: 'Track physical inventory quantities automatically with each sale.' },
          { title: 'Threshold Warnings', desc: 'Get color-coded alerts when ingredient stock drops below safety levels.' },
          { title: 'Purchase & Wastage Logging', desc: 'Record incoming vendor batches and track operational kitchen spoilage.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>📦</Text>
            <Text style={styles.mockTitle}>Live Stock Monitor</Text>
            <Text style={styles.mockSub}>Raw Materials • Low Stock Alerts</Text>
          </View>
        }
      />
    </MarketingLayout>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    backgroundColor: '#FAF9F6',
    paddingVertical: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  heroInner: {
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 16,
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
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 24,
  },
  ctaBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  mockBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 36,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  mockTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  mockSub: {
    fontSize: 13,
    color: '#64748B',
  },
});
