import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { staffService } from '../../src/services/api/staffService';
import { subscriptionGuardService } from '../../src/services/api/subscriptionGuardService';
import {
  StaffMemberWithDetails,
  RestaurantMemberPermissions,
  StaffPermissionPreset,
  PERMISSION_PRESETS,
  RestaurantPlanUsage,
} from '../../src/types';

const PERMISSION_CONFIG_ITEMS: {
  key: keyof RestaurantMemberPermissions;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    key: 'can_use_pos',
    label: 'POS Terminal',
    icon: '🖥️',
    description: 'Punch orders, live cart & bill counter',
  },
  {
    key: 'can_view_orders',
    label: 'View Orders',
    icon: '📋',
    description: 'View active orders feed & order history',
  },
  {
    key: 'can_edit_orders',
    label: 'Edit Orders',
    icon: '✏️',
    description: 'Modify items, quantities & order notes',
  },
  {
    key: 'can_cancel_orders',
    label: 'Cancel Orders',
    icon: '❌',
    description: 'Cancel live orders with required reason',
  },
  {
    key: 'can_manage_products',
    label: 'Products & Stock',
    icon: '🍲',
    description: 'Update products, pricing & inventory stock',
  },
  {
    key: 'can_manage_categories',
    label: 'Categories',
    icon: '📂',
    description: 'Create & organize menu categories',
  },
  {
    key: 'can_manage_tables',
    label: 'Tables & QR',
    icon: '🪑',
    description: 'Manage dining tables & table QR codes',
  },
  {
    key: 'can_manage_coupons',
    label: 'Coupons & Offers',
    icon: '🎟️',
    description: 'Create & manage promotional discount coupons',
  },
  {
    key: 'can_view_reports',
    label: 'Analytics & Reports',
    icon: '📊',
    description: 'View sales revenue metrics & day summaries',
  },
  {
    key: 'can_manage_register',
    label: 'Cash Register',
    icon: '💵',
    description: 'Open & close daily register cash drawer',
  },
  {
    key: 'can_view_settings',
    label: 'View Settings',
    icon: '⚙️',
    description: 'View restaurant details & printer config',
  },
  {
    key: 'can_manage_settings',
    label: 'Manage Settings',
    icon: '🔧',
    description: 'Modify store profile, taxes & system options',
  },
  {
    key: 'can_manage_staff',
    label: 'Staff & Roles',
    icon: '👥',
    description: 'Manage team members & assign role permissions',
  },
];

const PRESET_OPTIONS: { id: StaffPermissionPreset; label: string; icon: string }[] = [
  { id: 'CASHIER', label: 'Cashier', icon: '💳' },
  { id: 'WAITER', label: 'Waiter', icon: '🍽️' },
  { id: 'MANAGER', label: 'Manager', icon: '💼' },
  { id: 'KITCHEN', label: 'Kitchen', icon: '🧑‍🍳' },
];

const getStaffDisplayRole = (item: StaffMemberWithDetails): { label: string; bg: string; color: string } => {
  if (item.role === 'ADMIN') {
    return { label: 'ADMIN', bg: '#fef08a', color: '#854d0e' };
  }

  const perms = item.permissions;
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

export default function StaffManagementScreen() {
  const router = useRouter();
  const { user, isAdmin, isSuperAdmin, activeRestaurantId, activeRestaurant } = useAuth();

  const [staffList, setStaffList] = useState<StaffMemberWithDetails[]>([]);
  const [planUsage, setPlanUsage] = useState<RestaurantPlanUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Add Staff Modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newMemberRole, setNewMemberRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [selectedPreset, setSelectedPreset] = useState<StaffPermissionPreset>('CASHIER');
  const [submitting, setSubmitting] = useState(false);

  // Edit Permissions Modal
  const [editPermsModalVisible, setEditPermsModalVisible] = useState(false);
  const [targetMember, setTargetMember] = useState<StaffMemberWithDetails | null>(null);
  const [tempPermissions, setTempPermissions] = useState<Partial<RestaurantMemberPermissions> | null>(null);
  const [savingPerms, setSavingPerms] = useState(false);

  // Staff Password Change Modal State
  const [staffPwdModalVisible, setStaffPwdModalVisible] = useState(false);
  const [targetStaffForPwd, setTargetStaffForPwd] = useState<StaffMemberWithDetails | null>(null);
  const [staffNewPassword, setStaffNewPassword] = useState('');
  const [showStaffNewPassword, setShowStaffNewPassword] = useState(false);
  const [savingStaffPwd, setSavingStaffPwd] = useState(false);

  const loadData = async () => {
    if (!activeRestaurantId) return;
    setLoading(true);
    try {
      const [members, usage] = await Promise.all([
        staffService.getStaffMembers(activeRestaurantId),
        subscriptionGuardService.getPlanUsage(activeRestaurantId),
      ]);
      setStaffList(members);
      setPlanUsage(usage);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load staff list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeRestaurantId]);

  if (!isAdmin && !isSuperAdmin) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>🔒 Access Denied</Text>
        <Text style={styles.errorSubtext}>Only Restaurant Administrators can manage staff and permissions.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(admin)/pos' as any)}>
          <Text style={styles.backBtnText}>Return to POS</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleOpenAddStaff = () => {
    if (
      planUsage &&
      !planUsage.staff.is_unlimited &&
      planUsage.staff.max !== null &&
      planUsage.staff.current >= planUsage.staff.max
    ) {
      Alert.alert(
        'Plan Limit Reached',
        'Plan limit reached. Please upgrade or contact Super Admin.',
        [
          { text: 'Upgrade Plan', onPress: () => router.push('/(admin)/my-plan' as any) },
          { text: 'OK', style: 'cancel' },
        ]
      );
      return;
    }
    setAddModalVisible(true);
  };

  const handleAddStaff = async () => {
    if (!email.trim()) {
      Alert.alert('Validation Error', 'Email address is required.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim() || cleanEmail.split('@')[0];

    // Role Enforcement: Restaurant Admin can only create STAFF
    const assignedRole: 'ADMIN' | 'STAFF' = isSuperAdmin ? newMemberRole : 'STAFF';

    setSubmitting(true);
    try {
      await staffService.provisionStaff(activeRestaurantId, {
        full_name: cleanName,
        email: cleanEmail,
        phone: phone.trim() || undefined,
        password: password.trim() || 'Staff12345!',
        role: assignedRole,
        preset: assignedRole === 'STAFF' ? selectedPreset : undefined,
      });

      Alert.alert('Success', `Staff member ${cleanName} provisioned immediately without OTP/email verification.`);
      setAddModalVisible(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setNewMemberRole('STAFF');
      setSelectedPreset('CASHIER');
      loadData();
    } catch (e: any) {
      Alert.alert('Provisioning Error', e.message || 'Failed to add team member.');
    } finally {
      setSubmitting(false);
    }
  };

  const openPermissionEditor = (member: StaffMemberWithDetails) => {
    setTargetMember(member);
    setTempPermissions({ ...member.permissions });
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
    if (!targetMember || !tempPermissions) return;
    setSavingPerms(true);
    try {
      await staffService.updateStaffPermissions(targetMember.id, tempPermissions);
      Alert.alert('Success', `Permissions updated for ${targetMember.full_name}.`);
      setEditPermsModalVisible(false);
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update permissions.');
    } finally {
      setSavingPerms(false);
    }
  };

  const openStaffPasswordModal = (member: StaffMemberWithDetails) => {
    setTargetStaffForPwd(member);
    setStaffNewPassword('');
    setStaffPwdModalVisible(true);
  };

  const handleSaveStaffPassword = async () => {
    if (!targetStaffForPwd?.user_id) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Error: Invalid user target selected.');
      } else {
        Alert.alert('Error', 'Invalid user target selected.');
      }
      return;
    }
    if (!staffNewPassword || staffNewPassword.length < 8) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Validation Error: Password must be at least 8 characters long.');
      } else {
        Alert.alert('Validation Error', 'Password must be at least 8 characters long.');
      }
      return;
    }

    const memberName = targetStaffForPwd.full_name || 'Staff member';
    setSavingStaffPwd(true);
    try {
      await staffService.resetStaffPassword(targetStaffForPwd.user_id, staffNewPassword, activeRestaurantId);
      setStaffPwdModalVisible(false);
      setStaffNewPassword('');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`✅ Success: Password for ${memberName} has been updated successfully!`);
      } else {
        Alert.alert('Success', `Password for ${memberName} has been updated successfully.`);
      }
    } catch (err: any) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`❌ Password Update Failed: ${err.message || 'Failed to update staff password.'}`);
      } else {
        Alert.alert('Password Update Failed', err.message || 'Failed to update staff password.');
      }
    } finally {
      setSavingStaffPwd(false);
    }
  };

  const handleToggleActive = async (member: StaffMemberWithDetails) => {
    const newAction = member.is_active ? 'DEACTIVATE' : 'ACTIVATE';
    const actionLabel = member.is_active ? 'Deactivate' : 'Activate';
    const message = `Are you sure you want to ${actionLabel.toLowerCase()} ${member.full_name}?`;

    const doToggle = async () => {
      try {
        await staffService.setMembershipStatus(member.id, newAction);
        loadData();
      } catch (e: any) {
        Alert.alert('Error', e.message || `Failed to ${actionLabel.toLowerCase()} staff.`);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(message) : true;
      if (confirmed) {
        doToggle();
      }
      return;
    }

    Alert.alert(
      `${actionLabel} Staff Member`,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: member.is_active ? 'destructive' : 'default',
          onPress: doToggle,
        },
      ]
    );
  };

  const handleRemoveMember = (member: StaffMemberWithDetails) => {
    const message = `Remove ${member.full_name} from ${activeRestaurant?.name || 'this restaurant'}? Their global account will remain intact.`;

    const doRemove = async () => {
      try {
        await staffService.setMembershipStatus(member.id, 'REMOVE');
        Alert.alert('Success', `Staff member ${member.full_name} removed.`);
        loadData();
      } catch (e: any) {
        Alert.alert('Error', e.message || 'Failed to remove staff membership.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' ? window.confirm(message) : true;
      if (confirmed) {
        doRemove();
      }
      return;
    }

    Alert.alert(
      'Remove Staff Membership',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: doRemove,
        },
      ]
    );
  };

  const filteredStaff = staffList.filter((s) => {
    if (filterRole === 'ACTIVE') return s.is_active;
    if (filterRole === 'INACTIVE') return !s.is_active;
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleBox}>
          <Text style={styles.title} numberOfLines={1}>👥 Staff & Role Permissions</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {activeRestaurant?.name || 'Restaurant'} • {staffList.length} Team Members
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={handleOpenAddStaff}
        >
          <Text style={styles.addBtnText}>+ Add Staff</Text>
        </TouchableOpacity>
      </View>

      {/* Plan Usage Indicator Banner */}
      {planUsage && (
        <View style={styles.usageBanner}>
          <View style={styles.usageInfo}>
            <Text style={styles.usageTitle}>
              Plan Staff Limit: {planUsage.staff.current} /{' '}
              {planUsage.staff.is_unlimited ? 'Unlimited' : planUsage.staff.max}
            </Text>
            <Text style={styles.usageSub}>
              {planUsage.plan.name} • {planUsage.staff.is_unlimited ? 'No limits' : `${planUsage.staff.percentage}% used`}
            </Text>
          </View>
          {planUsage.staff.percentage >= 80 && !planUsage.staff.is_unlimited && (
            <TouchableOpacity
              style={styles.upgradeBtnSmall}
              onPress={() => router.push('/(admin)/my-plan' as any)}
            >
              <Text style={styles.upgradeBtnText}>Upgrade</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterChip, filterRole === tab && styles.filterChipActive]}
            onPress={() => setFilterRole(tab)}
          >
            <Text style={[styles.filterChipText, filterRole === tab && styles.filterChipTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Staff List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ea580c" />
          <Text style={styles.loadingText}>Loading team directory...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredStaff}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={loading}
          onRefresh={loadData}
          renderItem={({ item }) => (
            <View style={[styles.staffCard, !item.is_active && styles.staffCardInactive]}>
              <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.full_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardMainInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.staffName}>{item.full_name}</Text>
                    {(() => {
                      const displayRole = getStaffDisplayRole(item);
                      return (
                        <View
                          style={[
                            styles.roleBadge,
                            { backgroundColor: displayRole.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.roleBadgeText,
                              { color: displayRole.color },
                            ]}
                          >
                            {displayRole.label}
                          </Text>
                        </View>
                      );
                    })()}
                    {!item.is_active && (
                      <View style={styles.inactiveBadge}>
                        <Text style={styles.inactiveBadgeText}>DEACTIVATED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.staffContact}>{item.email} {item.phone ? `• ${item.phone}` : ''}</Text>
                </View>
              </View>

              {/* Permissions Summary Chips */}
              <View style={styles.permsRow}>
                {item.role === 'ADMIN' ? (
                  <View style={styles.permChipFull}>
                    <Text style={styles.permChipFullText}>⭐ Full Administrator Access</Text>
                  </View>
                ) : (
                  <>
                    {item.permissions.can_use_pos && (
                      <View style={styles.permChip}>
                        <Text style={styles.permChipText}>🖥️ POS</Text>
                      </View>
                    )}
                    {item.permissions.can_view_orders && (
                      <View style={styles.permChip}>
                        <Text style={styles.permChipText}>📋 Orders</Text>
                      </View>
                    )}
                    {item.permissions.can_edit_orders && (
                      <View style={styles.permChip}>
                        <Text style={styles.permChipText}>✏️ Edit Orders</Text>
                      </View>
                    )}
                    {item.permissions.can_cancel_orders && (
                      <View style={styles.permChip}>
                        <Text style={styles.permChipText}>❌ Cancel Orders</Text>
                      </View>
                    )}
                    {item.permissions.can_manage_products && (
                      <View style={styles.permChip}>
                        <Text style={styles.permChipText}>🍲 Products</Text>
                      </View>
                    )}
                    {item.permissions.can_manage_tables && (
                      <View style={styles.permChip}>
                        <Text style={styles.permChipText}>🪑 Tables</Text>
                      </View>
                    )}
                    {item.permissions.can_view_reports && (
                      <View style={styles.permChip}>
                        <Text style={styles.permChipText}>📊 Reports</Text>
                      </View>
                    )}
                    {item.permissions.can_manage_register && (
                      <View style={styles.permChip}>
                        <Text style={styles.permChipText}>💵 Register</Text>
                      </View>
                    )}
                    {!item.permissions.can_use_pos &&
                      !item.permissions.can_view_orders &&
                      !item.permissions.can_edit_orders &&
                      !item.permissions.can_cancel_orders &&
                      !item.permissions.can_manage_products &&
                      !item.permissions.can_manage_tables &&
                      !item.permissions.can_view_reports &&
                      !item.permissions.can_manage_register && (
                        <View style={styles.permChipEmpty}>
                          <Text style={styles.permChipEmptyText}>No permissions assigned</Text>
                        </View>
                      )}
                  </>
                )}
              </View>

              {/* Actions Grid (2 columns on mobile) */}
              <View style={styles.cardActionsGrid}>
                {item.role !== 'ADMIN' ? (
                  <>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPerms]}
                        onPress={() => openPermissionEditor(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionBtnPermsText} numberOfLines={1}>🛡️ Permissions</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPwd]}
                        onPress={() => openStaffPasswordModal(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionBtnPwdText} numberOfLines={1}>🔑 Password</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, item.is_active ? styles.btnDeact : styles.btnAct]}
                        onPress={() => handleToggleActive(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={item.is_active ? styles.btnDeactText : styles.btnActText} numberOfLines={1}>
                          {item.is_active ? '⏸️ Deactivate' : '▶️ Activate'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnRemove]}
                        onPress={() => handleRemoveMember(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionBtnRemoveText} numberOfLines={1}>🗑️ Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPwd]}
                        onPress={() => openStaffPasswordModal(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionBtnPwdText} numberOfLines={1}>🔑 Password</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, item.is_active ? styles.btnDeact : styles.btnAct]}
                        onPress={() => handleToggleActive(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={item.is_active ? styles.btnDeactText : styles.btnActText} numberOfLines={1}>
                          {item.is_active ? '⏸️ Deactivate' : '▶️ Activate'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnRemove]}
                        onPress={() => handleRemoveMember(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.actionBtnRemoveText} numberOfLines={1}>🗑️ Remove</Text>
                      </TouchableOpacity>
                      <View style={styles.actionBtnPlaceholder} />
                    </View>
                  </>
                )}
              </View>
            </View>
          )}
        />
      )}

      {/* Modal 1: Add Staff / Admin */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>+ Add Team Member</Text>
            <Text style={styles.modalSubtitle}>Provision a new account for {activeRestaurant?.name}</Text>

            <ScrollView style={styles.modalScroll}>
              {/* Role Selection */}
              <Text style={styles.inputLabel}>Role *</Text>
              {isSuperAdmin ? (
                <View style={styles.rolePickerRow}>
                  <TouchableOpacity
                    style={[styles.rolePickerChip, newMemberRole === 'STAFF' && styles.rolePickerChipActive]}
                    onPress={() => setNewMemberRole('STAFF')}
                  >
                    <Text style={[styles.rolePickerChipText, newMemberRole === 'STAFF' && styles.rolePickerChipTextActive]}>
                      STAFF
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.rolePickerChip, newMemberRole === 'ADMIN' && styles.rolePickerChipActive]}
                    onPress={() => setNewMemberRole('ADMIN')}
                  >
                    <Text style={[styles.rolePickerChipText, newMemberRole === 'ADMIN' && styles.rolePickerChipTextActive]}>
                      ADMIN
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.roleLockBadge}>
                  <Text style={styles.roleLockText}>Role: <Text style={{ fontWeight: '800' }}>STAFF</Text> (Admin creation restricted to Super Admin)</Text>
                </View>
              )}

              <Text style={styles.inputLabel}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="staff@example.com"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={styles.inputLabel}>Initial Password (Optional)</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter password (or auto-generate)"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
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

              <Text style={styles.inputLabel}>Full Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#64748b"
                value={fullName}
                onChangeText={setFullName}
              />

              <Text style={styles.inputLabel}>Phone (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              {newMemberRole === 'STAFF' ? (
                <>
                  <Text style={styles.inputLabel}>Permission Preset</Text>
                  <View style={styles.presetGrid}>
                    {(['CASHIER', 'WAITER', 'MANAGER', 'KITCHEN'] as StaffPermissionPreset[]).map((pr) => (
                      <TouchableOpacity
                        key={pr}
                        style={[styles.presetCard, selectedPreset === pr && styles.presetCardActive]}
                        onPress={() => setSelectedPreset(pr)}
                      >
                        <Text style={[styles.presetCardTitle, selectedPreset === pr && styles.presetCardTitleActive]}>
                          {pr === 'CASHIER' && '💵 Cashier'}
                          {pr === 'WAITER' && '🍽️ Waiter'}
                          {pr === 'MANAGER' && '👔 Manager'}
                          {pr === 'KITCHEN' && '🍳 Kitchen Staff'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.adminPermsNotice}>
                  <Text style={styles.adminPermsNoticeText}>
                    ⭐ Restaurant Administrators automatically have full administrative permissions for this restaurant.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setAddModalVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleAddStaff}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>
                    {newMemberRole === 'ADMIN' ? 'Create Admin' : 'Create Staff'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Edit Permissions */}
      <Modal visible={editPermsModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.permsModalContainer}>
            {/* Header with Title and Close Button */}
            <View style={styles.permsModalHeader}>
              <View style={styles.permsHeaderIconBox}>
                <Text style={{ fontSize: 20 }}>🛡️</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.permsModalTitle}>Configure Permissions</Text>
                <Text style={styles.permsModalSubtitle} numberOfLines={1}>
                  Editing permissions for <Text style={styles.permsTargetName}>{targetMember?.full_name}</Text>
                </Text>
              </View>
              <TouchableOpacity
                style={styles.permsCloseBtn}
                onPress={() => setEditPermsModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.permsCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Presets Carousel / ScrollRow */}
            <View style={styles.presetsSection}>
              <Text style={styles.presetsSectionLabel}>Quick Presets:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetScrollContent}
              >
                {PRESET_OPTIONS.map((pr) => (
                  <TouchableOpacity
                    key={pr.id}
                    style={styles.presetPillBtn}
                    onPress={() => handleApplyPreset(pr.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.presetPillIcon}>{pr.icon}</Text>
                    <Text style={styles.presetPillText}>{pr.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Scrollable Permissions List */}
            {tempPermissions && (
              <ScrollView
                style={styles.permsScrollView}
                contentContainerStyle={styles.permsScrollContent}
                showsVerticalScrollIndicator={true}
              >
                {PERMISSION_CONFIG_ITEMS.map((item) => {
                  const isEnabled = Boolean(tempPermissions[item.key]);
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.permCard, isEnabled && styles.permCardActive]}
                      onPress={() =>
                        setTempPermissions({
                          ...tempPermissions,
                          [item.key]: !isEnabled,
                        })
                      }
                      activeOpacity={0.8}
                    >
                      <View style={[styles.permIconBox, isEnabled && styles.permIconBoxActive]}>
                        <Text style={{ fontSize: 16 }}>{item.icon}</Text>
                      </View>
                      <View style={styles.permTextBox}>
                        <Text style={[styles.permTitle, isEnabled && styles.permTitleActive]}>
                          {item.label}
                        </Text>
                        <Text style={styles.permDescription}>{item.description}</Text>
                      </View>
                      <Switch
                        value={isEnabled}
                        onValueChange={(v) =>
                          setTempPermissions({ ...tempPermissions, [item.key]: v })
                        }
                        trackColor={{ false: '#E2E8F0', true: '#EA580C' }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor="#E2E8F0"
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Action Buttons */}
            <View style={styles.permsFooterRow}>
              <TouchableOpacity
                style={styles.permsCancelBtn}
                onPress={() => setEditPermsModalVisible(false)}
                disabled={savingPerms}
              >
                <Text style={styles.permsCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.permsSaveBtn, savingPerms && styles.btnDisabled]}
                onPress={handleSavePermissions}
                disabled={savingPerms}
              >
                {savingPerms ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.permsSaveBtnText}>Save Permissions</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 3: Change Staff Password */}
      <Modal visible={staffPwdModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>🔑 Change Password</Text>
            <Text style={styles.modalSubtitle}>Update login credentials for {targetStaffForPwd?.full_name}</Text>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Staff Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: '#f1f5f9', color: '#64748b' }]}
                value={targetStaffForPwd?.email || ''}
                editable={false}
              />

              <Text style={styles.inputLabel}>New Password *</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter new password (min 8 chars)"
                  placeholderTextColor="#64748b"
                  value={staffNewPassword}
                  onChangeText={setStaffNewPassword}
                  autoCapitalize="none"
                  secureTextEntry={!showStaffNewPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowStaffNewPassword(!showStaffNewPassword)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>{showStaffNewPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Password must contain at least 8 characters.
              </Text>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setStaffPwdModalVisible(false)}
                disabled={savingStaffPwd}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSaveStaffPassword}
                disabled={savingStaffPwd}
              >
                {savingStaffPwd ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  headerTitleBox: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  addBtn: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    flexShrink: 0,
  },
  addBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  usageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#fed7aa',
  },
  usageInfo: { flex: 1 },
  usageTitle: { fontSize: 13, fontWeight: '700', color: '#9a3412' },
  usageSub: { fontSize: 11, color: '#c2410c' },
  upgradeBtnSmall: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  upgradeBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: '#ea580c' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  filterChipTextActive: { color: '#ffffff' },
  listContent: { padding: 16, gap: 12 },
  staffCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  staffCardInactive: { opacity: 0.6, backgroundColor: '#f1f5f9' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fed7aa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: '#ea580c' },
  cardMainInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  staffName: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  roleAdmin: { backgroundColor: '#fef08a' },
  roleStaff: { backgroundColor: '#e2e8f0' },
  roleBadgeText: { fontSize: 10, fontWeight: '800' },
  roleAdminText: { color: '#854d0e' },
  roleStaffText: { color: '#475569' },
  inactiveBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  inactiveBadgeText: { color: '#dc2626', fontSize: 9, fontWeight: '800' },
  staffContact: { fontSize: 12, color: '#64748b', marginTop: 2 },
  permsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  permChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  permChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  permChipFull: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  permChipFullText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },
  permChipEmpty: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  permChipEmptyText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  cardActionsGrid: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  actionBtnPlaceholder: {
    flex: 1,
  },
  actionBtnPerms: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  actionBtnPermsText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  actionBtnPwd: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  actionBtnPwdText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  btnAct: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  btnActText: { color: '#059669', fontSize: 11, fontWeight: '700' },
  btnDeact: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  btnDeactText: { color: '#e11d48', fontSize: 11, fontWeight: '700' },
  actionBtnRemove: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  actionBtnRemoveText: {
    color: '#dc2626',
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
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  rolePickerChipActive: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  rolePickerChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  rolePickerChipTextActive: {
    color: '#ffffff',
  },
  roleLockBadge: {
    backgroundColor: '#f1f5f9',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
    marginBottom: 6,
  },
  roleLockText: {
    fontSize: 12,
    color: '#475569',
  },
  adminPermsNotice: {
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginTop: 10,
  },
  adminPermsNoticeText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
    lineHeight: 18,
  },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 14 },
  errorText: { fontSize: 20, fontWeight: '800', color: '#dc2626', marginBottom: 8 },
  errorSubtext: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 20 },
  backBtn: { backgroundColor: '#ea580c', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  backBtnText: { color: '#fff', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  modalContainer: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  modalSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  modalScroll: { maxHeight: 380 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 10, marginBottom: 4 },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    position: 'relative',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 40,
    fontSize: 14,
    color: '#0f172a',
  },
  eyeBtn: {
    position: 'absolute',
    right: 8,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: {
    fontSize: 16,
  },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  presetCard: {
    width: '48%',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  presetCardActive: { borderColor: '#ea580c', backgroundColor: '#fff7ed' },
  presetCardTitle: { fontSize: 12, fontWeight: '600', color: '#475569' },
  presetCardTitleActive: { color: '#ea580c', fontWeight: '700' },
  presetQuickRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  presetQuickLabel: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  presetChip: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  presetChipText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  permSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  permSwitchLabel: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modalCancelBtnText: { color: '#64748b', fontWeight: '700' },
  modalSubmitBtn: { backgroundColor: '#ea580c', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalSubmitBtnText: { color: '#fff', fontWeight: '700' },

  // Redesigned Configure Permissions Modal Styles
  permsModalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  permsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  permsHeaderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#ffedd5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permsModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.2,
  },
  permsModalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  permsTargetName: {
    color: '#ea580c',
    fontWeight: '700',
  },
  permsCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permsCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  presetsSection: {
    marginBottom: 12,
  },
  presetsSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  presetScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  presetPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetPillIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  permsScrollView: {
    maxHeight: 380,
  },
  permsScrollContent: {
    gap: 8,
    paddingVertical: 4,
  },
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  permCardActive: {
    borderColor: '#fed7aa',
    backgroundColor: '#fffaf5',
  },
  permIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  permIconBoxActive: {
    backgroundColor: '#ffedd5',
  },
  permTextBox: {
    flex: 1,
    marginRight: 8,
  },
  permTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  permTitleActive: {
    color: '#0f172a',
  },
  permDescription: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  permsFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  permsCancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permsCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  permsSaveBtn: {
    flex: 1.5,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#ea580c',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  permsSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
