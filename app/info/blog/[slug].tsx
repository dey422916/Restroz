import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { BLOG_ARTICLES, BlogArticle } from '../../../src/data/blogArticles';

export default function BlogArticlePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 992;
  const isTablet = width >= 768;

  const article = BLOG_ARTICLES.find((a) => a.slug === slug);

  if (!article) {
    return (
      <MarketingLayout
        seo={{
          title: 'Article Not Found | RestroZ Restaurant Knowledge Hub',
          description: 'The requested restaurant management article could not be found.',
          canonicalPath: '/info/blog',
        }}
      >
        <View style={styles.notFoundContainer}>
          <Text style={{ fontSize: 44 }}>📄</Text>
          <Text style={styles.notFoundTitle}>Article Not Found</Text>
          <Text style={styles.notFoundSubtitle}>
            The article you are looking for may have been moved or updated.
          </Text>
          <TouchableOpacity
            style={styles.backHubBtn}
            onPress={() => router.push('/info/blog' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.backHubBtnText}>← Return to Knowledge Hub</Text>
          </TouchableOpacity>
        </View>
      </MarketingLayout>
    );
  }

  // Related articles from same category or general
  const relatedArticles = BLOG_ARTICLES.filter(
    (a) => a.slug !== article.slug && (a.category === article.category || true)
  ).slice(0, 3);

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.publishedDate,
    dateModified: article.updatedDate,
    author: {
      '@type': 'Person',
      name: article.author.name,
      jobTitle: article.author.role,
    },
    publisher: {
      '@type': 'Organization',
      name: 'RestroZ',
      url: 'https://restroz.shop/info',
      logo: {
        '@type': 'ImageObject',
        url: 'https://restroz.shop/restroz-logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://restroz.shop/info/blog/${article.slug}`,
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://restroz.shop/info',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: 'https://restroz.shop/info/blog',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: article.title,
        item: `https://restroz.shop/info/blog/${article.slug}`,
      },
    ],
  };

  return (
    <MarketingLayout
      seo={{
        title: article.seo.title,
        description: article.seo.description,
        canonicalPath: `/info/blog/${article.slug}`,
        keywords: article.seo.keywords,
        structuredData: [articleSchema, breadcrumbSchema],
      }}
    >
      <View style={styles.articlePageWrapper}>
        <View style={styles.articleContainer}>
          {/* Breadcrumbs */}
          <View style={styles.breadcrumbRow}>
            <TouchableOpacity onPress={() => router.push('/info' as any)}>
              <Text style={styles.breadcrumbLink}>Home</Text>
            </TouchableOpacity>
            <Text style={styles.breadcrumbSeparator}>/</Text>
            <TouchableOpacity onPress={() => router.push('/info/blog' as any)}>
              <Text style={styles.breadcrumbLink}>Blog</Text>
            </TouchableOpacity>
            <Text style={styles.breadcrumbSeparator}>/</Text>
            <Text style={styles.breadcrumbCurrent} numberOfLines={1}>
              {article.category}
            </Text>
          </View>

          {/* Article Header */}
          <View style={styles.headerBlock}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{article.category}</Text>
            </View>
            <Text role="heading" aria-level={1} style={styles.articleTitle}>
              {article.title}
            </Text>
            <Text style={styles.articleExcerpt}>{article.excerpt}</Text>

            {/* Author & Meta Bar */}
            <View style={styles.metaRow}>
              <View style={styles.authorGroup}>
                <View style={styles.authorAvatar}>
                  <Text style={{ fontSize: 16 }}>✍️</Text>
                </View>
                <View>
                  <Text style={styles.authorName}>{article.author.name}</Text>
                  <Text style={styles.authorRole}>{article.author.role}</Text>
                </View>
              </View>
              <View style={styles.dateGroup}>
                <Text style={styles.dateText}>📅 Published: {article.publishedDate}</Text>
                <Text style={styles.readTimeText}>⏱️ {article.readingTime}</Text>
              </View>
            </View>
          </View>

          {/* Key Takeaways Box */}
          {article.keyTakeaways && article.keyTakeaways.length > 0 && (
            <View style={styles.keyTakeawaysCard}>
              <View style={styles.takeawaysHeader}>
                <Text style={{ fontSize: 18 }}>💡</Text>
                <Text style={styles.takeawaysTitle}>Key Takeaways for Restaurant Owners</Text>
              </View>
              <View style={styles.takeawaysList}>
                {article.keyTakeaways.map((item, idx) => (
                  <View key={idx} style={styles.takeawayItem}>
                    <Text style={styles.takeawayDot}>✓</Text>
                    <Text style={styles.takeawayText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Body Sections */}
          <View style={styles.bodyContent}>
            {article.sections.map((sec, secIdx) => (
              <View key={secIdx} style={styles.sectionBlock}>
                <Text role="heading" aria-level={2} style={styles.sectionHeading}>
                  {sec.heading}
                </Text>

                {sec.subheading && (
                  <Text role="heading" aria-level={3} style={styles.sectionSubheading}>
                    {sec.subheading}
                  </Text>
                )}

                {sec.paragraphs.map((p, pIdx) => (
                  <Text key={pIdx} style={styles.paragraphText}>
                    {p}
                  </Text>
                ))}

                {sec.bulletPoints && sec.bulletPoints.length > 0 && (
                  <View style={styles.bulletsList}>
                    {sec.bulletPoints.map((bp, bpIdx) => (
                      <View key={bpIdx} style={styles.bulletItem}>
                        <Text style={styles.bulletSymbol}>•</Text>
                        <Text style={styles.bulletText}>{bp}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {sec.callout && (
                  <View
                    style={[
                      styles.calloutBox,
                      sec.callout.type === 'important' && styles.calloutImportant,
                      sec.callout.type === 'tip' && styles.calloutTip,
                    ]}
                  >
                    <Text style={styles.calloutTitle}>
                      {sec.callout.type === 'tip' ? '💡 Tip: ' : '⚠️ Note: '}
                      {sec.callout.title}
                    </Text>
                    <Text style={styles.calloutText}>{sec.callout.text}</Text>
                  </View>
                )}

                {sec.table && (
                  <View style={styles.tableWrapper}>
                    <View style={styles.tableHeaderRow}>
                      {sec.table.headers.map((h, hIdx) => (
                        <Text key={hIdx} style={[styles.tableHeaderCell, { flex: 1 }]}>
                          {h}
                        </Text>
                      ))}
                    </View>
                    {sec.table.rows.map((row, rIdx) => (
                      <View
                        key={rIdx}
                        style={[
                          styles.tableRow,
                          rIdx % 2 === 1 && { backgroundColor: '#F8FAFC' },
                        ]}
                      >
                        {row.map((cell, cIdx) => (
                          <Text key={cIdx} style={[styles.tableCell, { flex: 1 }]}>
                            {cell}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Contextual Feature Spotlight Link */}
          {article.relatedFeatureLink && (
            <View style={styles.featureBridgeCard}>
              <View style={styles.bridgeLeft}>
                <Text style={styles.bridgeBadge}>RELEVANT SOLUTION</Text>
                <Text style={styles.bridgeTitle}>{article.relatedFeatureLink.label}</Text>
                <Text style={styles.bridgeDesc}>{article.relatedFeatureLink.description}</Text>
              </View>
              <TouchableOpacity
                style={styles.bridgeBtn}
                onPress={() => router.push(article.relatedFeatureLink!.route as any)}
                activeOpacity={0.85}
              >
                <Text style={styles.bridgeBtnText}>Explore Feature →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Article FAQs if any */}
          {article.faqs && article.faqs.length > 0 && (
            <View style={styles.faqSection}>
              <Text role="heading" aria-level={2} style={styles.faqTitle}>
                Frequently Asked Questions
              </Text>
              <View style={styles.faqList}>
                {article.faqs.map((faq, fIdx) => (
                  <View key={fIdx} style={styles.faqItem}>
                    <Text style={styles.faqQuestion}>Q: {faq.question}</Text>
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Author Bio Box */}
          <View style={styles.authorBioCard}>
            <View style={styles.authorBioAvatar}>
              <Text style={{ fontSize: 28 }}>👨‍💻</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.bioAuthorName}>{article.author.name}</Text>
              <Text style={styles.bioAuthorRole}>{article.author.role}</Text>
              <Text style={styles.bioAuthorDesc}>{article.author.bio}</Text>
            </View>
          </View>

          {/* Bottom Conversion Card */}
          <View style={styles.bottomCtaBanner}>
            <View style={styles.bottomCtaTextCol}>
              <Text style={styles.bottomCtaHeading}>
                Experience RestroZ in Your Restaurant
              </Text>
              <Text style={styles.bottomCtaSubtitle}>
                See how high-speed billing, automated KOT thermal printing, and mobile waiter ordering
                streamline your daily food operations.
              </Text>
            </View>
            <View style={styles.bottomCtaActionCol}>
              <TouchableOpacity
                style={styles.demoBtn}
                onPress={() => router.push('/info/book-demo' as any)}
                activeOpacity={0.85}
              >
                <Text style={styles.demoBtnText}>Book a Free 1-on-1 Demo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pricingBtn}
                onPress={() => router.push('/info/pricing' as any)}
                activeOpacity={0.85}
              >
                <Text style={styles.pricingBtnText}>View Pricing Plans</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Related Articles Section */}
          <View style={styles.relatedSection}>
            <Text style={styles.relatedHeading}>Related Restaurant Guides</Text>
            <View style={[styles.relatedGrid, !isTablet && styles.relatedGridMobile]}>
              {relatedArticles.map((rel) => (
                <TouchableOpacity
                  key={rel.slug}
                  style={styles.relatedCard}
                  onPress={() => router.push(`/info/blog/${rel.slug}` as any)}
                  activeOpacity={0.88}
                >
                  <View style={styles.relatedCat}>
                    <Text style={styles.relatedCatText}>{rel.category}</Text>
                  </View>
                  <Text style={styles.relatedTitle} numberOfLines={2}>
                    {rel.title}
                  </Text>
                  <Text style={styles.relatedReadTime}>⏱️ {rel.readingTime}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    </MarketingLayout>
  );
}

const styles = StyleSheet.create({
  articlePageWrapper: {
    backgroundColor: '#FAF9F6',
    paddingVertical: 32,
    width: '100%',
  },
  articleContainer: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 32,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  breadcrumbLink: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  breadcrumbSeparator: {
    fontSize: 13,
    color: '#CBD5E1',
  },
  breadcrumbCurrent: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
  },
  headerBlock: {
    gap: 16,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF4EB',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryBadgeText: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  articleTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  articleExcerpt: {
    fontSize: 17,
    color: '#475569',
    lineHeight: 26,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    flexWrap: 'wrap',
    gap: 12,
  },
  authorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  authorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  authorRole: {
    fontSize: 12,
    color: '#64748B',
  },
  dateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
  },
  readTimeText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  keyTakeawaysCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 24,
    gap: 14,
  },
  takeawaysHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  takeawaysTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E40AF',
  },
  takeawaysList: {
    gap: 8,
  },
  takeawayItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  takeawayDot: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
    marginTop: 2,
  },
  takeawayText: {
    flex: 1,
    fontSize: 14,
    color: '#1E3A8A',
    lineHeight: 22,
  },
  bodyContent: {
    gap: 28,
  },
  sectionBlock: {
    gap: 12,
  },
  sectionHeading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
    marginTop: 8,
  },
  sectionSubheading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
  },
  paragraphText: {
    fontSize: 16,
    color: '#334155',
    lineHeight: 26,
  },
  bulletsList: {
    gap: 8,
    marginVertical: 4,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletSymbol: {
    color: '#FC8019',
    fontSize: 18,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#334155',
    lineHeight: 24,
  },
  calloutBox: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    borderRadius: 8,
    padding: 16,
    gap: 6,
    marginVertical: 8,
  },
  calloutImportant: {
    backgroundColor: '#FFF7ED',
    borderLeftColor: '#EA580C',
  },
  calloutTip: {
    backgroundColor: '#F0FDF4',
    borderLeftColor: '#16A34A',
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  calloutText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  tableWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginVertical: 12,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHeaderCell: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableCell: {
    fontSize: 13,
    color: '#334155',
  },
  featureBridgeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FED7AA',
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    shadowColor: '#EA580C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  bridgeLeft: {
    flex: 1,
    minWidth: 260,
    gap: 4,
  },
  bridgeBadge: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '800',
  },
  bridgeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  bridgeDesc: {
    fontSize: 13,
    color: '#64748B',
  },
  bridgeBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  bridgeBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  faqSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 24,
    gap: 16,
  },
  faqTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  faqList: {
    gap: 14,
  },
  faqItem: {
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  faqAnswer: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  authorBioCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  authorBioAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioAuthorName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  bioAuthorRole: {
    fontSize: 12,
    color: '#EA580C',
    fontWeight: '600',
  },
  bioAuthorDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  bottomCtaBanner: {
    backgroundColor: '#0B132B',
    borderRadius: 20,
    padding: 32,
    gap: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  bottomCtaTextCol: {
    flex: 1,
    minWidth: 280,
    gap: 8,
  },
  bottomCtaHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  bottomCtaSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  bottomCtaActionCol: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  demoBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  demoBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  pricingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#475569',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  pricingBtnText: {
    color: '#CBD5E1',
    fontWeight: '600',
    fontSize: 14,
  },
  relatedSection: {
    gap: 16,
    marginTop: 8,
  },
  relatedHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  relatedGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  relatedGridMobile: {
    flexDirection: 'column',
  },
  relatedCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    gap: 8,
  },
  relatedCat: {
    alignSelf: 'flex-start',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  relatedCatText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  relatedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 20,
  },
  relatedReadTime: {
    fontSize: 11,
    color: '#94A3B8',
  },
  notFoundContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    gap: 16,
  },
  notFoundTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  notFoundSubtitle: {
    fontSize: 15,
    color: '#64748B',
  },
  backHubBtn: {
    backgroundColor: '#FC8019',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backHubBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
