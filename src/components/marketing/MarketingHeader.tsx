import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';

interface NavItem {
  label: string;
  route: string;
  children?: { label: string; route: string; description: string; icon: string }[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Products & Features',
    route: '/info/features',
    children: [
      { label: 'POS Billing', route: '/info/features/pos-billing', description: 'Fast dine-in, takeaway & delivery billing', icon: '⚡' },
      { label: 'KOT & Kitchen', route: '/info/features/kot-kitchen', description: 'Real-time kitchen order tickets & display', icon: '👨‍🍳' },
      { label: 'Waiter Mobile App', route: '/info/features/waiter-mobile-app', description: 'Table-side ordering directly from phones', icon: '📱' },
      { label: 'QR Digital Menu', route: '/info/features/qr-digital-menu', description: 'Contactless scan, browse & order at tables', icon: '📲' },
      { label: 'Inventory & Stock', route: '/info/features/inventory', description: 'Recipe costing, low stock alerts & wastage', icon: '📦' },
      { label: 'Table Management', route: '/info/features/table-management', description: 'Live floor occupancy & table status', icon: '🪑' },
      { label: 'Menu Management', route: '/info/features/menu-management', description: 'Dynamic items, categories & modifiers', icon: '📋' },
      { label: 'Staff & Roles', route: '/info/features/staff-management', description: 'Role-based access & cashier tracking', icon: '👥' },
      { label: 'Reports & Analytics', route: '/info/features/reports-analytics', description: 'Deep financial & item sales insights', icon: '📊' },
      { label: 'Loyalty & Wallet', route: '/info/features/loyalty-rewards', description: 'Cashback, customer wallet & retention', icon: '🎁' },
      { label: 'Multi-Outlet', route: '/info/features/multi-outlet', description: 'Centralized chain & franchise control', icon: '🏢' },
      { label: 'Restaurant Website', route: '/info/features/restaurant-website', description: 'Branded online ordering storefront', icon: '🌐' },
    ],
  },
  {
    label: 'Solutions',
    route: '/info/solutions',
    children: [
      { label: 'Restaurants & Dine-In', route: '/info/solutions/restaurants', description: 'Full-service table management & KOT', icon: '🍽️' },
      { label: 'Cafés & Bakeries', route: '/info/solutions/cafes', description: 'Quick checkout & beverage workflows', icon: '☕' },
      { label: 'Cloud Kitchens', route: '/info/solutions/cloud-kitchens', description: 'High-volume delivery order routing', icon: '🛵' },
      { label: 'Quick Service (QSR)', route: '/info/solutions/quick-service-restaurants', description: 'Rapid counter billing & token system', icon: '🍔' },
      { label: 'Fine Dining', route: '/info/solutions/fine-dining', description: 'Multi-course pacing & premium service', icon: '🍷' },
      { label: 'Multi-Outlet Chains', route: '/info/solutions/multi-outlet-restaurants', description: 'Unified reports & global catalog control', icon: '🌐' },
    ],
  },
  { label: 'Pricing', route: '/info/pricing' },
  { label: 'About', route: '/info/about' },
  { label: 'Blog', route: '/info/blog' },
  { label: 'FAQ', route: '/info/faq' },
  { label: 'Contact', route: '/info/contact' },
];

export function MarketingHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleScroll = () => {
        setScrolled(window.scrollY > 20);
      };
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, []);

  const handleNav = (route: string) => {
    setActiveDropdown(null);
    setMobileMenuOpen(false);
    router.push(route as any);
  };

  return (
    <View style={[styles.headerContainer, scrolled && styles.headerScrolled]}>
      <View style={styles.headerInner}>
        {/* Logo */}
        <TouchableOpacity
          style={styles.logoBlock}
          onPress={() => handleNav('/info')}
          activeOpacity={0.8}
        >
          <Image
            source={require('../../../assets/images/restroz-logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <Text style={styles.logoTagline}>RESTAURANT MANAGEMENT</Text>
        </TouchableOpacity>

        {/* Desktop Navigation */}
        {isDesktop && (
          <View style={styles.desktopNav}>
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.route || pathname.startsWith(`${item.route}/`);
              const hasDropdown = item.children && item.children.length > 0;

              const ViewComponent: any = View;
              return (
                <ViewComponent
                  key={item.label}
                  style={styles.navItemWrapper}
                  onMouseEnter={() => hasDropdown && setActiveDropdown(item.label)}
                  onMouseLeave={() => hasDropdown && setActiveDropdown(null)}
                >
                  <TouchableOpacity
                    style={[styles.navItem, isActive && styles.navItemActive]}
                    onPress={() => handleNav(item.route)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.navItemText, isActive && styles.navItemTextActive]}>
                      {item.label}
                    </Text>
                    {hasDropdown && <Text style={styles.dropdownArrow}>▾</Text>}
                  </TouchableOpacity>

                  {/* Dropdown Menu */}
                  {hasDropdown && activeDropdown === item.label && (
                    <View style={styles.dropdownMenu}>
                      <View style={styles.dropdownGrid}>
                        {item.children?.map((child) => (
                          <TouchableOpacity
                            key={child.route}
                            style={styles.dropdownCard}
                            onPress={() => handleNav(child.route)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.dropdownCardIcon}>{child.icon}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.dropdownCardTitle}>{child.label}</Text>
                              <Text style={styles.dropdownCardDesc}>{child.description}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </ViewComponent>
              );
            })}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() => router.push('/(auth)/login' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.loginBtnText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.demoBtn}
            onPress={() => handleNav('/info/book-demo')}
            activeOpacity={0.85}
          >
            <Text style={styles.demoBtnText}>Book a Demo</Text>
          </TouchableOpacity>

          {/* Mobile Hamburger Toggle */}
          {!isDesktop && (
            <TouchableOpacity
              style={styles.hamburgerBtn}
              onPress={() => setMobileMenuOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.hamburgerIcon}>☰</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Mobile Drawer Navigation Modal */}
      {!isDesktop && (
        <Modal
          visible={mobileMenuOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setMobileMenuOpen(false)}
        >
          <View style={styles.mobileOverlay}>
            <View style={styles.mobileDrawer}>
              <View style={styles.mobileDrawerHeader}>
                <TouchableOpacity
                  style={styles.logoBlock}
                  onPress={() => handleNav('/info')}
                  activeOpacity={0.8}
                >
                  <Image
                    source={require('../../../assets/images/restroz-logo.png')}
                    style={styles.logoImg}
                    resizeMode="contain"
                  />
                  <Text style={styles.logoTagline}>RESTAURANT MANAGEMENT</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeDrawerBtn}
                  onPress={() => setMobileMenuOpen(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.closeDrawerIcon}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.mobileScroll} showsVerticalScrollIndicator={false}>
                {NAV_ITEMS.map((item) => (
                  <View key={item.label} style={styles.mobileNavItemBlock}>
                    <TouchableOpacity
                      style={styles.mobileNavItem}
                      onPress={() => handleNav(item.route)}
                    >
                      <Text style={styles.mobileNavItemText}>{item.label}</Text>
                    </TouchableOpacity>

                    {item.children && (
                      <View style={styles.mobileSubNavList}>
                        {item.children.map((child) => (
                          <TouchableOpacity
                            key={child.route}
                            style={styles.mobileSubNavItem}
                            onPress={() => handleNav(child.route)}
                          >
                            <Text style={styles.mobileSubNavIcon}>{child.icon}</Text>
                            <Text style={styles.mobileSubNavText}>{child.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                ))}

                <View style={styles.mobileDrawerFooter}>
                  <TouchableOpacity
                    style={styles.mobileDrawerDemoBtn}
                    onPress={() => handleNav('/info/book-demo')}
                  >
                    <Text style={styles.mobileDrawerDemoText}>Book a Free Demo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.mobileDrawerLoginBtn}
                    onPress={() => {
                      setMobileMenuOpen(false);
                      router.push('/(auth)/login' as any);
                    }}
                  >
                    <Text style={styles.mobileDrawerLoginText}>Sign In to RestroZ POS</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: 'sticky' as any,
    top: 0,
    zIndex: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(12px)' } as any) : {}),
    width: '100%',
  },
  headerScrolled: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    borderBottomColor: '#E2E8F0',
  },
  headerInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    minHeight: 74,
  },
  logoBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: 60,
    height: 44,
  },
  logoTagline: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 2,
    textAlign: 'center',
  },
  desktopNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navItemWrapper: {
    position: 'relative' as any,
    paddingVertical: 10,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  navItemActive: {
    backgroundColor: '#FFF4EB',
  },
  navItemText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  navItemTextActive: {
    color: '#FC8019',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#64748B',
  },
  dropdownMenu: {
    position: 'absolute' as any,
    top: 48,
    left: -100,
    width: 620,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 1000,
  },
  dropdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dropdownCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 10,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  dropdownCardIcon: {
    fontSize: 20,
    marginTop: 2,
  },
  dropdownCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropdownCardDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loginBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  loginBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  demoBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#FC8019',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  demoBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  hamburgerBtn: {
    padding: 8,
  },
  hamburgerIcon: {
    fontSize: 24,
    color: '#0F172A',
  },
  mobileOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  mobileDrawer: {
    backgroundColor: '#FFFFFF',
    height: '90%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  mobileDrawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  closeDrawerBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  closeDrawerIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileScroll: {
    flex: 1,
    paddingTop: 12,
  },
  mobileNavItemBlock: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    paddingBottom: 8,
  },
  mobileNavItem: {
    paddingVertical: 8,
  },
  mobileNavItemText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileSubNavList: {
    paddingLeft: 12,
    paddingTop: 4,
    gap: 8,
  },
  mobileSubNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  mobileSubNavIcon: {
    fontSize: 16,
  },
  mobileSubNavText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  mobileDrawerFooter: {
    paddingVertical: 24,
    gap: 12,
  },
  mobileDrawerDemoBtn: {
    backgroundColor: '#FC8019',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  mobileDrawerDemoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  mobileDrawerLoginBtn: {
    backgroundColor: '#F8FAFC',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mobileDrawerLoginText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
});
