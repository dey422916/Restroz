import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../src/components/marketing/MarketingLayout';

export function DataDeletionPage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Account & Data Deletion Request — RestroZ',
        description: 'Submit an account or personal data deletion request for RestroZ restaurant management and POS services.',
        canonicalPath: '/info/data-deletion',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <Text style={styles.title}>Account & Data Deletion Request</Text>
          <Text style={styles.subtitle}>RestroZ User & Account Data Management</Text>
        </View>
      </View>

      <View style={styles.contentSection}>
        <View style={styles.contentInner}>
          <Text style={styles.paragraph}>
            RestroZ respects your right to control your personal information. If you have an account or have data associated with the RestroZ restaurant management platform, mobile application, or POS services, you may request the deletion of your account and eligible personal data in accordance with this policy.
          </Text>

          <Text style={styles.sectionHeader}>How to Submit a Deletion Request</Text>
          <Text style={styles.paragraph}>
            To request the deletion of your RestroZ account or associated eligible personal information, please send an email to our support team:
          </Text>
          <View style={styles.highlightCard}>
            <Text style={styles.highlightLabel}>Email:</Text>
            <Text style={styles.highlightValue}>restroz.pos@gmail.com</Text>
            <Text style={styles.highlightLabel}>Recommended Subject Line:</Text>
            <Text style={styles.highlightValue}>RestroZ Account/Data Deletion Request</Text>
          </View>

          <Text style={styles.sectionHeader}>Information to Include in Your Request</Text>
          <Text style={styles.paragraph}>
            To help us locate and identify your account accurately, please provide the following information in your email:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Your registered full name.</Text>
            <Text style={styles.bulletItem}>• Your registered email address associated with your RestroZ account.</Text>
            <Text style={styles.bulletItem}>• Your registered phone number, if applicable.</Text>
            <Text style={styles.bulletItem}>• Your restaurant or business name, if applicable.</Text>
            <Text style={styles.bulletItem}>• A clear statement requesting account deletion, personal data deletion, or both.</Text>
          </View>

          <Text style={styles.sectionHeader}>Important Security Notice — What NOT to Provide</Text>
          <View style={styles.warningCard}>
            <Text style={styles.warningText}>
              For your safety and protection, do NOT include sensitive authentication credentials in your request email. Specifically, never provide:
            </Text>
            <Text style={styles.warningItem}>• Your password</Text>
            <Text style={styles.warningItem}>• One-Time Passwords (OTPs)</Text>
            <Text style={styles.warningItem}>• Payment card details, PINs, or banking credentials</Text>
            <Text style={styles.warningItem}>• Any other sensitive security credentials</Text>
          </View>

          <Text style={styles.sectionHeader}>Identity Verification</Text>
          <Text style={styles.paragraph}>
            To protect your account from unauthorized deletion requests, RestroZ may verify your identity and confirm that you have the authority to request the deletion of the specified account or business data before processing your request.
          </Text>

          <Text style={styles.sectionHeader}>Data That May Be Deleted</Text>
          <Text style={styles.paragraph}>
            Upon successful verification and approval of your request, eligible data that may be deleted includes:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• User account and profile information.</Text>
            <Text style={styles.bulletItem}>• Account contact information.</Text>
            <Text style={styles.bulletItem}>• Restaurant and business information associated with the account, where eligible.</Text>
            <Text style={styles.bulletItem}>• Customer information associated with the account, where eligible.</Text>
            <Text style={styles.bulletItem}>• Other eligible personal information associated with the RestroZ account.</Text>
          </View>

          <Text style={styles.sectionHeader}>Data That May Be Retained</Text>
          <Text style={styles.paragraph}>
            Please note that certain information may need to be retained for legitimate business, accounting, taxation, security, dispute-resolution, or legal and regulatory compliance purposes. Retained information may include:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Completed transaction records and order histories.</Text>
            <Text style={styles.bulletItem}>• Invoices and billing records.</Text>
            <Text style={styles.bulletItem}>• Statutory tax documentation and GST billing snapshots.</Text>
            <Text style={styles.bulletItem}>• Financial and system audit records.</Text>
            <Text style={styles.bulletItem}>• Records that RestroZ is required or permitted by applicable law to retain.</Text>
          </View>

          <Text style={styles.sectionHeader}>Privacy Policy</Text>
          <Text style={styles.paragraph}>
            For more details on how RestroZ collects, processes, and protects your information, please review our full{' '}
            <Text
              style={styles.inlineLink}
              onPress={() => router.push('/info/privacy-policy')}
            >
              Privacy Policy
            </Text>
            .
          </Text>

          <Text style={styles.sectionHeader}>Contact Us</Text>
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

export default DataDeletionPage;

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
  highlightCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 16,
    marginVertical: 4,
    gap: 4,
  },
  highlightLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  highlightValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  warningCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 16,
    marginVertical: 4,
    gap: 6,
  },
  warningText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 4,
    lineHeight: 20,
  },
  warningItem: {
    fontSize: 14,
    color: '#B91C1C',
    fontWeight: '600',
    paddingLeft: 4,
  },
  inlineLink: {
    color: '#1E40AF',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
