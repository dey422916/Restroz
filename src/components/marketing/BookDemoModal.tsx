import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { marketingService } from '../../services/api/marketingService';
import { PreferredContactMethod } from '../../types/marketing';

interface BookDemoModalProps {
  visible: boolean;
  onClose: () => void;
  sourcePage?: string;
}

const FEATURE_OPTIONS = [
  'POS Billing & Thermal Print',
  'Kitchen KOT & Routing',
  'Waiter Table-Side App',
  'QR Menu Ordering',
  'Inventory & Stock Control',
  'Multi-Outlet Management',
  'Loyalty & Customer Wallet',
];

export function BookDemoModal({ visible, onClose, sourcePage = '/info' }: BookDemoModalProps) {
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [outlets, setOutlets] = useState('1');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['POS Billing & Thermal Print']);
  const [preferredMethod, setPreferredMethod] = useState<PreferredContactMethod>('phone');
  const [demoDate, setDemoDate] = useState('');
  const [demoTime, setDemoTime] = useState('11:00 AM');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const toggleFeature = (feat: string) => {
    if (selectedFeatures.includes(feat)) {
      setSelectedFeatures(selectedFeatures.filter((f) => f !== feat));
    } else {
      setSelectedFeatures([...selectedFeatures, feat]);
    }
  };

  const handleBookDemo = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const result = await marketingService.submitLead({
        lead_type: 'demo',
        full_name: fullName,
        business_name: businessName,
        phone,
        email,
        city,
        number_of_outlets: parseInt(outlets, 10) || 1,
        interested_features: selectedFeatures,
        preferred_contact_method: preferredMethod,
        preferred_demo_date: demoDate || undefined,
        preferred_demo_time: demoTime || undefined,
        message,
        source_page: sourcePage,
        honeypot,
      });

      if (!result.success) {
        setErrorMsg(result.error || 'Failed to book demo. Please check your entries.');
      } else {
        setSubmitted(true);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setSubmitted(false);
    setErrorMsg(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleResetAndClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Schedule a Live 1-on-1 Demo</Text>
              <Text style={styles.modalSub}>
                See how RestroZ transforms your restaurant billing, KOTs, and table operations.
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleResetAndClose}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {submitted ? (
            <View style={styles.successBlock}>
              <Text style={styles.successEmoji}>🎉</Text>
              <Text style={styles.successTitle}>Demo Request Confirmed!</Text>
              <Text style={styles.successDesc}>
                Thank you, {fullName}. Our product specialist will contact you via{' '}
                {preferredMethod.toUpperCase()} to confirm your demo schedule.
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleResetAndClose}>
                <Text style={styles.doneBtnText}>Close Window</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
              {errorMsg ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
                </View>
              ) : null}

              {/* Spam Trap */}
              <TextInput
                value={honeypot}
                onChangeText={setHoneypot}
                style={{ display: 'none' }}
                tabIndex={-1}
                autoComplete="off"
              />

              <View style={styles.fieldsGrid}>
                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Your Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Ratnadeep Dey"
                    placeholderTextColor="#94A3B8"
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Restaurant Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Panch Phoron Bistro"
                    placeholderTextColor="#94A3B8"
                    value={businessName}
                    onChangeText={setBusinessName}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Mobile Number *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="9876543210"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Email Address *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="owner@restaurant.com"
                    placeholderTextColor="#94A3B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>City *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Hyderabad, Delhi, Bangalore"
                    placeholderTextColor="#94A3B8"
                    value={city}
                    onChangeText={setCity}
                  />
                </View>

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>Number of Outlets</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={outlets}
                    onChangeText={setOutlets}
                  />
                </View>

                {/* Features of Interest */}
                <View style={[styles.fieldWrap, { width: '100%' }]}>
                  <Text style={styles.fieldLabel}>Features You Would Like to See</Text>
                  <View style={styles.featureChipsWrap}>
                    {FEATURE_OPTIONS.map((feat) => {
                      const isSelected = selectedFeatures.includes(feat);
                      return (
                        <TouchableOpacity
                          key={feat}
                          style={[styles.chip, isSelected && styles.chipActive]}
                          onPress={() => toggleFeature(feat)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                            {isSelected ? '✓ ' : '+ '}
                            {feat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Preferred Contact Method */}
                <View style={[styles.fieldWrap, { width: '100%' }]}>
                  <Text style={styles.fieldLabel}>Preferred Contact Method</Text>
                  <View style={styles.methodRow}>
                    {(['phone', 'whatsapp', 'email'] as PreferredContactMethod[]).map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.methodBtn, preferredMethod === m && styles.methodBtnActive]}
                        onPress={() => setPreferredMethod(m)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.methodText, preferredMethod === m && styles.methodTextActive]}>
                          {m === 'phone' ? '📞 Phone' : m === 'whatsapp' ? '💬 WhatsApp' : '✉️ Email'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                onPress={handleBookDemo}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Confirm Live Demo Booking →</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    maxWidth: 640,
    width: '100%',
    maxHeight: '90%',
    padding: 24,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
  },
  formScroll: {
    marginTop: 16,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginBottom: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  fieldWrap: {
    width: '48%',
    minWidth: 180,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  featureChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipActive: {
    backgroundColor: '#FFF4EB',
    borderColor: '#FC8019',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#EA580C',
    fontWeight: '700',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  methodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  methodBtnActive: {
    backgroundColor: '#FFF4EB',
    borderColor: '#FC8019',
  },
  methodText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  methodTextActive: {
    color: '#FC8019',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#FC8019',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    shadowColor: '#FC8019',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  successBlock: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  successEmoji: {
    fontSize: 44,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#16A34A',
  },
  successDesc: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },
  doneBtn: {
    marginTop: 12,
    backgroundColor: '#0F172A',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
