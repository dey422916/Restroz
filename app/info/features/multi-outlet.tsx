import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function MultiOutletFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Multi-Outlet Restaurant Management Platform — RestroZ',
        description:
          'Centrally manage multiple restaurant branches and franchise locations with unified menu catalog synchronization, consolidated reports, and branch-level controls.',
        canonicalPath: '/info/features/multi-outlet',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>MULTI-BRANCH ARCHITECTURE</Text>
          </View>
          <Text style={styles.title}>One Platform to Run All Your Restaurant Outlets</Text>
          <Text style={styles.subtitle}>
            Scale your restaurant brand effortlessly. Control menus, standardize pricing, manage staff permissions, and track real-time revenue across every branch.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Request Multi-Outlet Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="CENTRAL CONTROL"
        title="Consolidated Enterprise Reporting"
        subtitle="Compare sales, popular items, and staff productivity across branches side-by-side without pulling manual spreadsheets."
        bullets={[
          { title: 'Global Menu Distribution', desc: 'Push new items or seasonal price changes to specific branches or all locations instantly.' },
          { title: 'Franchise & Outlet Isolation', desc: 'Branch managers see only their branch data, while brand owners get holistic oversight.' },
          { title: 'Centralized User Management', desc: 'Add or revoke staff credentials across multiple outlets from one master console.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🏢</Text>
            <Text style={styles.mockTitle}>Multi-Outlet Network</Text>
            <Text style={styles.mockSub}>Branch Overview • Consolidated Reports</Text>
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
