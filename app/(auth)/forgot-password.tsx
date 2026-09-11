import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [sentSuccess, setSentSuccess] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);

  const handleSendReset = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Missing Email', 'Please enter your account email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address format.');
      return;
    }

    if (cooldown > 0) return;

    setLoading(true);
    try {
      await resetPassword(trimmedEmail);
      setSentSuccess(true);

      // Start 60 second cooldown
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      Alert.alert(
        'Request Sent',
        `If an account with ${trimmedEmail} exists in RestroZ, you will receive password reset instructions shortly.`
      );
    } catch (err: any) {
      Alert.alert('Request Failed', err.message || 'Could not send reset password email.');
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
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.icon}>🔑</Text>
            <Text style={styles.title}>Forgot Password</Text>
            <Text style={styles.subtitle}>Enter your registered email address</Text>
          </View>

          {sentSuccess && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                ✓ If this email is registered, password reset instructions have been sent to your inbox.
              </Text>
            </View>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="user@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, (loading || cooldown > 0) && styles.submitBtnDisabled]}
            onPress={handleSendReset}
            disabled={loading || cooldown > 0}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>
                {cooldown > 0 ? `RESEND IN ${cooldown}s` : 'SEND PASSWORD RESET LINK'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.backBtnText}>← Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  successBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  submitBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  backBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
  },
});
