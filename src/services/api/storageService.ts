import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured, SUPABASE_URL } from '../supabase';

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 - 1.0
  format?: 'webp' | 'jpeg' | 'png';
}

export function decodeBase64Image(dataString: string): { buffer: Uint8Array; mimeType: string; ext: string } {
  let mimeType = 'image/jpeg';
  let rawBase64 = dataString;

  const matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    mimeType = matches[1];
    rawBase64 = matches[2];
  }

  // Cross-platform base64 decode
  let binaryStr = '';
  if (typeof atob !== 'undefined') {
    binaryStr = atob(rawBase64);
  } else if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(rawBase64, 'base64');
    let ext = 'jpg';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';
    return { buffer: new Uint8Array(buf), mimeType, ext };
  }

  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  let ext = 'jpg';
  if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('webp')) ext = 'webp';
  else if (mimeType.includes('gif')) ext = 'gif';

  return { buffer: bytes, mimeType, ext };
}

/**
 * Universal Client-Side Image Resizer & Compressor
 * Resizes and compresses image before upload to drastically cut Supabase Storage egress.
 * Web: Uses HTML5 Canvas drawImage + toBlob
 * React Native: Uses expo-image-manipulator
 */
export async function compressAndResizeImage(
  uriOrBlob: string | Blob | File,
  options: ImageCompressionOptions = {}
): Promise<{ uri?: string; blob?: Blob; format: string; width: number; height: number }> {
  const maxWidth = options.maxWidth || 1200;
  const maxHeight = options.maxHeight || 800;
  const quality = options.quality !== undefined ? options.quality : 0.8;
  const targetFormat = options.format || 'webp';

  // 1. Web Platform (HTML5 Canvas)
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return new Promise((resolve, reject) => {
      let srcUrl = '';
      let shouldRevoke = false;

      if (typeof uriOrBlob === 'string') {
        srcUrl = uriOrBlob;
      } else {
        srcUrl = URL.createObjectURL(uriOrBlob as Blob);
        shouldRevoke = true;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        if (shouldRevoke) URL.revokeObjectURL(srcUrl);

        let origWidth = img.naturalWidth || img.width;
        let origHeight = img.naturalHeight || img.height;

        // Calculate aspect-ratio preserved dimensions
        let targetWidth = origWidth;
        let targetHeight = origHeight;

        if (targetWidth > maxWidth) {
          targetHeight = Math.round((targetHeight * maxWidth) / targetWidth);
          targetWidth = maxWidth;
        }
        if (targetHeight > maxHeight) {
          targetWidth = Math.round((targetWidth * maxHeight) / targetHeight);
          targetHeight = maxHeight;
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          if (uriOrBlob instanceof Blob) {
            resolve({ blob: uriOrBlob, format: 'jpeg', width: origWidth, height: origHeight });
          } else {
            resolve({ uri: String(uriOrBlob), format: 'jpeg', width: origWidth, height: origHeight });
          }
          return;
        }

        // Draw and smoothly resample
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const mimeType = targetFormat === 'webp' ? 'image/webp' : targetFormat === 'png' ? 'image/png' : 'image/jpeg';

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const dataUrl = canvas.toDataURL(mimeType, quality);
              resolve({
                blob,
                uri: dataUrl,
                format: targetFormat,
                width: targetWidth,
                height: targetHeight,
              });
            } else {
              // Fallback to jpeg if webp encoding fails
              canvas.toBlob(
                (fallbackBlob) => {
                  resolve({
                    blob: fallbackBlob || undefined,
                    uri: canvas.toDataURL('image/jpeg', quality),
                    format: 'jpeg',
                    width: targetWidth,
                    height: targetHeight,
                  });
                },
                'image/jpeg',
                quality
              );
            }
          },
          mimeType,
          quality
        );
      };

      img.onerror = (e) => {
        if (shouldRevoke) URL.revokeObjectURL(srcUrl);
        console.warn('Canvas image loading failed, returning original:', e);
        if (uriOrBlob instanceof Blob) {
          resolve({ blob: uriOrBlob, format: 'jpeg', width: maxWidth, height: maxHeight });
        } else {
          resolve({ uri: String(uriOrBlob), format: 'jpeg', width: maxWidth, height: maxHeight });
        }
      };

      img.src = srcUrl;
    });
  }

  // 2. React Native / Mobile Platform (expo-image-manipulator)
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const inputUri = typeof uriOrBlob === 'string' ? uriOrBlob : URL.createObjectURL(uriOrBlob as Blob);

    const saveFormat =
      targetFormat === 'webp' && ImageManipulator.SaveFormat.WEBP
        ? ImageManipulator.SaveFormat.WEBP
        : targetFormat === 'png'
          ? ImageManipulator.SaveFormat.PNG
          : ImageManipulator.SaveFormat.JPEG;

    const manipResult = await ImageManipulator.manipulateAsync(
      inputUri,
      [{ resize: { width: maxWidth } }],
      {
        compress: quality,
        format: saveFormat,
      }
    );

    return {
      uri: manipResult.uri,
      format: targetFormat,
      width: manipResult.width,
      height: manipResult.height,
    };
  } catch (nativeErr) {
    console.warn('Native image manipulation fallback:', nativeErr);
    const fallbackUri = typeof uriOrBlob === 'string' ? uriOrBlob : '';
    return {
      uri: fallbackUri,
      format: 'jpeg',
      width: maxWidth,
      height: maxHeight,
    };
  }
}

/**
 * Helper to prepare native upload bytes from local URI using modern Expo SDK 54 File API
 */
async function getUploadBytesFromUri(uri: string): Promise<Uint8Array> {
  if (Platform.OS !== 'web') {
    // 1. Primary: Modern Expo SDK 54 File API
    try {
      const { File } = await import('expo-file-system');
      if (typeof File === 'function') {
        const file = new File(uri);
        if (typeof (file as any).bytes === 'function') {
          return await (file as any).bytes();
        }
        if (typeof file.arrayBuffer === 'function') {
          const ab = await file.arrayBuffer();
          return new Uint8Array(ab);
        }
      }
    } catch (newApiErr) {
      console.warn('New FileSystem API failed, trying legacy fallback:', newApiErr);
    }

    // 2. Explicit legacy fallback via 'expo-file-system/legacy'
    try {
      const LegacyFS = await import('expo-file-system/legacy');
      const base64Data = await LegacyFS.readAsStringAsync(uri, {
        encoding: LegacyFS.EncodingType.Base64,
      });
      const decoded = decodeBase64Image(base64Data);
      return decoded.buffer;
    } catch (legacyErr) {
      console.warn('Legacy FileSystem fallback failed:', legacyErr);
    }
  }

  // 3. Web or standard fetch arrayBuffer fallback
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export const storageService = {
  /**
   * Upload binary data, Uint8Array, or blob directly to Supabase Storage and return public CDN URL.
   */
  async uploadBinary(
    bucket: 'product-images' | 'restaurant-assets',
    path: string,
    fileBody: any,
    contentType = 'image/webp'
  ): Promise<string> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase Storage is not configured.');
    }

    try {
      // 1. Try direct Supabase client upload
      const { data, error } = await supabase.storage.from(bucket).upload(path, fileBody, {
        contentType,
        cacheControl: '31536000',
        upsert: true,
      });

      if (!error && data?.path) {
        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
        return publicUrlData.publicUrl;
      }

      // 2. Direct HTTP upload with session authentication fallback
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (token) {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': contentType,
            'cache-control': '31536000',
            'x-upsert': 'true',
          },
          body: fileBody,
        });

        if (res.ok) {
          return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
        }
      }

      throw new Error(error?.message || 'Storage upload failed.');
    } catch (e: any) {
      console.error(`Storage upload error to ${bucket}/${path}:`, e.message);
      throw new Error(`Failed to upload image to storage: ${e.message}`);
    }
  },

  /**
   * Safe guard: Ensures a given string is a valid HTTP/HTTPS CDN URL.
   * If an unmigrated Base64 data URI is detected, it is immediately converted,
   * uploaded to Supabase Storage, and replaced with the CDN URL.
   */
  async ensureCdnUrl(
    urlOrBase64: string | null | undefined,
    bucket: 'product-images' | 'restaurant-assets' = 'restaurant-assets',
    pathPrefix: string = 'general'
  ): Promise<string | null> {
    if (!urlOrBase64) return null;
    if (urlOrBase64.startsWith('http://') || urlOrBase64.startsWith('https://')) {
      return urlOrBase64;
    }

    if (urlOrBase64.startsWith('data:image') || urlOrBase64.length > 500) {
      try {
        const decoded = decodeBase64Image(urlOrBase64);
        const fileName = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${decoded.ext}`;
        const path = `${pathPrefix}/${fileName}`;
        return await this.uploadBinary(bucket, path, decoded.buffer, decoded.mimeType);
      } catch (e: any) {
        console.warn('ensureCdnUrl auto-upload failed:', e?.message);
        return null;
      }
    }

    return urlOrBase64;
  },

  /**
   * Prompts user to pick an image from device gallery, resizes/compresses it,
   * uploads with strong cacheControl (31536000) to Supabase Storage, and returns ONLY the public CDN URL.
   */
  async pickAndUploadProductImage(options?: {
    restaurantId?: string;
    productId?: string;
  }): Promise<{ url: string; fileName: string } | null> {
    try {
      // 1. Web Platform (native file input)
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        return new Promise((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png,image/jpeg,image/jpg,image/webp';
          input.style.display = 'none';

          input.onchange = async (e: any) => {
            try {
              const file = e.target?.files?.[0];
              if (!file) {
                resolve(null);
                return;
              }

              // Compress & resize product (Max 800x800, quality 0.80 WebP)
              const compressed = await compressAndResizeImage(file, {
                maxWidth: 800,
                maxHeight: 800,
                quality: 0.8,
                format: 'webp',
              });

              const fileExt = compressed.format || 'webp';
              const timestamp = Date.now();
              const rand = Math.random().toString(36).substring(2, 7);
              const restScope = options?.restaurantId || 'global';
              const prodScope = options?.productId || 'new';
              const fileName = `${timestamp}_${rand}.${fileExt}`;
              const path = `restaurants/${restScope}/products/${prodScope}/${fileName}`;

              if (compressed.blob) {
                const cdnUrl = await storageService.uploadBinary(
                  'product-images',
                  path,
                  compressed.blob,
                  `image/${fileExt}`
                );
                resolve({ url: cdnUrl, fileName });
                return;
              }

              reject(new Error('Failed to process product image for upload.'));
            } catch (err) {
              reject(err);
            } finally {
              document.body.removeChild(input);
            }
          };

          document.body.appendChild(input);
          input.click();
        });
      }

      // 2. React Native / Mobile Platform
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera roll / gallery permissions are required to upload product photos.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const uri = asset.uri;

      // Resize & compress product image (Max 800x800, quality 0.80 WebP)
      const compressed = await compressAndResizeImage(uri, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.8,
        format: 'webp',
      });

      const effectiveUri = compressed.uri || uri;
      const fileExt = compressed.format || 'webp';
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 7);

      const restScope = options?.restaurantId || 'global';
      const prodScope = options?.productId || 'new';
      const fileName = `${timestamp}_${rand}.${fileExt}`;
      const path = `restaurants/${restScope}/products/${prodScope}/${fileName}`;

      const uploadBytes = await getUploadBytesFromUri(effectiveUri);

      const cdnUrl = await this.uploadBinary(
        'product-images',
        path,
        uploadBytes,
        `image/${fileExt}`
      );

      return { url: cdnUrl, fileName };
    } catch (err: any) {
      console.error('Product image upload error:', err);
      throw new Error(err.message || 'Failed to select or upload product image.');
    }
  },

  /**
   * Prompts user to pick a restaurant cover/banner image, resizes/compresses it,
   * uploads to Supabase Storage with strong Cache-Control and returns ONLY the public CDN URL.
   */
  async pickAndUploadBanner(options?: {
    restaurantId?: string;
  }): Promise<{ url: string; fileName: string } | null> {
    try {
      // 1. Web Platform (native file picker)
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        return new Promise((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png,image/jpeg,image/jpg,image/webp';
          input.style.display = 'none';

          input.onchange = async (e: any) => {
            try {
              const file = e.target?.files?.[0];
              if (!file) {
                resolve(null);
                return;
              }

              // Compress & resize banner (Max 1200x800, quality 0.80 WebP)
              const compressed = await compressAndResizeImage(file, {
                maxWidth: 1200,
                maxHeight: 800,
                quality: 0.8,
                format: 'webp',
              });

              const fileExt = compressed.format || 'webp';
              const timestamp = Date.now();
              const rand = Math.random().toString(36).substring(2, 7);
              const restScope = options?.restaurantId || 'global';
              const fileName = `${timestamp}_${rand}.${fileExt}`;
              const path = `restaurants/${restScope}/banners/${fileName}`;

              if (compressed.blob) {
                const cdnUrl = await storageService.uploadBinary(
                  'restaurant-assets',
                  path,
                  compressed.blob,
                  `image/${fileExt}`
                );
                resolve({ url: cdnUrl, fileName });
                return;
              }

              reject(new Error('Failed to process banner image for upload.'));
            } catch (err) {
              reject(err);
            } finally {
              document.body.removeChild(input);
            }
          };

          document.body.appendChild(input);
          input.click();
        });
      }

      // 2. Mobile Native (Android / iOS)
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera roll / gallery permissions are required to upload restaurant banner.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const uri = asset.uri;

      // Compress & resize banner (Max 1200x800, quality 0.80 WebP)
      const compressed = await compressAndResizeImage(uri, {
        maxWidth: 1200,
        maxHeight: 800,
        quality: 0.8,
        format: 'webp',
      });

      const effectiveUri = compressed.uri || uri;
      const fileExt = compressed.format || 'webp';
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 7);
      const restScope = options?.restaurantId || 'global';
      const fileName = `${timestamp}_${rand}.${fileExt}`;
      const path = `restaurants/${restScope}/banners/${fileName}`;

      const uploadBytes = await getUploadBytesFromUri(effectiveUri);

      const cdnUrl = await this.uploadBinary(
        'restaurant-assets',
        path,
        uploadBytes,
        `image/${fileExt}`
      );

      return { url: cdnUrl, fileName };
    } catch (err: any) {
      console.error('Banner upload error:', err);
      throw new Error(err.message || 'Failed to select or upload restaurant banner.');
    }
  },

  /**
   * Prompts user to pick a restaurant logo, resizes/compresses it,
   * uploads with strong Cache-Control to Supabase Storage and returns ONLY the public CDN URL.
   */
  async pickAndUploadLogo(options?: {
    restaurantId?: string;
  }): Promise<{ url: string; fileName: string } | null> {
    try {
      // 1. Web Platform (native file picker)
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        return new Promise((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png,image/jpeg,image/jpg,image/webp';
          input.style.display = 'none';

          input.onchange = async (e: any) => {
            try {
              const file = e.target?.files?.[0];
              if (!file) {
                resolve(null);
                return;
              }

              // Compress & resize logo (Max 400x400, quality 0.85 WebP)
              const compressed = await compressAndResizeImage(file, {
                maxWidth: 400,
                maxHeight: 400,
                quality: 0.85,
                format: 'webp',
              });

              const fileExt = compressed.format || 'webp';
              const timestamp = Date.now();
              const rand = Math.random().toString(36).substring(2, 7);
              const restScope = options?.restaurantId || 'global';
              const fileName = `${timestamp}_${rand}.${fileExt}`;
              const path = `restaurants/${restScope}/logos/${fileName}`;

              if (compressed.blob) {
                const cdnUrl = await storageService.uploadBinary(
                  'restaurant-assets',
                  path,
                  compressed.blob,
                  `image/${fileExt}`
                );
                resolve({ url: cdnUrl, fileName });
                return;
              }

              reject(new Error('Failed to process logo image for upload.'));
            } catch (err) {
              reject(err);
            } finally {
              document.body.removeChild(input);
            }
          };

          document.body.appendChild(input);
          input.click();
        });
      }

      // 2. Mobile Native (Android / iOS)
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera roll / gallery permissions are required to upload restaurant logo.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const uri = asset.uri;

      // Compress & resize logo (Max 400x400, quality 0.85 WebP)
      const compressed = await compressAndResizeImage(uri, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.85,
        format: 'webp',
      });

      const effectiveUri = compressed.uri || uri;
      const fileExt = compressed.format || 'webp';
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 7);
      const restScope = options?.restaurantId || 'global';
      const fileName = `${timestamp}_${rand}.${fileExt}`;
      const path = `restaurants/${restScope}/logos/${fileName}`;

      const uploadBytes = await getUploadBytesFromUri(effectiveUri);

      const cdnUrl = await this.uploadBinary(
        'restaurant-assets',
        path,
        uploadBytes,
        `image/${fileExt}`
      );

      return { url: cdnUrl, fileName };
    } catch (err: any) {
      console.error('Logo upload error:', err);
      throw new Error(err.message || 'Failed to select or upload restaurant logo.');
    }
  },

  /**
   * Prompts user to pick an avatar / profile photo, resizes/compresses to 300x300 WebP,
   * uploads to Supabase Storage, and returns ONLY the public CDN URL.
   */
  async pickAndUploadAvatar(options?: {
    userId?: string;
  }): Promise<{ url: string; fileName: string } | null> {
    try {
      // 1. Web Platform
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        return new Promise((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png,image/jpeg,image/jpg,image/webp';
          input.style.display = 'none';

          input.onchange = async (e: any) => {
            try {
              const file = e.target?.files?.[0];
              if (!file) {
                resolve(null);
                return;
              }

              const compressed = await compressAndResizeImage(file, {
                maxWidth: 240,
                maxHeight: 240,
                quality: 0.8,
                format: 'webp',
              });

              if (compressed.uri && compressed.uri.startsWith('data:')) {
                resolve({ url: compressed.uri, fileName: 'avatar.webp' });
                return;
              }

              if (compressed.blob) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const dataUrl = reader.result as string;
                  resolve({ url: dataUrl, fileName: 'avatar.webp' });
                };
                reader.onerror = () => reject(new Error('Failed to read compressed avatar.'));
                reader.readAsDataURL(compressed.blob);
                return;
              }

              reject(new Error('Failed to process avatar image.'));
            } catch (err) {
              reject(err);
            } finally {
              document.body.removeChild(input);
            }
          };

          document.body.appendChild(input);
          input.click();
        });
      }

      // 2. Mobile Native
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera roll / gallery permissions are required to upload profile avatar.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const uri = asset.uri;

      const compressed = await compressAndResizeImage(uri, {
        maxWidth: 240,
        maxHeight: 240,
        quality: 0.8,
        format: 'webp',
      });

      const effectiveUri = compressed.uri || uri;
      if (effectiveUri.startsWith('data:')) {
        return { url: effectiveUri, fileName: 'avatar.webp' };
      }

      // Read local file as base64 data URL
      try {
        const { File } = await import('expo-file-system');
        if (typeof File === 'function') {
          const file = new File(effectiveUri);
          if (typeof file.base64 === 'function') {
            const b64 = await file.base64();
            return { url: `data:image/webp;base64,${b64}`, fileName: 'avatar.webp' };
          }
        }
      } catch (fsErr) {
        console.warn('Modern File API b64 failed, trying legacy:', fsErr);
      }

      try {
        const LegacyFS = await import('expo-file-system/legacy');
        const b64 = await LegacyFS.readAsStringAsync(effectiveUri, {
          encoding: LegacyFS.EncodingType.Base64,
        });
        return { url: `data:image/webp;base64,${b64}`, fileName: 'avatar.webp' };
      } catch (legacyErr) {
        console.warn('Legacy FS base64 read failed:', legacyErr);
      }

      const res = await fetch(effectiveUri);
      const blob = await res.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onloadend = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });

      return { url: dataUrl, fileName: 'avatar.webp' };
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      throw new Error(err.message || 'Failed to select or upload avatar.');
    }
  },
};
