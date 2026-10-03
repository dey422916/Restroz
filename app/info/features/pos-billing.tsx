import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function PosBillingFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Restaurant POS & Fast Billing System — RestroZ',
        description:
          'Experience lightning-fast restaurant billing for Dine-In, Takeaway, and Delivery. Supports thermal receipt printing, split payments, custom discounts, and offline resilience.',
        canonicalPath: '/info/features/pos-billing',
        keywords: [
          'restaurant POS billing',
          'restaurant billing software',
          'thermal receipt printing POS',
          'split bill POS',
          'dine in takeaway billing',
        ],
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>CORE BILLING ENGINE</Text>
          </View>
          <Text style={styles.title}>High-Speed Restaurant POS Billing Built for Rush Hours</Text>
          <Text style={styles.subtitle}>
            Punch, modify, split, and settle customer bills in seconds. Keep counter queues moving fast with seamless multi-payment settlement.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Book a POS Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="FLEXIBLE MODES"
        title="Dine-In, Takeaway & Delivery in One Screen"
        subtitle="Switch between order types seamlessly. Manage table tabs, quick counter takeaways, and online delivery dispatches without switching applications."
        bullets={[
          { title: 'Dine-In Table Tabs', desc: 'Hold multiple active tables, add supplementary items, and print interim customer check bills.' },
          { title: 'Express Takeaway', desc: 'Punch items and settle in two taps with auto-incremented token numbers.' },
          { title: 'Delivery Address & Rider Tracking', desc: 'Record delivery addresses, customer phone numbers, and rider dispatches cleanly.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🧾</Text>
            <Text style={styles.mockTitle}>Multi-Mode Fast Billing</Text>
            <Text style={styles.mockSub}>Dine-In • Takeaway • Delivery</Text>
          </View>
        }
      />

      <AlternatingFeatureRow
        badge="PAYMENTS & GST"
        title="Split Payments, Discounts & Compliant Tax Snapshots"
        subtitle="Accept Cash, UPI, Cards, and Customer Store Credit wallets in any combination. Apply flat or percentage discounts with clear audit records."
        reversed
        bullets={[
          { title: 'Multi-Payment Split', desc: 'Settle a bill across multiple methods (e.g. ₹500 UPI + ₹300 Cash) accurately.' },
          { title: 'Configurable GST Slabs', desc: 'Support 5%, 12%, 18% or mixed GST with itemized CGST and SGST breakdown.' },
          { title: 'Instant Thermal Printing', desc: 'Auto-print clean 58mm and 80mm thermal receipts directly to network or USB printers.' },
        ]}
        visualComponent={
          <View style={[styles.mockBox, { backgroundColor: '#0B132B' }]}>
            <Text style={{ fontSize: 40 }}>💳</Text>
            <Text style={[styles.mockTitle, { color: '#FFFFFF' }]}>Split & GST Settle</Text>
            <Text style={[styles.mockSub, { color: '#94A3B8' }]}>Cash + UPI + Store Credit</Text>
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
