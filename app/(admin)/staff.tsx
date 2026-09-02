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
      Alert.alert('Error', 'Invalid user target selected.');
      return;
    }
    if (!staffNewPassword || staffNewPassword.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters long.');
      return;
    }

    setSavingStaffPwd(true);
    try {
      await staffService.resetStaffPassword(targetStaffForPwd.user_id, staffNewPassword, activeRestaurantId);
      Alert.alert('Success', 'Password updated successfully.');
      setStaffPwdModalVisible(false);
      setStaffNewPassword('');
    } catch (err: any) {
      Alert.alert('Password Update Failed', err.message || 'Failed to update staff password.');
    } finally {
      setSavingStaffPwd(false);
    }
  };

  const handleToggleActive = async (member: StaffMemberWithDetails) => {
    const newAction = member.is_active ? 'DEACTIVATE' : 'ACTIVATE';
    const actionLabel = member.is_active ? 'Deactivate' : 'Activate';

    Alert.alert(
      `${actionLabel} Staff Member`,
      `Are you sure you want to ${actionLabel.toLowerCase()} ${member.full_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: member.is_active ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await staffService.setMembershipStatus(member.id, newAction);
              loadData();
            } catch (e: any) {
              Alert.alert('Error', e.message || `Failed to ${actionLabel.toLowerCase()} staff.`);
            }
          },
        },
      ]
    );
  };

  const handleRemoveMember = (member: StaffMemberWithDetails) => {
    Alert.alert(
      'Remove Staff Membership',
      `Remove ${member.full_name} from ${activeRestaurant?.name || 'this restaurant'}? Their global account will remain intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await staffService.setMembershipStatus(member.id, 'REMOVE');
              loadData();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to remove staff membership.');
            }
          },
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
        <View>
          <Text style={styles.title}>👥 Staff & Role Permissions</Text>
          <Text style={styles.subtitle}>
            {activeRestaurant?.name || 'Restaurant'} • {staffList.length} Team Members
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setAddModalVisible(true)}
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
                    <View
                      style={[
                        styles.roleBadge,
                        item.role === 'ADMIN' ? styles.roleAdmin : styles.roleStaff,
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          item.role === 'ADMIN' ? styles.roleAdminText : styles.roleStaffText,
                        ]}
                      >
                        {item.role}
                      </Text>
                    </View>
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
                    {item.permissions.can_use_pos && <Text style={styles.permChip}>🖥️ POS</Text>}
                    {item.permissions.can_view_orders && <Text style={styles.permChip}>📋 Orders</Text>}
                    {item.permissions.can_edit_orders && <Text style={styles.permChip}>✏️ Edit Orders</Text>}
                    {item.permissions.can_cancel_orders && <Text style={styles.permChip}>❌ Cancel Orders</Text>}
                    {item.permissions.can_manage_products && <Text style={styles.permChip}>🍲 Products</Text>}
                    {item.permissions.can_manage_tables && <Text style={styles.permChip}>🪑 Tables</Text>}
                    {item.permissions.can_view_reports && <Text style={styles.permChip}>📊 Reports</Text>}
                    {item.permissions.can_manage_register && <Text style={styles.permChip}>💵 Register</Text>}
                  </>
                )}
              </View>

              {/* Actions */}
              <View style={styles.cardActions}>
                {item.role !== 'ADMIN' && (
                  <TouchableOpacity
                    style={styles.actionBtnPerms}
                    onPress={() => openPermissionEditor(item)}
                  >
                    <Text style={styles.actionBtnPermsText}>🛡️ Permissions</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionBtnPerms}
                  onPress={() => openStaffPasswordModal(item)}
                >
                  <Text style={styles.actionBtnPermsText}>🔑 Password</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtnToggle, item.is_active ? styles.btnDeact : styles.btnAct]}
                  onPress={() => handleToggleActive(item)}
                >
                  <Text style={item.is_active ? styles.btnDeactText : styles.btnActText}>
                    {item.is_active ? '⏸️ Deactivate' : '▶️ Activate'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionBtnRemove}
                  onPress={() => handleRemoveMember(item)}
                >
                  <Text style={styles.actionBtnRemoveText}>🗑️ Remove</Text>
                </TouchableOpacity>
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
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />

              <Text style={styles.inputLabel}>Initial Password (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder={newMemberRole === 'ADMIN' ? 'Default: Ratnadeep1@' : 'Default: Staff12345!'}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />

              <Text style={styles.inputLabel}>Full Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ramesh Kumar"
                value={fullName}
                onChangeText={setFullName}
              />

              <Text style={styles.inputLabel}>Phone (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
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
      <Modal visible={editPermsModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>🛡️ Configure Permissions</Text>
            <Text style={styles.modalSubtitle}>Editing permissions for {targetMember?.full_name}</Text>

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
              <ScrollView style={styles.modalScroll}>
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

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditPermsModalVisible(false)}
                disabled={savingPerms}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleSavePermissions}
                disabled={savingPerms}
              >
                {savingPerms ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Save Permissions</Text>
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
              <TextInput
                style={styles.input}
                placeholder="Enter new password (min 8 chars)"
                value={staffNewPassword}
                onChangeText={setStaffNewPassword}
                autoCapitalize="none"
              />
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  addBtn: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
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
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  staffName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
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
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  permChip: {
    fontSize: 11,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#334155',
  },
  permChipFull: { backgroundColor: '#fef3c7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  permChipFullText: { fontSize: 11, fontWeight: '700', color: '#92400e' },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  actionBtnPerms: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  actionBtnPermsText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  actionBtnToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  btnAct: { backgroundColor: '#dcfce7' },
  btnActText: { color: '#16a34a', fontSize: 12, fontWeight: '700' },
  btnDeact: { backgroundColor: '#fee2e2' },
  btnDeactText: { color: '#dc2626', fontSize: 12, fontWeight: '700' },
  actionBtnRemove: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  actionBtnRemoveText: {
    color: '#dc2626',
    fontSize: 12,
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
});
