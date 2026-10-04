import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { FeaturePillarGrid } from '../../../src/components/marketing/FeaturePillarGrid';

export default function FeaturesOverviewPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'RestroZ Features — Complete Restaurant POS & Management Suite',
        description:
          'Explore all features of RestroZ: fast billing, KOT management, table-side waiter app, QR digital menu, inventory, staff permissions, multi-outlet control, and loyalty rewards.',
        canonicalPath: '/info/features',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>RESTROZ CAPABILITIES</Text>
          </View>
          <Text style={styles.title}>Engineered for High-Volume Restaurant Efficiency</Text>
          <Text style={styles.subtitle}>
            Every feature in RestroZ is built to accelerate order throughput, eliminate operational bottlenecks, and give restaurant operators complete visibility.
          </Text>
          <TouchableOpacity
            style={styles.demoBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.demoBtnText}>Request a Live Interactive Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FeaturePillarGrid />
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
    fontSize: 38,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 46,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 24,
  },
  demoBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  demoBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
