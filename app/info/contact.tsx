import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';
import { ContactForm } from '../../src/components/marketing/ContactForm';

export function ContactPage() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 992;

  return (
    <MarketingLayout
      seo={{
        title: 'Contact RestroZ — Sales Enquiries, Support & Demo Consultation',
        description:
          'Get in touch with the RestroZ restaurant technology team. Speak with sales, request custom enterprise pricing, or get customer support.',
        canonicalPath: '/info/contact',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>WE ARE HERE TO HELP</Text>
          </View>
          <Text style={styles.title}>Connect with Our Restaurant Technology Team</Text>
          <Text style={styles.subtitle}>
            Have questions about compatibility, pricing, or setting up RestroZ for your restaurant? We are ready to assist.
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={[styles.contentInner, !isDesktop && styles.contentInnerMobile]}>
          {/* Left Contact Info */}
          <View style={styles.infoCol}>
            <Text style={styles.infoHeading}>Direct Channels</Text>

            <View style={styles.infoCard}>
              <Text style={styles.infoCardIcon}>📞</Text>
              <View>
                <Text style={styles.infoCardTitle}>Sales & Consultation</Text>
                <Text style={styles.infoCardVal}>+91 7098513441</Text>
                <Text style={styles.infoCardSub}>Mon - Sat • 9:00 AM to 8:00 PM IST</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoCardIcon}>✉️</Text>
              <View>
                <Text style={styles.infoCardTitle}>Email Enquiries</Text>
                <Text style={styles.infoCardVal}>sales@restroz.shop</Text>
                <Text style={styles.infoCardSub}>Response guaranteed within 2 business hours</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoCardIcon}>🌐</Text>
              <View>
                <Text style={styles.infoCardTitle}>Official Website</Text>
                <Text style={styles.infoCardVal}>restroz.shop</Text>
                <Text style={styles.infoCardSub}>Global SaaS Cloud Infrastructure</Text>
              </View>
            </View>
          </View>

          {/* Right Form */}
          <View style={styles.formCol}>
            <ContactForm sourcePage="/info/contact" />
          </View>
        </View>
      </View>
    </MarketingLayout>
  );
}

export default ContactPage;

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
    fontSize: 38,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 46,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 24,
  },
  contentSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 64,
    width: '100%',
  },
  contentInner: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 48,
  },
  contentInnerMobile: {
    flexDirection: 'column',
    gap: 36,
  },
  infoCol: {
    flex: 1,
    gap: 20,
  },
  infoHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  infoCard: {
    backgroundColor: '#FAF9F6',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  infoCardIcon: {
    fontSize: 28,
  },
  infoCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  infoCardVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  infoCardSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  formCol: {
    flex: 1.3,
    width: '100%',
  },
});
