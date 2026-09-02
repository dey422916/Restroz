import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { RestaurantSettings } from '../types';
import { settingsService } from '../services/api/settingsService';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useAuth } from './AuthContext';

interface SettingsContextType {
  settings: RestaurantSettings;
  updateSettings: (newSettings: Partial<RestaurantSettings>) => Promise<RestaurantSettings>;
  refreshSettings: () => Promise<RestaurantSettings>;
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
  });
  const [loading, setLoading] = useState<boolean>(true);

  const fetchLatestSettings = useCallback(async () => {
    try {
      const s = await settingsService.getSettings(activeRestaurantId);
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
      };
      setSettings(merged);
      return merged;
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, activeRestaurant]);

  useEffect(() => {
    fetchLatestSettings();

    // Supabase Realtime subscription on restaurant_settings table for active restaurant
    if (isSupabaseConfigured && activeRestaurantId) {
      const channel = supabase
        .channel(`public:restaurant_settings:${activeRestaurantId}`)
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

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchLatestSettings, activeRestaurantId, activeRestaurant]);

  const updateSettings = async (newSettings: Partial<RestaurantSettings>): Promise<RestaurantSettings> => {
    const updated = await settingsService.saveSettings(newSettings, activeRestaurantId);
    setSettings(updated);
    return updated;
  };

  const refreshSettings = async (): Promise<RestaurantSettings> => {
    setLoading(true);
    return fetchLatestSettings();
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, refreshSettings, loading }}>
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

