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
  useWindowDimensions,
} from 'react-native';
import { superAdminService } from '../../src/services/api/superAdminService';
import { Restaurant, RestaurantMember } from '../../src/types';
import { colors } from '../../src/utils/colors';

export default function RestaurantAdminsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [allAdmins, setAllAdmins] = useState<
    Array<RestaurantMember & { restaurant?: Restaurant; profile?: any }>
  >([]);

  // Provision Admin Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetRestaurantId, setTargetRestaurantId] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('Ratnadeep1@');

  // Edit Admin Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<any | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRestaurantId, setEditRestaurantId] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Change Password Modal State
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [pwdAdmin, setPwdAdmin] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const loadData = async () => {
    try {
      const rests = await superAdminService.getAllRestaurants();
      setRestaurants(rests);

      if (rests.length > 0 && !targetRestaurantId) {
        setTargetRestaurantId(rests[0].id);
      }

      // Collect all admin members across restaurants
      const adminList: any[] = [];
      for (const r of rests) {
        const mems = await superAdminService.getRestaurantMembers(r.id);
        const filtered = mems.filter((m) => m.role === 'ADMIN');
        filtered.forEach((m) => {
          adminList.push({ ...m, restaurant: r });
        });
      }
      setAllAdmins(adminList);
    } catch (e) {
      console.warn('Error loading admins:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAdmin = async () => {
    if (!formEmail.trim() || !targetRestaurantId) {
      Alert.alert('Validation Error', 'Email address and Restaurant selection are required.');
      return;
    }

    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanName = formFullName.trim() || cleanEmail.split('@')[0];

    setSaving(true);
    try {
      await superAdminService.createRestaurantAdmin({
        restaurant_id: targetRestaurantId,
        full_name: cleanName,
        email: cleanEmail,
        phone: formPhone.trim() || undefined,
        password: formPassword || 'Ratnadeep1@',
      });

      Alert.alert('Success', `Admin account created immediately without OTP/email verification. Login is active.`);
      setModalVisible(false);
      setFormFullName('');
      setFormEmail('');
      setFormPhone('');
      loadData();
    } catch (e: any) {
      Alert.alert('Provisioning Error', e.message || 'Failed to create restaurant admin.');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (admin: any) => {
    setSelectedAdmin(admin);
    setEditFullName(admin.profile?.full_name || '');
    setEditPhone(admin.profile?.phone || '');
    setEditRestaurantId(admin.restaurant_id || (restaurants[0] ? restaurants[0].id : ''));
    setEditIsActive(admin.is_active ?? true);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedAdmin || !editFullName.trim() || !editRestaurantId) {
      Alert.alert('Validation Error', 'Full Name and Restaurant assignment are required.');
      return;
    }

    setSavingEdit(true);
    try {
      await superAdminService.updateRestaurantAdmin({
        membership_id: selectedAdmin.id,
        user_id: selectedAdmin.user_id,
        restaurant_id: editRestaurantId,
        full_name: editFullName.trim(),
        phone: editPhone.trim() || undefined,
        is_active: editIsActive,
      });

      Alert.alert('Success', 'Restaurant Admin updated successfully!');
      setEditModalVisible(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update restaurant admin.');
    } finally {
      setSavingEdit(false);
    }
  };

  const openPasswordModal = (admin: any) => {
    setPwdAdmin(admin);
    setNewPassword('');
    setPwdModalVisible(true);
  };

  const handleSavePassword = async () => {
    if (!pwdAdmin?.user_id) {
      Alert.alert('Error', 'Invalid user target selected.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters long.');
      return;
    }

    setSavingPwd(true);
    try {
      await superAdminService.changeAdminPassword(pwdAdmin.user_id, newPassword, pwdAdmin.restaurant_id);
      Alert.alert('Success', 'Password updated successfully.');
      setPwdModalVisible(false);
      setNewPassword('');
    } catch (err: any) {
      Alert.alert('Password Update Failed', err.message || 'Failed to update user password in Supabase Auth.');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleDeleteAdmin = (membership_id: string, name: string) => {
    Alert.alert(
      'Confirm Removal',
      `Are you sure you want to remove ${name} from their assigned restaurant?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await superAdminService.deleteRestaurantAdmin(membership_id);
              Alert.alert('Admin Removed', `${name} has been removed from the restaurant.`);
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove admin.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Restaurant Admins</Text>
          <Text style={styles.subtitle}>
            Provision, edit, update passwords, and oversee tenant-level administrative privileges
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isMobile && { width: '100%', justifyContent: 'center' }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>➕ Provision Restaurant Admin</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView style={styles.tableScroll} contentContainerStyle={{ paddingBottom: isMobile ? 100 : 40 }}>
          {allAdmins.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={{ fontSize: 36 }}>👥</Text>
              <Text style={styles.emptyText}>No restaurant admins provisioned yet.</Text>
            </View>
          ) : isMobile ? (
            /* Mobile Cards */
            <View style={styles.mobileCardList}>
              {allAdmins.map((m) => (
                <View key={m.id} style={styles.mobileCard}>
                  <View style={styles.mobileCardTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(m.profile?.full_name || 'Admin').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.adminName} numberOfLines={1}>
                        {m.profile?.full_name || 'Restaurant Admin'}
                      </Text>
                      <Text style={styles.adminEmail} numberOfLines={1}>
                        {m.profile?.email || 'No email'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        m.is_active ? styles.badgeActive : styles.badgeInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          m.is_active ? styles.badgeTextActive : styles.badgeTextInactive,
                        ]}
                      >
                        {m.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.mobileMetaGrid}>
                    <View style={styles.mobileMetaItem}>
                      <Text style={styles.mobileMetaLabel}>ASSIGNED RESTAURANT</Text>
                      <Text style={styles.mobileMetaValue} numberOfLines={1}>
                        🏢 {m.restaurant?.name || 'Unassigned'}
                      </Text>
                    </View>
                    <View style={styles.mobileMetaItem}>
                      <Text style={styles.mobileMetaLabel}>PHONE NUMBER</Text>
                      <Text style={styles.mobileMetaValue} numberOfLines={1}>
                        {m.profile?.phone || 'N/A'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Row */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openEditModal(m)}
                    >
                      <Text style={styles.cardActionBtnText}>✏️ Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openPasswordModal(m)}
                    >
                      <Text style={styles.cardActionBtnText}>🔑 Password</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.cardActionBtnDanger]}
                      onPress={() =>
                        handleDeleteAdmin(
                          m.id,
                          m.profile?.full_name || m.profile?.email || 'Admin'
                        )
                      }
                    >
                      <Text style={styles.cardActionBtnDangerText}>🗑️ Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            /* Desktop Table */
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>ADMIN USER</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>ASSIGNED RESTAURANT</Text>
                <Text style={[styles.th, { flex: 1.2 }]}>PHONE</Text>
                <Text style={[styles.th, { flex: 0.9 }]}>STATUS</Text>
                <Text style={[styles.th, { flex: 2.2, textAlign: 'right' }]}>ACTIONS</Text>
              </View>

              {allAdmins.map((m) => (
                <View key={m.id} style={styles.tableRow}>
                  <View style={[styles.tdWrap, { flex: 2 }]}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(m.profile?.full_name || 'Admin').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.adminName} numberOfLines={1}>
                        {m.profile?.full_name || 'Restaurant Admin'}
                      </Text>
                      <Text style={styles.adminEmail} numberOfLines={1}>
                        {m.profile?.email || 'No email'}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.tdText, { flex: 1.5, fontWeight: '600' }]} numberOfLines={1}>
                    🏢 {m.restaurant?.name || 'Unassigned'}
                  </Text>

                  <Text style={[styles.tdText, { flex: 1.2, color: '#64748B' }]} numberOfLines={1}>
                    {m.profile?.phone || 'N/A'}
                  </Text>

                  <View style={{ flex: 0.9 }}>
                    <View
                      style={[
                        styles.statusBadge,
                        m.is_active ? styles.badgeActive : styles.badgeInactive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          m.is_active ? styles.badgeTextActive : styles.badgeTextInactive,
                        ]}
                      >
                        {m.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Column */}
                  <View style={[styles.tdWrap, { flex: 2.2, justifyContent: 'flex-end', gap: 6 }]}>
                    <TouchableOpacity
                      style={styles.tableActionBtn}
                      onPress={() => openEditModal(m)}
                    >
                      <Text style={styles.tableActionBtnText}>✏️ Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.tableActionBtn}
                      onPress={() => openPasswordModal(m)}
                    >
                      <Text style={styles.tableActionBtnText}>🔑 Password</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.tableActionBtn, styles.tableActionBtnDanger]}
                      onPress={() =>
                        handleDeleteAdmin(
                          m.id,
                          m.profile?.full_name || m.profile?.email || 'Admin'
                        )
                      }
                    >
                      <Text style={styles.tableActionBtnDangerText}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Provision Admin Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provision Restaurant Admin Account</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Select Target Restaurant *</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.restSelectScroll}
              >
                {restaurants.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.restChip,
                      targetRestaurantId === r.id && styles.restChipActive,
                    ]}
                    onPress={() => setTargetRestaurantId(r.id)}
                  >
                    <Text
                      style={[
                        styles.restChipText,
                        targetRestaurantId === r.id && styles.restChipTextActive,
                      ]}
                    >
                      🏢 {r.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Admin Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Doe"
                value={formFullName}
                onChangeText={setFormFullName}
              />

              <Text style={styles.label}>Admin Email *</Text>
              <TextInput
                style={styles.input}
                placeholder="admin@restaurant.com"
                value={formEmail}
                onChangeText={setFormEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="+91 98765 43210"
                value={formPhone}
                onChangeText={setFormPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.label}>Initial Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Default: Ratnadeep1@"
                value={formPassword}
                onChangeText={setFormPassword}
                secureTextEntry
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleCreateAdmin}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Provision Admin</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Admin Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Restaurant Admin</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Admin Full Name *</Text>
              <TextInput
                style={styles.input}
                value={editFullName}
                onChangeText={setEditFullName}
                placeholder="Admin Full Name"
              />

              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={editPhone}
                onChangeText={setEditPhone}
                keyboardType="phone-pad"
                placeholder="+91 98765 43210"
              />

              <Text style={styles.label}>Assigned Restaurant *</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.restSelectScroll}
              >
                {restaurants.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[
                      styles.restChip,
                      editRestaurantId === r.id && styles.restChipActive,
                    ]}
                    onPress={() => setEditRestaurantId(r.id)}
                  >
                    <Text
                      style={[
                        styles.restChipText,
                        editRestaurantId === r.id && styles.restChipTextActive,
                      ]}
                    >
                      🏢 {r.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.label}>Membership Status</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  style={[
                    styles.cyclePill,
                    editIsActive && styles.cyclePillActive,
                  ]}
                  onPress={() => setEditIsActive(true)}
                >
                  <Text
                    style={[
                      styles.cyclePillText,
                      editIsActive && styles.cyclePillTextActive,
                    ]}
                  >
                    ✅ ACTIVE
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.cyclePill,
                    !editIsActive && { backgroundColor: '#DC2626', borderColor: '#DC2626' },
                  ]}
                  onPress={() => setEditIsActive(false)}
                >
                  <Text
                    style={[
                      styles.cyclePillText,
                      !editIsActive && styles.cyclePillTextActive,
                    ]}
                  >
                    🚫 INACTIVE
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
                onPress={handleSaveEdit}
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

      {/* Change Password Modal */}
      <Modal visible={pwdModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Change Password for {pwdAdmin?.profile?.full_name || 'Admin'}
              </Text>
              <TouchableOpacity onPress={() => setPwdModalVisible(false)}>
                <Text style={{ fontSize: 18, color: '#64748B' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Admin Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: '#E2E8F0', color: '#64748B' }]}
                value={pwdAdmin?.profile?.email || ''}
                editable={false}
              />

              <Text style={styles.label}>New Password *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter new strong password"
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
              />
              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                Password must contain at least 8 characters.
              </Text>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPwdModalVisible(false)}
                disabled={savingPwd}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitBtn}
                onPress={handleSavePassword}
                disabled={savingPwd}
              >
                {savingPwd ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Update Password</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 16,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 10,
  },
  tableScroll: {
    flex: 1,
    paddingHorizontal: 24,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  tdWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tdText: {
    fontSize: 14,
    color: '#0F172A',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  adminName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  adminEmail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: '#DCFCE7',
  },
  badgeInactive: {
    backgroundColor: '#F1F5F9',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextActive: {
    color: '#15803D',
  },
  badgeTextInactive: {
    color: '#64748B',
  },
  tableActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  tableActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  tableActionBtnDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  tableActionBtnDangerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  mobileCardList: {
    gap: 12,
  },
  mobileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  mobileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mobileMetaGrid: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  mobileMetaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mobileMetaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  mobileMetaValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    maxWidth: '60%',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardActionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cardActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  cardActionBtnDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  cardActionBtnDangerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
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
    maxWidth: 520,
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
  modalBody: {
    maxHeight: 440,
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
  restSelectScroll: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  restChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 8,
    backgroundColor: '#F8FAFC',
  },
  restChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  restChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  restChipTextActive: {
    color: '#FFFFFF',
  },
  cyclePill: {
    paddingHorizontal: 14,
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
});
