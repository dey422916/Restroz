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
import { storageService } from '../../src/services/api/storageService';
import { customerColors } from '../../src/utils/colors';
import { isValidPhoneNumber } from '../../src/utils/phone';

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { user, logout, loading: authLoading, updateUserProfileState } = useAuth();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handlePickAndUploadAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const result = await storageService.pickAndUploadAvatar({ userId: user.id });
      if (result?.url) {
        setAvatarUrl(result.url);
        updateUserProfileState({ avatar_url: result.url });
        await marketplaceService.updateCustomerProfile(user.id, {
          avatar_url: result.url,
        });
        Alert.alert('Success', 'Profile photo updated successfully.');
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err.message || 'Failed to upload profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      setAvatarUrl('');
      updateUserProfileState({ avatar_url: undefined });
      await marketplaceService.updateCustomerProfile(user.id, {
        avatar_url: '',
      });
      Alert.alert('Removed', 'Profile photo removed.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to remove profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Full Name cannot be empty.');
      return;
    }

    if (phone.trim() && !isValidPhoneNumber(phone)) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setSaving(true);
    try {
      await marketplaceService.updateCustomerProfile(user.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      });
      updateUserProfileState({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        avatar_url: avatarUrl || undefined,
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
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageInner}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Image
                source={require('../../assets/images/restroz_logo.png')}
                style={styles.headerLogo}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>My Profile</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  Account details & preferences
                </Text>
              </View>
            </View>
            {!isEditing ? (
              <TouchableOpacity
                style={styles.editHeaderBtn}
                onPress={() => setIsEditing(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.editHeaderBtnText}>✏️ Edit Profile</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.saveHeaderBtn}
                onPress={handleSaveProfile}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveHeaderBtnText}>✓ Save</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Profile Card */}
          <View style={styles.profileCard}>
            {/* Avatar Section */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarWrap}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>
                    {(fullName || user.email || 'U').charAt(0).toUpperCase()}
                  </Text>
                )}

                {uploadingAvatar && (
                  <View style={styles.avatarLoadingOverlay}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}

                {/* Camera Click Badge */}
                <TouchableOpacity
                  style={styles.avatarCameraBadge}
                  onPress={handlePickAndUploadAvatar}
                  disabled={uploadingAvatar}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13 }}>📷</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.avatarButtonsRow}>
                <TouchableOpacity
                  style={styles.changePhotoBtn}
                  onPress={handlePickAndUploadAvatar}
                  disabled={uploadingAvatar}
                  activeOpacity={0.8}
                >
                  {uploadingAvatar ? (
                    <ActivityIndicator size="small" color={customerColors.primary} />
                  ) : (
                    <Text style={styles.changePhotoText}>
                      {avatarUrl ? 'Change Photo' : 'Upload Photo'}
                    </Text>
                  )}
                </TouchableOpacity>

                {Boolean(avatarUrl) && (
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.removePhotoText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
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
                <View>
                  <TextInput
                    style={styles.input}
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/[^\d+]/g, ''))}
                    placeholder="10-digit mobile number"
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                    maxLength={13}
                  />
                  {Boolean(phone && !isValidPhoneNumber(phone)) && (
                    <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700', marginTop: 3 }}>
                      ⚠️ Invalid mobile number
                    </Text>
                  )}
                </View>
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
                    setAvatarUrl(user.avatar_url || '');
                    setIsEditing(false);
                  }}
                  activeOpacity={0.8}
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
            activeOpacity={0.8}
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
            activeOpacity={0.8}
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
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={styles.logoutBtnText}>🚪 Sign Out</Text>
          </TouchableOpacity>

          <Text style={styles.versionFooter}>
            RestroZ SaaS Marketplace • v4.0.0 (Tenant Isolated)
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
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
  pageInner: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EDEBE6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 10,
  },
  headerLogo: {
    width: 36,
    height: 36,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: customerColors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  editHeaderBtn: {
    backgroundColor: customerColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 0,
    shadowColor: customerColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  editHeaderBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  saveHeaderBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexShrink: 0,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  saveHeaderBtnText: {
    fontSize: 12,
    fontWeight: '800',
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
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EDEBE6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: customerColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'visible',
    shadowColor: customerColors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#EDEBE6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  avatarButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  changePhotoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: customerColors.primaryBg,
  },
  changePhotoText: {
    fontSize: 12,
    fontWeight: '700',
    color: customerColors.primary,
  },
  removePhotoBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  removePhotoText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  avatarText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  formWrap: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  cancelEditBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 6,
  },
  cancelEditText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDEBE6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  menuSub: {
    fontSize: 12,
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
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '800',
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 24,
  },
});
