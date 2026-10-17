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
          <Text style={styles.title}>RestroZ Privacy Policy</Text>
          <Text style={styles.subtitle}>Last Updated: 17 October 2026</Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <Text style={styles.paragraph}>
            RestroZ respects your privacy and is committed to protecting personal and business information. This Privacy Policy explains how information is collected, used, and protected when you use the RestroZ website, mobile application, POS platform, and related services.
          </Text>

          <Text style={styles.sectionHeader}>1. Information We Collect</Text>
          <Text style={styles.paragraph}>
            Depending on the features you use, RestroZ may collect or process:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Name, email address, phone number, and account information.</Text>
            <Text style={styles.bulletItem}>• Restaurant/business name, address, and other business details.</Text>
            <Text style={styles.bulletItem}>• Menu, product, table, staff, inventory, and outlet information.</Text>
            <Text style={styles.bulletItem}>• Orders, KOTs, bills, payment records, and sales information.</Text>
            <Text style={styles.bulletItem}>• Customer information entered by restaurants, such as name and phone number.</Text>
            <Text style={styles.bulletItem}>• Device and technical information necessary for app functionality and security.</Text>
          </View>

          <Text style={styles.sectionHeader}>2. How We Use Information</Text>
          <Text style={styles.paragraph}>
            Information is used to provide and operate RestroZ services, including POS billing, order and KOT management, restaurant operations, reporting, customer management, loyalty features, QR ordering, account authentication, support, security, and service improvements.
          </Text>

          <Text style={styles.sectionHeader}>3. Device Permissions</Text>
          <Text style={styles.paragraph}>
            The RestroZ mobile app may request device permissions required for specific features.
          </Text>
          <Text style={styles.paragraph}>
            Bluetooth/Nearby Devices and USB access may be used to discover, connect to, and print through compatible thermal printers. Other permissions may be requested only when required for a feature being used.
          </Text>
          <Text style={styles.paragraph}>
            RestroZ does not use these permissions for unrelated tracking or advertising.
          </Text>

          <Text style={styles.sectionHeader}>4. Data Security and Restaurant Data</Text>
          <Text style={styles.paragraph}>
            RestroZ uses security measures designed to protect restaurant and user information from unauthorized access.
          </Text>
          <Text style={styles.paragraph}>
            Restaurant data, including sales records, customer information, menus, and operational data, is kept separate from other restaurant accounts using access-control mechanisms.
          </Text>

          <Text style={styles.sectionHeader}>5. Data Sharing</Text>
          <Text style={styles.paragraph}>
            RestroZ does not sell personal or restaurant customer information.
          </Text>
          <Text style={styles.paragraph}>
            Information may be processed by service providers necessary to operate RestroZ or disclosed when required by law, for security purposes, or when authorized by the user or restaurant.
          </Text>

          <Text style={styles.sectionHeader}>6. Data Retention and Deletion</Text>
          <Text style={styles.paragraph}>
            Information is retained only as reasonably necessary to provide RestroZ services and meet applicable business, legal, accounting, and security requirements.
          </Text>
          <Text style={styles.paragraph}>
            Users may contact us to request access, correction, or deletion of eligible personal information.
          </Text>

          <Text style={styles.sectionHeader}>7. Children's Privacy</Text>
          <Text style={styles.paragraph}>
            RestroZ is a business and restaurant-management platform and is not intended for use by children.
          </Text>

          <Text style={styles.sectionHeader}>8. Changes to This Policy</Text>
          <Text style={styles.paragraph}>
            We may update this Privacy Policy when our services, legal requirements, or data practices change. The latest version will be published on this page.
          </Text>

          <Text style={styles.sectionHeader}>9. Contact Us</Text>
          <Text style={styles.paragraph}>
            RestroZ{'\n'}
            Sales: +91 7098513441{'\n'}
            Email: restroz.pos@gmail.com{'\n'}
            Website: https://restroz.shop
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
  bulletList: {
    gap: 8,
    paddingLeft: 4,
    marginTop: -4,
  },
  bulletItem: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
});
