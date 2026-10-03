import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { marketingService } from '../../services/api/marketingService';
import { LeadType, PreferredContactMethod } from '../../types/marketing';

interface ContactFormProps {
  leadType?: LeadType;
  title?: string;
  subtitle?: string;
  sourcePage?: string;
  onSuccess?: () => void;
}

export function ContactForm({
  leadType = 'contact',
  title = 'Send Us a Message',
  subtitle = 'Fill in your details below and our team will get back to you within 2 business hours.',
  sourcePage = '/info/contact',
  onSuccess,
}: ContactFormProps) {
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [outlets, setOutlets] = useState('1');
  const [restaurantType, setRestaurantType] = useState('Restaurant');
  const [preferredMethod, setPreferredMethod] = useState<PreferredContactMethod>('phone');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState(''); // spam trap

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      const result = await marketingService.submitLead({
        lead_type: leadType,
        full_name: fullName,
        business_name: businessName,
        phone,
        email,
        city,
        number_of_outlets: parseInt(outlets, 10) || 1,
        restaurant_type: restaurantType,
        preferred_contact_method: preferredMethod,
        message,
        source_page: sourcePage,
        honeypot,
      });

      if (!result.success) {
        setErrorMsg(result.error || 'Failed to submit. Please check your entries.');
      } else {
        setSubmitted(true);
        if (onSuccess) onSuccess();
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.successCard}>
        <Text style={styles.successEmoji}>🎉</Text>
        <Text style={styles.successTitle}>Thank You, {fullName || 'Partner'}!</Text>
        <Text style={styles.successDesc}>
          Your inquiry has been received. A RestroZ restaurant technology advisor will reach out to you shortly via{' '}
          {preferredMethod.toUpperCase()}.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.formCard}>
      {title ? <Text style={styles.formTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.formSubtitle}>{subtitle}</Text> : null}

      {errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
        </View>
      ) : null}

      {/* Hidden Spam Trap */}
      <TextInput
        value={honeypot}
        onChangeText={setHoneypot}
        style={{ display: 'none' }}
        tabIndex={-1}
        autoComplete="off"
      />

      <View style={styles.fieldsGrid}>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Full Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Ratnadeep Dey"
            placeholderTextColor="#94A3B8"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Restaurant / Business Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Spice Garden Bistro"
            placeholderTextColor="#94A3B8"
            value={businessName}
            onChangeText={setBusinessName}
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Mobile Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 9876543210"
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
            placeholder="e.g. owner@restaurant.com"
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
            placeholder="e.g. Mumbai, Kolkata, Dubai"
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
                  {m === 'phone' ? '📞 Call' : m === 'whatsapp' ? '💬 WhatsApp' : '✉️ Email'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.fieldWrap, { width: '100%' }]}>
          <Text style={styles.fieldLabel}>Message / Requirements (Optional)</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Tell us about your restaurant setup, current software, or specific features you need..."
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={3}
            value={message}
            onChangeText={setMessage}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Submit Sales Inquiry →</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 28,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
    gap: 16,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginTop: -8,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '600',
  },
  fieldsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  fieldWrap: {
    width: '48%',
    minWidth: 200,
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  methodTextActive: {
    color: '#FC8019',
  },
  submitBtn: {
    backgroundColor: '#FC8019',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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
  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 36,
    alignItems: 'center',
    textAlign: 'center' as any,
    gap: 12,
  },
  successEmoji: {
    fontSize: 48,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#16A34A',
  },
  successDesc: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
  },
});
