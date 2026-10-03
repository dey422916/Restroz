import React from 'react';
import { Platform } from 'react-native';
import Head from 'expo-router/head';
import { MarketingSEOMetadata } from '../../types/marketing';

const SITE_DOMAIN = 'https://restroz.shop';
const DEFAULT_OG_IMAGE = 'https://restroz.shop/restroz-logo.png';

export function SEOHead({
  title,
  description,
  canonicalPath,
  keywords,
  ogImage = DEFAULT_OG_IMAGE,
  structuredData,
}: MarketingSEOMetadata) {
  // Ensure canonicalPath starts with /info
  const normalizedPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
  const canonicalUrl = `${SITE_DOMAIN}${normalizedPath}`;
  const fullTitle = title.includes('RestroZ') ? title : `${title} | RestroZ Restaurant POS`;

  const keywordString = (
    keywords || [
      'restaurant POS software',
      'restaurant management software',
      'restaurant billing software',
      'cloud restaurant POS',
      'waiter ordering app',
      'KOT kitchen software',
      'restaurant inventory management',
      'QR menu ordering',
      'multi outlet restaurant software',
      'RestroZ',
    ]
  ).join(', ');

  const defaultOrgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'RestroZ',
    url: `${SITE_DOMAIN}/info`,
    logo: DEFAULT_OG_IMAGE,
    description: 'Complete Modern Restaurant Management & Cloud POS Platform',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+91-7098513441',
      contactType: 'sales',
      areaServed: ['IN', 'AE', 'SG', 'US', 'GB'],
      availableLanguage: ['English', 'Hindi'],
    },
  };

  const defaultSoftwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'RestroZ',
    operatingSystem: 'Web, Android, Windows, Cloud',
    applicationCategory: 'BusinessApplication',
    description: description,
    url: canonicalUrl,
  };

  const allStructuredData = Array.isArray(structuredData)
    ? [defaultOrgSchema, defaultSoftwareSchema, ...structuredData]
    : structuredData
    ? [defaultOrgSchema, defaultSoftwareSchema, structuredData]
    : [defaultOrgSchema, defaultSoftwareSchema];

  return (
    <Head>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywordString} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="RestroZ" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Structured Data (JSON-LD) */}
      {allStructuredData.map((schema, index) => (
        <script
          key={`ld-json-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </Head>
  );
}
