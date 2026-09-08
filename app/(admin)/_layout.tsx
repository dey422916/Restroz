import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Platform, Alert } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { usePos } from '../../src/context/PosContext';
import { useSettings } from '../../src/context/SettingsContext';
import { subscriptionService, SubscriptionAccessStatus } from '../../src/services/api/subscriptionService';
import { SubscriptionLockOverlay } from '../../src/components/common/SubscriptionLockOverlay';
import { useNewOrderTracker } from '../../src/hooks/useNewOrderTracker';

export default function AdminLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, isSuperAdmin, isAdmin, activeRestaurantId, activeRestaurant, hasPermission, loading, logout } = useAuth();
  const { pendingCustomerOrders, activeOrders } = usePos();
  const { settings, isOnlineOrdersEnabled, toggleOnlineOrders } = useSettings();
  const { newCounts } = useNewOrderTracker(activeRestaurantId, activeOrders);

  const [togglingOnline, setTogglingOnline] = useState<boolean>(false);
  const [subAccess, setSubAccess] = useState<SubscriptionAccessStatus | null>(null);

  const isWeb = Platform.OS === 'web';
  const topPadding = isWeb ? 8 : insets.top;
  const bottomPadding = isWeb ? 0 : insets.bottom;

  const verifySubscription = async () => {
    if (activeRestaurantId) {
      const access = await subscriptionService.checkTenantAccess(activeRestaurantId);
      setSubAccess(access);
    }
  };

  useEffect(() => {
    verifySubscription();
  }, [activeRestaurantId]);

  React.useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/(auth)/login');
      } else if (role === 'CUSTOMER') {
        router.replace('/(marketplace)');
      } else if (role === 'STAFF' && !isSuperAdmin) {
        const adminOnlyMatches = [
          '/dashboard', '/(admin)/dashboard',
          '/products', '/(admin)/products',
          '/categories', '/(admin)/categories',
          '/coupons', '/(admin)/coupons',
          '/bulk-import', '/(admin)/bulk-import',
          '/settings', '/(admin)/settings',
          '/staff', '/(admin)/staff',
          '/my-plan', '/(admin)/my-plan',
        ];
        if (adminOnlyMatches.some((m) => pathname === m || pathname.startsWith(`${m}/`))) {
          router.replace('/(admin)/pos');
        }
      }
    }
  }, [user, role, loading, pathname, isSuperAdmin]);

  if (loading || !user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const allNavTabs = [
    { label: '🖥️ POS Terminal', route: '/(admin)/pos', match: ['/pos', '/(admin)/pos', '/(admin)', '/'], perm: 'can_use_pos' },
    { label: '📊 Dashboard', route: '/(admin)/dashboard', match: ['/dashboard', '/(admin)/dashboard'], perm: 'can_view_reports' },
    { label: '🛒 Orders Feed', route: '/(admin)/orders', match: ['/orders', '/(admin)/orders'], perm: 'can_view_orders' },
    { label: '🪑 Tables & QR', route: '/(admin)/tables', match: ['/tables', '/(admin)/tables'], perm: 'can_manage_tables' },
    { label: '🍽️ Menu / Products', route: '/(admin)/products', match: ['/products', '/(admin)/products'], perm: 'can_manage_products' },
    { label: '📂 Categories', route: '/(admin)/categories', match: ['/categories', '/(admin)/categories'], perm: 'can_manage_categories' },
    { label: '🎟️ Coupons', route: '/(admin)/coupons', match: ['/coupons', '/(admin)/coupons'], perm: 'can_manage_coupons' },
    { label: '👥 Staff & Roles', route: '/(admin)/staff', match: ['/staff', '/(admin)/staff'], perm: 'can_manage_staff' },
    { label: '💎 My Plan', route: '/(admin)/my-plan', match: ['/my-plan', '/(admin)/my-plan'], perm: 'can_view_settings' },
    { label: '📥 CSV Import', route: '/(admin)/bulk-import', match: ['/bulk-import', '/(admin)/bulk-import'], perm: 'can_manage_products' },
    { label: '⚙️ Settings', route: '/(admin)/settings', match: ['/settings', '/(admin)/settings'], perm: 'can_view_settings' },
  ];

  // Super Admin & Admin get ALL tabs; Staff gets permission-filtered tabs
  const navTabs = isSuperAdmin || role === 'ADMIN'
    ? allNavTabs
    : allNavTabs.filter((t) => !t.perm || hasPermission(t.perm as any));

  const isTabActive = (item: (typeof allNavTabs)[0]) => {
    const current = (pathname || '').trim();
    return item.match.some((m) => {
      if (m === '/') return current === '/' || current === '';
      return current === m || current.startsWith(`${m}/`);
    });
  };

  const isLocked = subAccess && !subAccess.isAllowed && !isSuperAdmin;

  return (
    <View style={[styles.container, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      {/* Super Admin Persistent Tenant Indicator Banner */}
      {isSuperAdmin && (
        <View style={styles.superAdminModeBanner}>
          <View style={styles.superAdminModeTextWrap}>
            <Text style={styles.superAdminModeTitle}>🛡️ Super Admin Management</Text>
            <Text style={styles.superAdminModeSubtitle} numberOfLines={1}>
              Managing: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{activeRestaurant?.name || settings.name || 'Selected Restaurant'}</Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.backToSuperAdminBtn}
            onPress={() => router.push('/super-admin' as any)}
            accessibilityRole="button"
            accessibilityLabel="Back to Super Admin"
          >
            <Text style={styles.backToSuperAdminBtnText}>← Back to Super Admin</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top Header Brand Bar */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          {/* Logo & Branding */}
          <View style={styles.brandBox}>
            {settings.logo_url || activeRestaurant?.logo_url ? (
              <Image
                source={{ uri: settings.logo_url || activeRestaurant?.logo_url }}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.headerLogoPlaceholder}>
                <Text style={{ fontSize: 18 }}>🍽️</Text>
              </View>
            )}
            <View style={{ flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                  {activeRestaurant?.name || settings.name || 'Ratnadeep Restaurant'}
                </Text>

                {/* Online Orders Status / Toggle Button */}
                <TouchableOpacity
                  testID="admin-online-orders-toggle"
                  style={[
                    styles.onlineToggleBtn,
                    isOnlineOrdersEnabled ? styles.onlineToggleBtnGreen : styles.onlineToggleBtnRed,
                    togglingOnline && { opacity: 0.6 },
                  ]}
                  disabled={togglingOnline}
                  onPress={async () => {
                    const canChange = isSuperAdmin || role === 'ADMIN' || hasPermission('can_view_settings');
                    if (!canChange) {
                      Alert.alert('Permission Denied', 'Only Restaurant Admins can change online ordering status.');
                      return;
                    }
                    setTogglingOnline(true);
                    try {
                      const nextState = !isOnlineOrdersEnabled;
                      await toggleOnlineOrders(nextState);
                    } catch (err: any) {
                      Alert.alert('Error', err.message || 'Failed to update online ordering status');
                    } finally {
                      setTogglingOnline(false);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.onlineToggleBtnText,
                    isOnlineOrdersEnabled ? styles.onlineToggleBtnTextGreen : styles.onlineToggleBtnTextRed,
                  ]}>
                    {isOnlineOrdersEnabled ? '🟢 Online' : '🔴 Offline'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
                Logged in as: <Text style={{ fontWeight: 'bold', color: '#0f172a' }}>{user?.full_name || user?.email?.split('@')[0]}</Text> • <Text style={styles.roleBadgeText}>{role.toUpperCase()}</Text>
              </Text>
            </View>
          </View>

          {/* Super Admin Switcher, Alerts & Logout Action */}
          <View style={styles.headerActionsRow}>
            {isSuperAdmin && (
              <TouchableOpacity
                style={styles.superAdminBadge}
                onPress={() => router.push('/super-admin' as any)}
              >
                <Text style={styles.superAdminBadgeText}>⚡ Platform</Text>
              </TouchableOpacity>
            )}

            {newCounts.totalNewCount > 0 ? (
              <TouchableOpacity
                style={styles.alertBadge}
                onPress={() => router.push('/(admin)/orders')}
              >
                <Text style={styles.alertBadgeText}>
                  🔔 {newCounts.totalNewCount} New ({newCounts.onlineNewCount > 0 ? `${newCounts.onlineNewCount} Online` : ''}{newCounts.onlineNewCount > 0 && newCounts.qrNewCount > 0 ? ', ' : ''}{newCounts.qrNewCount > 0 ? `${newCounts.qrNewCount} QR` : ''})
                </Text>
              </TouchableOpacity>
            ) : pendingCustomerOrders.length > 0 ? (
              <TouchableOpacity
                style={styles.alertBadge}
                onPress={() => router.push('/(admin)/orders')}
              >
                <Text style={styles.alertBadgeText}>
                  🔔 QR Orders ({pendingCustomerOrders.length})
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={async () => {
                if (Platform.OS === 'web') {
                  const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out?') : true;
                  if (!confirmed) return;
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
                      await logout();
                      router.replace('/(auth)/login' as any);
                    },
                  },
                ]);
              }}
            >
              <Text style={styles.logoutBtnText}>🚪 Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Horizontally Scrollable Admin Top Navigation Tabs */}
      <View style={styles.navBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.navBarScroll}
        >
          {navTabs.map((tab) => {
            const active = isTabActive(tab);
            const isOrdersTab = tab.route === '/(admin)/orders';
            const hasNew = isOrdersTab && newCounts.totalNewCount > 0;
            return (
              <TouchableOpacity
                key={tab.route}
                style={[styles.tabChip, active && styles.tabChipActive]}
                onPress={() => router.push(tab.route as any)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                    {tab.label}
                  </Text>
                  {hasNew && (
                    <View style={styles.tabBadgePill}>
                      <Text style={styles.tabBadgePillText}>
                        {newCounts.totalNewCount} New
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Admin Screen Stack Content */}
      <View style={styles.screenBody}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>

      {/* Non-destructive subscription lock overlay if expired/suspended */}
      {isLocked && subAccess && (
        <SubscriptionLockOverlay
          status={subAccess.status as any}
          restaurantName={settings.name || 'Your Restaurant'}
          planName={subAccess.planName}
          endDate={subAccess.endDate}
          message={subAccess.message}
          onLogout={async () => {
            await logout();
            router.replace('/(auth)/login');
          }}
          onRefresh={verifySubscription}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  superAdminModeBanner: {
    backgroundColor: '#f0fdf4',
    borderBottomWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  superAdminModeTextWrap: {
    flex: 1,
  },
  superAdminModeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
  },
  superAdminModeSubtitle: {
    fontSize: 11,
    color: '#15803d',
    marginTop: 1,
  },
  backToSuperAdminBtn: {
    backgroundColor: '#166534',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  backToSuperAdminBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    gap: 5,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  headerLogoPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  onlineToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 14,
    borderWidth: 1,
  },
  onlineToggleBtnGreen: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  onlineToggleBtnRed: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  onlineToggleBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  onlineToggleBtnTextGreen: {
    color: '#059669',
  },
  onlineToggleBtnTextRed: {
    color: '#dc2626',
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  roleBadgeText: {
    color: '#2563eb',
    fontWeight: '800',
    fontSize: 11,
  },
  superAdminBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  superAdminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
  },
  alertBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  alertBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#92400e',
  },
  logoutBtn: {
    backgroundColor: '#fff1f2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  logoutBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#e11d48',
  },
  navBarContainer: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
  },
  navBarScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  tabChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  tabChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  screenBody: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  tabBadgePill: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  tabBadgePillText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
