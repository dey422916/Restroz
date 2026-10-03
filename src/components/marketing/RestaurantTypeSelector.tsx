import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';

const TYPES = [
  {
    icon: '🍽️',
    title: 'Dine-In Restaurants',
    desc: 'Table floor plans, multi-terminal KOT, split bills, and guest loyalty.',
    route: '/info/solutions/restaurants',
  },
  {
    icon: '☕',
    title: 'Cafés & Bakeries',
    desc: 'Rapid counter checkout, barista ticket routing, and takeaway tokens.',
    route: '/info/solutions/cafes',
  },
  {
    icon: '🛵',
    title: 'Cloud Kitchens',
    desc: 'High-volume delivery order dispatch, raw inventory costing, and multi-brand support.',
    route: '/info/solutions/cloud-kitchens',
  },
  {
    icon: '🍔',
    title: 'Quick Service (QSR)',
    desc: 'Self-ordering QR, combo items, express checkout, and lightning counter speed.',
    route: '/info/solutions/quick-service-restaurants',
  },
  {
    icon: '🍷',
    title: 'Fine Dining',
    desc: 'Course pacing, custom table seating, steward assignment, and premium service flow.',
    route: '/info/solutions/fine-dining',
  },
  {
    icon: '🏢',
    title: 'Multi-Outlet Chains',
    desc: 'Centralized catalog control, cross-outlet reports, and franchise billing.',
    route: '/info/solutions/multi-outlet-restaurants',
  },
];

export function RestaurantTypeSelector() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 992;
  const isTablet = width >= 640 && width < 992;

  const handleNav = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionInner}>
        <View style={styles.headerBlock}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>TAILORED SOLUTIONS</Text>
          </View>
          <Text style={styles.sectionTitle}>Built for Every Kind of Food Business</Text>
          <Text style={styles.sectionSubtitle}>
            Whether you operate a single cozy café or a 50-branch franchise network, RestroZ adapts to your operational style.
          </Text>
        </View>

        <View style={styles.grid}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t.title}
              style={[
                styles.card,
                isDesktop ? styles.cardDesktop : isTablet ? styles.cardTablet : styles.cardMobile,
              ]}
              onPress={() => handleNav(t.route)}
              activeOpacity={0.8}
            >
              <Text style={styles.icon}>{t.icon}</Text>
              <Text style={styles.title}>{t.title}</Text>
              <Text style={styles.desc}>{t.desc}</Text>
              <View style={styles.linkRow}>
                <Text style={styles.linkText}>View solution</Text>
                <Text style={styles.linkArrow}>→</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 72,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  sectionInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 48,
  },
  headerBlock: {
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 12,
    maxWidth: 750,
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
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FAF9F6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    gap: 12,
  },
  cardDesktop: {
    width: '31%',
    minWidth: 300,
  },
  cardTablet: {
    width: '47%',
  },
  cardMobile: {
    width: '100%',
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  desc: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FC8019',
  },
  linkArrow: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FC8019',
  },
});
