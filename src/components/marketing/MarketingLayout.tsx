import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { MarketingHeader } from './MarketingHeader';
import { MarketingFooter } from './MarketingFooter';
import { SEOHead } from './SEOHead';
import { MarketingSEOMetadata } from '../../types/marketing';

interface MarketingLayoutProps {
  seo: MarketingSEOMetadata;
  children: React.ReactNode;
}

export function MarketingLayout({ seo, children }: MarketingLayoutProps) {
  return (
    <View style={styles.rootContainer}>
      <SEOHead {...seo} />
      <MarketingHeader />
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        {children}
        <MarketingFooter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
