import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';

export function AboutPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'About RestroZ — Our Mission, Story & Hospitality Philosophy',
        description:
          'Learn about RestroZ: built with the core belief that "Good Food Brings People Together." Discover how we empower restaurants with modern, connected technology.',
        canonicalPath: '/info/about',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>OUR MISSION & STORY</Text>
          </View>
          <Text style={styles.title}>Good Food Brings People Together. We Handle the Rest.</Text>
          <Text style={styles.subtitle}>
            RestroZ was born out of a desire to simplify the daily chaos of running a restaurant. We build technology that gets out of the way so chefs, managers, and servers can focus on exceptional hospitality.
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <View style={styles.cardsGrid}>
            <View style={styles.card}>
              <Text style={styles.cardIcon}>🎯</Text>
              <Text style={styles.cardTitle}>Why We Built RestroZ</Text>
              <Text style={styles.cardText}>
                Traditional restaurant software was clunky, locked into expensive proprietary hardware, and split across disconnected tools. We set out to create a unified, cloud-native platform that connects the cash desk, floor servers, kitchen, and customers effortlessly.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardIcon}>💡</Text>
              <Text style={styles.cardTitle}>Our Core Values</Text>
              <Text style={styles.cardText}>
                We prioritize speed, offline resilience, and operational simplicity. Every button and workflow is designed to work reliably in loud, fast-paced restaurant environments during peak dinner rushes.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardIcon}>🚀</Text>
              <Text style={styles.cardTitle}>Built for Scale</Text>
              <Text style={styles.cardText}>
                Whether you are launching your first cafe or standardizing operations across a 50-unit franchise, RestroZ grows with your business without requiring painful data migrations.
              </Text>
            </View>
          </View>

          <View style={styles.ctaBox}>
            <Text style={styles.ctaTitle}>Ready to See RestroZ in Action?</Text>
            <Text style={styles.ctaSub}>Schedule a personalized walkthrough with our restaurant technology team.</Text>
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={() => router.push('/info/book-demo' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.ctaBtnText}>Book a Free Demo →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </MarketingLayout>
  );
}

export default AboutPage;

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
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 48,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'center',
  },
  card: {
    flex: 1,
    minWidth: 300,
    backgroundColor: '#FAF9F6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 28,
    gap: 12,
  },
  cardIcon: {
    fontSize: 32,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  ctaBox: {
    backgroundColor: '#0B132B',
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 12,
  },
  ctaTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ctaSub: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
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
});
