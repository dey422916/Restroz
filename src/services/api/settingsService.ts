import AsyncStorage from '@react-native-async-storage/async-storage';
import { RestaurantSettings, PaperSize } from '../../types';
import { mockStorage } from '../mockStorage';
import { supabase, isSupabaseConfigured } from '../supabase';
import { DEFAULT_RESTAURANT_ID } from './restaurantService';
import { parseBannerUrls } from '../../utils/mediaUtils';

const STORAGE_KEY_PRINTER_PREFIX = '@restaurant_printer_settings_';

const RESTAURANT_SETTINGS_COLUMNS = new Set([
  'id',
  'restaurant_id',
  'name',
  'legal_name',
  'address',
  'phone',
  'email',
  'gstin',
  'state',
  'logo_url',
  'invoice_prefix',
  'kot_prefix',
  'default_tax_rate',
  'currency',
  'currency_symbol',
  'service_charge_rate',
  'next_order_seq',
  'kot_paper_size',
  'bill_paper_size',
  'auto_print_kot',
  'created_at',
  'updated_at',
]);

function cleanLogoOnly(rawLogoUrl?: string | null): string {
  if (!rawLogoUrl) return '';
  return rawLogoUrl.split('#printer=')[0].trim();
}

export const settingsService = {
  async getPublicRestaurantInfo(restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Partial<RestaurantSettings>> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('get_public_restaurant_info', {
          p_restaurant_id: restaurantId,
        });
        if (!error && data) {
          return data as Partial<RestaurantSettings>;
        }
      } catch (err) {
        console.warn('get_public_restaurant_info RPC failed:', err);
      }
    }
    return this.getSettings(restaurantId);
  },

  async getSettings(restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<RestaurantSettings> {
    // 0. Load local printer settings cache if available
    let localPrinterSettings: { kot_paper_size?: PaperSize; bill_paper_size?: PaperSize; auto_print_kot?: boolean } | null = null;
    try {
      const cachedStr = await AsyncStorage.getItem(`${STORAGE_KEY_PRINTER_PREFIX}${restaurantId}`);
      if (cachedStr) {
        localPrinterSettings = JSON.parse(cachedStr);
      }
    } catch (e) {
      // ignore
    }

    if (isSupabaseConfigured) {
      try {
        // 1. Query tenant-specific settings record
        let { data, error } = await supabase
          .from('restaurant_settings')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .maybeSingle();

        // Fallback for initial legacy migration
        if (!data) {
          const fallback = await supabase
            .from('restaurant_settings')
            .select('*')
            .eq('id', 'rest-1')
            .maybeSingle();
          if (fallback.data) {
            data = fallback.data;
          }
        }

        // 2. Query restaurant record to get latest banner_url and logo_url
        let bannerUrl = '';
        let bannerUrls: string[] = [];
        let restName = '';
        let restLogo = '';
        let restPhone = '';
        let restAddress = '';

        const { data: restData } = await supabase
          .from('restaurants')
          .select('banner_url, logo_url, name, phone, address')
          .eq('id', restaurantId)
          .maybeSingle();

        if (restData) {
          bannerUrl = restData.banner_url || '';
          bannerUrls = parseBannerUrls(restData.banner_url);
          restName = restData.name || '';
          restLogo = restData.logo_url || '';
          restPhone = restData.phone || '';
          restAddress = restData.address || '';
        }

        // Extract printer settings directly from Supabase columns or local cache
        const resolvedKotPaper: PaperSize = (data?.kot_paper_size || localPrinterSettings?.kot_paper_size || '80mm') as PaperSize;
        const resolvedBillPaper: PaperSize = (data?.bill_paper_size || localPrinterSettings?.bill_paper_size || '80mm') as PaperSize;
        const resolvedAutoPrint: boolean = data?.auto_print_kot !== undefined && data?.auto_print_kot !== null
          ? Boolean(data.auto_print_kot)
          : (localPrinterSettings?.auto_print_kot !== undefined ? localPrinterSettings.auto_print_kot : false);

        // Sync local cache with Supabase values
        AsyncStorage.setItem(
          `${STORAGE_KEY_PRINTER_PREFIX}${restaurantId}`,
          JSON.stringify({
            kot_paper_size: resolvedKotPaper,
            bill_paper_size: resolvedBillPaper,
            auto_print_kot: resolvedAutoPrint,
          })
        ).catch(() => {});

        const cleanLogo = cleanLogoOnly(restLogo || data?.logo_url || '');

        if (data) {
          const loaded: RestaurantSettings = {
            ...mockStorage.getSettings(),
            ...data,
            name: restName || data.name || 'Restaurant POS',
            logo_url: cleanLogo,
            phone: restPhone || data.phone || '',
            address: restAddress || data.address || '',
            banner_url: bannerUrl,
            banner_urls: bannerUrls,
            gallery_urls: bannerUrls,
            restaurant_id: data.restaurant_id || restaurantId,
            kot_paper_size: resolvedKotPaper,
            bill_paper_size: resolvedBillPaper,
            auto_print_kot: resolvedAutoPrint,
          };
          mockStorage.saveSettings(loaded);
          return loaded;
        } else if (restData) {
          const loaded: RestaurantSettings = {
            ...mockStorage.getSettings(),
            id: 'rest-' + restaurantId,
            name: restName || 'Restaurant POS',
            logo_url: cleanLogo,
            phone: restPhone || '',
            address: restAddress || '',
            banner_url: bannerUrl,
            banner_urls: bannerUrls,
            gallery_urls: bannerUrls,
            restaurant_id: restaurantId,
            kot_paper_size: resolvedKotPaper,
            bill_paper_size: resolvedBillPaper,
            auto_print_kot: resolvedAutoPrint,
          };
          mockStorage.saveSettings(loaded);
          return loaded;
        }
      } catch (e) {
        console.warn('Supabase getSettings fallback to local cache:', e);
      }
    }

    const localSettings = mockStorage.getSettings();
    return {
      ...localSettings,
      kot_paper_size: localPrinterSettings?.kot_paper_size || localSettings.kot_paper_size || '80mm',
      bill_paper_size: localPrinterSettings?.bill_paper_size || localSettings.bill_paper_size || '80mm',
      auto_print_kot: localPrinterSettings?.auto_print_kot !== undefined ? localPrinterSettings.auto_print_kot : (localSettings.auto_print_kot || false),
    };
  },

  async saveSettings(
    settings: Partial<RestaurantSettings>,
    restaurantId: string = DEFAULT_RESTAURANT_ID
  ): Promise<RestaurantSettings> {
    const current = await this.getSettings(restaurantId);
    const updated: RestaurantSettings = { ...current, ...settings, restaurant_id: restaurantId };

    const targetKotPaper = updated.kot_paper_size || '80mm';
    const targetBillPaper = updated.bill_paper_size || '80mm';
    const targetAutoPrint = Boolean(updated.auto_print_kot);

    // Save to local AsyncStorage cache for instant response
    try {
      await AsyncStorage.setItem(
        `${STORAGE_KEY_PRINTER_PREFIX}${restaurantId}`,
        JSON.stringify({
          kot_paper_size: targetKotPaper,
          bill_paper_size: targetBillPaper,
          auto_print_kot: targetAutoPrint,
        })
      );
    } catch (e) {
      console.warn('Failed to cache printer settings locally:', e);
    }

    // Format banner payload for restaurants & public profiles
    let bannerPayload: string | undefined = undefined;
    if (settings.banner_urls !== undefined) {
      bannerPayload = settings.banner_urls.length > 0 ? JSON.stringify(settings.banner_urls) : '';
    } else if (settings.banner_url !== undefined) {
      bannerPayload = settings.banner_url;
    }

    if (isSupabaseConfigured) {
      // 1. Update restaurants table (banner_url, logo_url, name, phone, address)
      const restUpdates: Record<string, any> = {};
      if (bannerPayload !== undefined) restUpdates.banner_url = bannerPayload || null;
      if (settings.logo_url !== undefined) restUpdates.logo_url = settings.logo_url || null;
      if (settings.name !== undefined) restUpdates.name = settings.name;
      if (settings.phone !== undefined) restUpdates.phone = settings.phone;
      if (settings.address !== undefined) restUpdates.address = settings.address;

      if (Object.keys(restUpdates).length > 0) {
        try {
          await supabase.from('restaurants').update(restUpdates).eq('id', restaurantId);
        } catch (rErr) {
          console.warn('Failed to update restaurants table:', rErr);
        }
      }

      // 2. Update restaurant_public_profiles table with banner_url
      if (bannerPayload !== undefined) {
        try {
          await supabase
            .from('restaurant_public_profiles')
            .update({ banner_url: bannerPayload || null })
            .eq('restaurant_id', restaurantId);
        } catch (pErr) {
          console.warn('Failed to update restaurant_public_profiles banner_url:', pErr);
        }
      }

      // 3. Prepare payload for restaurant_settings table in Supabase
      const { id, created_at, updated_at, ...fieldsToUpdate } = updated;
      const sanitizedSettingsPayload: Record<string, any> = {};
      Object.entries(fieldsToUpdate).forEach(([key, val]) => {
        if (val !== undefined && RESTAURANT_SETTINGS_COLUMNS.has(key)) {
          sanitizedSettingsPayload[key] = val;
        }
      });
      sanitizedSettingsPayload.restaurant_id = restaurantId;
      sanitizedSettingsPayload.updated_at = new Date().toISOString();

      // Ensure logo_url contains only pure logo data/URL (no #printer data)
      const pureLogoUrl = cleanLogoOnly(settings.logo_url !== undefined ? settings.logo_url : current.logo_url);
      sanitizedSettingsPayload.logo_url = pureLogoUrl || null;
      sanitizedSettingsPayload.kot_paper_size = targetKotPaper;
      sanitizedSettingsPayload.bill_paper_size = targetBillPaper;
      sanitizedSettingsPayload.auto_print_kot = targetAutoPrint;

      let targetId = current.id;
      let query;
      if (targetId && !targetId.startsWith('rest-')) {
        query = supabase
          .from('restaurant_settings')
          .update(sanitizedSettingsPayload)
          .eq('id', targetId)
          .select()
          .single();
      } else {
        query = supabase
          .from('restaurant_settings')
          .upsert({ ...sanitizedSettingsPayload, restaurant_id: restaurantId }, { onConflict: 'restaurant_id' })
          .select()
          .single();
      }

      let { data, error } = await query;

      // If database does not yet have kot_paper_size columns (PGRST204), retry omitting native columns
      if (error && error.code === 'PGRST204') {
        delete sanitizedSettingsPayload.kot_paper_size;
        delete sanitizedSettingsPayload.bill_paper_size;
        delete sanitizedSettingsPayload.auto_print_kot;
        if (targetId && !targetId.startsWith('rest-')) {
          query = supabase
            .from('restaurant_settings')
            .update(sanitizedSettingsPayload)
            .eq('id', targetId)
            .select()
            .single();
        } else {
          query = supabase
            .from('restaurant_settings')
            .upsert({ ...sanitizedSettingsPayload, restaurant_id: restaurantId }, { onConflict: 'restaurant_id' })
            .select()
            .single();
        }
        const retry = await query;
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        console.error('Supabase restaurant_settings error:', error);
      }

      const cleanLogo = (settings.logo_url || current.logo_url || '').split('#printer=')[0];
      const parsedBanners = parseBannerUrls(bannerPayload !== undefined ? bannerPayload : current.banner_url);
      const persisted: RestaurantSettings = {
        ...current,
        ...(data || {}),
        ...settings,
        logo_url: cleanLogo,
        banner_url: bannerPayload !== undefined ? bannerPayload : current.banner_url,
        banner_urls: parsedBanners,
        gallery_urls: parsedBanners,
        kot_paper_size: targetKotPaper,
        bill_paper_size: targetBillPaper,
        auto_print_kot: targetAutoPrint,
      };
      mockStorage.saveSettings(persisted);
      return persisted;
    }

    mockStorage.saveSettings(updated);
    return updated;
  },
};

