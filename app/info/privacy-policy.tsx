import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';

export function PrivacyPolicyPage() {
  return (
    <MarketingLayout
      seo={{
        title: 'Privacy Policy — RestroZ',
        description: 'RestroZ Privacy Policy. Learn how we collect, store, and protect customer and restaurant business data.',
        canonicalPath: '/info/privacy-policy',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.subtitle}>Last updated: October 2026</Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <Text style={styles.paragraph}>
            At RestroZ ("we", "our", or "us"), we take your privacy and data security seriously. This Privacy Policy explains how personal and business data is handled when you use the RestroZ platform, websites, mobile applications, and services.
          </Text>

          <Text style={styles.sectionHeader}>1. Information We Collect</Text>
          <Text style={styles.paragraph}>
            We collect information you provide directly to us when creating a restaurant account, requesting a demo, contacting sales, or using our POS services. This may include your name, business name, phone number, email address, outlet city/state, and billing details.
          </Text>

          <Text style={styles.sectionHeader}>2. Tenant Data Isolation & Security</Text>
          <Text style={styles.paragraph}>
            RestroZ utilizes strict enterprise multi-tenant row-level security (RLS). Your restaurant's sales figures, customer phone lists, menu catalogs, and financial transaction records are strictly isolated and never shared with other tenants.
          </Text>

          <Text style={styles.sectionHeader}>3. How We Use Your Information</Text>
          <Text style={styles.paragraph}>
            We use your data to provide, maintain, and improve POS services, process payments, deliver automated KOT tickets, generate sales tax reports, and communicate service updates.
          </Text>

          <Text style={styles.sectionHeader}>4. Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have questions regarding this Privacy Policy or your data, please contact our data protection team at privacy@restroz.shop or call +91 7098513441.
          </Text>
        </View>
      </View>
    </MarketingLayout>
  );
}

export default PrivacyPolicyPage;

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
