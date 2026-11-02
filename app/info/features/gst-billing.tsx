import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MarketingLayout } from '../../../src/components/marketing/MarketingLayout';
import { AlternatingFeatureRow } from '../../../src/components/marketing/AlternatingFeatureRow';

export default function GstBillingFeaturePage() {
  const router = useRouter();

  return (
    <MarketingLayout
      seo={{
        title: 'Restaurant GST Billing Software in India — 5%, 12%, 18% Tax Slabs | RestroZ',
        description:
          'Automated Indian GST compliant restaurant billing software. Instant CGST, SGST & IGST calculation, mixed alcohol VAT billing, customer GSTIN invoicing, and one-click GSTR reports.',
        canonicalPath: '/info/features/gst-billing',
        keywords: [
          'restaurant GST billing software',
          'restaurant billing software India',
          'CGST SGST restaurant bill',
          'restaurant tax invoice software',
          'GST compliant restaurant POS',
          'restaurant GSTR report export',
        ],
      }}
    >
      {/* Hero Section */}
      <View style={styles.heroSection}>
        <View style={styles.heroInner}>
          <View style={styles.tagBadge}>
            <Text style={styles.tagBadgeText}>STATUTORY COMPLIANCE & TAXATION</Text>
          </View>
          <Text role="heading" aria-level={1} style={styles.title}>
            Indian GST Compliant Restaurant Billing & Invoicing
          </Text>
          <Text style={styles.subtitle}>
            Eliminate tax calculation errors and compliance stress. Automatically compute 5% restaurant GST,
            hotel 18% slabs, mixed alcohol State VAT, and generate compliant B2B tax invoices with customer GSTIN.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/info/book-demo' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Schedule a Live Demo →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Feature Row 1: Automated Tax Slabs */}
      <AlternatingFeatureRow
        badge="AUTOMATED TAX RULES"
        title="5%, 12% and 18% GST Slabs with Itemized CGST & SGST"
        subtitle="Configure your tax rates once. RestroZ automatically applies the legal rates across food, packaged beverages, and bakery items with zero cashier guesswork."
        bullets={[
          { title: 'Standard 5% Restaurant GST', desc: 'Auto-split into 2.5% CGST and 2.5% SGST on standalone restaurant dine-in and takeaways.' },
          { title: 'Hotel 18% GST Support', desc: 'Seamlessly switch to 9% CGST + 9% SGST for restaurants located within hotels with room tariff > ₹7,500.' },
          { title: 'HSN / SAC Code Mapping', desc: 'Pre-mapped SAC codes (e.g. SAC 996331 for restaurant services) on all printed thermal invoices.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>🧾</Text>
            <Text style={styles.mockTitle}>GST Tax Snapshot</Text>
            <Text style={styles.mockSub}>CGST (2.5%) + SGST (2.5%)</Text>
            <View style={styles.taxBadge}>
              <Text style={styles.taxBadgeText}>SAC: 996331 • 100% COMPLIANT</Text>
            </View>
          </View>
        }
      />

      {/* Feature Row 2: B2B Invoicing & Mixed Alcohol VAT */}
      <AlternatingFeatureRow
        badge="ENTERPRISE & BAR BILLING"
        title="Corporate B2B Tax Invoices & Mixed Alcohol VAT Settlement"
        subtitle="Cater to corporate diners with full GSTIN input tax invoices, while simultaneously handling state-specific liquor VAT on the same customer order."
        reversed
        bullets={[
          { title: 'Customer GSTIN Capture', desc: 'Record corporate guest company names, billing addresses, and 15-digit GSTINs in 3 taps.' },
          { title: 'Dual Tax Receipts (Food GST + Alcohol VAT)', desc: 'Restro-bars charge 5% GST on food and 10%–22% State VAT on alcohol on a unified bill.' },
          { title: 'Compliant Serial Invoicing', desc: 'Continuous, sequential financial year invoice numbering (e.g. INV-2627-0001) complying with Rule 46.' },
        ]}
        visualComponent={
          <View style={[styles.mockBox, { backgroundColor: '#0B132B' }]}>
            <Text style={{ fontSize: 40 }}>🍸</Text>
            <Text style={[styles.mockTitle, { color: '#FFFFFF' }]}>Mixed Tax Invoicing</Text>
            <Text style={[styles.mockSub, { color: '#94A3B8' }]}>Food GST (5%) + Liquor VAT (18%)</Text>
            <View style={[styles.taxBadge, { backgroundColor: '#1E293B' }]}>
              <Text style={[styles.taxBadgeText, { color: '#38BDF8' }]}>B2B Corporate Invoice Enabled</Text>
            </View>
          </View>
        }
      />

      {/* Feature Row 3: GSTR Export & CA Ready Reports */}
      <AlternatingFeatureRow
        badge="ACCOUNTING EXPORTS"
        title="One-Click GSTR-1 & GSTR-3B Financial Reports"
        subtitle="Save dozens of hours every month during tax filing. Export clean Excel and CSV spreadsheets formatted for your Chartered Accountant or Tally."
        bullets={[
          { title: 'B2B vs B2C Split Summaries', desc: 'Separately aggregate high-value corporate invoices from general retail walk-in guests.' },
          { title: 'Taxable Value vs Collected Tax', desc: 'Instant breakdown of gross sales, net taxable amount, CGST collected, and SGST collected.' },
          { title: 'Cancelled Bill & Credit Note Audit', desc: 'Clear reconciliation of voided items and discounts to satisfy tax authority audits.' },
        ]}
        visualComponent={
          <View style={styles.mockBox}>
            <Text style={{ fontSize: 40 }}>📊</Text>
            <Text style={styles.mockTitle}>One-Click Tax Exports</Text>
            <Text style={styles.mockSub}>GSTR-1 • GSTR-3B • Tally Compatible</Text>
          </View>
        }
      />

      {/* FAQ Section */}
      <View style={styles.faqSection}>
        <View style={styles.faqInner}>
          <Text style={styles.faqHeading}>Frequently Asked Questions About Restaurant GST</Text>
          <View style={styles.faqList}>
            <View style={styles.faqCard}>
              <Text style={styles.faqQ}>Can a restaurant claim Input Tax Credit (ITC) under 5% GST?</Text>
              <Text style={styles.faqA}>
                No. Under standard Indian GST notifications, standalone restaurants charging 5% GST cannot claim
                Input Tax Credit on raw materials, rent, or capital goods. Only hotel restaurants with room rates
                above ₹7,500 charging 18% GST are eligible for ITC.
              </Text>
            </View>
            <View style={styles.faqCard}>
              <Text style={styles.faqQ}>Does RestroZ print the restaurant 14-digit FSSAI number?</Text>
              <Text style={styles.faqA}>
                Yes. Under FSSAI regulations, printing the 14-digit food license number on all cash receipts
                and bills is mandatory in India. RestroZ prints both your FSSAI license number and GSTIN automatically.
              </Text>
            </View>
            <View style={styles.faqCard}>
              <Text style={styles.faqQ}>How does RestroZ handle delivery orders with packaging charges?</Text>
              <Text style={styles.faqA}>
                RestroZ applies the uniform composite GST rate to delivery packaging and service charges, ensuring
                your total bill conforms to composite supply guidelines.
              </Text>
            </View>
          </View>
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
    shadowRadius: 15,
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
  taxBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  taxBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E40AF',
  },
  faqSection: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 64,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  faqInner: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    gap: 24,
  },
  faqHeading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  faqList: {
    gap: 16,
  },
  faqCard: {
    backgroundColor: '#FAF9F6',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  faqQ: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  faqA: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
});
