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

// Pure JS base64 encoder without Node Buffer dependency
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return result;
}

// Pure JS PNG encoder without Node.js 'util' or 'stream' standard libraries
function encodePureJsPng(width: number, height: number, getPixel: (x: number, y: number) => number): Uint8Array {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  function crc32(buf: Uint8Array, start: number, len: number): number {
    let c = 0xffffffff;
    for (let i = start; i < start + len; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function adler32(buf: Uint8Array): number {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length; i++) {
      a = (a + buf[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  const rawRowLen = 1 + width;
  const rawData = new Uint8Array(rawRowLen * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rawRowLen;
    rawData[rowOffset] = 0; // Filter: 0 (None)
    for (let x = 0; x < width; x++) {
      rawData[rowOffset + 1 + x] = getPixel(x, y);
    }
  }

  const maxBlockSize = 65535;
  const numBlocks = Math.ceil(rawData.length / maxBlockSize) || 1;
  const idatDataSize = 2 + (numBlocks * 5) + rawData.length + 4;
  const idatData = new Uint8Array(idatDataSize);

  idatData[0] = 0x78;
  idatData[1] = 0x01;
  let inPos = 0, outPos = 2;

  for (let b = 0; b < numBlocks; b++) {
    const isLast = (b === numBlocks - 1);
    const blockSize = Math.min(maxBlockSize, rawData.length - inPos);
    idatData[outPos++] = isLast ? 0x01 : 0x00;
    idatData[outPos++] = blockSize & 0xff;
    idatData[outPos++] = (blockSize >>> 8) & 0xff;
    const nlen = (~blockSize) & 0xffff;
    idatData[outPos++] = nlen & 0xff;
    idatData[outPos++] = (nlen >>> 8) & 0xff;
    idatData.set(rawData.subarray(inPos, inPos + blockSize), outPos);
    outPos += blockSize;
    inPos += blockSize;
  }

  const adler = adler32(rawData);
  idatData[outPos++] = (adler >>> 24) & 0xff;
  idatData[outPos++] = (adler >>> 16) & 0xff;
  idatData[outPos++] = (adler >>> 8) & 0xff;
  idatData[outPos++] = adler & 0xff;

  const totalPngLen = 8 + 25 + (12 + idatData.length) + 12;
  const png = new Uint8Array(totalPngLen);
  let p = 0;

  png.set([137, 80, 78, 71, 13, 10, 26, 10], p); p += 8;

  function writeChunk(typeStr: string, data: Uint8Array) {
    const len = data.length;
    png[p++] = (len >>> 24) & 0xff;
    png[p++] = (len >>> 16) & 0xff;
    png[p++] = (len >>> 8) & 0xff;
    png[p++] = len & 0xff;
    const typeStart = p;
    for (let i = 0; i < 4; i++) png[p++] = typeStr.charCodeAt(i);
    png.set(data, p); p += len;
    const crc = crc32(png, typeStart, 4 + len);
    png[p++] = (crc >>> 24) & 0xff;
    png[p++] = (crc >>> 16) & 0xff;
    png[p++] = (crc >>> 8) & 0xff;
    png[p++] = crc & 0xff;
  }

  const ihdr = new Uint8Array(13);
  ihdr[0] = (width >>> 24) & 0xff;
  ihdr[1] = (width >>> 16) & 0xff;
  ihdr[2] = (width >>> 8) & 0xff;
  ihdr[3] = width & 0xff;
  ihdr[4] = (height >>> 24) & 0xff;
  ihdr[5] = (height >>> 16) & 0xff;
  ihdr[6] = (height >>> 8) & 0xff;
  ihdr[7] = height & 0xff;
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 0; // Grayscale
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  writeChunk('IHDR', ihdr);

  writeChunk('IDAT', idatData);
  writeChunk('IEND', new Uint8Array(0));

  return png;
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

  // Pure JS Matrix + Zero-Dependency PNG writer (runs natively on Android & iOS without Node modules)
  const QRCode = require('qrcode');
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const modCount = modules.size;
  const marginModules = 4;
  const totalModules = modCount + marginModules * 2;
  const scale = size / totalModules;

  const pngBytes = encodePureJsPng(size, size, (x, y) => {
    const r = Math.floor(y / scale) - marginModules;
    const c = Math.floor(x / scale) - marginModules;
    const isDark = r >= 0 && r < modCount && c >= 0 && c < modCount && modules.get(r, c);
    return isDark ? 0 : 255;
  });

  return `data:image/png;base64,${uint8ArrayToBase64(pngBytes)}`;
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
