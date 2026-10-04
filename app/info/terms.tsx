import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';

export function TermsPage() {
  return (
    <MarketingLayout
      seo={{
        title: 'Terms of Service — RestroZ',
        description: 'RestroZ Terms of Service and End User License Agreement for restaurant operators and businesses.',
        canonicalPath: '/info/terms',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <Text style={styles.title}>Terms of Service</Text>
          <Text style={styles.subtitle}>Last updated: October 2026</Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <Text style={styles.paragraph}>
            Welcome to RestroZ. By subscribing to or using our restaurant management software, POS mobile applications, cloud services, and website, you agree to comply with and be bound by the following terms and conditions.
          </Text>

          <Text style={styles.sectionHeader}>1. Service Description & Subscriptions</Text>
          <Text style={styles.paragraph}>
            RestroZ provides a cloud-based restaurant management SaaS platform that enables restaurant billing, KOT management, mobile ordering, catalog management, and business reporting. Subscriptions are billed according to your selected plan and number of active outlets.
          </Text>

          <Text style={styles.sectionHeader}>2. Account Security & Responsibilities</Text>
          <Text style={styles.paragraph}>
            You are responsible for maintaining the confidentiality of your account credentials and for all operations performed under your restaurant staff accounts. You agree to notify us immediately of any unauthorized access.
          </Text>

          <Text style={styles.sectionHeader}>3. Service Level & Uptime</Text>
          <Text style={styles.paragraph}>
            We strive to provide 99.9% platform availability. Our offline-resilient architecture ensures that local billing and receipt printing continue functioning even during intermittent internet downtime.
          </Text>

          <Text style={styles.sectionHeader}>4. Termination & Contact</Text>
          <Text style={styles.paragraph}>
            You may cancel your subscription at any time. For support or legal inquiries, reach out to legal@restroz.shop or call +91 7098513441.
          </Text>
        </View>
      </View>
    </MarketingLayout>
  );
}

export default TermsPage;

const styles = StyleSheet.create({
  heroSection: {
    backgroundColor: '#FAF9F6',
    paddingVertical: 48,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
  },
  heroInner: {
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  contentSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 48,
    width: '100%',
  },
  contentInner: {
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 16,
  },
  paragraph: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 24,
  },
});
