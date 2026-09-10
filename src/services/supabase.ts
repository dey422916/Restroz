import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const PROD_SUPABASE_PROJECT_ID = 'szpjsibrwxegaopcaukb';
const PROD_SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV || (typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing required Supabase environment variables: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be defined in your environment (.env.development or .env.production).'
  );
}

// Development Safety Guard: Refuse to start development/preview builds if pointing to production Supabase
const isDevMode = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
if (isDevMode && (SUPABASE_URL.includes(PROD_SUPABASE_PROJECT_ID) || SUPABASE_URL === PROD_SUPABASE_URL)) {
  if (APP_ENV !== 'production') {
    throw new Error(
      `[RESTROZ SAFETY GUARD] Development build is configured with the PRODUCTION Supabase URL (${PROD_SUPABASE_URL}). ` +
      'To protect production data, development and preview builds require the DEV Supabase project URL in .env.development.'
    );
  }
}

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Manage token auto-refresh when app transitions between active and background states
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

