import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';
import { ContactForm } from '../../src/components/marketing/ContactForm';

export function BookDemoPage() {
  return (
    <MarketingLayout
      seo={{
        title: 'Book a Free Live Demo — RestroZ Restaurant POS',
        description:
          'Experience a personalized 1-on-1 walkthrough of RestroZ. See how our POS, KOT printing, waiter mobile app, and inventory features transform your restaurant operations.',
        canonicalPath: '/info/book-demo',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>LIVE INTERACTIVE WALKTHROUGH</Text>
          </View>
          <Text style={styles.title}>Experience RestroZ Tailored to Your Restaurant</Text>
          <Text style={styles.subtitle}>
            Schedule a free 20-minute live demonstration with one of our senior restaurant tech specialists.
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <ContactForm
            leadType="demo"
            title="Book Your 1-on-1 Demo Session"
            subtitle="Tell us a little bit about your setup and we will prepare a customized walkthrough."
            sourcePage="/info/book-demo"
          />
        </View>
      </View>
    </MarketingLayout>
  );
}

export default BookDemoPage;

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
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
});
