import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function MultiOutletSolutionsPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'POS & Operations Suite for Multi-Outlet Restaurant Chains — RestroZ',
        description:
          'Standardize operations across franchise branches and restaurant chains with RestroZ. Global catalog pushes, centralized revenue audits, and branch level permissions.',
        canonicalPath: '/info/solutions/multi-outlet-restaurants',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>FOOD CHAINS & FRANCHISES</Text>
          </View>
          <Text style={styles.title}>Scalable Multi-Branch Restaurant Operations</Text>
          <Text style={styles.subtitle}>
            Manage brand consistency, push master menu revisions, compare branch performance, and protect sensitive financial figures across 10 to 100+ outlets.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Consult Multi-Outlet Specialist →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="CHAIN CONSISTENCY"
        title="Central Control with Local Agility"
        subtitle="Maintain central oversight over pricing, taxes, and raw inventory while allowing branch managers to handle day-to-day floor operations."
        bullets={[
          { title: 'Unified Franchise Dashboard', desc: 'Real-time sales velocity, register closures, and tax summaries across all locations.' },
          { title: 'Global Menu Sync', desc: 'Push promotional items or price updates to all branches simultaneously.' },
          { title: 'Multi-Terminal License Freedom', desc: 'Deploy unlimited waiter mobile tablets and KOT printers without hardware lock-in.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🏢</Text>
            <Text style={styles.mockTitle}>Franchise Control</Text>
            <Text style={styles.mockSub}>Central Menu • Branch Isolation</Text>
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
