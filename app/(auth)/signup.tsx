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
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { signUp, setPendingTableId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTableId?: string }>();

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSignup = async () => {
    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      Alert.alert('Missing Fields', 'Please fill in all required fields (Full Name, Email, Password, Confirm Password).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address format.');
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
      await signUp(trimmedEmail, password, trimmedName, phone);
      Alert.alert('Account Created', 'A verification email has been sent to your email address.');
      router.replace({
        pathname: '/(auth)/verify-email',
        params: { email: trimmedEmail, redirectTableId: params.redirectTableId },
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
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/restroz_logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>Customer Account Registration</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ramesh Kumar"
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address *</Text>
            <TextInput
              style={styles.input}
              placeholder="customer@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Mobile Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="+91 98765 43210"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Password * (Min 6 chars)</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Confirm Password *</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitBtnText}>CREATE CUSTOMER ACCOUNT</Text>
            )}
          </TouchableOpacity>

          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/(auth)/login', params: params.redirectTableId ? { redirectTableId: params.redirectTableId } : undefined })}>
              <Text style={styles.linkAction}>Sign In</Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: 16,
  },
  logoImage: {
    width: 110,
    height: 110,
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  formGroup: {
    marginBottom: 14,
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
    backgroundColor: '#16a34a',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    fontSize: 12,
    color: '#64748b',
  },
  linkAction: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563eb',
  },
});
