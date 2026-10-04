import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function WaiterMobileAppFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Table-Side Waiter Ordering Mobile App — RestroZ',
        description:
          'Equip your waitstaff with the RestroZ mobile app. Punch table orders, modify dishes, check table occupancy, and trigger kitchen tickets right at the dining table.',
        canonicalPath: '/info/features/waiter-mobile-app',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>TABLE-SIDE MOBILITY</Text>
          </View>
          <Text style={styles.title}>Take Orders Anywhere in Your Restaurant from Any Phone</Text>
          <Text style={styles.subtitle}>
            Turn any budget Android phone or tablet into an enterprise order terminal. Waiters stay on the floor attending to guests instead of lining up at the cash counter.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Book a Mobile POS Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="FASTER TABLE TURNS"
        title="Accelerate Guest Service by 40%"
        subtitle="With real-time sync between waiters and kitchen, food preparation starts before the waiter even leaves the table."
        bullets={[
          { title: 'Live Table Map & Status', desc: 'See which tables are vacant, occupied, or waiting for check.' },
          { title: 'Instant Catalog Search', desc: 'Find dishes, out-of-stock indicators, and item descriptions quickly.' },
          { title: 'Guest Add-Ons & Notes', desc: 'Customize spice levels, portion sizes, and allergens accurately.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>📱</Text>
            <Text style={styles.mockTitle}>Mobile Waiter POS</Text>
            <Text style={styles.mockSub}>Runs on Android, iOS & Tablets</Text>
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
