import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface FAQItem {
  q: string;
  a: string;
}

export const COMMON_FAQS: FAQItem[] = [
  {
    q: 'What is RestroZ and how does it help restaurants?',
    a: 'RestroZ is a modern, unified cloud restaurant management platform that connects your front-of-house, kitchen, and back-office. It handles high-speed POS billing, digital KOT routing, table-side waiter ordering, QR menus, inventory stock costing, loyalty cashback, and multi-outlet reporting.',
  },
  {
    q: 'Can our waiters take customer orders from mobile phones or tablets?',
    a: 'Yes! RestroZ provides a dedicated table-side Waiter Mobile App that runs seamlessly on any standard Android smartphone, iPhone, or iPad. Waiters can instantly punch orders, modify dishes, add notes, and fire KOTs directly to the kitchen without walking back to the cash counter.',
  },
  {
    q: 'Does RestroZ support Kitchen Order Tickets (KOT) and thermal printer routing?',
    a: 'Yes. RestroZ supports automated KOT generation, supplementary item tracking, and intelligent category-based printer routing (e.g. sending Bar items to a Bar printer and Tandoor items to a Kitchen printer) via network TCP, Bluetooth, and local Windows print agents.',
  },
  {
    q: 'How does the contactless QR Digital Menu work?',
    a: 'Each table is assigned a unique QR standee. Guests scan the QR code using their phone camera to instantly view your live digital menu with photos, descriptions, and dietary tags. Depending on your configuration, guests can either browse or place orders directly from the table.',
  },
  {
    q: 'Can I manage multiple restaurant branches from a single dashboard?',
    a: 'Yes. RestroZ includes enterprise multi-outlet capabilities. Owners can view aggregated real-time sales, manage catalog menus across branches, control staff permissions, and analyze performance across all locations from one central admin account.',
  },
  {
    q: 'How does inventory & stock tracking work in RestroZ?',
    a: 'RestroZ tracks raw ingredient consumption against recipe items sold. You receive automated low-stock warnings, purchase ledger tracking, and wastage visibility to control food costs and prevent shrinkage.',
  },
  {
    q: 'How can I schedule a live demo or get pricing for my restaurant?',
    a: 'You can click "Book a Demo" or "Contact Sales" on our website. Our restaurant technology specialists will walk you through a live personalized demo and help you choose the best plan for your setup.',
  },
];

export function FAQAccordion({ items = COMMON_FAQS }: { items?: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <View style={styles.faqList}>
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <View key={`faq-${idx}`} style={[styles.faqCard, isOpen && styles.faqCardOpen]}>
            <TouchableOpacity
              style={styles.faqQuestionRow}
              onPress={() => toggle(idx)}
              activeOpacity={0.7}
            >
              <Text style={[styles.faqQuestion, isOpen && styles.faqQuestionActive]}>
                {item.q}
              </Text>
              <Text style={styles.faqToggleIcon}>{isOpen ? '−' : '+'}</Text>
            </TouchableOpacity>

            {isOpen && (
              <View style={styles.faqAnswerWrap}>
                <Text style={styles.faqAnswer}>{item.a}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  faqList: {
    gap: 12,
    width: '100%',
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  faqCardOpen: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFFDFB',
  },
  faqQuestionRow: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  faqQuestionActive: {
    color: '#EA580C',
  },
  faqToggleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748B',
  },
  faqAnswerWrap: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  faqAnswer: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
});
