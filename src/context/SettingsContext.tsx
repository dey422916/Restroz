import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { RestaurantSettings } from '../types';
import { settingsService } from '../services/api/settingsService';
import { marketplaceService } from '../services/api/marketplaceService';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useAuth } from './AuthContext';

interface SettingsContextType {
  settings: RestaurantSettings;
  updateSettings: (newSettings: Partial<RestaurantSettings>) => Promise<RestaurantSettings>;
  refreshSettings: () => Promise<RestaurantSettings>;
  isOnlineOrdersEnabled: boolean;
  toggleOnlineOrders: (enabled: boolean) => Promise<boolean>;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeRestaurantId, activeRestaurant } = useAuth();

  const [settings, setSettings] = useState<RestaurantSettings>({
    id: activeRestaurantId || 'rest-1',
    name: activeRestaurant?.name || 'Restaurant POS',
    legal_name: activeRestaurant?.name || 'Restaurant POS Pvt Ltd',
    address: activeRestaurant?.address || 'Main Road',
    phone: activeRestaurant?.phone || '+91 9876543210',
    email: activeRestaurant?.email || 'contact@restaurant.com',
    gstin: '36AAAAA0000A1Z5',
    state: 'West Bengal',
    logo_url: activeRestaurant?.logo_url || '',
    invoice_prefix: 'INV-',
    kot_prefix: 'KOT-',
    default_tax_rate: 5.0,
    currency: 'INR',
    currency_symbol: '₹',
    service_charge_rate: 0.0,
    online_orders_enabled: true,
  });
  const [isOnlineOrdersEnabled, setIsOnlineOrdersEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchLatestSettings = useCallback(async () => {
    try {
      const [s, onlineStatus] = await Promise.all([
        settingsService.getSettings(activeRestaurantId),
        activeRestaurantId
          ? marketplaceService.getRestaurantOnlineStatus(activeRestaurantId)
          : Promise.resolve(true),
      ]);

      setIsOnlineOrdersEnabled(onlineStatus);

      // Ensure activeRestaurant's name, logo, and banner override default if settings record is fresh
      const merged: RestaurantSettings = {
        ...s,
        name: activeRestaurant?.name || s.name || 'Restaurant POS',
        logo_url: activeRestaurant?.logo_url || s.logo_url || '',
        phone: activeRestaurant?.phone || s.phone || '',
        address: activeRestaurant?.address || s.address || '',
        banner_url: s.banner_url || '',
        banner_urls: s.banner_urls || [],
        gallery_urls: s.gallery_urls || [],
        restaurant_id: activeRestaurantId,
        online_orders_enabled: onlineStatus,
      };
      setSettings(merged);
      return merged;
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, activeRestaurant]);

  useEffect(() => {
    fetchLatestSettings();

    // Supabase Realtime subscription on restaurant_settings & restaurant_public_profiles for active restaurant
    if (isSupabaseConfigured && activeRestaurantId) {
      const settingsChName = `sub_settings_${activeRestaurantId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const profileChName = `sub_pub_prof_${activeRestaurantId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const settingsChannel = supabase
        .channel(settingsChName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'restaurant_settings',
            filter: `restaurant_id=eq.${activeRestaurantId}`,
          },
          (payload) => {
            if (payload.new && (payload.new as any).id) {
              setSettings((prev) => ({
                ...prev,
                ...(payload.new as RestaurantSettings),
                name: activeRestaurant?.name || (payload.new as any).name || prev.name,
              }));
            }
          }
        )
        .subscribe();

      const profileChannel = supabase
        .channel(profileChName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'restaurant_public_profiles',
            filter: `restaurant_id=eq.${activeRestaurantId}`,
          },
          (payload) => {
            if (payload.new && (payload.new as any).restaurant_id) {
              const newIsOpen =
                (payload.new as any).is_open !== false &&
                (payload.new as any).marketplace_enabled !== false;
              setIsOnlineOrdersEnabled(newIsOpen);
              setSettings((prev) => ({
                ...prev,
                online_orders_enabled: newIsOpen,
              }));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(settingsChannel);
        supabase.removeChannel(profileChannel);
      };
    }
  }, [fetchLatestSettings, activeRestaurantId, activeRestaurant]);

  const updateSettings = async (newSettings: Partial<RestaurantSettings>): Promise<RestaurantSettings> => {
    const updated = await settingsService.saveSettings(newSettings, activeRestaurantId);
    setSettings(updated);
    return updated;
  };

  const toggleOnlineOrders = async (enabled: boolean): Promise<boolean> => {
    if (!activeRestaurantId) return enabled;
    // Optimistic UI update
    setIsOnlineOrdersEnabled(enabled);
    setSettings((prev) => ({ ...prev, online_orders_enabled: enabled }));

    try {
      await marketplaceService.setRestaurantOnlineStatus(activeRestaurantId, enabled);
      return enabled;
    } catch (e) {
      // Revert if failed
      setIsOnlineOrdersEnabled(!enabled);
      setSettings((prev) => ({ ...prev, online_orders_enabled: !enabled }));
      throw e;
    }
  };

  const refreshSettings = async (): Promise<RestaurantSettings> => {
    setLoading(true);
    return fetchLatestSettings();
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        refreshSettings,
        isOnlineOrdersEnabled,
        toggleOnlineOrders,
        loading,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

