import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function QsrSolutionPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Quick Service Restaurant (QSR) & Fast Food POS — RestroZ',
        description:
          'Maximize counter speed and throughput with RestroZ QSR POS. Rapid order entry, token numbering, combo item bundling, and self-ordering QR menus.',
        canonicalPath: '/info/solutions/quick-service-restaurants',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>QUICK SERVICE RESTAURANTS</Text>
          </View>
          <Text style={styles.title}>Rapid Counter POS for High-Volume QSR Outlets</Text>
          <Text style={styles.subtitle}>
            Process 100+ orders per hour with lightning-quick touch billing, combo modifiers, automatic order token sequencing, and instant thermal receipt cut.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Schedule a QSR Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="LIGHTNING SPEED"
        title="Express Counter Checkout & Token Sequencing"
        subtitle="Cut line waiting times in half. Cashiers punch combo meals and print customer token slips in two seconds flat."
        bullets={[
          { title: 'Sub-Second Touchscreen Entry', desc: 'Large category tiles and quick-add favorites for rapid tapping.' },
          { title: 'Automated Order Token Slips', desc: 'Numbered tokens printed on thermal slips for organized customer pickup.' },
          { title: 'Self-Ordering Counter QR', desc: 'Diners scan counter QR codes during peak lines to place orders independently.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🍔</Text>
            <Text style={styles.mockTitle}>Express QSR POS</Text>
            <Text style={styles.mockSub}>Sub-Second Checkout • Tokens</Text>
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
