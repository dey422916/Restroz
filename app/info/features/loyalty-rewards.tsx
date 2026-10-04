import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function LoyaltyRewardsFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Customer Loyalty, Cashback & Wallet System — RestroZ',
        description:
          'Turn one-time diners into loyal regulars with automated cashback rewards, customer mobile wallet store credit, and seamless bill redemption.',
        canonicalPath: '/info/features/loyalty-rewards',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>CUSTOMER RETENTION</Text>
          </View>
          <Text style={styles.title}>Automated Cashback Rewards & Digital Customer Wallets</Text>
          <Text style={styles.subtitle}>
            Reward loyal diners automatically upon settlement. Customer wallets store earned credit linked cleanly to their mobile number for instant redemption on future visits.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>See Loyalty Engine Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="REPEAT DINING"
        title="Zero-Hassle Mobile Phone Loyalty"
        subtitle="No plastic loyalty cards required. Diners simply provide their phone number at checkout to earn cashback and redeem existing wallet balances."
        bullets={[
          { title: 'Configurable Earning Ratio', desc: 'Set custom spend-to-reward rules (e.g. Earn ₹5 cashback per ₹100 spent).' },
          { title: 'Minimum Redeem Thresholds', desc: 'Encourage repeat visits by requiring a minimum balance before redemption.' },
          { title: 'Full Ledger Audit History', desc: 'Every earn, redeem, and adjustment transaction is logged securely.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🎁</Text>
            <Text style={styles.mockTitle}>Loyalty & Store Credit</Text>
            <Text style={styles.mockSub}>Cashback • Customer Wallets • Ledger</Text>
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
