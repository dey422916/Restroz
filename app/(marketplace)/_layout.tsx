import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, useWindowDimensions, Image } from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCustomerCart } from '../../src/context/CustomerCartContext';
import { useAuth } from '../../src/context/AuthContext';
import { customerColors } from '../../src/utils/colors';

export default function MarketplaceLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const { itemCount } = useCustomerCart();
  const { user, role, loading, superAdminMarketplacePreview, setSuperAdminMarketplacePreview } = useAuth();

  // Authoritative Route Guard:
  // 1. Restaurant ADMIN & STAFF must NEVER access customer marketplace directly -> Redirect to POS
  // 2. SUPER_ADMIN must NEVER auto-land in customer marketplace unless explicit preview mode is active
  useEffect(() => {
    if (!loading && user) {
      if (role === 'ADMIN' || role === 'STAFF') {
        router.replace('/(admin)/pos' as any);
      } else if (role === 'SUPER_ADMIN' && !superAdminMarketplacePreview) {
        router.replace('/super-admin' as any);
      }
    }
  }, [user, role, loading, superAdminMarketplacePreview]);

  if (!loading && user && (role === 'ADMIN' || role === 'STAFF' || (role === 'SUPER_ADMIN' && !superAdminMarketplacePreview))) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
        <ActivityIndicator size="large" color={customerColors.primary} />
      </View>
    );
  }
  const tabs = [
    { name: 'Explore', icon: '🏠', route: '/(marketplace)', path: '/' },
    { name: 'Cart', icon: '🛍️', route: '/(marketplace)/cart', path: '/cart' },
    { name: 'My Orders', icon: '📋', route: '/(marketplace)/orders', path: '/orders' },
    { name: 'Addresses', icon: '📍', route: '/(marketplace)/addresses', path: '/addresses' },
    user
      ? { name: 'Profile', icon: '👤', route: '/(marketplace)/profile', path: '/profile' }
      : { name: 'Login', icon: '👤', route: '/(auth)/login', path: '/login' },
  ];

  const isTabActive = (tab: { name: string; icon: string; route: string; path: string }) => {
    if (tab.name === 'Explore') {
      return (
        pathname === '/(marketplace)' ||
        pathname === '/(marketplace)/' ||
        pathname === '/(marketplace)/index' ||
        pathname === '/marketplace' ||
        pathname === '/marketplace/' ||
        pathname === '/' ||
        pathname === ''
      );
    }
    if (tab.name === 'Login') {
      return (
        pathname === '/(auth)/login' ||
        pathname === '/login' ||
        pathname.startsWith('/(auth)/login') ||
        pathname.includes('login')
      );
    }
    return (
      pathname === tab.route ||
      pathname === tab.path ||
      pathname.startsWith(tab.route) ||
      pathname.startsWith(tab.path) ||
      pathname.includes(tab.path.replace('/', ''))
    );
  };

  const handleTabPress = (tab: { name: string; icon: string; route: string; path: string }) => {
    try {
      router.push(tab.route as any);
    } catch {
      try {
        router.replace(tab.route as any);
      } catch {
        router.push(tab.path as any);
      }
    }
  };

  // Safe area bottom calculation ensuring clean, sleek bottom navigation without huge blank margins
  const bottomInset = Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        {/* Super Admin Marketplace Preview Header Banner */}
        {role === 'SUPER_ADMIN' && superAdminMarketplacePreview && (
          <View style={styles.superAdminBanner}>
            <View style={styles.superAdminBannerLeft}>
              <Text style={{ fontSize: 16 }}>🛡️</Text>
              <View>
                <Text style={styles.superAdminBannerTitle}>Super Admin Preview</Text>
                <Text style={styles.superAdminBannerSub}>Viewing customer marketplace as platform admin</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.backToSuperAdminBtn}
              onPress={() => {
                setSuperAdminMarketplacePreview(false);
                router.replace('/super-admin' as any);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.backToSuperAdminBtnText}>← Back to Super Admin</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Desktop Web Top Navigation Bar */}
        {isDesktop && (
          <View style={styles.desktopNavbar}>
            <View style={styles.desktopNavInner}>
              <TouchableOpacity
                style={styles.desktopLogoWrap}
                onPress={() => router.push('/(marketplace)')}
                activeOpacity={0.8}
              >
                <Image
                  source={require('../../assets/images/restroz_logo.png')}
                  style={styles.desktopLogo}
                  resizeMode="contain"
                />
                <View>
                  <Text style={styles.desktopBrandName}>RestroZ</Text>
                  <Text style={styles.desktopBrandSub}>Every flavor, one place</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.desktopNavLinks}>
                {tabs.map((tab) => {
                  const active = isTabActive(tab);
                  const isCart = tab.name === 'Cart';
                  const isProfile = tab.name === 'Profile';

                  return (
                    <TouchableOpacity
                      key={tab.name}
                      style={[styles.desktopNavLink, active && styles.desktopNavLinkActive]}
                      onPress={() => handleTabPress(tab)}
                      activeOpacity={0.8}
                    >
                      {isProfile && user?.avatar_url ? (
                        <Image source={{ uri: user.avatar_url }} style={styles.navAvatarDesktop} />
                      ) : (
                        <Text style={styles.desktopNavIcon}>{tab.icon}</Text>
                      )}
                      <Text style={[styles.desktopNavText, active && styles.desktopNavTextActive]}>
                        {tab.name}
                      </Text>
                      {isCart && itemCount > 0 && (
                        <View style={styles.desktopCartBadge}>
                          <Text style={styles.desktopCartBadgeText}>{itemCount}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* Main Content */}
        <View style={styles.content}>
          <Slot />
        </View>

        {/* Mobile Bottom Navigation Bar (hidden on desktop) */}
        {!isDesktop && (
          <View style={[styles.bottomNavWrapper, { paddingBottom: bottomInset }]}>
            <View style={styles.bottomNavInner}>
              {tabs.map((tab) => {
                const active = isTabActive(tab);
                const isCart = tab.name === 'Cart';
                const isProfile = tab.name === 'Profile';

                return (
                  <TouchableOpacity
                    key={tab.name}
                    style={styles.navItem}
                    onPress={() => handleTabPress(tab)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <View style={styles.iconWrap}>
                      {isProfile && user?.avatar_url ? (
                        <Image source={{ uri: user.avatar_url }} style={styles.navAvatarMobile} />
                      ) : (
                        <Text style={{ fontSize: 20 }}>{tab.icon}</Text>
                      )}
                      {isCart && itemCount > 0 && (
                        <View style={styles.cartBadge}>
                          <Text style={styles.cartBadgeText}>{itemCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                      {tab.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  content: {
    flex: 1,
  },
  desktopNavbar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDEBE6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
    zIndex: 100,
  },
  desktopNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  desktopLogoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  desktopLogo: {
    width: 38,
    height: 38,
  },
  desktopBrandName: {
    fontSize: 20,
    fontWeight: '900',
    color: customerColors.primary,
    letterSpacing: -0.5,
  },
  desktopBrandSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
    letterSpacing: 0.2,
  },
  desktopNavLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  desktopNavLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  desktopNavLinkActive: {
    backgroundColor: '#FFF4EB',
    borderColor: '#FED7AA',
  },
  desktopNavIcon: {
    fontSize: 15,
  },
  desktopNavText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  desktopNavTextActive: {
    color: customerColors.primary,
    fontWeight: '800',
  },
  desktopCartBadge: {
    backgroundColor: customerColors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 2,
  },
  desktopCartBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  bottomNavWrapper: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    width: '100%',
    zIndex: 999,
  },
  bottomNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
    paddingBottom: 6,
    maxWidth: 768,
    width: '100%',
    alignSelf: 'center',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    minHeight: 42,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    height: 24,
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: customerColors.primary,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  navLabel: {
    fontSize: 11,
    color: customerColors.textSecondary,
    fontWeight: '500',
    marginTop: 3,
  },
  navLabelActive: {
    color: customerColors.primary,
    fontWeight: '700',
  },
  superAdminBanner: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    zIndex: 100,
  },
  superAdminBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  superAdminBannerTitle: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '800',
  },
  superAdminBannerSub: {
    color: '#94A3B8',
    fontSize: 10,
  },
  backToSuperAdminBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  backToSuperAdminBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  navAvatarDesktop: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 2,
  },
  navAvatarMobile: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});
