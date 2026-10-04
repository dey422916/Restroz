import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function CafesSolutionPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'POS & Billing Software for Cafés, Bakeries & Coffee Shops — RestroZ',
        description:
          'Speed up morning rush hours with RestroZ café POS. Rapid beverage modifiers, token numbering, barista ticket printing, and baked goods inventory.',
        canonicalPath: '/info/solutions/cafes',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>CAFÉS & BAKERIES</Text>
          </View>
          <Text style={styles.title}>Fast Counter Billing for Busy Cafés & Bakeries</Text>
          <Text style={styles.subtitle}>
            Handle morning coffee queues with rapid two-tap checkout, beverage modifiers (milk choices, syrup flavors), and instant barista printer routing.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Schedule a Café Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="COUNTER SPEED"
        title="Custom Beverage Modifiers & Barista Workflow"
        subtitle="Ensure every custom latte and artisan pastry is prepared exactly to customer specification."
        bullets={[
          { title: 'Quick Modifiers', desc: 'Add Oat Milk, Extra Shot, or Less Sugar in one tap.' },
          { title: 'Barista Station Printer', desc: 'Drink orders print directly at the espresso bar without cashier shouting.' },
          { title: 'Fresh Baked Goods Stock', desc: 'Track daily batch baking quantities and reduce end-of-day waste.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>☕</Text>
            <Text style={styles.mockTitle}>Café & Bakery POS</Text>
            <Text style={styles.mockSub}>Quick Checkout • Barista KOT</Text>
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
