import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';

interface FeatureCard {
  number: string;
  icon: string;
  title: string;
  description: string;
  route: string;
  tag: string;
}

const FEATURES: FeatureCard[] = [
  {
    number: '01',
    icon: '⚡',
    title: 'POS & Fast Billing',
    description: 'Lightning-fast Dine-In, Takeaway, and Delivery billing with split payments, discounts & thermal receipt printing.',
    route: '/info/features/pos-billing',
    tag: 'Core POS',
  },
  {
    number: '02',
    icon: '👨‍🍳',
    title: 'KOT & Kitchen Display',
    description: 'Instant kitchen order tickets, category printer routing, supplementary order tracking & zero lost food orders.',
    route: '/info/features/kot-kitchen',
    tag: 'Operations',
  },
  {
    number: '03',
    icon: '📱',
    title: 'Waiter Mobile App',
    description: 'Empower waitstaff to punch orders right at the table using any smartphone or tablet. Cuts service time by 40%.',
    route: '/info/features/waiter-mobile-app',
    tag: 'Mobility',
  },
  {
    number: '04',
    icon: '📲',
    title: 'QR Digital Menu',
    description: 'Dynamic table-side contactless QR ordering. Guests scan, browse high-res photos, customize, and order effortlessly.',
    route: '/info/features/qr-digital-menu',
    tag: 'Guest Experience',
  },
  {
    number: '05',
    icon: '🌐',
    title: 'Restaurant Website',
    description: 'Launch your own branded online ordering website. Accept direct delivery orders without paying 30% aggregator commissions.',
    route: '/info/features/restaurant-website',
    tag: 'Direct Sales',
  },
  {
    number: '06',
    icon: '🎁',
    title: 'Loyalty & Wallet',
    description: 'Automated cashback rewards, customer store credit wallets, and repeat visit incentives that build customer retention.',
    route: '/info/features/loyalty-rewards',
    tag: 'Marketing',
  },
  {
    number: '07',
    icon: '🪑',
    title: 'Table Management',
    description: 'Interactive live floor maps, table status indicators, guest counts, split tables, and occupancy monitoring.',
    route: '/info/features/table-management',
    tag: 'Floor Ops',
  },
  {
    number: '08',
    icon: '📋',
    title: 'Menu Management',
    description: 'Easily update items, variants, add-on groups, spicy/veg tags, tax slabs, and out-of-stock items in real time.',
    route: '/info/features/menu-management',
    tag: 'Catalog',
  },
  {
    number: '09',
    icon: '📦',
    title: 'Inventory & Stock',
    description: 'Recipe-based raw ingredient tracking, automated low-stock warnings, purchase management, and wastage reduction.',
    route: '/info/features/inventory',
    tag: 'Cost Control',
  },
  {
    number: '10',
    icon: '👥',
    title: 'Staff & Permissions',
    description: 'Granular role-based access for Cashiers, Waiters, Chefs, and Managers with day register cash float tracking.',
    route: '/info/features/staff-management',
    tag: 'Security',
  },
  {
    number: '11',
    icon: '📊',
    title: 'Reports & Analytics',
    description: 'Item-wise sales trends, hourly peak analysis, payment breakdowns, GST tax summaries, and executive dashboards.',
    route: '/info/features/reports-analytics',
    tag: 'Intelligence',
  },
  {
    number: '12',
    icon: '🏢',
    title: 'Multi-Outlet Control',
    description: 'Centrally manage menus, pricing, staff, and aggregated performance across multiple restaurant branches and franchises.',
    route: '/info/features/multi-outlet',
    tag: 'Enterprise',
  },
];

export function FeaturePillarGrid() {
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
        {/* Section Header */}
        <View style={styles.headerBlock}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>POWERFUL CAPABILITIES</Text>
          </View>
          <Text style={styles.sectionTitle}>
            Everything You Need to Run & Grow Your Food Business
          </Text>
          <Text style={styles.sectionSubtitle}>
            RestroZ replaces disjointed software tools with a single, synchronized restaurant operating system.
          </Text>
        </View>

        {/* Feature Cards Grid */}
        <View style={styles.grid}>
          {FEATURES.map((item) => (
            <TouchableOpacity
              key={item.number}
              style={[
                styles.card,
                isDesktop ? styles.cardDesktop : isTablet ? styles.cardTablet : styles.cardMobile,
              ]}
              onPress={() => handleNav(item.route)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTopRow}>
                <View style={styles.iconCircle}>
                  <Text style={styles.cardIcon}>{item.icon}</Text>
                </View>
                <View style={styles.tagWrap}>
                  <Text style={styles.cardTag}>{item.tag}</Text>
                  <Text style={styles.cardNumber}>{item.number}</Text>
                </View>
              </View>

              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>{item.description}</Text>

              <View style={styles.cardLinkRow}>
                <Text style={styles.cardLinkText}>Explore feature</Text>
                <Text style={styles.cardLinkArrow}>→</Text>
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
    maxWidth: 800,
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
    fontSize: 34,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 42,
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
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDesktop: {
    width: '31%',
    minWidth: 320,
  },
  cardTablet: {
    width: '47%',
  },
  cardMobile: {
    width: '100%',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 22,
  },
  tagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: '#94A3B8',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardDesc: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  cardLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
  },
  cardLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FC8019',
  },
  cardLinkArrow: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FC8019',
  },
});
