import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function CloudKitchensSolutionPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Cloud Kitchen & Delivery Management Software — RestroZ',
        description:
          'Power high-volume delivery operations with RestroZ. Multi-brand kitchen routing, rider dispatch, raw ingredient recipe costing, and direct online ordering.',
        canonicalPath: '/info/solutions/cloud-kitchens',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>CLOUD & GHOST KITCHENS</Text>
          </View>
          <Text style={styles.title}>High-Volume Delivery Dispatch & Raw Cost Control</Text>
          <Text style={styles.subtitle}>
            Manage multiple virtual delivery brands from one physical kitchen with unified KOT ticket routing, rider coordination, and recipe-level stock tracking.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Schedule a Cloud Kitchen Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="DELIVERY FIRST"
        title="Multi-Brand Routing & Direct Deliveries"
        subtitle="Eliminate delivery order clutter. Route incoming orders to appropriate prep stations and save 30% aggregator commission with your own direct storefront."
        bullets={[
          { title: 'Multi-Brand Kitchen KOTs', desc: 'Manage virtual brands under one roof with clear brand-tagged tickets.' },
          { title: 'Recipe-Level Ingredient Tracking', desc: 'Know exact raw cost per dish and monitor ingredient consumption.' },
          { title: 'Direct Ordering Storefront', desc: 'Accept customer delivery orders with 0% third-party commission.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🛵</Text>
            <Text style={styles.mockTitle}>Cloud Kitchen Engine</Text>
            <Text style={styles.mockSub}>Delivery Dispatch • Recipe Costing</Text>
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
