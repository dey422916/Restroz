import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';

interface RegionData {
  region: string;
  badge: string;
  states: string;
  cities: string[];
  description: string;
  localInsights: string[];
  hardwareHighlight: string;
}

const REGIONS: RegionData[] = [
  {
    region: 'Eastern India',
    badge: 'EAST ZONE & BENGAL',
    states: 'West Bengal, Odisha, Assam, Bihar, Jharkhand',
    cities: ['Kolkata', 'Siliguri', 'Durgapur', 'Asansol', 'Howrah', 'Bhubaneswar', 'Cuttack', 'Puri', 'Guwahati', 'Patna', 'Ranchi'],
    description:
      'From heritage colonial dining rooms on Park Street and bustling sweet & mishti counters across Bengal, to coastal seafood restaurants in Puri and tea cafes in Guwahati.',
    localInsights: [
      'High demand for dual counter and kitchen KOT printing in multi-level restaurants.',
      'Specialized workflows for sweet shops with weighed items and express counter token slips.',
      'Regional language receipt support and offline resilience during monsoons.',
    ],
    hardwareHighlight: 'Readily pairs with popular thermal printers available across Chadni Market (Kolkata) and regional tech hubs.',
  },
  {
    region: 'Delhi NCR & Northern India',
    badge: 'NORTH ZONE & CAPITAL',
    states: 'Delhi NCR, Uttar Pradesh, Punjab, Haryana, Rajasthan, Chandigarh',
    cities: ['New Delhi', 'Noida', 'Gurgaon', 'Faridabad', 'Chandigarh', 'Lucknow', 'Kanpur', 'Jaipur', 'Ludhiana', 'Amritsar'],
    description:
      'High-speed dining ecosystems: high-volume QSR counters in Connaught Place, craft microbreweries in Gurgaon Cyber City, Awadhi dining in Lucknow, and highway dhabas in Punjab.',
    localInsights: [
      'Extreme peak dinner rushes requiring sub-second KOT thermal firing to prevent kitchen queues.',
      'Corporate B2B dining tax invoices with customer GSTIN capture for business lunches.',
      'Multi-kitchen routing separating Tandoor, Curry, and Beverage bar stations.',
    ],
    hardwareHighlight: 'Compatible with standard USB and LAN thermal printers from Nehru Place and Chandni Chowk electronics markets.',
  },
  {
    region: 'Western India',
    badge: 'WEST ZONE & FINANCIAL CAPITAL',
    states: 'Maharashtra, Gujarat, Goa',
    cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Ahmedabad', 'Surat', 'Vadodara', 'Panaji'],
    description:
      'From fast-paced coastal cafes and Irani diners in Mumbai to sprawling pure-veg thali restaurants in Ahmedabad and beach shacks across Goa.',
    localInsights: [
      'Split payment flexibility (UPI, Cash, and Card) heavily utilized by office lunch crowds.',
      'Liquor VAT and food GST mixed invoicing for restro-bars and coastal bistros.',
      'Daily register cash reconciliation audits to eliminate cashier counter discrepancies.',
    ],
    hardwareHighlight: 'Instant connectivity with hardware from Lamington Road (Mumbai) and local Gujarat electronics suppliers.',
  },
  {
    region: 'Southern India',
    badge: 'SOUTH ZONE & TECH CORRIDOR',
    states: 'Karnataka, Telangana, Tamil Nadu, Andhra Pradesh, Kerala',
    cities: ['Bengaluru', 'Hyderabad', 'Chennai', 'Kochi', 'Visakhapatnam', 'Vijayawada', 'Coimbatore', 'Mysuru', 'Thiruvananthapuram'],
    description:
      'India’s technology and culinary powerhouse: specialty third-wave coffee shops in Indiranagar, legendary high-speed biryani centers in Hyderabad, and tiffin houses in Chennai.',
    localInsights: [
      'High adoption of table QR digital menus and contactless self-ordering among tech workers.',
      'Handheld Android waiter mobile apps to speed up table turnaround times.',
      'Automated recipe inventory deductions to control high dairy, poultry, and spice costs.',
    ],
    hardwareHighlight: 'Seamless ESC/POS driver integration with printers from SP Road (Bengaluru) and Ritchie Street (Chennai).',
  },
  {
    region: 'Central & North-East India',
    badge: 'CENTRAL & NORTH-EAST',
    states: 'Madhya Pradesh, Chhattisgarh, Sikkim, Tripura, Meghalaya',
    cities: ['Indore', 'Bhopal', 'Raipur', 'Gangtok', 'Agartala', 'Shillong'],
    description:
      'Famous street food hubs (56 Dukan, Sarafa in Indore), family restaurants, hill station cafes, and growing multi-outlet regional food brands.',
    localInsights: [
      'Fast counter takeaway token printing with automated token numbers.',
      'Low bandwidth data efficiency (under 15MB/day) ensuring smooth operation even on budget mobile hotspots.',
      'Zero hardware lock-in: food startups can launch using budget laptops and thermal printers.',
    ],
    hardwareHighlight: 'Universal support for budget 58mm Bluetooth and USB portable thermal printers.',
  },
];

export default function LocationsHubPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  return (
    <MarketingLayout
      seo={{
        title: 'Restaurant POS Software in India — Cities & States Coverage | RestroZ',
        description:
          'Discover RestroZ restaurant POS software across India. Serving restaurant owners in Kolkata, Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, and 50+ dining capitals.',
        canonicalPath: '/info/locations',
        keywords: [
          'restaurant POS software India',
          'restaurant POS software Kolkata',
          'restaurant billing software Delhi',
          'restaurant management software Mumbai',
          'restaurant POS Bangalore',
          'restaurant POS Hyderabad',
          'KOT software Chennai',
          'restaurant billing software West Bengal',
        ],
      }}
    >
      {/* Hero Header */}
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>INDIA-WIDE RESTAURANT PLATFORM</Text>
          </View>
          <Text role="heading" aria-level={1} style={styles.title}>
            Modern Restaurant POS & Billing Software Across India
          </Text>
          <Text style={styles.subtitle}>
            Empowering cafes, dine-in restaurants, quick-service food counters, and multi-outlet chains
            across all 28 Indian States and Union Territories with cloud speed and offline reliability.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Book a Free Demo for Your City →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Regions Grid */}
      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <View style={styles.sectionHeadingBlock}>
            <Text style={styles.sectionTitle}>Regional Coverage & Tailored Restaurant Solutions</Text>
            <Text style={styles.sectionSubtitle}>
              RestroZ adapts to local Indian restaurant business models, statutory compliance, and hardware environments.
            </Text>
          </View>

          <View style={styles.regionList}>
            {REGIONS.map((reg) => (
              <View key={reg.region} style={styles.regionCard}>
                <View style={styles.regionHeader}>
                  <View style={styles.badgeBox}>
                    <Text style={styles.badgeText}>{reg.badge}</Text>
                  </View>
                  <Text style={styles.regionName}>{reg.region}</Text>
                  <Text style={styles.statesText}>{reg.states}</Text>
                </View>

                <Text style={styles.regionDesc}>{reg.description}</Text>

                {/* Cities Pills */}
                <View style={styles.cityPillsRow}>
                  {reg.cities.map((city) => (
                    <View key={city} style={styles.cityPill}>
                      <Text style={styles.cityPillText}>📍 {city}</Text>
                    </View>
                  ))}
                </View>

                {/* Local Insights */}
                <View style={styles.insightsBox}>
                  <Text style={styles.insightsTitle}>Key Operational Requirements:</Text>
                  {reg.localInsights.map((insight, idx) => (
                    <View key={idx} style={styles.insightItem}>
                      <Text style={styles.insightDot}>✓</Text>
                      <Text style={styles.insightText}>{insight}</Text>
                    </View>
                  ))}
                </View>

                {/* Hardware Note */}
                <View style={styles.hardwareBox}>
                  <Text style={styles.hardwareText}>🔌 Hardware Compatibility: {reg.hardwareHighlight}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Onboarding & Deployment Guarantee */}
          <View style={styles.guaranteeCard}>
            <View style={{ gap: 8, flex: 1, minWidth: 280 }}>
              <Text style={styles.guaranteeTitle}>Remote Setup in Under 30 Minutes Anywhere in India</Text>
              <Text style={styles.guaranteeDesc}>
                Whether your food business is located in central Delhi, downtown Bengaluru, or a peaceful hill station
                in Himachal or Sikkim, our cloud platform deploys instantly without waiting for on-site technician visits.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.demoActionBtn}
              onPress={() => router.push('/info/book-demo' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.demoActionBtnText}>Schedule Free Demo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    maxWidth: 760,
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
  contentSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 56,
    width: '100%',
  },
  contentInner: {
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 36,
  },
  sectionHeadingBlock: {
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 700,
  },
  regionList: {
    gap: 24,
  },
  regionCard: {
    backgroundColor: '#FAF9F6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 28,
    gap: 16,
  },
  regionHeader: {
    gap: 6,
  },
  badgeBox: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF4EB',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EA580C',
  },
  regionName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  statesText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  regionDesc: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  cityPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cityPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  cityPillText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  insightsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 8,
  },
  insightsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  insightDot: {
    color: '#16A34A',
    fontWeight: '800',
    fontSize: 13,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  hardwareBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hardwareText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  guaranteeCard: {
    backgroundColor: '#0B132B',
    borderRadius: 16,
    padding: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 20,
  },
  guaranteeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  guaranteeDesc: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 22,
  },
  demoActionBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  demoActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
