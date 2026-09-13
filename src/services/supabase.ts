import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const PROD_SUPABASE_PROJECT_ID = 'szpjsibrwxegaopcaukb';
const PROD_SUPABASE_URL = 'https://szpjsibrwxegaopcaukb.supabase.co';

// Sanitize inputs (strip whitespace and accidental surrounding quotes)
const rawUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
const rawAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');
const rawAppEnv = (process.env.EXPO_PUBLIC_APP_ENV || (typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production')).trim().replace(/^["']|["']$/g, '');

export const SUPABASE_URL = rawUrl;
export const SUPABASE_ANON_KEY = rawAnonKey;
export const APP_ENV = rawAppEnv;

// Startup Validation & Diagnostic Checks
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '[RESTROZ STARTUP ERROR] Missing required Supabase environment variables: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be defined in your environment.'
  );
}

if (
  SUPABASE_URL.includes('<') ||
  SUPABASE_URL.includes('>') ||
  SUPABASE_URL.includes('your-') ||
  SUPABASE_ANON_KEY.includes('<') ||
  SUPABASE_ANON_KEY.includes('>') ||
  SUPABASE_ANON_KEY.includes('your-')
) {
  throw new Error(
    '[RESTROZ CONFIG ERROR] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY contains placeholder values. Ensure eas.json or .env contains valid Supabase project credentials.'
  );
}

try {
  const parsed = new URL(SUPABASE_URL);
  if (!parsed.protocol || !['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('Invalid protocol or hostname');
  }
} catch {
  throw new Error(
    '[RESTROZ CONFIG ERROR] EXPO_PUBLIC_SUPABASE_URL is malformed. Expected valid absolute HTTPS URL (e.g. https://<project-ref>.supabase.co).'
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
