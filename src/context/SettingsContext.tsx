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
  const { activeRestaurantId, activeRestaurant, user } = useAuth();

  const [settings, setSettings] = useState<RestaurantSettings>({
    id: activeRestaurantId || '',
    name: activeRestaurant?.name || 'Restaurant POS',
    legal_name: activeRestaurant?.legal_name || activeRestaurant?.name || 'Restaurant POS Pvt Ltd',
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

  // Keep a ref to activeRestaurant to avoid re-triggering effects when object identity changes
  const activeRestaurantRef = React.useRef(activeRestaurant);
  useEffect(() => {
    activeRestaurantRef.current = activeRestaurant;
  }, [activeRestaurant]);

  const isMountedRef = React.useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchLatestSettings = useCallback(async (targetRestId?: string) => {
    const idToFetch = targetRestId || activeRestaurantId;
    if (!idToFetch || !user?.id) {
      setLoading(false);
      return;
    }
    try {
      const [s, onlineStatus] = await Promise.all([
        settingsService.getSettings(idToFetch),
        marketplaceService.getRestaurantOnlineStatus(idToFetch),
      ]);

      if (!isMountedRef.current) return;

      setIsOnlineOrdersEnabled(onlineStatus);

      setSettings((prev) => ({
        ...prev,
        ...s,
        name: activeRestaurantRef.current?.name || s.name || prev.name || 'Restaurant POS',
        legal_name: s.legal_name || activeRestaurantRef.current?.legal_name || s.name || activeRestaurantRef.current?.name || prev.legal_name || '',
        email: s.email || activeRestaurantRef.current?.email || prev.email || '',
        logo_url: activeRestaurantRef.current?.logo_url || s.logo_url || prev.logo_url || '',
        phone: activeRestaurantRef.current?.phone || s.phone || prev.phone || '',
        address: activeRestaurantRef.current?.address || s.address || prev.address || '',
        banner_url: s.banner_url || prev.banner_url || '',
        banner_urls: s.banner_urls && s.banner_urls.length > 0 ? s.banner_urls : (prev.banner_urls || []),
        gallery_urls: s.gallery_urls && s.gallery_urls.length > 0 ? s.gallery_urls : (prev.gallery_urls || []),
        restaurant_id: idToFetch,
        online_orders_enabled: onlineStatus,
      }));
    } catch (e) {
      console.warn('SettingsContext fetch error:', e);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [activeRestaurantId, user?.id]);

  useEffect(() => {
    if (!activeRestaurantId || !user?.id) {
      setLoading(false);
      return;
    }

    // Initial fetch once per restaurant
    fetchLatestSettings(activeRestaurantId);

    // Exactly one single Realtime channel per activeRestaurantId
    if (isSupabaseConfigured) {
      const channelName = `realtime_settings_${activeRestaurantId}`;
      const channel = supabase
        .channel(channelName)
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
              const newRec = payload.new as any;
              setSettings((prev) => ({
                ...prev,
                ...newRec,
                name: activeRestaurantRef.current?.name || newRec.name || prev.name,
                default_tax_rate: newRec.default_tax_rate !== undefined ? Number(newRec.default_tax_rate) : prev.default_tax_rate,
                tax_rate: newRec.tax_rate !== undefined ? Number(newRec.tax_rate) : prev.tax_rate,
                cgst_rate: newRec.cgst_rate !== undefined ? Number(newRec.cgst_rate) : prev.cgst_rate,
                sgst_rate: newRec.sgst_rate !== undefined ? Number(newRec.sgst_rate) : prev.sgst_rate,
                gstin: newRec.gstin !== undefined ? newRec.gstin : prev.gstin,
                auto_print_kot: newRec.kot_auto_print !== undefined ? Boolean(newRec.kot_auto_print) : prev.auto_print_kot,
              }));
            }
          }
        )
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
              const newRec = payload.new as any;
              const newIsOpen =
                newRec.is_open !== false &&
                newRec.marketplace_enabled !== false;
              setIsOnlineOrdersEnabled(newIsOpen);
              setSettings((prev) => ({
                ...prev,
                online_orders_enabled: newIsOpen,
                minimum_order_value: newRec.minimum_order_value !== undefined && newRec.minimum_order_value !== null ? Number(newRec.minimum_order_value) : prev.minimum_order_value,
                min_order_value: newRec.minimum_order_value !== undefined && newRec.minimum_order_value !== null ? Number(newRec.minimum_order_value) : prev.min_order_value,
                delivery_charge_base: newRec.delivery_charge_base !== undefined && newRec.delivery_charge_base !== null ? Number(newRec.delivery_charge_base) : prev.delivery_charge_base,
                free_delivery_above: newRec.free_delivery_above !== undefined && newRec.free_delivery_above !== null ? Number(newRec.free_delivery_above) : prev.free_delivery_above,
                enable_cod: newRec.enable_cod !== undefined ? Boolean(newRec.enable_cod) : prev.enable_cod,
                delivery_payment_qr_url: newRec.delivery_payment_qr_url !== undefined ? newRec.delivery_payment_qr_url : prev.delivery_payment_qr_url,
                delivery_upi_id: newRec.delivery_upi_id !== undefined ? newRec.delivery_upi_id : prev.delivery_upi_id,
                delivery_sample_screenshot_url: newRec.delivery_sample_screenshot_url !== undefined ? newRec.delivery_sample_screenshot_url : prev.delivery_sample_screenshot_url,
              }));
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [activeRestaurantId, user?.id, fetchLatestSettings]);

  const updateSettings = async (newSettings: Partial<RestaurantSettings>): Promise<RestaurantSettings> => {
    const updated = await settingsService.saveSettings(newSettings, activeRestaurantId);
    setSettings(updated);
    if (activeRestaurantRef.current) {
      activeRestaurantRef.current = {
        ...activeRestaurantRef.current,
        ...(newSettings.name ? { name: newSettings.name } : {}),
        ...(newSettings.legal_name ? { legal_name: newSettings.legal_name } : {}),
        ...(newSettings.email !== undefined ? { email: newSettings.email } : {}),
        ...(newSettings.phone !== undefined ? { phone: newSettings.phone } : {}),
        ...(newSettings.address !== undefined ? { address: newSettings.address } : {}),
      };
    }
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
    await fetchLatestSettings();
    return settings;
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

