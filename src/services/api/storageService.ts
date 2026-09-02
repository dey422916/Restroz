import { supabase, isSupabaseConfigured } from '../supabase';

export const storageService = {
  /**
   * Prompts user to pick an image from device gallery, validates format/size,
   * uploads to Supabase Storage, and returns the public CDN URL.
   */
  async pickAndUploadProductImage(): Promise<{ url: string; fileName: string } | null> {
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera roll / gallery permissions are required to upload product photos.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const uri = asset.uri;

      // Validate format
      const fileExt = (uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0];
      const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      if (!validExtensions.includes(fileExt)) {
        throw new Error(`Unsupported image format: .${fileExt}. Please select a JPG, PNG, or WEBP photo.`);
      }

      // Maximum 5MB check
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        throw new Error('Image size exceeds 5MB limit. Please choose a smaller image.');
      }

      const fileName = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const path = `products/${fileName}`;

      if (isSupabaseConfigured) {
        // Fetch binary data
        const response = await fetch(uri);
        const blob = await response.blob();

        const { data, error } = await supabase.storage
          .from('product-images')
          .upload(path, blob, {
            contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
            upsert: true,
          });

        if (error) {
          console.warn('Supabase storage upload error:', error.message);
          return { url: uri, fileName };
        }

        const { data: publicUrlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(data.path);

        return { url: publicUrlData.publicUrl, fileName };
      }

      return { url: uri, fileName };
    } catch (err: any) {
      console.error('Image upload error:', err);
      throw new Error(err.message || 'Failed to select or upload product image.');
    }
  },

  /**
   * Prompts user to pick a restaurant cover/banner image, validates format/size,
   * uploads to Supabase Storage (restaurant-assets / product-images) or generates a persistent Base64 URI.
   */
  async pickAndUploadBanner(): Promise<{ url: string; fileName: string } | null> {
    try {
      const { Platform } = await import('react-native');

      // 1. Direct Web Implementation (browser native file input)
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

              if (file.size > 5 * 1024 * 1024) {
                reject(new Error('Banner image size exceeds 5MB limit. Please choose a smaller image.'));
                return;
              }

              const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
              const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
              const ext = validExtensions.includes(fileExt) ? fileExt : 'jpg';
              const fileName = `banner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
              const path = `banners/${fileName}`;

              const reader = new FileReader();
              reader.onload = async () => {
                const base64Data = reader.result as string;

                if (isSupabaseConfigured) {
                  try {
                    const uploadRes = await supabase.storage
                      .from('restaurant-assets')
                      .upload(path, file, {
                        contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                        upsert: true,
                      });

                    if (!uploadRes.error) {
                      const { data: publicUrlData } = supabase.storage
                        .from('restaurant-assets')
                        .getPublicUrl(uploadRes.data.path);
                      resolve({ url: publicUrlData.publicUrl, fileName });
                      return;
                    }
                  } catch (storageErr) {
                    console.warn('Storage bucket upload failed, using persistent Base64 Data URI:', storageErr);
                  }
                }

                // Resolves with persistent Base64 data URI
                resolve({ url: base64Data, fileName });
              };

              reader.onerror = () => reject(new Error('Failed to read selected image file.'));
              reader.readAsDataURL(file);
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

      // 2. Mobile Native Implementation (Android / iOS)
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera roll / gallery permissions are required to upload restaurant banner.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const uri = asset.uri;

      // Validate format
      const fileExt = (uri.split('.').pop() || 'jpg').toLowerCase().split('?')[0].split('#')[0];
      const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      const ext = validExtensions.includes(fileExt) ? fileExt : 'jpg';

      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        throw new Error('Banner image size exceeds 5MB limit. Please choose a smaller image.');
      }

      const fileName = `banner_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const path = `banners/${fileName}`;

      let fallbackDataUri = uri;
      if (asset.base64) {
        fallbackDataUri = asset.base64.startsWith('data:')
          ? asset.base64
          : `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${asset.base64}`;
      }

      if (isSupabaseConfigured) {
        try {
          const response = await fetch(uri);
          const blob = await response.blob();

          const targetBucket = 'restaurant-assets';
          const uploadRes = await supabase.storage
            .from(targetBucket)
            .upload(path, blob, {
              contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
              upsert: true,
            });

          if (!uploadRes.error) {
            const { data: publicUrlData } = supabase.storage
              .from(targetBucket)
              .getPublicUrl(uploadRes.data.path);

            return { url: publicUrlData.publicUrl, fileName };
          }
        } catch (storageErr) {
          console.warn('Storage upload error, using fallback data URI:', storageErr);
        }

        return { url: fallbackDataUri, fileName };
      }

      return { url: fallbackDataUri, fileName };
    } catch (err: any) {
      console.error('Banner upload error:', err);
      throw new Error(err.message || 'Failed to select or upload restaurant banner.');
    }
  },

  /**
   * Prompts user to pick a restaurant logo, validates format/size,
   * uploads to Supabase Storage (restaurant-assets / product-images) or generates a persistent Base64 URI.
   */
  async pickAndUploadLogo(): Promise<{ url: string; fileName: string } | null> {
    try {
      const { Platform } = await import('react-native');

      // 1. Direct Web Implementation (browser native file input)
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

              if (file.size > 5 * 1024 * 1024) {
                reject(new Error('Logo file size exceeds 5MB limit. Please choose a smaller image.'));
                return;
              }

              const fileExt = (file.name.split('.').pop() || 'png').toLowerCase();
              const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
              const ext = validExtensions.includes(fileExt) ? fileExt : 'png';
              const fileName = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
              const path = `logos/${fileName}`;

              const reader = new FileReader();
              reader.onload = async () => {
                const base64Data = reader.result as string;

                if (isSupabaseConfigured) {
                  try {
                    const uploadRes = await supabase.storage
                      .from('restaurant-assets')
                      .upload(path, file, {
                        contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
                        upsert: true,
                      });

                    if (!uploadRes.error) {
                      const { data: publicUrlData } = supabase.storage
                        .from('restaurant-assets')
                        .getPublicUrl(uploadRes.data.path);
                      resolve({ url: publicUrlData.publicUrl, fileName });
                      return;
                    }
                  } catch (storageErr) {
                    console.warn('Storage bucket upload failed, using persistent Base64 Data URI:', storageErr);
                  }
                }

                // Resolves with persistent Base64 data URI
                resolve({ url: base64Data, fileName });
              };

              reader.onerror = () => reject(new Error('Failed to read selected image file.'));
              reader.readAsDataURL(file);
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

      // 2. Mobile Native Implementation (Android / iOS)
      const ImagePicker = await import('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Camera roll / gallery permissions are required to upload restaurant logo.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const uri = asset.uri;

      // Validate format
      const fileExt = (uri.split('.').pop() || 'png').toLowerCase().split('?')[0].split('#')[0];
      const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
      const ext = validExtensions.includes(fileExt) ? fileExt : 'png';

      // Maximum 5MB check
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        throw new Error('Logo file size exceeds 5MB limit. Please choose a smaller image.');
      }

      const fileName = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const path = `logos/${fileName}`;

      // Construct base64 fallback data URI
      let fallbackDataUri = uri;
      if (asset.base64) {
        fallbackDataUri = asset.base64.startsWith('data:')
          ? asset.base64
          : `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${asset.base64}`;
      }

      if (isSupabaseConfigured) {
        try {
          const response = await fetch(uri);
          const blob = await response.blob();

          const targetBucket = 'restaurant-assets';
          const uploadRes = await supabase.storage
            .from(targetBucket)
            .upload(path, blob, {
              contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
              upsert: true,
            });

          if (!uploadRes.error) {
            const { data: publicUrlData } = supabase.storage
              .from(targetBucket)
              .getPublicUrl(uploadRes.data.path);

            return { url: publicUrlData.publicUrl, fileName };
          }

          // Try product-images fallback bucket
          const fallbackRes = await supabase.storage
            .from('product-images')
            .upload(path, blob, {
              contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
              upsert: true,
            });

          if (!fallbackRes.error) {
            const { data: publicUrlData } = supabase.storage
              .from('product-images')
              .getPublicUrl(fallbackRes.data.path);

            return { url: publicUrlData.publicUrl, fileName };
          }
        } catch (storageErr) {
          console.warn('Direct storage bucket upload failed, using persistent base64 data URI:', storageErr);
        }

        // Return persistent base64 data URI if storage bucket RLS restricts client upload
        return { url: fallbackDataUri, fileName };
      }

      return { url: fallbackDataUri, fileName };
    } catch (err: any) {
      console.error('Logo upload error:', err);
      throw new Error(err.message || 'Failed to select or upload restaurant logo.');
    }
  },

  /**
   * Direct upload of a file blob or buffer
   */
  async uploadImage(
    bucket: 'product-images' | 'logos',
    path: string,
    fileBody: any,
    contentType = 'image/jpeg'
  ): Promise<string | null> {
    if (!isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase.storage.from(bucket).upload(path, fileBody, {
        cacheControl: '3600',
        upsert: true,
        contentType,
      });

      if (error) {
        console.error('Storage upload error:', error);
        return null;
      }

      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
      return publicUrlData.publicUrl;
    } catch (e) {
      console.error('Failed to upload file to storage:', e);
      return null;
    }
  },
};
