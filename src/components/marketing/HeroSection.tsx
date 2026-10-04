import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';

export function HeroSection() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 992;

  const handleNav = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={styles.heroSection}>
      <View style={[styles.heroInner, !isDesktop && styles.heroInnerMobile]}>
        {/* Left Copy Col */}
        <View style={styles.copyCol}>
          <View style={styles.announcementBadge}>
            <Text style={styles.badgeFire}>🚀</Text>
            <Text style={styles.badgeText}>Next-Gen Cloud Restaurant Management</Text>
          </View>

          <Text style={styles.headline}>
            Run Your Restaurant <Text style={styles.headlineHighlight}>Smarter</Text> with RestroZ
          </Text>

          <Text style={styles.subheadline}>
            From orders to happy customers — manage high-speed POS billing, kitchen KOTs, table-side waiter app, dynamic QR menus, inventory, and multiple outlets in one unified system.
          </Text>

          <View style={styles.ctaGroup}>
            <TouchableOpacity
              style={styles.primaryCta}
              onPress={() => handleNav('/info/book-demo')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryCtaText}>Book a Free Demo</Text>
              <Text style={styles.ctaArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryCta}
              onPress={() => handleNav('/info/features')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryCtaText}>Explore All Features</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Value Points */}
          <View style={styles.valueRow}>
            <View style={styles.valueItem}>
              <Text style={styles.valueIcon}>✓</Text>
              <Text style={styles.valueText}>Zero Setup Friction</Text>
            </View>
            <View style={styles.valueItem}>
              <Text style={styles.valueIcon}>✓</Text>
              <Text style={styles.valueText}>Offline-Resilient POS</Text>
            </View>
            <View style={styles.valueItem}>
              <Text style={styles.valueIcon}>✓</Text>
              <Text style={styles.valueText}>No Expensive Hardware Locked</Text>
            </View>
          </View>
        </View>

        {/* Right Interactive Mockup / Illustration Card */}
        <View style={styles.mockupCol}>
          <View style={styles.deviceCard}>
            {/* Terminal Window Top Bar */}
            <View style={styles.terminalBar}>
              <View style={styles.dotGroup}>
                <View style={[styles.macDot, { backgroundColor: '#EF4444' }]} />
                <View style={[styles.macDot, { backgroundColor: '#F59E0B' }]} />
                <View style={[styles.macDot, { backgroundColor: '#10B981' }]} />
              </View>
              <Text style={styles.terminalTitle}>RestroZ Smart POS Terminal • Table 04</Text>
              <View style={styles.statusLiveBadge}>
                <View style={styles.livePulse} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>

            {/* Mockup Dashboard Content */}
            <View style={styles.mockupBody}>
              {/* Order Header */}
              <View style={styles.mockupOrderHeader}>
                <View>
                  <Text style={styles.mockupOrderNum}>Order #INV-2026-0042</Text>
                  <Text style={styles.mockupOrderSub}>Dine-In • 4 Guests • Waiter: Rahul</Text>
                </View>
                <View style={styles.mockupBadgePaid}>
                  <Text style={styles.mockupPaidText}>Kitchen KOT Sent</Text>
                </View>
              </View>

              {/* Order Items Mock */}
              <View style={styles.mockupItemsList}>
                <View style={styles.mockItemRow}>
                  <Text style={styles.mockItemQty}>2x</Text>
                  <Text style={styles.mockItemName}>Paneer Tikka Butter Masala</Text>
                  <Text style={styles.mockItemPrice}>₹560.00</Text>
                </View>
                <View style={styles.mockItemRow}>
                  <Text style={styles.mockItemQty}>4x</Text>
                  <Text style={styles.mockItemName}>Butter Garlic Naan</Text>
                  <Text style={styles.mockItemPrice}>₹240.00</Text>
                </View>
                <View style={styles.mockItemRow}>
                  <Text style={styles.mockItemQty}>2x</Text>
                  <Text style={styles.mockItemName}>Fresh Lime Soda (Sweet)</Text>
                  <Text style={styles.mockItemPrice}>₹160.00</Text>
                </View>
              </View>

              {/* Mockup Financial Total */}
              <View style={styles.mockupSummary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryVal}>₹960.00</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>GST (5%)</Text>
                  <Text style={styles.summaryVal}>₹48.00</Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryTotalRow]}>
                  <Text style={styles.summaryTotalLabel}>Grand Total</Text>
                  <Text style={styles.summaryTotalVal}>₹1,008.00</Text>
                </View>
              </View>

              {/* Action Buttons Mock */}
              <View style={styles.mockupActionGrid}>
                <View style={[styles.mockActionBtn, { backgroundColor: '#10B981' }]}>
                  <Text style={styles.mockActionText}>💵 Cash Settle</Text>
                </View>
                <View style={[styles.mockActionBtn, { backgroundColor: '#3B82F6' }]}>
                  <Text style={styles.mockActionText}>📱 UPI QR</Text>
                </View>
                <View style={[styles.mockActionBtn, { backgroundColor: '#6366F1' }]}>
                  <Text style={styles.mockActionText}>🖨️ Print Bill</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    backgroundColor: '#FAF9F6',
    paddingTop: 48,
    paddingBottom: 64,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  heroInner: {
    maxWidth: 1280,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 40,
  },
  heroInnerMobile: {
    flexDirection: 'column',
    gap: 36,
  },
  copyCol: {
    flex: 1.1,
    gap: 20,
  },
  announcementBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4EB',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 8,
  },
  badgeFire: {
    fontSize: 14,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EA580C',
  },
  headline: {
    fontSize: 44,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 52,
    letterSpacing: -1,
  },
  headlineHighlight: {
    color: '#FC8019',
  },
  subheadline: {
    fontSize: 18,
    color: '#475569',
    lineHeight: 28,
    fontWeight: '400',
  },
  ctaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
    paddingTop: 8,
  },
  primaryCta: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 26,
    paddingVertical: 15,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#FC8019',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  ctaArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryCta: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  secondaryCtaText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    flexWrap: 'wrap',
    paddingTop: 12,
  },
  valueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueIcon: {
    color: '#16A34A',
    fontSize: 14,
    fontWeight: '900',
  },
  valueText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  mockupCol: {
    flex: 1,
    width: '100%',
  },
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 8,
    overflow: 'hidden',
  },
  terminalBar: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  macDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  terminalTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  statusLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  livePulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16A34A',
  },
  mockupBody: {
    padding: 20,
    gap: 16,
  },
  mockupOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  mockupOrderNum: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  mockupOrderSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  mockupBadgePaid: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mockupPaidText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  mockupItemsList: {
    gap: 8,
  },
  mockItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 10,
  },
  mockItemQty: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FC8019',
    width: 24,
  },
  mockItemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  mockItemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  mockupSummary: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  summaryVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
    marginTop: 2,
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  summaryTotalVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FC8019',
  },
  mockupActionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  mockActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
