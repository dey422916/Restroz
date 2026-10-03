import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';
import { FAQAccordion, COMMON_FAQS } from '../../src/components/marketing/FAQAccordion';

const EXTENDED_FAQS = [
  ...COMMON_FAQS,
  {
    q: 'Does RestroZ work on existing Windows PCs, laptops, or tablets?',
    a: 'Yes. RestroZ is cross-platform. It runs directly inside modern web browsers (Chrome, Edge, Safari) on Windows PCs, MacBooks, iPads, Android tablets, and smartphones without forcing you to buy proprietary point-of-sale hardware.',
  },
  {
    q: 'Which thermal printers are supported for bills and KOTs?',
    a: 'RestroZ supports standard 58mm (2-inch) and 80mm (3-inch) ESC/POS thermal printers via Network Ethernet/TCP, Wi-Fi, Bluetooth, and local USB via the RestroZ Print Agent.',
  },
  {
    q: 'How does RestroZ handle internet disconnection or offline moments?',
    a: 'RestroZ employs an offline-resilient local cache architecture. Active bills, pending tables, and draft orders remain safe locally in your device storage and synchronize automatically once network connectivity resumes.',
  },
  {
    q: 'Can we configure custom GST rates and HSN/SAC codes in India?',
    a: 'Yes. RestroZ provides full Indian GST compliance with configurable 5%, 12%, 18%, or mixed tax slabs, automatic CGST/SGST splitting, and itemized tax invoice generation with customer GSTIN recording.',
  },
];

export function FaqPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Frequently Asked Questions (FAQ) — RestroZ Restaurant POS',
        description:
          'Find answers to all your questions about RestroZ: billing, printer setups, waiter app compatibility, multi-outlet management, pricing, and onboarding.',
        canonicalPath: '/info/faq',
        structuredData: {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: EXTENDED_FAQS.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: {
              '@type': 'Answer',
              text: f.a,
            },
          })),
        },
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>HELP & KNOWLEDGE BASE</Text>
          </View>
          <Text style={styles.title}>Frequently Asked Questions</Text>
          <Text style={styles.subtitle}>
            Everything you need to know about setting up, scaling, and running your restaurant with RestroZ.
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <FAQAccordion items={EXTENDED_FAQS} />

          <View style={styles.supportBox}>
            <Text style={styles.supportTitle}>Still Have Questions?</Text>
            <Text style={styles.supportSub}>Our support and sales specialists are always available to help.</Text>
            <TouchableOpacity
              style={styles.supportBtn}
              onPress={() => router.push('/info/contact' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.supportBtnText}>Contact Our Team →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </MarketingLayout>
  );
}

export default FaqPage;

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
    maxWidth: 880,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 48,
  },
  supportBox: {
    backgroundColor: '#FAF9F6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 32,
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 10,
  },
  supportTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  supportSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  supportBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6,
  },
  supportBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
