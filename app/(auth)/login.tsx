import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useRouter, useLocalSearchParams } from 'expo-router';

const REMEMBER_EMAIL_KEY = 'ratnadeep_remember_email';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login, consumePendingTableId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ redirectTableId?: string }>();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Load saved email on mount if "Remember Me" was enabled
  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_EMAIL_KEY).then((savedEmail) => {
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    });
  }, []);

  const handleLoginSubmit = async () => {
    if (loading) return; // Prevent duplicate submissions

    setErrorMessage('');

    const targetEmail = email.trim();
    if (!targetEmail) {
      setErrorMessage('Email is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
      setErrorMessage('Enter a valid email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Password is required.');
      return;
    }

    setLoading(true);
    try {
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, targetEmail);
      } else {
        await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
      }

      const userProfile = await login(targetEmail, password);
      const userRole = (userProfile.role || 'CUSTOMER').toUpperCase();

      if (userRole === 'SUPER_ADMIN') {
        router.replace('/super-admin' as any);
      } else if (userRole === 'ADMIN' || userRole === 'STAFF') {
        router.replace('/(admin)/pos' as any);
      } else {
        const pendingTable = params.redirectTableId || (await consumePendingTableId());
        if (pendingTable && pendingTable !== 'general') {
          router.replace(`/menu/table/${pendingTable}` as any);
        } else {
          router.replace('/(marketplace)' as any);
        }
      }
    } catch (err: any) {
      const rawMsg = (err?.message || err?.error_description || String(err || '')).toLowerCase();

      if (
        rawMsg.includes('network') ||
        rawMsg.includes('failed to fetch') ||
        rawMsg.includes('connection') ||
        rawMsg.includes('timeout') ||
        (err?.name === 'TypeError' && rawMsg.includes('fetch'))
      ) {
        setErrorMessage('Unable to connect. Please check your internet connection and try again.');
      } else if (
        rawMsg.includes('invalid login credentials') ||
        rawMsg.includes('invalid email or password') ||
        rawMsg.includes('invalid credential') ||
        rawMsg.includes('user not found') ||
        rawMsg.includes('invalid password') ||
        err?.status === 400 ||
        err?.code === 'invalid_credentials'
      ) {
        setErrorMessage('Incorrect email or password.');
      } else if (rawMsg.includes('not been verified')) {
        setErrorMessage(
          'Your email has not been verified yet. Please check your inbox and verify your account.'
        );
      } else {
        setErrorMessage('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push('/(auth)/forgot-password');
  };

  const isEmailError =
    errorMessage === 'Email is required.' ||
    errorMessage === 'Enter a valid email address.' ||
    errorMessage === 'Incorrect email or password.';

  const isPasswordError =
    errorMessage === 'Password is required.' ||
    errorMessage === 'Incorrect email or password.';

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
            {/* Restaurant Branding Header */}
            <View style={styles.header}>
              <Image
                source={require('../../assets/images/restroz_logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.brandSubtitle}>Restaurant POS & Customer Ordering</Text>
            </View>

            {/* Email Field */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, isEmailError && styles.inputError]}
                  placeholder="name@example.com"
                  placeholderTextColor="#94a3b8"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
              </View>
            </View>

            {/* Password Field with Show/Hide Eye Toggle */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={[styles.input, { paddingRight: 46 }, isPasswordError && styles.inputError]}
                  placeholder="Enter your password"
                  placeholderTextColor="#94a3b8"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage('');
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Remember Me Checkbox */}
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.rememberText}>Remember Me</Text>
            </TouchableOpacity>

            {/* Login Action Button */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLoginSubmit}
              disabled={loading}
              activeOpacity={0.85}
              testID="login-submit-button"
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.loginBtnText}>LOGIN</Text>
              )}
            </TouchableOpacity>

            {/* Clearly Visible Error Message Display below login form */}
            {errorMessage ? (
              <View
                style={styles.errorContainer}
                testID="login-error-message"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
              >
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText} testID="login-error-text">
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {/* Forgot Password Link */}
            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={handleForgotPassword}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Customer Registration Link */}
            <View style={styles.signupRow}>
              <Text style={styles.signupPrompt}>New customer? </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(auth)/signup',
                    params: params.redirectTableId ? { redirectTableId: params.redirectTableId } : undefined,
                  })
                }
                activeOpacity={0.7}
              >
                <Text style={styles.signupAction}>Sign Up</Text>
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
    backgroundColor: '#0f172a', // Clean modern dark slate background
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
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
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
  eyeBtn: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  eyeIcon: {
    fontSize: 16,
    color: '#64748b',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    marginTop: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    marginTop: -1,
  },
  rememberText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  loginBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  loginBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  forgotBtn: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563eb',
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 18,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupPrompt: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  signupAction: {
    fontSize: 13,
    fontWeight: '800',
    color: '#16a34a',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
    gap: 10,
  },
  errorIcon: {
    fontSize: 16,
  },
  errorText: {
    flex: 1,
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  inputError: {
    borderColor: '#EF4444',
    backgroundColor: '#FFF5F5',
  },
});
