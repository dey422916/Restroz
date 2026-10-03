import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function ReportsAnalyticsFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Restaurant Reports & Real-Time Sales Analytics — RestroZ',
        description:
          'Make data-backed decisions with live sales reports, item popularity trends, payment breakdown insights, and automated GST tax summaries.',
        canonicalPath: '/info/features/reports-analytics',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>BUSINESS INTELLIGENCE</Text>
          </View>
          <Text style={styles.title}>Real-Time Sales Reports & Operational Insights</Text>
          <Text style={styles.subtitle}>
            Stop waiting until the end of the month to understand your restaurant metrics. Get live visibility into daily revenue, peak sales hours, and best-selling menu items.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Explore Analytics Reports →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="ACTIONABLE DATA"
        title="Item Velocity, Payment Breakdowns & Tax Auditing"
        subtitle="Identify your highest-margin dishes, discover underperforming menu items, and reconcile payment gateways effortlessly."
        bullets={[
          { title: 'Item-Wise Velocity', desc: 'See units sold, revenue generated, and dish popularity across categories.' },
          { title: 'Payment Channel Audit', desc: 'Instant breakdown of Cash, UPI, Cards, and Customer Store Credit transactions.' },
          { title: 'Tax & GST Summary', desc: 'Export compliant tax snapshots itemized by CGST and SGST with one click.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>📊</Text>
            <Text style={styles.mockTitle}>Executive Analytics</Text>
            <Text style={styles.mockSub}>Sales • Item Trends • Tax Exports</Text>
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
