import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';

const ARTICLES = [
  {
    category: 'POS & Operations',
    title: 'How Table-Side Waiter Apps Can Boost Restaurant Table Turns by 40%',
    excerpt: 'Discover how eliminating server trips back to the counter accelerates order delivery and boosts dining room revenue.',
    readTime: '4 min read',
  },
  {
    category: 'Food Cost Control',
    title: '5 Practical Ways to Eliminate Kitchen Spoilage and Raw Inventory Wastage',
    excerpt: 'Simple recipe costing and low-stock threshold management techniques for modern cafes and cloud kitchens.',
    readTime: '6 min read',
  },
  {
    category: 'Direct Sales & Growth',
    title: 'Why Restaurants Are Switching to Direct Online Ordering Over Aggregators',
    excerpt: 'How to reclaim 30% delivery margins and build direct customer loyalty with branded online storefronts.',
    readTime: '5 min read',
  },
  {
    category: 'Multi-Outlet Strategy',
    title: 'The Multi-Unit Playbook: Centralizing Catalog Menus Across Franchise Outlets',
    excerpt: 'Key strategies for maintaining brand consistency, price revisions, and tax compliance across 10+ branches.',
    readTime: '7 min read',
  },
];

export function BlogPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <MarketingLayout
      seo={{
        title: 'RestroZ Resource Center — Restaurant Management Guides & Industry Insights',
        description:
          'Expert advice, industry insights, and operational guides on restaurant POS billing, kitchen operations, waiter apps, and food business growth.',
        canonicalPath: '/info/blog',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>RESOURCES & INSIGHTS</Text>
          </View>
          <Text style={styles.title}>Restaurant Growth & Technology Guides</Text>
          <Text style={styles.subtitle}>
            Actionable strategies and operational insights to help your food business run smoother and grow faster.
          </Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <View style={[styles.articlesGrid, !isDesktop && styles.articlesGridMobile]}>
            {ARTICLES.map((art) => (
              <View key={art.title} style={styles.articleCard}>
                <View style={styles.catBadge}>
                  <Text style={styles.catText}>{art.category}</Text>
                </View>
                <Text style={styles.artTitle}>{art.title}</Text>
                <Text style={styles.artExcerpt}>{art.excerpt}</Text>
                <View style={styles.artFooter}>
                  <Text style={styles.readTime}>⏱️ {art.readTime}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </MarketingLayout>
  );
}

export default BlogPage;

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
  },
  articlesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'center',
  },
  articlesGridMobile: {
    flexDirection: 'column',
  },
  articleCard: {
    flex: 1,
    minWidth: 320,
    backgroundColor: '#FAF9F6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    gap: 12,
  },
  catBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  catText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '700',
  },
  artTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 24,
  },
  artExcerpt: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  artFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  readTime: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
});
