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
import {
  isValidEmail,
  normalizeEmail,
  isValidIndianPhone,
  normalizeIndianPhone,
  getEmailValidationError,
  getIndianPhoneValidationError,
} from '../../src/utils/validation';

export default function RestaurantAdminsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [allAdmins, setAllAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Provision Admin Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetRestaurantId, setTargetRestaurantId] = useState('');
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false);
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formEmailTouched, setFormEmailTouched] = useState(false);
  const [formPhoneTouched, setFormPhoneTouched] = useState(false);
  const [formFullNameTouched, setFormFullNameTouched] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Edit Admin Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<any | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRestaurantId, setEditRestaurantId] = useState('');
  const [editDropdownOpen, setEditDropdownOpen] = useState(false);
  const [editIsActive, setEditIsActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editPhoneTouched, setEditPhoneTouched] = useState(false);
  const [editSubmitted, setEditSubmitted] = useState(false);

  // Change Password Modal State
  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [pwdAdmin, setPwdAdmin] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
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

  const resetProvisionForm = () => {
    setFormFullName('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setShowFormPassword(false);
    setFormEmailTouched(false);
    setFormPhoneTouched(false);
    setFormFullNameTouched(false);
    setFormSubmitted(false);
    setTargetDropdownOpen(false);
  };

  const handleCreateAdmin = async () => {
    setFormSubmitted(true);

    if (!formFullName.trim()) {
      Alert.alert('Validation Error', 'Admin full name is required.');
      return;
    }

    if (!targetRestaurantId) {
      Alert.alert('Validation Error', 'Please select a target restaurant.');
      return;
    }

    if (!isValidEmail(formEmail)) {
      Alert.alert('Validation Error', 'Enter a valid email address.');
      return;
    }

    if (formPhone.trim() && !isValidIndianPhone(formPhone)) {
      Alert.alert('Validation Error', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }

    const cleanEmail = normalizeEmail(formEmail);
    const cleanName = formFullName.trim();
    const cleanPhone = formPhone.trim() ? normalizeIndianPhone(formPhone) : undefined;

    setSaving(true);
    try {
      await superAdminService.createRestaurantAdmin({
        restaurant_id: targetRestaurantId,
        full_name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        password: formPassword.trim() || undefined,
      });

      Alert.alert('Success', `Admin account created immediately without OTP/email verification. Login is active.`);
      setModalVisible(false);
      resetProvisionForm();
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
    setEditDropdownOpen(false);
    setEditIsActive(admin.is_active ?? true);
    setEditPhoneTouched(false);
    setEditSubmitted(false);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    setEditSubmitted(true);
    if (!selectedAdmin || !editFullName.trim() || !editRestaurantId) {
      Alert.alert('Validation Error', 'Full Name and Restaurant assignment are required.');
      return;
    }

    if (editPhone.trim() && !isValidIndianPhone(editPhone)) {
      Alert.alert('Validation Error', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }

    const cleanPhone = editPhone.trim() ? normalizeIndianPhone(editPhone) : undefined;

    setSavingEdit(true);
    try {
      await superAdminService.updateRestaurantAdmin({
        membership_id: selectedAdmin.id,
        user_id: selectedAdmin.user_id,
        restaurant_id: editRestaurantId,
        full_name: editFullName.trim(),
        phone: cleanPhone,
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
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={[
                    styles.dropdownTrigger,
                    targetDropdownOpen && styles.dropdownTriggerOpen,
                  ]}
                  onPress={() => setTargetDropdownOpen(!targetDropdownOpen)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropdownValueRow}>
                    <Text style={{ fontSize: 14 }}>🏢</Text>
                    <Text
                      style={[
                        styles.dropdownValueText,
                        !targetRestaurantId && styles.dropdownPlaceholderText,
                      ]}
                      numberOfLines={1}
                    >
                      {restaurants.find((r) => r.id === targetRestaurantId)?.name || 'Select a restaurant...'}
                    </Text>
                  </View>
                  <Text style={styles.dropdownChevron}>
                    {targetDropdownOpen ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {targetDropdownOpen && (
                  <View style={styles.dropdownListContainer}>
                    <ScrollView
                      style={styles.dropdownScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={true}
                    >
                      {restaurants.map((r) => {
                        const isSelected = targetRestaurantId === r.id;
                        return (
                          <TouchableOpacity
                            key={r.id}
                            style={[
                              styles.dropdownItem,
                              isSelected && styles.dropdownItemSelected,
                            ]}
                            onPress={() => {
                              setTargetRestaurantId(r.id);
                              setTargetDropdownOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={styles.dropdownItemContent}>
                              <Text style={{ fontSize: 13 }}>🏢</Text>
                              <Text
                                style={[
                                  styles.dropdownItemText,
                                  isSelected && styles.dropdownItemTextSelected,
                                ]}
                                numberOfLines={1}
                              >
                                {r.name}
                              </Text>
                            </View>
                            {isSelected && (
                              <Text style={styles.dropdownItemCheck}>✓</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

              <Text style={styles.label}>Admin Full Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  (formFullNameTouched || formSubmitted) && !formFullName.trim() && styles.inputError,
                ]}
                placeholder="e.g. John Doe"
                value={formFullName}
                onChangeText={(v) => {
                  setFormFullName(v);
                  if (formSubmitted) setFormSubmitted(false);
                }}
                onBlur={() => setFormFullNameTouched(true)}
              />
              {(formFullNameTouched || formSubmitted) && !formFullName.trim() && (
                <Text style={styles.fieldErrorText}>⚠️ Full Name is required</Text>
              )}

              <Text style={styles.label}>Admin Email *</Text>
              <TextInput
                style={[
                  styles.input,
                  Boolean((formEmailTouched || formSubmitted) && getEmailValidationError(formEmail, true)) &&
                    styles.inputError,
                ]}
                placeholder="admin@restaurant.com"
                value={formEmail}
                onChangeText={(v) => {
                  setFormEmail(v);
                  if (formSubmitted) setFormSubmitted(false);
                }}
                onBlur={() => setFormEmailTouched(true)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {Boolean((formEmailTouched || formSubmitted) && getEmailValidationError(formEmail, true)) && (
                <Text style={styles.fieldErrorText}>
                  ⚠️ {getEmailValidationError(formEmail, true)}
                </Text>
              )}

              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={[
                  styles.input,
                  Boolean((formPhoneTouched || formSubmitted) && getIndianPhoneValidationError(formPhone, false)) &&
                    styles.inputError,
                ]}
                placeholder="+91 98765 43210"
                value={formPhone}
                onChangeText={(v) => {
                  setFormPhone(v);
                  if (formSubmitted) setFormSubmitted(false);
                }}
                onBlur={() => setFormPhoneTouched(true)}
                keyboardType="phone-pad"
              />
              {Boolean((formPhoneTouched || formSubmitted) && getIndianPhoneValidationError(formPhone, false)) && (
                <Text style={styles.fieldErrorText}>
                  ⚠️ {getIndianPhoneValidationError(formPhone, false)}
                </Text>
              )}

              <Text style={styles.label}>Initial Password</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter initial password (min 6 chars)"
                  placeholderTextColor="#94A3B8"
                  value={formPassword}
                  onChangeText={setFormPassword}
                  secureTextEntry={!showFormPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowFormPassword(!showFormPassword)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>{showFormPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setModalVisible(false);
                  resetProvisionForm();
                }}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  (!Boolean(formFullName.trim()) ||
                    !Boolean(targetRestaurantId) ||
                    !isValidEmail(formEmail) ||
                    Boolean(formPhone.trim() && !isValidIndianPhone(formPhone)) ||
                    saving) &&
                    styles.submitBtnDisabled,
                ]}
                onPress={handleCreateAdmin}
                disabled={
                  !Boolean(formFullName.trim()) ||
                  !Boolean(targetRestaurantId) ||
                  !isValidEmail(formEmail) ||
                  Boolean(formPhone.trim() && !isValidIndianPhone(formPhone)) ||
                  saving
                }
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
                style={[
                  styles.input,
                  (editSubmitted) && !editFullName.trim() && styles.inputError,
                ]}
                value={editFullName}
                onChangeText={(v) => {
                  setEditFullName(v);
                  if (editSubmitted) setEditSubmitted(false);
                }}
                placeholder="Admin Full Name"
              />
              {editSubmitted && !editFullName.trim() && (
                <Text style={styles.fieldErrorText}>⚠️ Full Name is required</Text>
              )}

              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={[
                  styles.input,
                  Boolean((editPhoneTouched || editSubmitted) && getIndianPhoneValidationError(editPhone, false)) &&
                    styles.inputError,
                ]}
                value={editPhone}
                onChangeText={(v) => {
                  setEditPhone(v);
                  if (editSubmitted) setEditSubmitted(false);
                }}
                onBlur={() => setEditPhoneTouched(true)}
                keyboardType="phone-pad"
                placeholder="+91 98765 43210"
              />
              {Boolean((editPhoneTouched || editSubmitted) && getIndianPhoneValidationError(editPhone, false)) && (
                <Text style={styles.fieldErrorText}>
                  ⚠️ {getIndianPhoneValidationError(editPhone, false)}
                </Text>
              )}

              <Text style={styles.label}>Assigned Restaurant *</Text>
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={[
                    styles.dropdownTrigger,
                    editDropdownOpen && styles.dropdownTriggerOpen,
                  ]}
                  onPress={() => setEditDropdownOpen(!editDropdownOpen)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropdownValueRow}>
                    <Text style={{ fontSize: 14 }}>🏢</Text>
                    <Text
                      style={[
                        styles.dropdownValueText,
                        !editRestaurantId && styles.dropdownPlaceholderText,
                      ]}
                      numberOfLines={1}
                    >
                      {restaurants.find((r) => r.id === editRestaurantId)?.name || 'Select a restaurant...'}
                    </Text>
                  </View>
                  <Text style={styles.dropdownChevron}>
                    {editDropdownOpen ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {editDropdownOpen && (
                  <View style={styles.dropdownListContainer}>
                    <ScrollView
                      style={styles.dropdownScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={true}
                    >
                      {restaurants.map((r) => {
                        const isSelected = editRestaurantId === r.id;
                        return (
                          <TouchableOpacity
                            key={r.id}
                            style={[
                              styles.dropdownItem,
                              isSelected && styles.dropdownItemSelected,
                            ]}
                            onPress={() => {
                              setEditRestaurantId(r.id);
                              setEditDropdownOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={styles.dropdownItemContent}>
                              <Text style={{ fontSize: 13 }}>🏢</Text>
                              <Text
                                style={[
                                  styles.dropdownItemText,
                                  isSelected && styles.dropdownItemTextSelected,
                                ]}
                                numberOfLines={1}
                              >
                                {r.name}
                              </Text>
                            </View>
                            {isSelected && (
                              <Text style={styles.dropdownItemCheck}>✓</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>

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
                style={[
                  styles.submitBtn,
                  (!Boolean(editFullName.trim()) ||
                    !Boolean(editRestaurantId) ||
                    Boolean(editPhone.trim() && !isValidIndianPhone(editPhone)) ||
                    savingEdit) &&
                    styles.submitBtnDisabled,
                ]}
                onPress={handleSaveEdit}
                disabled={
                  !Boolean(editFullName.trim()) ||
                  !Boolean(editRestaurantId) ||
                  Boolean(editPhone.trim() && !isValidIndianPhone(editPhone)) ||
                  savingEdit
                }
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
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter new strong password"
                  placeholderTextColor="#94A3B8"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>{showNewPassword ? '👁️' : '👁️‍🗨️'}</Text>
                </TouchableOpacity>
              </View>
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
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingRight: 40,
    fontSize: 14,
    color: '#0F172A',
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
  dropdownContainer: {
    width: '100%',
    marginBottom: 12,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  dropdownTriggerOpen: {
    borderColor: colors.primary,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  dropdownValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  dropdownValueText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  dropdownPlaceholderText: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  dropdownChevron: {
    fontSize: 11,
    color: '#64748B',
    marginLeft: 8,
    fontWeight: '700',
  },
  dropdownListContainer: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
    maxHeight: 180,
  },
  dropdownScroll: {
    maxHeight: 180,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemSelected: {
    backgroundColor: '#F0F9FF',
  },
  dropdownItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
  },
  dropdownItemTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  dropdownItemCheck: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
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
  submitBtnDisabled: {
    opacity: 0.5,
    backgroundColor: '#94A3B8',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  inputError: {
    borderColor: '#DC2626',
    borderWidth: 1.5,
  },
  fieldErrorText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
    marginTop: 3,
    marginBottom: 6,
  },
});
