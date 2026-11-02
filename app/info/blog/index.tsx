import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { BLOG_ARTICLES, BlogArticle } from '../../../src/data/blogArticles';

const CATEGORIES = [
  'All Articles',
  'POS & Billing',
  'KOT & Kitchen',
  'Inventory & Cost Control',
  'QR & Contactless',
  'Indian Operations',
];

export default function BlogHubPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 992;
  const isTablet = width >= 768;

  const [selectedCategory, setSelectedCategory] = useState('All Articles');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArticles = useMemo(() => {
    return BLOG_ARTICLES.filter((art) => {
      const matchesCat =
        selectedCategory === 'All Articles' || art.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        art.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const featuredArticle = BLOG_ARTICLES[0];

  const handleNav = (slug: string) => {
    router.push(`/info/blog/${slug}` as any);
  };

  return (
    <MarketingLayout
      seo={{
        title: 'Restaurant Management & POS Knowledge Hub | RestroZ Blog',
        description:
          'Expert operational guides, technical tutorials, and industry insights on Indian restaurant POS billing, automatic KOT printing, inventory costing, GST rules, and QR menus.',
        canonicalPath: '/info/blog',
        keywords: [
          'restaurant management guides',
          'restaurant POS blog',
          'restaurant billing tutorials',
          'KOT printing guide',
          'restaurant GST rules',
          'restaurant inventory management guide',
          'RestroZ knowledge hub',
        ],
      }}
    >
      {/* Hero Header */}
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>KNOWLEDGE HUB & OPERATIONAL GUIDES</Text>
          </View>
          <Text role="heading" aria-level={1} style={styles.title}>
            Restaurant Technology, Billing & Operations Insights
          </Text>
          <Text style={styles.subtitle}>
            In-depth guides, practical advice, and technical tutorials to help Indian restaurateurs,
            cafe owners, and cloud kitchen operators streamline billing, kitchen workflows, and profitability.
          </Text>

          {/* Search Bar */}
          <View style={styles.searchBarContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search topics (e.g., GST billing, KOT printing, thermal printers, inventory)..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Category Pills */}
      <View style={styles.catSection}>
        <View style={styles.catInner}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.catPill, active && styles.catPillActive]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.8}
              >
                <Text style={[styles.catPillText, active && styles.catPillTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Featured Article Hero (When on All Articles with no search) */}
      {selectedCategory === 'All Articles' && searchQuery === '' && featuredArticle && (
        <View style={styles.featuredSection}>
          <View style={styles.featuredInner}>
            <TouchableOpacity
              style={[styles.featuredCard, isTablet && styles.featuredCardDesktop]}
              onPress={() => handleNav(featuredArticle.slug)}
              activeOpacity={0.9}
            >
              <View style={styles.featuredBadgeRow}>
                <View style={styles.featuredTag}>
                  <Text style={styles.featuredTagText}>FEATURED GUIDE</Text>
                </View>
                <Text style={styles.featuredTime}>⏱️ {featuredArticle.readingTime}</Text>
              </View>
              <Text style={styles.featuredTitle}>{featuredArticle.title}</Text>
              <Text style={styles.featuredExcerpt}>{featuredArticle.excerpt}</Text>
              <View style={styles.featuredFooter}>
                <Text style={styles.featuredAuthor}>
                  By {featuredArticle.author.name} • {featuredArticle.publishedDate}
                </Text>
                <Text style={styles.featuredReadLink}>Read Complete Guide →</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Articles Grid */}
      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeading}>
              {selectedCategory === 'All Articles' ? 'All Published Articles' : selectedCategory}
            </Text>
            <Text style={styles.articleCountBadge}>
              {filteredArticles.length} {filteredArticles.length === 1 ? 'Article' : 'Articles'}
            </Text>
          </View>

          {filteredArticles.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={styles.emptyTitle}>No matching articles found</Text>
              <Text style={styles.emptySubtitle}>
                Try adjusting your search terms or selecting another category.
              </Text>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategory('All Articles');
                }}
              >
                <Text style={styles.resetBtnText}>Reset Filters</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.grid, !isTablet && styles.gridMobile]}>
              {filteredArticles.map((art) => (
                <TouchableOpacity
                  key={art.slug}
                  style={styles.card}
                  onPress={() => handleNav(art.slug)}
                  activeOpacity={0.88}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.cardCatBadge}>
                      <Text style={styles.cardCatText}>{art.category}</Text>
                    </View>
                    <Text style={styles.cardTime}>⏱️ {art.readingTime}</Text>
                  </View>

                  <Text style={styles.cardTitle}>{art.title}</Text>
                  <Text style={styles.cardExcerpt}>{art.excerpt}</Text>

                  <View style={styles.cardFooter}>
                    <Text style={styles.cardDate}>{art.publishedDate}</Text>
                    <Text style={styles.readMoreText}>Read Guide →</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
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
    maxWidth: 920,
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
    maxWidth: 760,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: 600,
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: '#0F172A',
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700',
  },
  catSection: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 14,
  },
  catInner: {
    maxWidth: 1160,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catPillActive: {
    backgroundColor: '#FC8019',
    borderColor: '#FC8019',
  },
  catPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  catPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  featuredSection: {
    backgroundColor: '#FAF9F6',
    paddingTop: 36,
    paddingBottom: 12,
  },
  featuredInner: {
    maxWidth: 1160,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  featuredCard: {
    backgroundColor: '#0B132B',
    borderRadius: 20,
    padding: 32,
    gap: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#0B132B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 6,
  },
  featuredCardDesktop: {
    padding: 40,
  },
  featuredBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  featuredTag: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  featuredTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  featuredTime: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  featuredTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  featuredExcerpt: {
    fontSize: 15,
    color: '#CBD5E1',
    lineHeight: 23,
    maxWidth: 900,
  },
  featuredFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 16,
    flexWrap: 'wrap',
    gap: 10,
  },
  featuredAuthor: {
    color: '#94A3B8',
    fontSize: 13,
  },
  featuredReadLink: {
    color: '#FC8019',
    fontSize: 14,
    fontWeight: '700',
  },
  contentSection: {
    backgroundColor: '#FAF9F6',
    paddingVertical: 40,
    width: '100%',
  },
  contentInner: {
    maxWidth: 1160,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 12,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  articleCountBadge: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
  },
  gridMobile: {
    flexDirection: 'column',
  },
  card: {
    flex: 1,
    minWidth: 320,
    maxWidth: 560,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
    justifyContent: 'space-between',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardCatBadge: {
    backgroundColor: '#FFF4EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  cardCatText: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '700',
  },
  cardTime: {
    fontSize: 12,
    color: '#94A3B8',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 24,
  },
  cardExcerpt: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    marginTop: 4,
  },
  cardDate: {
    fontSize: 12,
    color: '#94A3B8',
  },
  readMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FC8019',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  resetBtn: {
    marginTop: 8,
    backgroundColor: '#FC8019',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resetBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
