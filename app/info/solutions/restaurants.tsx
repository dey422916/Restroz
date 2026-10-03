import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function RestaurantsSolutionPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'POS & Management System for Dine-In Restaurants — RestroZ',
        description:
          'Elevate your full-service dining room with RestroZ. Interactive table maps, table-side waiter ordering, category KOT routing, and split payment settlement.',
        canonicalPath: '/info/solutions/restaurants',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>DINE-IN RESTAURANTS</Text>
          </View>
          <Text style={styles.title}>Flawless Table Service from Greeting to Final Settle</Text>
          <Text style={styles.subtitle}>
            Delight diners with faster service, perfectly paced kitchen tickets, and frictionless table billing.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Schedule a Restaurant Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="FULL-SERVICE EXCELLENCE"
        title="Speed, Precision & Table Coordination"
        subtitle="Manage complex dining rooms with ease. RestroZ keeps your servers, bartenders, and chefs coordinated."
        bullets={[
          { title: 'Interactive Floor Layouts', desc: 'Monitor table turn times and live guest occupancy at a glance.' },
          { title: 'Table-Side Ordering', desc: 'Waiters send KOT tickets directly from mobile phones right at the table.' },
          { title: 'Split & Partial Payments', desc: 'Easily divide checks across guests with mixed payment methods.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🍽️</Text>
            <Text style={styles.mockTitle}>Dine-In Management</Text>
            <Text style={styles.mockSub}>Tables • Waiters • Kitchen Pacing</Text>
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
