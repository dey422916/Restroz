import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, isSupabaseConfigured } from '../../src/services/supabase';

export default function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; redirectTableId?: string }>();
  const email = params.email || 'your email address';

  const [loading, setLoading] = useState<boolean>(false);
  const [cooldown, setCooldown] = useState<number>(0);

  const handleResendEmail = async () => {
    if (!params.email) {
      Alert.alert('Missing Email', 'No email address provided to resend verification.');
      return;
    }

    if (cooldown > 0) return;

    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: params.email,
        });

        if (error) throw error;
      }

      Alert.alert(
        'Verification Email Sent',
        `A fresh verification link has been sent to ${params.email}. Please check your inbox and spam folder.`
      );

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
    } catch (err: any) {
      Alert.alert('Resend Failed', err.message || 'Could not resend verification email.');
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
            <Text style={styles.icon}>✉️</Text>
            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.subtitle}>RestroZ Customer Registration</Text>
          </View>

          <Text style={styles.message}>
            We sent a verification link to:{'\n'}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          <Text style={styles.instruction}>
            Please check your email inbox and click the verification link before signing in.
          </Text>

          <TouchableOpacity
            style={[styles.resendBtn, (loading || cooldown > 0) && styles.resendBtnDisabled]}
            onPress={handleResendEmail}
            disabled={loading || cooldown > 0}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.resendBtnText}>
                {cooldown > 0 ? `RESEND IN ${cooldown}s` : 'RESEND VERIFICATION EMAIL'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={() =>
              router.replace({
                pathname: '/(auth)/login',
                params: params.redirectTableId ? { redirectTableId: params.redirectTableId } : undefined,
              })
            }
          >
            <Text style={styles.loginBtnText}>BACK TO LOGIN</Text>
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
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
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
  message: {
    fontSize: 14,
    color: '#334155',
    textAlign: 'center',
    marginBottom: 12,
  },
  emailHighlight: {
    fontWeight: '900',
    color: '#2563eb',
  },
  instruction: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  resendBtn: {
    width: '100%',
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  resendBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  resendBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  loginBtn: {
    width: '100%',
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  loginBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
});
