import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function StaffManagementFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Staff Roles, Permissions & Register Controls — RestroZ',
        description:
          'Protect restaurant revenues with granular role-based permissions for Cashiers, Waiters, Kitchen Staff, and Managers with day register cash float tracking.',
        canonicalPath: '/info/features/staff-management',
      }}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>STAFF ACCESS CONTROL</Text>
          </View>
          <Text style={styles.title}>Granular Staff Permissions & Cash Register Accountability</Text>
          <Text style={styles.subtitle}>
            Empower your team while keeping revenue safe. Restrict discounts, prevent unauthorized order deletions, and track opening and closing cash floats.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Explore Staff Controls →</Text>
          </TouchableOpacity>
        </View>
      </View>

      <AlternatingFeatureRow
        badge="REVENUE PROTECTION"
        title="Role-Based Security & Day Register Auditing"
        subtitle="Ensure cashiers balance their drawer every night with opening cash float logging and shift-end difference reconciliation."
        bullets={[
          { title: 'Strict Role Permissions', desc: 'Define access for Cashiers, Floor Waiters, Kitchen Ticket displays, and Admins.' },
          { title: 'Day Register Reconciliation', desc: 'Log opening float, track cash vs card vs UPI sales, and calculate end-of-day cash difference.' },
          { title: 'Detailed Audit Trail', desc: 'Every discount, order edit, and voided item is logged with employee timestamp.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>👥</Text>
            <Text style={styles.mockTitle}>Staff & Register Control</Text>
            <Text style={styles.mockSub}>Roles • Day Register • Audit Logs</Text>
          </View>
        }
      />
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
  mockBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 36,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  mockTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  mockSub: {
    fontSize: 13,
    color: '#64748B',
  },
});
