import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { marketplaceService } from '../../src/services/api/marketplaceService';
import { customerColors } from '../../src/utils/colors';

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { user, logout, loading: authLoading } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Full Name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      await marketplaceService.updateCustomerProfile(user.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
      });
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm('Are you sure you want to sign out?') : true;
      if (!confirmed) return;
      await logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      } else {
        router.replace('/(auth)/login' as any);
      }
      return;
    }

    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login' as any);
        },
      },
    ]);
  };

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={customerColors.primary} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 44 }}>👤</Text>
        <Text style={styles.authTitle}>Customer Account</Text>
        <Text style={styles.authSub}>Sign in to view your profile, manage addresses, and track meals.</Text>
        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginBtnText}>Log In to Your Account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image
            source={require('../../assets/images/restroz_logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>My Profile</Text>
        </View>
        {!isEditing ? (
          <TouchableOpacity
            style={styles.editHeaderBtn}
            onPress={() => setIsEditing(true)}
          >
            <Text style={styles.editHeaderBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.saveHeaderBtn}
            onPress={handleSaveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveHeaderBtnText}>Save</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>
              {(fullName || user.email || 'U').charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.formWrap}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your Name"
              />
            ) : (
              <Text style={styles.fieldValue}>{fullName || 'Not provided'}</Text>
            )}

            <Text style={styles.fieldLabel}>Mobile Phone</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 99999 00000"
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.fieldValue}>{phone || 'Not provided'}</Text>
            )}

            <Text style={styles.fieldLabel}>Email Address</Text>
            <Text style={[styles.fieldValue, { color: '#64748B' }]}>{user.email}</Text>

            {isEditing && (
              <TouchableOpacity
                style={styles.cancelEditBtn}
                onPress={() => {
                  setFullName(user.full_name || '');
                  setPhone(user.phone || '');
                  setIsEditing(false);
                }}
              >
                <Text style={styles.cancelEditText}>Cancel Editing</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Quick Menu Shortcuts */}
        <Text style={styles.sectionTitle}>Account Shortcuts</Text>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push('/(marketplace)/addresses')}
        >
          <View style={styles.menuIconWrap}>
            <Text style={{ fontSize: 18 }}>📍</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>Saved Delivery Addresses</Text>
            <Text style={styles.menuSub}>Manage home, work & other delivery locations</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => router.push('/(marketplace)/orders')}
        >
          <View style={styles.menuIconWrap}>
            <Text style={{ fontSize: 18 }}>📋</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuTitle}>My Orders & Live Tracking</Text>
            <Text style={styles.menuSub}>View live food tracking and past order receipts</Text>
          </View>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>🚪 Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.versionFooter}>
          RestroZ SaaS Marketplace • v4.0.0 (Tenant Isolated)
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  authSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  loginBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerLogo: {
    width: 34,
    height: 34,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.text,
  },
  editHeaderBtn: {
    backgroundColor: customerColors.primaryBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editHeaderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: customerColors.primary,
  },
  saveHeaderBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  saveHeaderBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 70,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: customerColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  formWrap: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  cancelEditBtn: {
    marginTop: 12,
    alignItems: 'center',
  },
  cancelEditText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  menuIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 20,
    fontWeight: '700',
    color: '#94A3B8',
    marginLeft: 8,
  },
  logoutBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 24,
  },
});
