import { Platform, Linking, Alert } from 'react-native';

/**
 * Returns the canonical public online-ordering website URL for a given restaurant slug or ID.
 * Always resolves to https://restroz.shop/r/<slug> in production or when forceProduction is true.
 * Never uses localhost for production sharing or QR generation.
 */
export function getRestaurantOnlineOrderingUrl(
  slugOrId?: string | null,
  forceProduction = false
): string {
  if (!slugOrId) return '';
  const clean = slugOrId.trim();

  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location?.hostname === 'localhost' ||
      window.location?.hostname === '127.0.0.1' ||
      window.location?.hostname?.endsWith('.local'));

  let origin = 'https://restroz.shop';
  if (!forceProduction && !isLocalhost && Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    origin = window.location.origin;
  } else if (!forceProduction && !isLocalhost && process.env.EXPO_PUBLIC_APP_URL) {
    origin = process.env.EXPO_PUBLIC_APP_URL.replace(/\/+$/, '');
  }

  return `${origin}/r/${clean}`;
}

/**
 * Returns the standardized downloadable QR filename for a restaurant:
 * restroz-<restaurant-slug>-ordering-qr.png
 * Example: restroz-panch-phoron-ordering-qr.png
 */
export function getRestaurantQrFilename(
  slugOrId?: string | null,
  restaurantName?: string
): string {
  const raw = slugOrId || restaurantName || 'restaurant';
  const cleanSlug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `restroz-${cleanSlug || 'restaurant'}-ordering-qr.png`;
}

/**
 * Generates a high-resolution (default 1024x1024) PNG base64 Data URL for the restaurant's dedicated URL.
 * Works seamlessly across Web (HTML5 canvas) and Node/Native (pure JS PNG writer).
 * Strictly encodes the canonical production URL (https://restroz.shop/r/<slug>).
 */
export async function generateRestaurantQrDataUrl(
  slugOrId?: string | null,
  options?: { size?: number }
): Promise<string> {
  const url = getRestaurantOnlineOrderingUrl(slugOrId, true);
  if (!url) throw new Error('Cannot generate QR code: restaurant URL is empty');

  const size = options?.size ?? 1024;

  // On Web, use QRCode.toDataURL which renders cleanly to hidden HTML5 canvas
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(url, {
      width: size,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  }

  // Pure JS Matrix + PNG writer (works in Node and React Native without DOM)
  const QRCode = require('qrcode');
  const { PNG } = require('pngjs');
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const modCount = modules.size;
  const marginModules = 4;
  const totalModules = modCount + marginModules * 2;
  const scale = size / totalModules;

  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / scale) - marginModules;
    for (let x = 0; x < size; x++) {
      const c = Math.floor(x / scale) - marginModules;
      const isDark = r >= 0 && r < modCount && c >= 0 && c < modCount && modules.get(r, c);
      const idx = (y * size + x) * 4;
      const color = isDark ? 0 : 255;
      png.data[idx] = color;
      png.data[idx + 1] = color;
      png.data[idx + 2] = color;
      png.data[idx + 3] = 255;
    }
  }

  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/**
 * Downloads a high-resolution 1024x1024 PNG QR code for the restaurant's dedicated ordering website.
 * Filename: restroz-<slug>-ordering-qr.png
 */
export async function downloadRestaurantQrCode(
  slugOrId?: string | null,
  restaurantName?: string
): Promise<{ success: boolean; fileName: string; url: string; error?: string }> {
  const url = getRestaurantOnlineOrderingUrl(slugOrId, true);
  const fileName = getRestaurantQrFilename(slugOrId, restaurantName);

  if (!url) {
    Alert.alert('Error', 'Unable to resolve restaurant website URL.');
    return { success: false, fileName, url: '', error: 'Missing URL' };
  }

  try {
    const dataUrl = await generateRestaurantQrDataUrl(slugOrId, { size: 1024 });

    // Web browser download
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return { success: true, fileName, url };
    }

    // Native Android / iOS save or share
    const rawBase64 = dataUrl.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
    let fileUri: string | null = null;

    try {
      const LegacyFS = await import('expo-file-system/legacy');
      const cacheDir = LegacyFS.cacheDirectory || LegacyFS.documentDirectory || '';
      const target = `${cacheDir}${fileName}`;
      await LegacyFS.writeAsStringAsync(target, rawBase64, {
        encoding: LegacyFS.EncodingType.Base64,
      });
      fileUri = target;
    } catch (_) {
      try {
        const { File, Paths } = await import('expo-file-system');
        if (typeof File === 'function' && Paths && Paths.cache) {
          const file = new File(Paths.cache, fileName);
          if (file.exists) file.delete();
          file.create();
          file.write(rawBase64, { encoding: 'base64' as any });
          fileUri = file.uri;
        }
      } catch (err2) {
        console.warn('Native file write failed:', err2);
      }
    }

    if (fileUri) {
      const Sharing = await import('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: `Download / Save ${fileName}`,
          UTI: 'public.png',
        });
        return { success: true, fileName, url };
      } else {
        Alert.alert('Download Ready', `QR code saved to: ${fileUri}`);
        return { success: true, fileName, url };
      }
    }

    throw new Error('Could not write QR code to local filesystem.');
  } catch (err: any) {
    console.warn('Download QR code error:', err);
    Alert.alert('Download Error', 'Could not generate or download QR code. Please try again.');
    return { success: false, fileName, url, error: err?.message };
  }
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
