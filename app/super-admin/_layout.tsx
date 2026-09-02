import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { Slot, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { colors } from '../../src/utils/colors';

const NAV_ITEMS = [
  { label: '📊 Overview', route: '/super-admin', title: 'Platform Control Center' },
  { label: '🏢 Restaurants', route: '/super-admin/restaurants', title: 'Restaurant Directory' },
  { label: '👥 Admins', route: '/super-admin/admins', title: 'Restaurant Admins' },
  { label: '🎟️ Coupons', route: '/super-admin/coupons', title: 'Global Coupons Manager' },
  { label: '🏷️ Subscription Plans', route: '/super-admin/plans', title: 'Subscription Plans' },
  { label: '💳 Payments', route: '/super-admin/payments', title: 'Payment Ledger' },
  { label: '🛡️ Audit Logs', route: '/super-admin/audit-logs', title: 'Platform Audit Trail' },
];

export default function SuperAdminLayout() {
  const { user, isSuperAdmin, loading, logout, setSuperAdminMarketplacePreview } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isMobile = width < 768;
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Strict Super Admin Route Protection Guard
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/(auth)/login');
      } else if (!isSuperAdmin) {
        // Redirect unauthorized users to their allowed home dashboard
        router.replace('/(admin)/dashboard');
      }
    }
  }, [user, isSuperAdmin, loading, router]);

  // Close drawer on path change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (loading || !user || !isSuperAdmin) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 36 }}>🛡️</Text>
        <Text style={styles.loadingText}>Authenticating Super Admin platform access...</Text>
      </View>
    );
  }

  const isCurrentRoute = (route: string) => {
    if (route === '/super-admin') {
      return pathname === '/super-admin' || pathname === '/super-admin/';
    }
    return pathname.startsWith(route);
  };

  const getCurrentTitle = () => {
    if (pathname.includes('/super-admin/restaurant/')) return 'Restaurant Details';
    const found = NAV_ITEMS.find((n) => isCurrentRoute(n.route));
    return found ? found.title : 'Super Admin';
  };

  const handleNavigate = (route: string) => {
    setDrawerOpen(false);
    router.push(route as any);
  };

  // Reusable Sidebar Content
  const renderSidebarContent = (isDrawer = false) => (
    <View style={[styles.sidebarInner, isDrawer && styles.drawerSidebarInner]}>
      {/* Brand Header */}
      <View style={styles.brandHeader}>
        <View style={styles.brandBadge}>
          <Text style={{ fontSize: 18 }}>⚡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>RESTROZ</Text>
          <Text style={styles.brandSubtitle}>SUPER ADMIN SAAS</Text>
        </View>
        {isDrawer && (
          <TouchableOpacity
            style={styles.closeDrawerBtn}
            onPress={() => setDrawerOpen(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.closeDrawerText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.divider} />

      {/* Nav List */}
      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionHeader}>PLATFORM MANAGEMENT</Text>
        {NAV_ITEMS.map((item) => {
          const active = isCurrentRoute(item.route);
          return (
            <TouchableOpacity
              key={item.route}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => handleNavigate(item.route)}
              activeOpacity={0.7}
            >
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}

        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>TENANT OPERATIONS</Text>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => handleNavigate('/(admin)/dashboard')}
          activeOpacity={0.7}
        >
          <Text style={styles.navItemText}>🏪 Switch to POS App</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, styles.navItemCustomer]}
          onPress={() => {
            setSuperAdminMarketplacePreview(true);
            setDrawerOpen(false);
            router.push('/(marketplace)' as any);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.navItemText, styles.navItemCustomerText]}>🛍️ View Customer App</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.divider} />

      {/* User Profile Footer */}
      <View style={styles.userFooter}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user.full_name || 'SA').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.userName} numberOfLines={1}>
            {user.full_name || 'Super Admin'}
          </Text>
          <Text style={styles.userRole}>PLATFORM OWNER</Text>
        </View>
        <TouchableOpacity
          onPress={async () => {
            if (Platform.OS === 'web') {
              const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out?') : true;
              if (!confirmed) return;
              setDrawerOpen(false);
              await logout();
              if (typeof window !== 'undefined') {
                window.location.href = '/login';
              } else {
                router.replace('/(auth)/login' as any);
              }
              return;
            }

            Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign Out',
                style: 'destructive',
                onPress: async () => {
                  setDrawerOpen(false);
                  await logout();
                  router.replace('/(auth)/login' as any);
                },
              },
            ]);
          }}
          style={styles.logoutIcon}
        >
          <Text style={{ fontSize: 16 }}>🚪</Text>
        </TouchableOpacity>
      </View>

      {/* Explicit Sign Out Row for Drawer / Sidebar */}
      <TouchableOpacity
        style={styles.drawerSignOutBtn}
        onPress={async () => {
          if (Platform.OS === 'web') {
            const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out?') : true;
            if (!confirmed) return;
            setDrawerOpen(false);
            await logout();
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            } else {
              router.replace('/(auth)/login' as any);
            }
            return;
          }

          Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign Out',
              style: 'destructive',
              onPress: async () => {
                setDrawerOpen(false);
                await logout();
                router.replace('/(auth)/login' as any);
              },
            },
          ]);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.drawerSignOutBtnText}>🚪 Sign Out</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Desktop Permanent Sidebar */}
      {!isMobile && <View style={styles.sidebarDesktop}>{renderSidebarContent(false)}</View>}

      {/* Mobile Drawer Overlay */}
      {isMobile && (
        <Modal
          visible={drawerOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setDrawerOpen(false)}
        >
          <View style={styles.modalBackdropContainer}>
            <TouchableOpacity
              style={styles.drawerBackdrop}
              activeOpacity={1}
              onPress={() => setDrawerOpen(false)}
            />
            <View
              style={[
                styles.drawerPanel,
                {
                  width: Math.min(width * 0.82, 320),
                  paddingTop: Math.max(insets.top, 16),
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              {renderSidebarContent(true)}
            </View>
          </View>
        </Modal>
      )}

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Mobile Header Top Bar */}
        {isMobile && (
          <View style={[styles.mobileTopBar, { paddingTop: Math.max(insets.top, 10) }]}>
            <TouchableOpacity
              style={styles.hamburgerBtn}
              onPress={() => setDrawerOpen(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.hamburgerIcon}>☰</Text>
            </TouchableOpacity>

            <View style={styles.mobileTitleWrap}>
              <Text style={styles.mobileHeaderTitle} numberOfLines={1}>
                {getCurrentTitle()}
              </Text>
            </View>

            <View style={styles.mobileAvatarBadge}>
              <Text style={styles.mobileAvatarText}>
                {(user.full_name || 'SA').slice(0, 2).toUpperCase()}
              </Text>
            </View>
          </View>
        )}

        {/* Child Screen Content */}
        <View style={styles.slotWrap}>
          <Slot />
        </View>

        {/* Bottom Margin for Mobile to prevent Android navigation bar overlap */}
        {isMobile && (
          <View
            style={{
              height: Math.max(insets.bottom, 48),
              backgroundColor: '#000000',
              width: '100%',
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '500',
  },
  // Desktop Sidebar
  sidebarDesktop: {
    width: 250,
    backgroundColor: '#0F172A',
    borderRightWidth: 1,
    borderRightColor: '#1E293B',
  },
  sidebarInner: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  drawerSidebarInner: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  // Mobile Modal / Drawer
  modalBackdropContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  drawerPanel: {
    backgroundColor: '#0F172A',
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 20,
  },
  closeDrawerBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeDrawerText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  // Mobile Header Top Bar
  mobileTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  hamburgerBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hamburgerIcon: {
    fontSize: 20,
    color: '#0F172A',
    fontWeight: '700',
  },
  mobileTitleWrap: {
    flex: 1,
    paddingHorizontal: 12,
  },
  mobileHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  mobileAvatarBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mobileAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // Main Content Area
  mainContent: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    minWidth: 0, // Prevents flex child overflow
  },
  slotWrap: {
    flex: 1,
    minWidth: 0,
  },
  // Branding
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 12,
  },
  sectionHeader: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  navScroll: {
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  navItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  navItemText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  navItemTextActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  navItemCustomer: {
    backgroundColor: 'rgba(252, 128, 25, 0.12)',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(252, 128, 25, 0.3)',
  },
  navItemCustomerText: {
    color: '#FC8019',
    fontWeight: '700',
  },
  userFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  userRole: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  logoutIcon: {
    padding: 6,
  },
  drawerSignOutBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerSignOutBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '700',
  },
});
