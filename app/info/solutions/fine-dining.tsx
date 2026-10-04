import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function FineDiningSolutionPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'POS & Guest Experience Software for Fine Dining — RestroZ',
        description:
          'Deliver exceptional dining hospitality with RestroZ. Multi-course pacing, VIP guest preferences, sommelier bar tickets, and discreet table-side billing.',
        canonicalPath: '/info/solutions/fine-dining',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>FINE DINING & PREMIUM HOSPITALITY</Text>
          </View>
          <Text style={styles.title}>Refined Service Flow & Multi-Course Pacing</Text>
          <Text style={styles.subtitle}>
            Provide unforgettable dining experiences with course firing (Starters, Mains, Desserts), custom guest notes, and discreet table-side payment settlement.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Schedule a Fine Dining Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="WHITE GLOVE SERVICE"
        title="Course Management & Guest Preference Tracking"
        subtitle="Give stewards and captains the tools to coordinate multi-course banquets and tasting menus without friction."
        bullets={[
          { title: 'Multi-Course Kitchen Firing', desc: 'Hold main courses until starters are cleared with intuitive captain controls.' },
          { title: 'VIP Guest History & Allergies', desc: 'Record guest seating preferences, dietary restrictions, and favorite vintages.' },
          { title: 'Discreet Settle Options', desc: 'Print elegant interim guest checks and settle with multi-card or contactless QR.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🍷</Text>
            <Text style={styles.mockTitle}>Fine Dining Suite</Text>
            <Text style={styles.mockSub}>Course Pacing • VIP Guest History</Text>
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
