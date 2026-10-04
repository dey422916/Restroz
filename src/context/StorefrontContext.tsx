import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Restaurant, RestaurantPublicProfile } from '../types';
import { marketplaceService } from '../services/api/marketplaceService';

export type StorefrontMode = 'marketplace' | 'dedicated';

interface StorefrontContextType {
  mode: StorefrontMode;
  isDedicated: boolean;
  dedicatedSlug: string | null;
  dedicatedRestaurantId: string | null;
  dedicatedRestaurant: (Restaurant & { public_profile?: RestaurantPublicProfile }) | null;
  setDedicatedMode: (slugOrId: string, restaurantObj?: (Restaurant & { public_profile?: RestaurantPublicProfile }) | null) => void;
  setMarketplaceMode: () => void;
  getMenuRoute: () => string;
}

const STORAGE_MODE_KEY = '@restroz_storefront_mode';
const STORAGE_SLUG_KEY = '@restroz_storefront_slug';
const STORAGE_REST_ID_KEY = '@restroz_storefront_rest_id';

const StorefrontContext = createContext<StorefrontContextType | undefined>(undefined);

export const StorefrontProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<StorefrontMode>('marketplace');
  const [dedicatedSlug, setDedicatedSlug] = useState<string | null>(null);
  const [dedicatedRestaurantId, setDedicatedRestaurantId] = useState<string | null>(null);
  const [dedicatedRestaurant, setDedicatedRestaurant] = useState<
    (Restaurant & { public_profile?: RestaurantPublicProfile }) | null
  >(null);

  // Restore persisted mode on startup
  useEffect(() => {
    const initMode = async () => {
      try {
        let storedMode: string | null = null;
        let storedSlug: string | null = null;
        let storedRestId: string | null = null;

        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
          storedMode = window.sessionStorage.getItem(STORAGE_MODE_KEY);
          storedSlug = window.sessionStorage.getItem(STORAGE_SLUG_KEY);
          storedRestId = window.sessionStorage.getItem(STORAGE_REST_ID_KEY);
        }

        if (!storedMode) {
          storedMode = await AsyncStorage.getItem(STORAGE_MODE_KEY);
          storedSlug = await AsyncStorage.getItem(STORAGE_SLUG_KEY);
          storedRestId = await AsyncStorage.getItem(STORAGE_REST_ID_KEY);
        }

        // Also check window pathname on web for direct URL landing
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const path = window.location.pathname || '';
          const matchR = path.match(/^\/r\/([^\/?#]+)/i);
          const matchRest = path.match(/^\/restaurant\/([^\/?#]+)/i);
          const activeSlugOrId = matchR ? matchR[1] : matchRest ? matchRest[1] : null;

          if (activeSlugOrId) {
            storedMode = 'dedicated';
            storedSlug = activeSlugOrId;
          }
        }

        if (storedMode === 'dedicated' && (storedSlug || storedRestId)) {
          const target = storedSlug || storedRestId!;
          setMode('dedicated');
          setDedicatedSlug(storedSlug || null);
          setDedicatedRestaurantId(storedRestId || null);

          // Preload restaurant details
          marketplaceService.getRestaurantPublicDetails(target).then((rest) => {
            if (rest) {
              setDedicatedRestaurant(rest);
              setDedicatedRestaurantId(rest.id);
              if (rest.slug) setDedicatedSlug(rest.slug);
            }
          }).catch((err) => console.warn('[StorefrontContext] Failed to load details:', err));
        }
      } catch (err) {
        console.warn('[StorefrontContext] Init error:', err);
      }
    };

    initMode();
  }, []);

  const setDedicatedMode = useCallback(
    (slugOrId: string, restaurantObj?: (Restaurant & { public_profile?: RestaurantPublicProfile }) | null) => {
      if (!slugOrId) return;
      const clean = slugOrId.trim();
      setMode('dedicated');
      setDedicatedSlug(clean);

      if (restaurantObj) {
        setDedicatedRestaurant(restaurantObj);
        setDedicatedRestaurantId(restaurantObj.id);
        if (restaurantObj.slug) setDedicatedSlug(restaurantObj.slug);
      } else {
        // Resolve asynchronously if not provided
        marketplaceService.getRestaurantPublicDetails(clean).then((rest) => {
          if (rest) {
            setDedicatedRestaurant(rest);
            setDedicatedRestaurantId(rest.id);
            if (rest.slug) setDedicatedSlug(rest.slug);
          }
        }).catch(console.warn);
      }

      // Persist
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(STORAGE_MODE_KEY, 'dedicated');
        window.sessionStorage.setItem(STORAGE_SLUG_KEY, clean);
        if (restaurantObj?.id) window.sessionStorage.setItem(STORAGE_REST_ID_KEY, restaurantObj.id);
      }
      AsyncStorage.setItem(STORAGE_MODE_KEY, 'dedicated').catch(() => {});
      AsyncStorage.setItem(STORAGE_SLUG_KEY, clean).catch(() => {});
      if (restaurantObj?.id) AsyncStorage.setItem(STORAGE_REST_ID_KEY, restaurantObj.id).catch(() => {});
    },
    []
  );

  const setMarketplaceMode = useCallback(() => {
    setMode('marketplace');
    setDedicatedSlug(null);
    setDedicatedRestaurantId(null);
    setDedicatedRestaurant(null);

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(STORAGE_MODE_KEY);
      window.sessionStorage.removeItem(STORAGE_SLUG_KEY);
      window.sessionStorage.removeItem(STORAGE_REST_ID_KEY);
    }
    AsyncStorage.removeItem(STORAGE_MODE_KEY).catch(() => {});
    AsyncStorage.removeItem(STORAGE_SLUG_KEY).catch(() => {});
    AsyncStorage.removeItem(STORAGE_REST_ID_KEY).catch(() => {});
  }, []);

  const getMenuRoute = useCallback(() => {
    if (dedicatedSlug) {
      return `/restaurant/${encodeURIComponent(dedicatedSlug)}`;
    }
    if (dedicatedRestaurantId) {
      return `/restaurant/${encodeURIComponent(dedicatedRestaurantId)}`;
    }
    return '/(marketplace)';
  }, [dedicatedSlug, dedicatedRestaurantId]);

  const value = useMemo<StorefrontContextType>(
    () => ({
      mode,
      isDedicated: mode === 'dedicated',
      dedicatedSlug,
      dedicatedRestaurantId,
      dedicatedRestaurant,
      setDedicatedMode,
      setMarketplaceMode,
      getMenuRoute,
    }),
    [mode, dedicatedSlug, dedicatedRestaurantId, dedicatedRestaurant, setDedicatedMode, setMarketplaceMode, getMenuRoute]
  );

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
};

export const useStorefront = (): StorefrontContextType => {
  const ctx = useContext(StorefrontContext);
  if (!ctx) {
    throw new Error('useStorefront must be used within a StorefrontProvider');
  }
  return ctx;
};
