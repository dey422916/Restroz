import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Image,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { superAdminService } from '../../../src/services/api/superAdminService';
import { staffService } from '../../../src/services/api/staffService';
import { storageService } from '../../../src/services/api/storageService';
import { supabase } from '../../../src/services/supabase';
import {
  Restaurant,
  RestaurantMember,
  RestaurantSubscription,
  SubscriptionPayment,
  SubscriptionPlan,
  RestaurantDetailStats,
  StaffPermissionPreset,
  RestaurantMemberPermissions,
  PERMISSION_PRESETS,
} from '../../../src/types';
import { colors } from '../../../src/utils/colors';

const getStaffDisplayRole = (m: any): { label: string; bg: string; color: string } => {
  if (m.role === 'ADMIN') {
    return { label: 'ADMIN', bg: '#fef08a', color: '#854d0e' };
  }

  const perms = m.permissions;
  if (perms) {
    if (perms.can_manage_products && perms.can_manage_settings && perms.can_manage_staff) {
      return { label: 'ADMIN', bg: '#fef08a', color: '#854d0e' };
    }
    if (perms.can_use_pos && perms.can_view_orders && perms.can_edit_orders && perms.can_manage_tables && !perms.can_manage_register) {
      return { label: 'WAITER', bg: '#e0f2fe', color: '#0369a1' };
    }
    if (perms.can_use_pos && perms.can_manage_register && !perms.can_manage_tables) {
      return { label: 'CASHIER', bg: '#ecfdf5', color: '#047857' };
    }
    if (perms.can_use_pos && perms.can_manage_products && perms.can_manage_tables && perms.can_view_reports) {
      return { label: 'MANAGER', bg: '#f3e8ff', color: '#7e22ce' };
    }
    if (!perms.can_use_pos && perms.can_view_orders) {
      return { label: 'KITCHEN', bg: '#ffedd5', color: '#c2410c' };
    }
  }

  return { label: 'STAFF', bg: '#e2e8f0', color: '#475569' };
};

export default function SuperAdminRestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { setActiveRestaurantId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [members, setMembers] = useState<RestaurantMember[]>([]);
  const [subscriptions, setSubscriptions] = useState<RestaurantSubscription[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [stats, setStats] = useState<RestaurantDetailStats | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  // Member Management Modal State
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [newMemberPreset, setNewMemberPreset] = useState<StaffPermissionPreset>('CASHIER');
  const [savingMember, setSavingMember] = useState(false);

  // Edit Permissions Modal State
  const [editPermsModalVisible, setEditPermsModalVisible] = useState(false);
  const [targetMemberForPerms, setTargetMemberForPerms] = useState<any | null>(null);
  const [tempPermissions, setTempPermissions] = useState<RestaurantMemberPermissions | null>(null);
  const [savingPerms, setSavingPerms] = useState(false);

  // Member Password Change Modal State
  const [memberPwdModalVisible, setMemberPwdModalVisible] = useState(false);
  const [targetMemberForPwd, setTargetMemberForPwd] = useState<any | null>(null);
  const [memberNewPassword, setMemberNewPassword] = useState('');
  const [savingMemberPwd, setSavingMemberPwd] = useState(false);

  // Edit Restaurant Details Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editLegalName, setEditLegalName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editPostalCode, setEditPostalCode] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');

  // Assign Plan Modal State
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [durationDays, setDurationDays] = useState('30');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [assigning, setAssigning] = useState(false);

  // Record Payment Modal State
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('upi');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [recordingPay, setRecordingPay] = useState(false);

  const populateEditFields = (rest: Restaurant) => {
    setEditName(rest.name || '');
    setEditSlug(rest.slug || '');
    setEditLegalName(rest.legal_name || rest.name || '');
    setEditPhone(rest.phone || '');
    setEditEmail(rest.email || '');
    setEditAddress(rest.address || '');
    setEditCity(rest.city || '');
    setEditState(rest.state || '');
    setEditPostalCode(rest.postal_code || '');
    setEditBannerUrl(rest.banner_url || '');
    setEditLogoUrl(rest.logo_url || '');
    setEditLat(rest.latitude != null ? String(rest.latitude) : '');
    setEditLng(rest.longitude != null ? String(rest.longitude) : '');
    setEditStatus((rest.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE') as any);
  };

  const loadData = async () => {
    if (!id) return;
    try {
      // 1. Fetch restaurant
      let rest = await superAdminService.getRestaurantById(id);
      if (!rest && id === 'a0000000-0000-0000-0000-000000000001') {
        rest = {
          id,
          name: 'Kullad Chai',
          slug: 'bipin',
          legal_name: 'Bipin Foods Pvt Ltd',
          phone: '+91 9876543210',
          email: 'bipin@yopmail.com',
          address: '123 Main Road, Jubilee Hills',
          city: 'Budbud',
          state: 'West Bengal',
          postal_code: '713403',
          status: 'ACTIVE',
          created_at: new Date().toISOString(),
        };
      }

      if (rest) {
        setRestaurant(rest);
        populateEditFields(rest);
      }

      // 2. Fetch other panels with individual resilience
      const [mems, subs, pays, st, plns] = await Promise.all([
        superAdminService.getRestaurantMembers(id).catch(() => []),
        superAdminService.getRestaurantSubscriptions(id).catch(() => []),
        superAdminService.getAllPayments(id).catch(() => []),
        superAdminService.getRestaurantStats(id).catch(() => ({ productCount: 0, tableCount: 0, orderCount: 0, staffCount: 0 })),
        superAdminService.getSubscriptionPlans().catch(() => []),
      ]);

      setMembers(mems);
      setSubscriptions(subs);
      setPayments(pays);
      setStats(st);
      setPlans(plns);

      if (plns.length > 0 && !selectedPlanId) {
        setSelectedPlanId(plns[0].id);
        setCustomAmount(plns[0].price?.toString() || '0');
      }
    } catch (e) {
      console.warn('Error loading restaurant detail:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleToggleStatus = async () => {
    if (!restaurant) return;
    const newStatus = restaurant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await superAdminService.updateRestaurantStatus(restaurant.id, newStatus);
      setRestaurant({ ...restaurant, status: newStatus });
      setEditStatus(newStatus);
      Alert.alert('Status Updated', `Restaurant status is now ${newStatus}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSaveRestaurantDetails = async () => {
    if (!restaurant || !editName.trim() || !editSlug.trim()) {
      Alert.alert('Validation Error', 'Restaurant name and slug are required.');
      return;
    }

    if (!editAddress.trim()) {
      Alert.alert('Validation Error', 'Street Address is required for marketplace discovery.');
      return;
    }
    if (!editCity.trim()) {
      Alert.alert('Validation Error', 'City is required for marketplace discovery.');
      return;
    }
    if (!editState.trim()) {
      Alert.alert('Validation Error', 'State is required for marketplace discovery.');
      return;
    }
    if (!editPostalCode.trim()) {
      Alert.alert('Validation Error', 'Postal Code / PIN is required for marketplace discovery.');
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await superAdminService.updateRestaurant(restaurant.id, {
        name: editName.trim(),
        slug: editSlug.trim().toLowerCase(),
        legal_name: editLegalName.trim() || editName.trim(),
        phone: editPhone.trim() || undefined,
        email: editEmail.trim() || undefined,
        address: editAddress.trim(),
        city: editCity.trim(),
        state: editState.trim(),
        postal_code: editPostalCode.trim(),
        banner_url: editBannerUrl.trim() || undefined,
        logo_url: editLogoUrl.trim() || undefined,
        latitude: editLat.trim() ? parseFloat(editLat.trim()) : null,
        longitude: editLng.trim() ? parseFloat(editLng.trim()) : null,
        status: editStatus,
      });

      // Also update restaurant_settings if exists
      await supabase
        .from('restaurant_settings')
        .update({
          name: editName.trim(),
          legal_name: editLegalName.trim() || editName.trim(),
          phone: editPhone.trim() || undefined,
          email: editEmail.trim() || undefined,
          address: editAddress.trim(),
          state: editState.trim(),
          logo_url: editLogoUrl.trim() || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('restaurant_id', restaurant.id);

      setRestaurant(updated);
      Alert.alert('Success', 'Restaurant details updated successfully!');
      setEditModalVisible(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update restaurant details.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handlePickBanner = async () => {
    setUploadingBanner(true);
    try {
      const res = await storageService.pickAndUploadBanner({ restaurantId: restaurant?.id });
      if (res?.url) {
        setEditBannerUrl(res.url);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload banner image.');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handlePickLogo = async () => {
    setUploadingLogo(true);
    try {
      const res = await storageService.pickAndUploadLogo({ restaurantId: restaurant?.id });
      if (res?.url) {
        setEditLogoUrl(res.url);
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Failed to upload logo image.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleAssignPlan = async () => {
    if (!restaurant || !selectedPlanId) return;

    setAssigning(true);
    try {
      await superAdminService.assignSubscription({
        restaurant_id: restaurant.id,
        plan_id: selectedPlanId,
        duration_days: parseInt(durationDays, 10) || 30,
        amount: parseFloat(customAmount) || 0,
        payment_method: paymentMethod,
        notes: `Plan assigned by Super Admin`,
      });

      Alert.alert('Success', 'Subscription plan assigned successfully!');
      setAssignModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to assign plan.');
    } finally {
      setAssigning(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!restaurant || !payAmount) {
      Alert.alert('Validation Error', 'Payment amount is required.');
      return;
    }

    setRecordingPay(true);
    try {
      await superAdminService.recordPayment({
        restaurant_id: restaurant.id,
        subscription_id: subscriptions.find((s) => s.status === 'active')?.id,
        amount: parseFloat(payAmount),
        payment_method: payMethod,
        payment_reference: payRef || undefined,
        notes: payNotes || undefined,
      });

      Alert.alert('Success', 'Payment record added to ledger!');
      setPayModalVisible(false);
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to record payment.');
    } finally {
      setRecordingPay(false);
    }
  };

  const handleCreateMember = async () => {
    if (!restaurant || !newMemberEmail.trim()) {
      Alert.alert('Validation Error', 'Email address is required.');
      return;
    }

    const cleanEmail = newMemberEmail.trim().toLowerCase();
    const cleanName = newMemberName.trim() || cleanEmail.split('@')[0];

    setSavingMember(true);
    try {
      await staffService.provisionStaff(restaurant.id, {
        full_name: cleanName,
        email: cleanEmail,
        phone: newMemberPhone.trim() || undefined,
        password: newMemberPassword.trim() || undefined,
        role: newMemberRole,
        preset: newMemberRole === 'STAFF' ? newMemberPreset : undefined,
      });

      Alert.alert('Success', `${newMemberRole === 'ADMIN' ? 'Admin' : 'Staff'} provisioned immediately without OTP/email verification.`);
      setAddMemberModalVisible(false);
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberPhone('');
      setNewMemberPassword('');
      setNewMemberRole('STAFF');
      setNewMemberPreset('CASHIER');
      loadData();
    } catch (err: any) {
      Alert.alert('Provisioning Error', err.message || 'Failed to add member.');
    } finally {
      setSavingMember(false);
    }
  };

  const handleToggleMemberActive = async (member: any) => {
    try {
      const action = member.is_active ? 'DEACTIVATE' : 'ACTIVATE';
      await staffService.setMembershipStatus(member.id, action);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update member status.');
    }
  };

  const handleRemoveMemberFromRestaurant = (member: any) => {
    const memberName = member.profile?.full_name || member.profile?.email || 'this member';
    const restName = restaurant?.name || 'this restaurant';

    Alert.alert(
      'Confirm Removal',
      `Remove ${memberName} from ${restName}?\n\nThis removes their access to this restaurant.\nTheir account and historical activity will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove Member',
          style: 'destructive',
          onPress: async () => {
            try {
              await staffService.removeMember(member.id);
              Alert.alert('Member Removed', `${memberName} has been removed from ${restName}.`);
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove member.');
            }
          },
        },
      ]
    );
  };

  const openEditPermsModal = (member: any) => {
    setTargetMemberForPerms(member);
    const currentPerms = (member as any).permissions || {
      restaurant_member_id: member.id,
      can_use_pos: true,
      can_view_orders: true,
      can_edit_orders: member.role === 'ADMIN',
      can_cancel_orders: member.role === 'ADMIN',
      can_manage_products: member.role === 'ADMIN',
      can_manage_categories: member.role === 'ADMIN',
      can_manage_tables: member.role === 'ADMIN',
      can_manage_coupons: member.role === 'ADMIN',
      can_view_reports: member.role === 'ADMIN',
      can_manage_register: member.role === 'ADMIN',
      can_view_settings: member.role === 'ADMIN',
      can_manage_settings: member.role === 'ADMIN',
      can_manage_staff: member.role === 'ADMIN',
    };
    setTempPermissions({ ...currentPerms });
    setEditPermsModalVisible(true);
  };

  const handleApplyPreset = (preset: StaffPermissionPreset) => {
    if (preset === 'CUSTOM' || !tempPermissions) return;
    const p = PERMISSION_PRESETS[preset];
    setTempPermissions({
      ...tempPermissions,
      ...p,
    });
  };

  const handleSavePermissions = async () => {
    if (!targetMemberForPerms || !tempPermissions) return;
    setSavingPerms(true);
    try {
      await staffService.updateStaffPermissions(targetMemberForPerms.id, tempPermissions);
      Alert.alert('Success', 'Permissions updated successfully!');
      setEditPermsModalVisible(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update permissions.');
    } finally {
      setSavingPerms(false);
    }
  };

  const openMemberPasswordModal = (member: any) => {
    setTargetMemberForPwd(member);
    setMemberNewPassword('');
    setMemberPwdModalVisible(true);
  };

  const handleSaveMemberPassword = async () => {
    if (!targetMemberForPwd?.user_id) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Error: Invalid user target selected.');
      } else {
        Alert.alert('Error', 'Invalid user target selected.');
      }
      return;
    }
    if (!memberNewPassword || memberNewPassword.length < 8) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Validation Error: Password must be at least 8 characters long.');
      } else {
        Alert.alert('Validation Error', 'Password must be at least 8 characters long.');
      }
      return;
    }

    const memberName = (targetMemberForPwd as any).profile?.full_name || (targetMemberForPwd as any).profile?.email || 'User';
    setSavingMemberPwd(true);
    try {
      await superAdminService.changeAdminPassword(targetMemberForPwd.user_id, memberNewPassword, restaurant?.id);
      setMemberPwdModalVisible(false);
      setMemberNewPassword('');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`✅ Success: Password for ${memberName} has been updated successfully!`);
      } else {
        Alert.alert('Success', `Password for ${memberName} has been updated successfully.`);
      }
    } catch (err: any) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`❌ Password Update Failed: ${err.message || 'Failed to update user password.'}`);
      } else {
        Alert.alert('Password Update Failed', err.message || 'Failed to update user password.');
      }
    } finally {
      setSavingMemberPwd(false);
    }
  };

  if (loading && !restaurant) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading restaurant details...</Text>
      </View>
    );
  }

  if (!restaurant) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 36 }}>🏢</Text>
        <Text style={styles.emptyTitle}>Restaurant Not Found</Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { marginTop: 16 }]}
          onPress={() => router.push('/super-admin/restaurants')}
        >
          <Text style={styles.primaryBtnText}>← Back to Restaurant Directory</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeSub = subscriptions.find((s) => s.status === 'active') || (restaurant.id === 'a0000000-0000-0000-0000-000000000001' ? {
    id: 'seed-ratnadeep-sub',
    restaurant_id: restaurant.id,
    plan_id: 'plan-enterprise',
    status: 'active',
    start_date: new Date().toISOString(),
    end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    amount: 19999,
    currency: 'INR',
    auto_renew: true,
    created_at: new Date().toISOString(),
    plan: {
      id: 'plan-enterprise',
      name: 'Enterprise Plan',
      code: 'ENTERPRISE_YEARLY',
      billing_cycle: 'yearly',
      price: 19999,
      currency: 'INR',
      max_staff: 999,
      max_tables: 999,
      max_products: 9999,
      features: { qr_ordering: true, inventory: true, reports: true, analytics: true },
      is_active: true,
      created_at: new Date().toISOString(),
    } as SubscriptionPlan,
  } as RestaurantSubscription : null);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { padding: isMobile ? 16 : 24, paddingBottom: isMobile ? 100 : 40 },
      ]}
    >
      {/* Back Button & Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/super-admin/restaurants')}>
          <Text style={styles.backBtnText}>← Back to Restaurants</Text>
        </TouchableOpacity>

        <View style={[styles.headerActionRow, isMobile && styles.headerActionRowMobile]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: '#0284C7', borderColor: '#0369A1' }, isMobile && { flex: 1, justifyContent: 'center' }]}
            onPress={() => {
              if (restaurant) {
                setActiveRestaurantId(restaurant.id);
                router.push('/(admin)/pos' as any);
              }
            }}
          >
            <Text style={styles.primaryBtnText}>🖥️ Manage POS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.editBtnTop, isMobile && { flex: 1, justifyContent: 'center' }]}
            onPress={() => {
              if (restaurant) populateEditFields(restaurant);
              setEditModalVisible(true);
            }}
          >
            <Text style={styles.editBtnTopText}>✏️ Edit Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusBtn,
              restaurant.status === 'ACTIVE' ? styles.statusBtnWarn : styles.statusBtnSuccess,
              isMobile && { flex: 1, justifyContent: 'center' },
            ]}
            onPress={handleToggleStatus}
          >
            <Text
              style={[
                styles.statusBtnText,
                { color: restaurant.status === 'ACTIVE' ? '#DC2626' : '#16A34A' },
              ]}
            >
              {restaurant.status === 'ACTIVE' ? '🚫 Suspend' : '✅ Activate'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, isMobile && { flex: 1, justifyContent: 'center' }]}
            onPress={() => setAssignModalVisible(true)}
          >
            <Text style={styles.primaryBtnText}>🏷️ Plan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Restaurant Header Card */}
      <View style={[styles.restaurantHero, isMobile && styles.restaurantHeroMobile]}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>{restaurant.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Text style={styles.restaurantHeroName}>{restaurant.name}</Text>
            <View
              style={[
                styles.badge,
                restaurant.status === 'ACTIVE' ? styles.badgeActive : styles.badgeSuspended,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  restaurant.status === 'ACTIVE' ? styles.badgeTextActive : styles.badgeTextSuspended,
                ]}
              >
                {restaurant.status}
              </Text>
            </View>
          </View>
          <Text style={styles.restaurantHeroMeta}>
            Slug: <Text style={{ color: '#0F172A', fontWeight: '700' }}>{restaurant.slug}</Text> • Legal:{' '}
            {restaurant.legal_name || restaurant.name}
          </Text>
          <Text style={styles.restaurantHeroMeta}>
            {restaurant.address ? `${restaurant.address}, ` : ''}
            {restaurant.city ? `${restaurant.city}, ` : ''}
            {restaurant.state || ''} {restaurant.postal_code ? `- ${restaurant.postal_code}` : ''}
          </Text>
          <Text style={styles.restaurantHeroMeta}>
            📞 {restaurant.phone || 'No phone'} • ✉️ {restaurant.email || 'No email'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.editHeroBtn}
          onPress={() => {
            if (restaurant) populateEditFields(restaurant);
            setEditModalVisible(true);
          }}
        >
          <Text style={styles.editHeroBtnText}>✏️ Edit Restaurant</Text>
        </TouchableOpacity>
      </View>

      {/* Platform Level Basic Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, isMobile && { width: '47%' }]}>
          <Text style={{ fontSize: 18 }}>🍔</Text>
          <Text style={styles.statValue}>{stats?.productCount || 0}</Text>
          <Text style={styles.statLabel}>Products</Text>
        </View>
        <View style={[styles.statCard, isMobile && { width: '47%' }]}>
          <Text style={{ fontSize: 18 }}>🪑</Text>
          <Text style={styles.statValue}>{stats?.tableCount || 0}</Text>
          <Text style={styles.statLabel}>Tables</Text>
        </View>
        <View style={[styles.statCard, isMobile && { width: '47%' }]}>
          <Text style={{ fontSize: 18 }}>🧾</Text>
          <Text style={styles.statValue}>{stats?.orderCount || 0}</Text>
          <Text style={styles.statLabel}>Orders</Text>
        </View>
        <View style={[styles.statCard, isMobile && { width: '47%' }]}>
          <Text style={{ fontSize: 18 }}>👥</Text>
          <Text style={styles.statValue}>{stats?.staffCount || members.length}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
      </View>

      {/* Two Column Details */}
      <View style={[styles.twoCol, { flexDirection: isMobile ? 'column' : 'row' }]}>
        {/* Left Column: Active Subscription & Members */}
        <View style={styles.col}>
          {/* Active Subscription Panel */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Active Subscription</Text>
              {activeSub && (
                <View style={styles.badgeActive}>
                  <Text style={styles.badgeTextActive}>ACTIVE</Text>
                </View>
              )}
            </View>

            {activeSub ? (
              <View style={styles.subDetailBox}>
                <Text style={styles.subPlanTitle}>{activeSub.plan?.name || 'Enterprise Plan'}</Text>
                <Text style={styles.subPlanPrice}>
                  ₹{(activeSub.amount || 0).toLocaleString('en-IN')}{' '}
                  <Text style={{ fontSize: 13, color: '#64748B' }}>
                    / {activeSub.plan?.billing_cycle || 'yearly'}
                  </Text>
                </Text>

                <View style={styles.subMetaGrid}>
                  <View style={styles.subMetaItem}>
                    <Text style={styles.subMetaLabel}>START DATE</Text>
                    <Text style={styles.subMetaValue}>
                      {new Date(activeSub.start_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.subMetaItem}>
                    <Text style={styles.subMetaLabel}>EXPIRY DATE</Text>
                    <Text style={styles.subMetaValue}>
                      {new Date(activeSub.end_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.subMetaItem}>
                    <Text style={styles.subMetaLabel}>MAX TABLES</Text>
                    <Text style={styles.subMetaValue}>{activeSub.plan?.max_tables || 'Unlimited'}</Text>
                  </View>
                  <View style={styles.subMetaItem}>
                    <Text style={styles.subMetaLabel}>MAX PRODUCTS</Text>
                    <Text style={styles.subMetaValue}>{activeSub.plan?.max_products || 'Unlimited'}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={{ fontSize: 32 }}>⚠️</Text>
                <Text style={styles.emptyTitle}>No Active Subscription</Text>
                <Text style={styles.emptySub}>
                  Assign a plan to ensure uninterrupted POS terminal operations.
                </Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { marginTop: 12 }]}
                  onPress={() => setAssignModalVisible(true)}
                >
                  <Text style={styles.primaryBtnText}>Assign Plan Now</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Authorized Members */}
          <View style={[styles.panel, { marginTop: 20 }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Authorized Members ({members.length})</Text>
              <TouchableOpacity
                style={styles.addMemberHeaderBtn}
                onPress={() => {
                  setNewMemberName('');
                  setNewMemberEmail('');
                  setNewMemberPhone('');
                  setNewMemberPassword('');
                  setNewMemberRole('STAFF');
                  setNewMemberPreset('CASHIER');
                  setAddMemberModalVisible(true);
                }}
              >
                <Text style={styles.addMemberHeaderBtnText}>➕ Add Member</Text>
              </TouchableOpacity>
            </View>

            {members.length === 0 ? (
              <Text style={styles.emptySub}>No members provisioned yet.</Text>
            ) : (
              members.map((m) => (
                <View key={m.id} style={[styles.memberCardEnhanced, !m.is_active && styles.memberCardInactive]}>
                  <View style={styles.memberCardTop}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {m.role === 'ADMIN' ? 'AD' : 'ST'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {(m as any).profile?.full_name || (m as any).profile?.email || `User ${m.user_id.slice(0, 8)}`}
                        </Text>
                        {(() => {
                          const displayRole = getStaffDisplayRole(m);
                          return (
                            <View style={[styles.roleBadge, { backgroundColor: displayRole.bg }]}>
                              <Text style={[styles.roleBadgeText, { color: displayRole.color }]}>
                                {displayRole.label}
                              </Text>
                            </View>
                          );
                        })()}
                        {!m.is_active && (
                          <View style={styles.inactivePill}>
                            <Text style={styles.inactivePillText}>DEACTIVATED</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.memberContact} numberOfLines={1}>
                        {(m as any).profile?.email || 'No email'} {(m as any).profile?.phone ? `• ${(m as any).profile?.phone}` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.memberActionsRow}>
                    {m.role === 'STAFF' && (
                      <TouchableOpacity
                        style={styles.actionBtnSmall}
                        onPress={() => openEditPermsModal(m)}
                      >
                        <Text style={styles.actionBtnSmallText}>🛡️ Permissions</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.actionBtnSmall}
                      onPress={() => openMemberPasswordModal(m)}
                    >
                      <Text style={styles.actionBtnSmallText}>🔑 Password</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtnSmall, m.is_active ? styles.actionBtnDeact : styles.actionBtnAct]}
                      onPress={() => handleToggleMemberActive(m)}
                    >
                      <Text style={m.is_active ? styles.actionBtnDeactText : styles.actionBtnActText}>
                        {m.is_active ? '⏸️ Deactivate' : '▶️ Activate'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnRemoveMember}
                      onPress={() => handleRemoveMemberFromRestaurant(m)}
                    >
                      <Text style={styles.actionBtnRemoveMemberText}>🗑️ Remove Member</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Right Column: Subscription History & Payments */}
        <View style={styles.col}>
          {/* Payments Panel */}
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Payment History</Text>
              <TouchableOpacity
                style={styles.recordPayBtn}
                onPress={() => setPayModalVisible(true)}
              >
                <Text style={styles.recordPayBtnText}>➕ Record Payment</Text>
              </TouchableOpacity>
            </View>

            {payments.length === 0 ? (
              <Text style={styles.emptySub}>No payments recorded for this restaurant.</Text>
            ) : (
              payments.map((p) => (
                <View key={p.id} style={styles.payItem}>
                  <View style={styles.payIcon}>
                    <Text style={{ fontSize: 14 }}>💳</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.payAmount}>₹{Number(p.amount).toLocaleString('en-IN')}</Text>
                    <Text style={styles.payMeta}>
                      {p.payment_method.toUpperCase()} • {new Date(p.paid_at).toLocaleDateString()}
                      {p.payment_reference ? ` • Ref: ${p.payment_reference}` : ''}
                    </Text>
                  </View>
                  <View style={styles.badgeActive}>
                    <Text style={styles.badgeTextActive}>PAID</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Subscription History */}
          <View style={[styles.panel, { marginTop: 20 }]}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Subscription History</Text>
            </View>

            {subscriptions.length === 0 ? (
              <Text style={styles.emptySub}>No prior subscription records.</Text>
            ) : (
              subscriptions.map((s) => (
                <View key={s.id} style={styles.historyItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyPlan}>{s.plan?.name || 'Subscription'}</Text>
                    <Text style={styles.historyDates}>
                      {new Date(s.start_date).toLocaleDateString()} →{' '}
                      {new Date(s.end_date).toLocaleDateString()}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      s.status === 'active' ? styles.badgeActive : styles.badgeNeutral,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        s.status === 'active' ? styles.badgeTextActive : styles.badgeTextNeutral,
                      ]}
                    >
                      {s.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </View>

      {/* Edit Restaurant Details Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Restaurant Details</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Restaurant Display Name *</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="e.g. Ratnadeep Restaurant"
              />

              <Text style={styles.label}>Subdomain Slug *</Text>
              <TextInput
                style={styles.input}
                value={editSlug}
                onChangeText={setEditSlug}
                autoCapitalize="none"
                placeholder="e.g. ratnadeep"
              />

              <Text style={styles.label}>Legal Business Name</Text>
              <TextInput
                style={styles.input}
                value={editLegalName}
                onChangeText={setEditLegalName}
                placeholder="Legal registered business name"
              />

              <View style={[styles.inputRow, isMobile && { flexDirection: 'column' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    keyboardType="phone-pad"
                    placeholder="+91 9876543210"
                  />
                </View>
                <View style={[{ flex: 1, marginLeft: isMobile ? 0 : 12 }]}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="info@restaurant.com"
                  />
                </View>
              </View>

              <Text style={styles.label}>Street Address *</Text>
              <TextInput
                style={styles.input}
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder="Shop/Building, Street, Landmark"
              />

              <View style={[styles.inputRow, isMobile && { flexDirection: 'column' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>City *</Text>
                  <TextInput
                    style={styles.input}
                    value={editCity}
                    onChangeText={setEditCity}
                    placeholder="City"
                  />
                </View>
                <View style={[{ flex: 1, marginHorizontal: isMobile ? 0 : 8 }]}>
                  <Text style={styles.label}>State *</Text>
                  <TextInput
                    style={styles.input}
                    value={editState}
                    onChangeText={setEditState}
                    placeholder="State"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Postal Code / PIN *</Text>
                  <TextInput
                    style={styles.input}
                    value={editPostalCode}
                    onChangeText={setEditPostalCode}
                    keyboardType="number-pad"
                    placeholder="500033"
                  />
                </View>
              </View>

              {/* Restaurant Banner / Cover Upload */}
              <Text style={styles.label}>Restaurant Cover / Banner Image</Text>
              <View style={{ marginBottom: 12 }}>
                {editBannerUrl.trim() ? (
                  <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', marginBottom: 8 }}>
                    <Image source={{ uri: editBannerUrl }} style={{ width: '100%', height: 120, resizeMode: 'cover' }} />
                    <View style={{ padding: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
                      <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '700' }}>✓ Banner Ready</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={handlePickBanner} disabled={uploadingBanner}>
                          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                            {uploadingBanner ? 'Uploading...' : '🔄 Change Banner'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditBannerUrl('')}>
                          <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>✕ Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: '#94A3B8',
                      borderRadius: 8,
                      padding: 16,
                      alignItems: 'center',
                      backgroundColor: '#F8FAFC',
                      marginBottom: 8,
                    }}
                    onPress={handlePickBanner}
                    disabled={uploadingBanner}
                  >
                    {uploadingBanner ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <>
                        <Text style={{ fontSize: 24, marginBottom: 4 }}>🖼️</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                          Upload Restaurant Banner (JPG, PNG, WEBP)
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                          Max 5MB • 16:9 widescreen recommended
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Restaurant Logo Upload */}
              <Text style={styles.label}>Restaurant Logo</Text>
              <View style={{ marginBottom: 12 }}>
                {editLogoUrl.trim() ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <Image source={{ uri: editLogoUrl }} style={{ width: 44, height: 44, borderRadius: 8, resizeMode: 'cover' }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '700' }}>✓ Logo Ready</Text>
                    </View>
                    <TouchableOpacity onPress={handlePickLogo} disabled={uploadingLogo}>
                      <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700' }}>
                        {uploadingLogo ? 'Uploading...' : '🔄 Change'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setEditLogoUrl('')}>
                      <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>✕ Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: '#94A3B8',
                      borderRadius: 8,
                      padding: 12,
                      alignItems: 'center',
                      backgroundColor: '#F8FAFC',
                    }}
                    onPress={handlePickLogo}
                    disabled={uploadingLogo}
                  >
                    {uploadingLogo ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                        📷 Upload Logo (Square JPG, PNG, WEBP)
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              <View style={[styles.inputRow, isMobile && { flexDirection: 'column' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Latitude (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={editLat}
                    onChangeText={setEditLat}
                    keyboardType="numeric"
                    placeholder="e.g. 23.2324"
                  />
                </View>
                <View style={[{ flex: 1, marginLeft: isMobile ? 0 : 8 }]}>
                  <Text style={styles.label}>Longitude (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={editLng}
                    onChangeText={setEditLng}
                    keyboardType="numeric"
                    placeholder="e.g. 87.8615"
                  />
                </View>
              </View>

              <Text style={styles.label}>Lifecycle Status</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.cyclePill,
                    editStatus === 'ACTIVE' && styles.cyclePillActive,
                  ]}
                  onPress={() => setEditStatus('ACTIVE')}
                >
                  <Text
                    style={[
                      styles.cyclePillText,
                      editStatus === 'ACTIVE' && styles.cyclePillTextActive,
                    ]}
                  >
                    ✅ ACTIVE
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.cyclePill,
                    editStatus === 'SUSPENDED' && { backgroundColor: '#DC2626', borderColor: '#DC2626' },
                  ]}
                  onPress={() => setEditStatus('SUSPENDED')}
                >
                  <Text
                    style={[
                      styles.cyclePillText,
                      editStatus === 'SUSPENDED' && styles.cyclePillTextActive,
                    ]}
                  >
                    🚫 SUSPENDED
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditModalVisible(false)}
                disabled={savingEdit}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSaveRestaurantDetails}
                disabled={savingEdit}
              >
                {savingEdit ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign Plan Modal */}
      <Modal visible={assignModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign / Upgrade Plan</Text>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Select Subscription Tier</Text>
              {plans.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.planOption,
                    selectedPlanId === p.id && styles.planOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedPlanId(p.id);
                    setCustomAmount(p.price.toString());
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planOptTitle}>{p.name}</Text>
                    <Text style={styles.planOptDesc}>
                      Max {p.max_tables || '∞'} tables • Max {p.max_products || '∞'} items
                    </Text>
                  </View>
                  <Text style={styles.planOptPrice}>
                    ₹{p.price.toLocaleString('en-IN')}/{p.billing_cycle}
                  </Text>
                </TouchableOpacity>
              ))}

              <View style={[styles.inputRow, isMobile && { flexDirection: 'column' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Duration (Days)</Text>
                  <TextInput
                    style={styles.input}
                    value={durationDays}
                    onChangeText={setDurationDays}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[{ flex: 1, marginLeft: isMobile ? 0 : 12 }]}>
                  <Text style={styles.label}>Amount Charged (₹)</Text>
                  <TextInput
                    style={styles.input}
                    value={customAmount}
                    onChangeText={setCustomAmount}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.methodRow}>
                {['upi', 'bank_transfer', 'cash', 'card'].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.methodBtn,
                      paymentMethod === m && styles.methodBtnActive,
                    ]}
                    onPress={() => setPaymentMethod(m)}
                  >
                    <Text
                      style={[
                        styles.methodBtnText,
                        paymentMethod === m && styles.methodBtnTextActive,
                      ]}
                    >
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setAssignModalVisible(false)}
                disabled={assigning}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleAssignPlan}
                disabled={assigning}
              >
                {assigning ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Confirm Plan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal visible={payModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Subscription Payment</Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Payment Amount (₹) *</Text>
              <TextInput
                style={styles.input}
                placeholder="19999"
                value={payAmount}
                onChangeText={setPayAmount}
                keyboardType="numeric"
              />

              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.methodRow}>
                {['upi', 'bank_transfer', 'cash', 'card'].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.methodBtn,
                      payMethod === m && styles.methodBtnActive,
                    ]}
                    onPress={() => setPayMethod(m)}
                  >
                    <Text
                      style={[
                        styles.methodBtnText,
                        payMethod === m && styles.methodBtnTextActive,
                      ]}
                    >
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Transaction / Payment Reference ID</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. UPI-TXN-8849201"
                value={payRef}
                onChangeText={setPayRef}
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={styles.input}
                placeholder="Offline settlement details"
                value={payNotes}
                onChangeText={setPayNotes}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPayModalVisible(false)}
                disabled={recordingPay}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleRecordPayment}
                disabled={recordingPay}
              >
                {recordingPay ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Record Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Add Authorized Member */}
      <Modal visible={addMemberModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>+ Add Authorized Member</Text>
              <TouchableOpacity onPress={() => setAddMemberModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {/* Role Selection */}
              <Text style={styles.label}>Role *</Text>
              <View style={styles.rolePickerRow}>
                <TouchableOpacity
                  style={[styles.rolePickerChip, newMemberRole === 'ADMIN' && styles.rolePickerChipActive]}
                  onPress={() => setNewMemberRole('ADMIN')}
                >
                  <Text style={[styles.rolePickerChipText, newMemberRole === 'ADMIN' && styles.rolePickerChipTextActive]}>
                    ○ ADMIN
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rolePickerChip, newMemberRole === 'STAFF' && styles.rolePickerChipActive]}
                  onPress={() => setNewMemberRole('STAFF')}
                >
                  <Text style={[styles.rolePickerChipText, newMemberRole === 'STAFF' && styles.rolePickerChipTextActive]}>
                    ○ STAFF
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="user@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                value={newMemberEmail}
                onChangeText={setNewMemberEmail}
              />

              <Text style={styles.label}>Initial Password (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter password (or auto-generate)"
                secureTextEntry
                value={newMemberPassword}
                onChangeText={setNewMemberPassword}
              />

              <Text style={styles.label}>Full Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ramesh Kumar"
                value={newMemberName}
                onChangeText={setNewMemberName}
              />

              <Text style={styles.label}>Phone Number (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
                keyboardType="phone-pad"
                value={newMemberPhone}
                onChangeText={setNewMemberPhone}
              />

              {newMemberRole === 'STAFF' ? (
                <>
                  <Text style={styles.label}>Permission Preset</Text>
                  <View style={styles.presetGrid}>
                    {(['CASHIER', 'WAITER', 'MANAGER', 'KITCHEN'] as StaffPermissionPreset[]).map((pr) => (
                      <TouchableOpacity
                        key={pr}
                        style={[styles.presetCard, newMemberPreset === pr && styles.presetCardActive]}
                        onPress={() => setNewMemberPreset(pr)}
                      >
                        <Text style={[styles.presetCardTitle, newMemberPreset === pr && styles.presetCardTitleActive]}>
                          {pr === 'CASHIER' && '💵 Cashier'}
                          {pr === 'WAITER' && '🍽️ Waiter'}
                          {pr === 'MANAGER' && '👔 Manager'}
                          {pr === 'KITCHEN' && '🍳 Kitchen / Delivery'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.adminPermsNotice}>
                  <Text style={styles.adminPermsNoticeText}>
                    ⭐ Restaurant Administrators automatically receive full tenant-wide management permissions.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setAddMemberModalVisible(false)}
                disabled={savingMember}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateMember}
                disabled={savingMember}
              >
                {savingMember ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {newMemberRole === 'ADMIN' ? 'Create Admin' : 'Create Staff'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 4: Edit Staff Permissions */}
      <Modal visible={editPermsModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🛡️ Configure Permissions</Text>
              <TouchableOpacity onPress={() => setEditPermsModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
              Editing permissions for {targetMemberForPerms?.profile?.full_name || 'Staff Member'}
            </Text>

            <View style={styles.presetQuickRow}>
              <Text style={styles.presetQuickLabel}>Presets:</Text>
              {(['CASHIER', 'WAITER', 'MANAGER', 'KITCHEN'] as StaffPermissionPreset[]).map((pr) => (
                <TouchableOpacity
                  key={pr}
                  style={styles.presetChip}
                  onPress={() => handleApplyPreset(pr)}
                >
                  <Text style={styles.presetChipText}>{pr}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {tempPermissions && (
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>🖥️ Can Use POS Terminal</Text>
                  <Switch
                    value={tempPermissions.can_use_pos}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_use_pos: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>📋 Can View Orders</Text>
                  <Switch
                    value={tempPermissions.can_view_orders}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_view_orders: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>✏️ Can Edit Orders</Text>
                  <Switch
                    value={tempPermissions.can_edit_orders}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_edit_orders: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>❌ Can Cancel Orders</Text>
                  <Switch
                    value={tempPermissions.can_cancel_orders}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_cancel_orders: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>🍲 Can Manage Products & Stock</Text>
                  <Switch
                    value={tempPermissions.can_manage_products}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_manage_products: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>📂 Can Manage Categories</Text>
                  <Switch
                    value={tempPermissions.can_manage_categories}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_manage_categories: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>🪑 Can Manage Tables & QR</Text>
                  <Switch
                    value={tempPermissions.can_manage_tables}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_manage_tables: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>🎟️ Can Manage Coupons</Text>
                  <Switch
                    value={tempPermissions.can_manage_coupons}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_manage_coupons: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>📊 Can View Analytics & Reports</Text>
                  <Switch
                    value={tempPermissions.can_view_reports}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_view_reports: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>💵 Can Open/Close Cash Register</Text>
                  <Switch
                    value={tempPermissions.can_manage_register}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_manage_register: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>⚙️ Can View Settings</Text>
                  <Switch
                    value={tempPermissions.can_view_settings}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_view_settings: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>🔧 Can Manage Settings</Text>
                  <Switch
                    value={tempPermissions.can_manage_settings}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_manage_settings: v })}
                  />
                </View>
                <View style={styles.permSwitchRow}>
                  <Text style={styles.permSwitchLabel}>👥 Can Manage Staff & Permissions</Text>
                  <Switch
                    value={tempPermissions.can_manage_staff}
                    onValueChange={(v) => setTempPermissions({ ...tempPermissions, can_manage_staff: v })}
                  />
                </View>
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditPermsModalVisible(false)}
                disabled={savingPerms}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSavePermissions}
                disabled={savingPerms}
              >
                {savingPerms ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Save Permissions</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 4: Change Member Password Modal */}
      <Modal visible={memberPwdModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Change Password for {targetMemberForPwd?.profile?.full_name || 'Member'}
              </Text>
              <TouchableOpacity onPress={() => setMemberPwdModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Member Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: '#E2E8F0', color: '#64748B' }]}
                value={targetMemberForPwd?.profile?.email || ''}
                editable={false}
              />

              <Text style={styles.label}>New Password *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter new password (min 8 chars)"
                value={memberNewPassword}
                onChangeText={setMemberNewPassword}
                autoCapitalize="none"
              />
              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                Password must contain at least 8 characters.
              </Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setMemberPwdModalVisible(false)}
                disabled={savingMemberPwd}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSaveMemberPassword}
                disabled={savingMemberPwd}
              >
                {savingMemberPwd ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  content: {
    padding: 24,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtnText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  headerActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  headerActionRowMobile: {
    width: '100%',
    flexDirection: 'row',
  },
  editBtnTop: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  editBtnTopText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 13,
  },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBtnWarn: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  statusBtnSuccess: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  statusBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  restaurantHero: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  restaurantHeroMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#EEF2F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLargeText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },
  restaurantHeroName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  restaurantHeroMeta: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 3,
  },
  editHeroBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editHeroBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeSuspended: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeTextSuspended: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeNeutral: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeTextNeutral: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  twoCol: {
    flexDirection: 'row',
    gap: 20,
  },
  col: {
    flex: 1,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  subDetailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subPlanTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subPlanPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
    marginBottom: 16,
  },
  subMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  subMetaItem: {
    width: '45%',
  },
  subMetaLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  subMetaValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 2,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF2F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  memberRole: {
    fontSize: 12,
    color: '#64748B',
  },
  recordPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recordPayBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  payItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  payIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  payAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  payMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  historyPlan: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  historyDates: {
    fontSize: 11,
    color: '#64748B',
  },
  emptyWrap: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
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
  inputRow: {
    flexDirection: 'row',
  },
  cyclePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  cyclePillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  cyclePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  cyclePillTextActive: {
    color: '#FFFFFF',
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
  },
  planOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  planOptTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  planOptDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  planOptPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  methodBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  methodBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  methodBtnTextActive: {
    color: '#FFFFFF',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: '600',
  },
  submitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  addMemberHeaderBtn: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  addMemberHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  memberCardEnhanced: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  memberCardInactive: {
    opacity: 0.65,
    backgroundColor: '#F8FAFC',
  },
  memberCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberContact: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeAdmin: {
    backgroundColor: '#FEF08A',
  },
  roleBadgeStaff: {
    backgroundColor: '#E2E8F0',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  roleBadgeTextAdmin: {
    color: '#854D0E',
  },
  roleBadgeTextStaff: {
    color: '#475569',
  },
  inactivePill: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactivePillText: {
    color: '#DC2626',
    fontSize: 9,
    fontWeight: '800',
  },
  memberActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionBtnSmall: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  actionBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  actionBtnAct: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  actionBtnActText: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtnDeact: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
  },
  actionBtnDeactText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtnRemoveMember: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  actionBtnRemoveMemberText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  rolePickerChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  rolePickerChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rolePickerChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  rolePickerChipTextActive: {
    color: '#FFFFFF',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  presetCard: {
    width: '48%',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  presetCardActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  presetCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  presetCardTitleActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  adminPermsNotice: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 10,
  },
  adminPermsNoticeText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    lineHeight: 18,
  },
  presetQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  presetQuickLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  permSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  permSwitchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
});
