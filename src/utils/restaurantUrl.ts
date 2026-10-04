import { Platform, Linking, Alert } from 'react-native';

/**
 * Returns the public online-ordering website URL for a given restaurant slug or ID.
 */
export function getRestaurantOnlineOrderingUrl(slugOrId?: string | null): string {
  if (!slugOrId) return '';
  const clean = slugOrId.trim();

  let origin = 'https://restroz.shop';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    origin = window.location.origin;
  } else if (process.env.EXPO_PUBLIC_APP_URL) {
    origin = process.env.EXPO_PUBLIC_APP_URL.replace(/\/+$/, '');
  }

  return `${origin}/r/${clean}`;
}

/**
 * Copies a given restaurant URL to clipboard across Web and Native platforms.
 */
export async function copyRestaurantUrlToClipboard(url: string): Promise<boolean> {
  if (!url) return false;

  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      } else if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return Boolean(successful);
      }
    } else {
      // Native fallback: using Linking or alert
      Alert.alert('Online Ordering Website', url);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard copy error:', err);
  }
  return false;
}

/**
 * Opens the restaurant ordering website in a new browser tab or via Linking.
 */
export function openRestaurantWebsite(slugOrId?: string | null): void {
  const url = getRestaurantOnlineOrderingUrl(slugOrId);
  if (!url) return;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank');
  } else {
    Linking.openURL(url).catch((err) => {
      console.warn('Failed to open restaurant URL:', err);
    });
  }
}
