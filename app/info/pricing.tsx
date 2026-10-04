import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';

const PLANS = [
  {
    name: 'Starter POS',
    tagline: 'Ideal for small cafes, bakeries & single-counter QSRs.',
    priceDesc: 'Flexible Plans for Every Setup',
    popular: false,
    features: [
      'High-Speed Touch POS & Billing',
      'Dine-In, Takeaway & Delivery Modes',
      'Thermal Receipt Printing (58/80mm)',
      'Digital Menu Catalog & Modifiers',
      'Day Register & Cash Reconciliation',
      'Standard Sales Reports',
      'Email & Community Support',
    ],
  },
  {
    name: 'Professional Dine-In',
    tagline: 'Complete table management & kitchen operations for full-service restaurants.',
    priceDesc: 'Most Popular for Restaurants',
    popular: true,
    features: [
      'Everything in Starter POS, plus:',
      'Table-Side Waiter Mobile App (Android/iOS)',
      'Automated Category KOT Kitchen Routing',
      'Interactive Live Table Floor Plans',
      'Contactless QR Menu Ordering',
      'Customer Loyalty Cashback & Wallets',
      'Inventory Stock & Low-Stock Alerts',
      'Priority Phone & WhatsApp Support',
    ],
  },
  {
    name: 'Enterprise & Multi-Outlet',
    tagline: 'For restaurant chains, franchises, and high-volume multi-brand cloud kitchens.',
    priceDesc: 'Custom Multi-Branch Pricing',
    popular: false,
    features: [
      'Everything in Professional, plus:',
      'Multi-Outlet Centralized Dashboard',
      'Global Menu & Price Synchronization',
      'Consolidated Multi-Branch Analytics',
      'Dedicated Branded Online Storefront',
      'Custom Role Permissions & Security Audits',
      'Central Print Station & Custom Agents',
      'Dedicated Account Manager & 24/7 SLA',
    ],
  },
];

export function PricingPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 992;

  const handleNav = (route: string) => {
    router.push(route as any);
  };

  return (
    <MarketingLayout
      seo={{
        title: 'RestroZ Pricing — Flexible Plans for Restaurants of Every Size',
        description:
          'Transparent restaurant POS and management plans. From single-outlet cafes to multi-branch restaurant chains, choose the plan that fits your growth.',
        canonicalPath: '/info/pricing',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>TRANSPARENT VALUE</Text>
          </View>
          <Text style={styles.title}>Simple, Predictable Plans for Food Businesses</Text>
          <Text style={styles.subtitle}>
            No hidden fees, no expensive proprietary hardware lock-in. Scale your restaurant operations with the plan that fits your exact workflow.
          </Text>
        </View>
      </View>

      <View style={styles.plansSection}>
        <View style={styles.plansInner}>
          <View style={[styles.plansGrid, !isDesktop && styles.plansGridMobile]}>
            {PLANS.map((plan) => (
              <View
                key={plan.name}
                style={[
                  styles.planCard,
                  plan.popular && styles.planCardPopular,
                ]}
              >
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planTagline}>{plan.tagline}</Text>
                  <View style={styles.priceWrap}>
                    <Text style={styles.priceHeading}>{plan.priceDesc}</Text>
                    <Text style={styles.priceSub}>Tailored to your outlet count & hardware</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.planCtaBtn, plan.popular && styles.planCtaBtnPopular]}
                  onPress={() => handleNav('/info/contact')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.planCtaText, plan.popular && styles.planCtaTextPopular]}>
                    Request Custom Quote →
                  </Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                <View style={styles.featuresList}>
                  <Text style={styles.featuresHeader}>INCLUDED CAPABILITIES:</Text>
                  {plan.features.map((feat, idx) => (
                    <View key={`feat-${idx}`} style={styles.featureItem}>
                      <Text style={styles.featureCheck}>✓</Text>
                      <Text style={styles.featureText}>{feat}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Bottom Consultation Box */}
          <View style={styles.consultBox}>
            <View style={{ flex: 1, minWidth: 260 }}>
              <Text style={styles.consultTitle}>Need a Tailored Multi-Outlet or Enterprise Quote?</Text>
              <Text style={styles.consultSub}>
                Our restaurant technology specialists will help design the optimal hardware and software setup for your restaurant chain.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.consultBtn}
              onPress={() => handleNav('/info/book-demo')}
              activeOpacity={0.85}
            >
              <Text style={styles.consultBtnText}>Schedule a Consultation</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </MarketingLayout>
  );
}

export default PricingPage;

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
  plansSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 72,
    width: '100%',
  },
  plansInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 48,
  },
  plansGrid: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  plansGridMobile: {
    flexDirection: 'column',
  },
  planCard: {
    flex: 1,
    backgroundColor: '#FAF9F6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 32,
    gap: 20,
    position: 'relative' as any,
    minWidth: 280,
  },
  planCardPopular: {
    borderColor: '#FC8019',
    backgroundColor: '#FFFFFF',
    shadowColor: '#FC8019',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
  popularBadge: {
    position: 'absolute' as any,
    top: -14,
    alignSelf: 'center',
    backgroundColor: '#FC8019',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 999,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  planHeader: {
    gap: 8,
  },
  planName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  planTagline: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  priceWrap: {
    marginTop: 12,
    gap: 4,
  },
  priceHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FC8019',
  },
  priceSub: {
    fontSize: 12,
    color: '#94A3B8',
  },
  planCtaBtn: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  planCtaBtnPopular: {
    backgroundColor: '#FC8019',
  },
  planCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  planCtaTextPopular: {
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  featuresList: {
    gap: 12,
  },
  featuresHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  featureCheck: {
    color: '#16A34A',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  featureText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    flex: 1,
  },
  consultBox: {
    backgroundColor: '#0B132B',
    borderRadius: 20,
    padding: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 20,
  },
  consultTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  consultSub: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 6,
    lineHeight: 20,
  },
  consultBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  consultBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
