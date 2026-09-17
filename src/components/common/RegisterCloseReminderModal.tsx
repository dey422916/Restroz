import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { registerReminderService, OverdueRegisterReminder } from '../../services/api/registerReminderService';

export const RegisterCloseReminderModal: React.FC = () => {
  const router = useRouter();
  const { user, role, activeRestaurantId, isSuperAdmin } = useAuth();

  const [reminder, setReminder] = useState<OverdueRegisterReminder | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const activeSlotRef = useRef<string | null>(null);

  const isStaffOrAdmin = role === 'ADMIN' || role === 'STAFF' || isSuperAdmin;

  const checkOverdueStatus = useCallback(async () => {
    if (!activeRestaurantId || !isStaffOrAdmin) {
      setModalVisible(false);
      setReminder(null);
      return;
    }

    try {
      const res = await registerReminderService.getOverdueReminder(activeRestaurantId);
      if (res && res.is_overdue && res.slot_key) {
        setReminder(res);
        activeSlotRef.current = res.slot_key;

        // Check if user has already dismissed this exact 15-minute slot
        const isDismissed = await registerReminderService.isSlotDismissed(
          activeRestaurantId,
          res.slot_key
        );

        if (!isDismissed) {
          setModalVisible(true);

          // Trigger native browser notification if on web & allowed
          if (Platform.OS === 'web') {
            registerReminderService.showBrowserNotification(
              res.title || 'Register Still Open',
              res.message || "Yesterday's register is still open. Please close the register to complete the business day."
            );
          }
        }
      } else {
        // Not overdue or register was closed
        setModalVisible(false);
        setReminder(null);
      }
    } catch (e) {
      console.warn('Register close reminder check failed:', e);
    }
  }, [activeRestaurantId, isStaffOrAdmin]);

  // Request browser notification permission once on mount for staff/admin
  useEffect(() => {
    if (isStaffOrAdmin && Platform.OS === 'web') {
      registerReminderService.requestBrowserNotificationPermission();
    }
  }, [isStaffOrAdmin]);

  // Periodic polling every 30 seconds to catch 15-minute slot transitions
  useEffect(() => {
    if (!activeRestaurantId || !isStaffOrAdmin) return;

    checkOverdueStatus();
    const interval = setInterval(() => {
      checkOverdueStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [activeRestaurantId, isStaffOrAdmin, checkOverdueStatus]);

  const handleDismiss = async () => {
    if (activeRestaurantId && reminder?.slot_key) {
      await registerReminderService.markSlotDismissed(activeRestaurantId, reminder.slot_key);
    }
    setModalVisible(false);
  };

  const handleCloseRegister = async () => {
    setModalVisible(false);
    if (activeRestaurantId && reminder?.slot_key) {
      await registerReminderService.markSlotDismissed(activeRestaurantId, reminder.slot_key);
    }
    // Navigate to dashboard where close register can be performed
    router.push('/(admin)/dashboard');
  };

  if (!modalVisible || !reminder?.is_overdue) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={modalVisible}
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⏰</Text>
          </View>

          <Text style={styles.title}>{reminder.title || 'Register Still Open'}</Text>
          
          <Text style={styles.message}>
            {reminder.message || "Yesterday's register is still open. Please close the register to complete the business day."}
          </Text>

          {reminder.register_date && (
            <View style={styles.metaBadge}>
              <Text style={styles.metaText}>
                Shift Date: <Text style={styles.metaBold}>{reminder.register_date}</Text>
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.dismissButton]}
              onPress={handleDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.closeRegisterButton]}
              onPress={handleCloseRegister}
              activeOpacity={0.8}
            >
              <Text style={styles.closeRegisterButtonText}>Close Register</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 99999,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderTopWidth: 4,
    borderTopColor: '#ef4444',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  metaBadge: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  metaText: {
    fontSize: 13,
    color: '#64748b',
  },
  metaBold: {
    fontWeight: '600',
    color: '#334155',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  closeRegisterButton: {
    backgroundColor: '#ef4444',
  },
  closeRegisterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});
