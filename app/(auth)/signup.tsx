import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { pendingRedirectUtil } from '../../src/utils/pendingRedirect';
import {
  isValidEmail,
  normalizeEmail,
  isValidIndianPhone,
  normalizeIndianPhone,
} from '../../src/utils/validation';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { signUp, setPendingTableId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTableId?: string; redirectSlug?: string; redirectUrl?: string }>();

  useEffect(() => {
    if (params.redirectSlug) {
      pendingRedirectUtil.setPendingRedirectSlug(params.redirectSlug);
    }
    if (params.redirectUrl) {
      pendingRedirectUtil.setPendingRedirectUrl(params.redirectUrl);
    }
  }, [params.redirectSlug, params.redirectUrl]);

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSignup = async () => {
    const cleanEmail = normalizeEmail(email);
    const trimmedName = fullName.trim();
    const cleanPhone = phone.trim() ? normalizeIndianPhone(phone) : undefined;

    if (!trimmedName || !cleanEmail || !password || !confirmPassword) {
      Alert.alert('Missing Fields', 'Please fill in all required fields (Full Name, Email, Password, Confirm Password).');
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      Alert.alert('Invalid Email', 'Enter a valid email address.');
      return;
    }

    if (phone.trim() && !isValidIndianPhone(phone)) {
      Alert.alert('Invalid Phone', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);
    try {
      if (params.redirectTableId) {
        await setPendingTableId(params.redirectTableId);
      }
      await signUp(cleanEmail, password, trimmedName, cleanPhone);
      Alert.alert('Account Created', 'A verification email has been sent to your email address.');
      router.replace({
        pathname: '/(auth)/verify-email',
        params: {
          email: cleanEmail,
          ...(params.redirectTableId ? { redirectTableId: params.redirectTableId } : {}),
          ...(params.redirectSlug ? { redirectSlug: params.redirectSlug } : {}),
          ...(params.redirectUrl ? { redirectUrl: params.redirectUrl } : {}),
        },
      });
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message || 'Could not register customer account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: Platform.OS === 'web' ? 16 : insets.top + 8,
            paddingBottom: Platform.OS === 'web' ? 16 : insets.bottom + 8,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.centeredWrapper}>
          <View style={styles.card}>
            {/* Branding Header */}
            <View style={styles.header}>
              <Image
                source={require('../../assets/images/restroz_logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.brandSubtitle}>Customer Account Registration</Text>
            </View>

            {/* Full Name Field */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#94a3b8"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            {/* Email Address Field */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="customer@example.com"
                placeholderTextColor="#94a3b8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            {/* Mobile Phone Number Field */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Mobile Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
                placeholderTextColor="#94a3b8"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            {/* Password Field */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Password * (Min 6 chars)</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {/* Confirm Password Field */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Confirm Password *</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            </View>

            {/* Create Account Action Button */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>CREATE CUSTOMER ACCOUNT</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Link back to Sign In */}
            <View style={styles.linkRow}>
              <Text style={styles.linkText}>Already have an account? </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(auth)/login',
                    params: {
                      ...(params.redirectTableId ? { redirectTableId: params.redirectTableId } : {}),
                      ...(params.redirectSlug ? { redirectSlug: params.redirectSlug } : {}),
                      ...(params.redirectUrl ? { redirectUrl: params.redirectUrl } : {}),
                    },
                  } as any)
                }
                activeOpacity={0.7}
              >
                <Text style={styles.linkAction}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a', // Clean modern dark slate background matching login
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  centeredWrapper: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 32,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
      },
      default: {
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
    }),
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoImage: {
    width: 120,
    height: 120,
    marginBottom: 4,
  },
  brandSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14.5,
    color: '#0f172a',
  },
  submitBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
    marginTop: 6,
  },
  submitBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 18,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  linkAction: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563eb',
  },
});
