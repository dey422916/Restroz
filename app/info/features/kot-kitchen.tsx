import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function KotKitchenFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'KOT & Kitchen Order Management System — RestroZ',
        description:
          'Eliminate kitchen chaos with RestroZ KOT management. Features instant kitchen order tickets, category printer routing, supplementary order tracking, and live KDS displays.',
        canonicalPath: '/info/features/kot-kitchen',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>KITCHEN OPERATIONS</Text>
          </View>
          <Text style={styles.title}>Eliminate Kitchen Confusion & Speed Up Food Prep</Text>
          <Text style={styles.subtitle}>
            Instantly transmit orders from table or counter straight to your kitchen staff with itemized notes, supplementary tracking, and multi-printer routing.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>See Kitchen Workflow Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="ZERO ERRORS"
        title="Automated Category Printer Routing"
        subtitle="Route food items to the main kitchen thermal printer and beverages/mocktails to the bar printer automatically upon punch."
        bullets={[
          { title: 'Category-Based Split', desc: 'Separate KOT prints generated for different preparation stations.' },
          { title: 'Supplementary Item Tracking', desc: 'When guests re-order, KOT clearly highlights newly added quantities only.' },
          { title: 'Itemized Cooking Notes', desc: 'Special preparation instructions like "Less oil" or "Jain preparation" printed clearly.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>👨‍🍳</Text>
            <Text style={styles.mockTitle}>Kitchen Ticket Routing</Text>
            <Text style={styles.mockSub}>Kitchen Printer • Bar Printer • KDS</Text>
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
