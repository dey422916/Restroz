import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Linking,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';

export function MarketingFooter() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const handleNav = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={styles.footerContainer}>
      <View style={styles.footerInner}>
        {/* Top CTA Banner */}
        <View style={styles.topCtaCard}>
          <View style={styles.topCtaTextCol}>
            <Text style={styles.topCtaTitle}>Ready to Upgrade Your Restaurant Operations?</Text>
            <Text style={styles.topCtaSubtitle}>
              Join modern restaurants, cafes, and multi-outlet food chains growing with RestroZ.
            </Text>
          </View>
          <View style={styles.topCtaActionCol}>
            <TouchableOpacity
              style={styles.ctaPrimaryBtn}
              onPress={() => handleNav('/info/book-demo')}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaPrimaryText}>Schedule a Live Demo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaSecondaryBtn}
              onPress={() => handleNav('/info/contact')}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaSecondaryText}>Talk to Sales</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Main Footer Columns */}
        <View style={[styles.columnsGrid, !isDesktop && styles.columnsGridMobile]}>
          {/* Brand Col */}
          <View style={styles.brandCol}>
            <View style={styles.footerLogoBlock}>
              <Image
                source={require('../../../assets/images/restroz-logo.png')}
                style={styles.footerLogoImg}
                resizeMode="contain"
              />
              <Text style={styles.footerLogoTagline}>RESTAURANT MANAGEMENT</Text>
            </View>
            <Text style={styles.brandDesc}>
              Complete modern cloud restaurant management platform. Powering high-speed POS billing,
              kitchen KOT, table-side waiter app, dynamic QR menus, inventory, and multi-outlet operations.
            </Text>
            <View style={styles.contactInfoBlock}>
              <Text style={styles.contactItem}>📞 Sales: +91 7098513441</Text>
              <Text style={styles.contactItem}>✉️ Email: sales@restroz.shop</Text>
              <Text style={styles.contactItem}>🌐 Website: restroz.shop</Text>
            </View>
          </View>

          {/* Features Col */}
          <View style={styles.navCol}>
            <Text style={styles.colTitle}>Product & POS</Text>
            <TouchableOpacity onPress={() => handleNav('/info/features/pos-billing')}>
              <Text style={styles.colLink}>POS Billing Engine</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/features/kot-kitchen')}>
              <Text style={styles.colLink}>KOT & Kitchen Display</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/features/waiter-mobile-app')}>
              <Text style={styles.colLink}>Waiter Mobile App</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/features/qr-digital-menu')}>
              <Text style={styles.colLink}>QR Table Ordering</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/features/inventory')}>
              <Text style={styles.colLink}>Inventory & Recipe Cost</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/features/table-management')}>
              <Text style={styles.colLink}>Table Floor Management</Text>
            </TouchableOpacity>
          </View>

          {/* Solutions Col */}
          <View style={styles.navCol}>
            <Text style={styles.colTitle}>Solutions</Text>
            <TouchableOpacity onPress={() => handleNav('/info/solutions/restaurants')}>
              <Text style={styles.colLink}>Dine-In Restaurants</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/solutions/cafes')}>
              <Text style={styles.colLink}>Cafes & Bakeries</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/solutions/cloud-kitchens')}>
              <Text style={styles.colLink}>Cloud Kitchens</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/solutions/quick-service-restaurants')}>
              <Text style={styles.colLink}>QSR & Fast Food</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/solutions/fine-dining')}>
              <Text style={styles.colLink}>Fine Dining</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/solutions/multi-outlet-restaurants')}>
              <Text style={styles.colLink}>Multi-Outlet Chains</Text>
            </TouchableOpacity>
          </View>

          {/* Company & Resources Col */}
          <View style={styles.navCol}>
            <Text style={styles.colTitle}>Company & Legal</Text>
            <TouchableOpacity onPress={() => handleNav('/info/pricing')}>
              <Text style={styles.colLink}>Plans & Pricing</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/about')}>
              <Text style={styles.colLink}>About RestroZ</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/contact')}>
              <Text style={styles.colLink}>Contact & Support</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/faq')}>
              <Text style={styles.colLink}>Help & FAQ</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/blog')}>
              <Text style={styles.colLink}>Resource Center</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/privacy-policy')}>
              <Text style={styles.colLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleNav('/info/terms')}>
              <Text style={styles.colLink}>Terms of Service</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bottom Bar */}
        <View style={styles.bottomBar}>
          <Text style={styles.copyrightText}>
            © {new Date().getFullYear()} RestroZ. All rights reserved. "Good Food Brings People Together"
          </Text>
          <View style={styles.bottomLinksRow}>
            <TouchableOpacity onPress={() => handleNav('/info/privacy-policy')}>
              <Text style={styles.bottomLegalLink}>Privacy</Text>
            </TouchableOpacity>
            <Text style={styles.bottomDivider}>•</Text>
            <TouchableOpacity onPress={() => handleNav('/info/terms')}>
              <Text style={styles.bottomLegalLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.bottomDivider}>•</Text>
            <TouchableOpacity onPress={() => handleNav('/info/contact')}>
              <Text style={styles.bottomLegalLink}>Security</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerContainer: {
    backgroundColor: '#0B132B',
    paddingTop: 60,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    width: '100%',
  },
  footerInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  topCtaCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 20,
    marginBottom: 60,
  },
  topCtaTextCol: {
    flex: 1,
    minWidth: 280,
  },
  topCtaTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  topCtaSubtitle: {
    fontSize: 15,
    color: '#94A3B8',
    marginTop: 8,
    lineHeight: 22,
  },
  topCtaActionCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  ctaPrimaryBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  ctaSecondaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  ctaSecondaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  columnsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 32,
    marginBottom: 48,
  },
  columnsGridMobile: {
    flexDirection: 'column',
    gap: 32,
  },
  brandCol: {
    flex: 1.4,
    minWidth: 260,
  },
  footerLogoBlock: {
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  footerLogoImg: {
    width: 68,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 2,
  },
  footerLogoTagline: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  brandDesc: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 22,
    marginBottom: 20,
  },
  contactInfoBlock: {
    gap: 8,
  },
  contactItem: {
    fontSize: 14,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  navCol: {
    flex: 1,
    minWidth: 160,
    gap: 12,
  },
  colTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  colLink: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '500',
    paddingVertical: 2,
  },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  copyrightText: {
    fontSize: 13,
    color: '#64748B',
  },
  bottomLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bottomLegalLink: {
    fontSize: 13,
    color: '#94A3B8',
  },
  bottomDivider: {
    color: '#475569',
  },
});
