import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function MenuManagementFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Dynamic Restaurant Menu Management — RestroZ',
        description:
          'Effortlessly update menu items, categories, variants, add-on modifier groups, and real-time 86/out-of-stock toggles across your POS and QR menus.',
        canonicalPath: '/info/features/menu-management',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>CATALOG CONTROL</Text>
          </View>
          <Text style={styles.title}>Flexible Digital Menu Management & Real-Time Sync</Text>
          <Text style={styles.subtitle}>
            Modify pricing, add new seasonal specials, attach modifier groups, and toggle item availability across all POS terminals and QR menus in one click.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Explore Menu Management →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="INSTANT UPDATES"
        title="Variants, Modifiers & Dietary Tags"
        subtitle="Offer customized choices like crust size, spice level, or extra toppings with structured add-on groups."
        bullets={[
          { title: 'Item Variant Pricing', desc: 'Manage Half/Full or Small/Medium/Large portions with distinct prices.' },
          { title: 'Dietary & Spice Badges', desc: 'Flag dishes with Veg, Non-Veg, Spicy, Chef Special, or Gluten-Free tags.' },
          { title: 'Quick 86 Out-of-Stock Toggle', desc: 'Mark finished ingredients out of stock with one tap to avoid awkward apologies.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>📋</Text>
            <Text style={styles.mockTitle}>Dynamic Menu Engine</Text>
            <Text style={styles.mockSub}>Variants • Add-Ons • Veg / Non-Veg</Text>
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
