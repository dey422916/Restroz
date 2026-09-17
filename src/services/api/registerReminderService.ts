import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../supabase';

const DISMISSED_SLOT_STORAGE_KEY = '@restroz_dismissed_register_slot_';
const BROWSER_NOTIF_REQUESTED_KEY = '@restroz_browser_notif_requested';

export interface OverdueRegisterReminder {
  is_overdue: boolean;
  register_id?: string;
  restaurant_id?: string;
  register_date?: string;
  current_local_time?: string;
  slot_key?: string;
  title?: string;
  message?: string;
}

export const registerReminderService = {
  /**
   * Fetch current overdue register reminder status for the active restaurant
   */
  async getOverdueReminder(restaurantId: string): Promise<OverdueRegisterReminder> {
    if (!restaurantId || !isSupabaseConfigured) {
      return { is_overdue: false };
    }

    try {
      const { data, error } = await supabase.rpc('get_overdue_register_reminder', {
        p_restaurant_id: restaurantId,
      });

      if (!error && data) {
        return data as OverdueRegisterReminder;
      }
    } catch (e) {
      console.warn('get_overdue_register_reminder RPC error:', e);
    }

    return { is_overdue: false };
  },

  /**
   * Trigger backend reminder check (invokes Supabase Edge Function to dispatch Expo pushes)
   */
  async checkAndSendReminders(restaurantId?: string): Promise<void> {
    if (!isSupabaseConfigured) return;

    try {
      await supabase.functions.invoke('send-register-reminders', {
        body: restaurantId ? { restaurant_id: restaurantId } : {},
      });
    } catch (e) {
      console.warn('send-register-reminders function invocation error:', e);
    }
  },

  /**
   * Register push token for staff member
   */
  async registerPushToken(restaurantId: string, pushToken: string, platform: 'ios' | 'android' | 'web' | 'mobile' = 'android'): Promise<boolean> {
    if (!restaurantId || !pushToken || !isSupabaseConfigured) return false;

    try {
      const { data, error } = await supabase.rpc('register_staff_push_token', {
        p_restaurant_id: restaurantId,
        p_push_token: pushToken,
        p_platform: platform,
      });

      if (error) {
        console.warn('[PUSH_REG] register_staff_push_token RPC error:', error.message || error);
        return false;
      }

      return Boolean(data?.success);
    } catch (e: any) {
      console.warn('[PUSH_REG] register_staff_push_token exception:', e?.message || e);
      return false;
    }
  },

  /**
   * Unregister push token for staff member
   */
  async unregisterPushToken(pushToken: string): Promise<boolean> {
    if (!pushToken || !isSupabaseConfigured) return false;

    try {
      const { data, error } = await supabase.rpc('unregister_staff_push_token', {
        p_push_token: pushToken,
      });

      return !error && Boolean(data?.success);
    } catch (e) {
      console.warn('unregister_staff_push_token RPC error:', e);
      return false;
    }
  },

  /**
   * Check if the user already dismissed the reminder for the current 15-minute slot
   */
  async isSlotDismissed(restaurantId: string, slotKey: string): Promise<boolean> {
    if (!restaurantId || !slotKey) return false;
    try {
      const key = `${DISMISSED_SLOT_STORAGE_KEY}${restaurantId}`;
      const dismissedSlot = await AsyncStorage.getItem(key);
      return dismissedSlot === slotKey;
    } catch {
      return false;
    }
  },

  /**
   * Mark a 15-minute slot as dismissed by the user
   */
  async markSlotDismissed(restaurantId: string, slotKey: string): Promise<void> {
    if (!restaurantId || !slotKey) return;
    try {
      const key = `${DISMISSED_SLOT_STORAGE_KEY}${restaurantId}`;
      await AsyncStorage.setItem(key, slotKey);
    } catch (e) {
      console.warn('Failed to mark slot dismissed:', e);
    }
  },

  /**
   * Request browser notification permission once without repeated nagging
   */
  async requestBrowserNotificationPermission(): Promise<boolean> {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    try {
      if (window.Notification.permission === 'granted') {
        return true;
      }

      if (window.Notification.permission === 'denied') {
        return false;
      }

      // Check if we already asked in this session
      const alreadyAsked = await AsyncStorage.getItem(BROWSER_NOTIF_REQUESTED_KEY);
      if (alreadyAsked === 'true') {
        return false;
      }

      await AsyncStorage.setItem(BROWSER_NOTIF_REQUESTED_KEY, 'true');
      const permission = await window.Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.warn('Browser notification permission request failed:', e);
      return false;
    }
  },

  /**
   * Show native browser notification if allowed on web
   */
  showBrowserNotification(title: string, message: string): void {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    try {
      if (window.Notification.permission === 'granted') {
        new window.Notification(title, {
          body: message,
          icon: '/favicon.ico',
          tag: 'register-close-reminder',
        });
      }
    } catch (e) {
      console.warn('Failed to show browser notification:', e);
    }
  },

  /**
   * Automatically request permissions & register Expo Push Token on native mobile (iOS/Android)
   * Strictly skipped on Web and blocked for CUSTOMER accounts.
   */
  async registerMobileDevicePushToken(restaurantId: string, role?: string): Promise<boolean> {
    const normalizedRole = (role || '').toUpperCase();

    if (Platform.OS === 'web') {
      return false;
    }
    if (!restaurantId || !isSupabaseConfigured) {
      return false;
    }

    if (normalizedRole !== 'ADMIN' && normalizedRole !== 'STAFF' && normalizedRole !== 'SUPER_ADMIN') {
      return false;
    }

    try {
      const Notifications = await import('expo-notifications');
      const Constants = (await import('expo-constants')).default;

      // Check / request notification permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return false;
      }

      // Configure high-importance channel on Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('register-reminders', {
          name: 'Register Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#EF4444',
          sound: 'default',
        });
      }

      // Resolve EAS projectId from app.json / Constants
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId ??
        'b432a10d-95f1-4958-a858-7322d8591bb0';

      const tokenResult = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      const pushToken = tokenResult?.data;
      if (!pushToken) {
        return false;
      }

      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const success = await this.registerPushToken(restaurantId, pushToken, platform);

      if (success) {
        await AsyncStorage.setItem(`@restroz_registered_token_${restaurantId}`, pushToken);
      }

      return success;
    } catch (e: any) {
      console.warn('registerMobileDevicePushToken encountered error:', e?.message || e);
      return false;
    }
  },

  /**
   * Cleanup mobile push token on logout
   */
  async unregisterMobileDevicePushToken(restaurantId?: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      if (restaurantId) {
        const cached = await AsyncStorage.getItem(`@restroz_registered_token_${restaurantId}`);
        if (cached) {
          await this.unregisterPushToken(cached);
          await AsyncStorage.removeItem(`@restroz_registered_token_${restaurantId}`);
        }
      }
    } catch (e) {
      console.warn('unregisterMobileDevicePushToken failed:', e);
    }
  },
};
