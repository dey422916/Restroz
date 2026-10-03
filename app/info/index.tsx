import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';
import { PromotionalBannerCarousel } from '../../src/components/marketing/PromotionalBannerCarousel';
import { HeroSection } from '../../src/components/marketing/HeroSection';
import { TrustBar } from '../../src/components/marketing/TrustBar';
import { FeaturePillarGrid } from '../../src/components/marketing/FeaturePillarGrid';
import { AlternatingFeatureRow } from '../../src/components/marketing/AlternatingFeatureRow';
import { EcosystemWorkflow } from '../../src/components/marketing/EcosystemWorkflow';
import { RestaurantTypeSelector } from '../../src/components/marketing/RestaurantTypeSelector';
import { FAQAccordion } from '../../src/components/marketing/FAQAccordion';

export default function MarketingHome() {
  return (
    <MarketingLayout
      seo={{
        title: 'RestroZ — Complete Restaurant Management & Cloud POS System',
        description:
          'From orders to happy customers — RestroZ is the modern cloud restaurant POS software with table-side waiter app, KOT printing, QR menu, inventory, and multi-outlet management.',
        canonicalPath: '/info',
      }}
    >
      {/* Top Promotional Carousel (Super Admin Managed) */}
      <PromotionalBannerCarousel />

      {/* Hero Section */}
      <HeroSection />

      {/* Trust & Credibility */}
      <TrustBar />

      {/* 12 Core Feature Pillars */}
      <FeaturePillarGrid />

      {/* Deep Feature Spotlight 1: Waiter Mobile App */}
      <AlternatingFeatureRow
        badge="MOBILITY & SPEED"
        title="Take Orders Directly from the Table with Waiter Mobile App"
        subtitle="No more scribbling on paper pads or walking back and forth to the billing desk. Waiters take orders, modify dishes, and fire tickets right in front of the guest."
        bullets={[
          { title: 'Any Device Compatibility', desc: 'Runs seamlessly on standard Android smartphones, iPhones, and tablets.' },
          { title: 'Zero Waiter Trips', desc: 'KOTs route directly to kitchen printers the second the order is placed.' },
          { title: 'Dynamic Modifiers & Notes', desc: 'Capture guest preferences like "Extra spicy" or "No onion" accurately.' },
        ]}
        ctaText="Explore Waiter App"
        ctaRoute="/info/features/waiter-mobile-app"
        visualComponent={
          <View style={styles.spotlightCard}>
            <Text style={{ fontSize: 44 }}>📱</Text>
            <Text style={styles.spotlightTitle}>Smart Waiter Terminal</Text>
            <Text style={styles.spotlightDesc}>Live Table 08 • 3 Items Active • Kitchen Synced</Text>
          </View>
        }
      />

      {/* Deep Feature Spotlight 2: Multi-Outlet Architecture */}
      <AlternatingFeatureRow
        badge="ENTERPRISE SCALE"
        title="One Connected Platform for Multiple Restaurant Branches"
        subtitle="Monitor sales performance, standardize recipes, control menu catalogs, and track staff attendance across all your locations from a single master dashboard."
        reversed
        bullets={[
          { title: 'Central Catalog Sync', desc: 'Push price changes and seasonal menus to 5 or 50 branches in one click.' },
          { title: 'Consolidated Reporting', desc: 'Real-time aggregated sales, tax reports, and top-selling items.' },
          { title: 'Franchise & Outlet Permissions', desc: 'Lock sensitive financial data while giving branch managers operational tools.' },
        ]}
        ctaText="Explore Multi-Outlet"
        ctaRoute="/info/features/multi-outlet"
        visualComponent={
          <View style={[styles.spotlightCard, { backgroundColor: '#0B132B', borderColor: '#1E293B' }]}>
            <Text style={{ fontSize: 44 }}>🏢</Text>
            <Text style={[styles.spotlightTitle, { color: '#FFFFFF' }]}>Global Outlet Network</Text>
            <Text style={[styles.spotlightDesc, { color: '#94A3B8' }]}>Branch A • Branch B • Branch C • Synced</Text>
          </View>
        }
      />

      {/* How RestroZ Works */}
      <EcosystemWorkflow />

      {/* Food Business Solutions */}
      <RestaurantTypeSelector />

      {/* FAQ Section */}
      <View style={styles.faqSection}>
        <View style={styles.faqInner}>
          <View style={styles.headerBlock}>
            <View style={styles.tagBadge}>
              <Text style={styles.tagBadgeText}>FREQUENTLY ASKED QUESTIONS</Text>
            </View>
            <Text style={styles.sectionTitle}>Everything You Need to Know</Text>
            <Text style={styles.sectionSubtitle}>
              Common questions about switching to RestroZ, hardware compatibility, and deployment.
            </Text>
          </View>
          <FAQAccordion />
        </View>
      </View>
    </MarketingLayout>
  );
}

const styles = StyleSheet.create({
  spotlightCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 40,
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  spotlightTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  spotlightDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  faqSection: {
    backgroundColor: '#FAF9F6',
    paddingVertical: 72,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  faqInner: {
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 36,
  },
  headerBlock: {
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 12,
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
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },
});
