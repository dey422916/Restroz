import AsyncStorage from '@react-native-async-storage/async-storage';
import { RestaurantSettings, PaperSize } from '../../types';
import { mockStorage } from '../mockStorage';
import { supabase, isSupabaseConfigured } from '../supabase';
import { restaurantService } from './restaurantService';
import { parseBannerUrls } from '../../utils/mediaUtils';
import { storageService } from './storageService';
import { marketplaceService } from './marketplaceService';

const STORAGE_KEY_PRINTER_PREFIX = '@restaurant_printer_settings_';
const STORAGE_KEY_GST_PREFIX = '@restaurant_gst_settings_';

const RESTAURANT_SETTINGS_COLUMNS = new Set([
  'name',
  'legal_name',
  'address',
  'city',
  'state',
  'postal_code',
  'country',
  'phone',
  'email',
  'gstin',
  'fssai',
  'currency',
  'currency_symbol',
  'tax_rate',
  'cgst_rate',
  'sgst_rate',
  'default_tax_rate',
  'service_charge_rate',
  'packaging_charge_rate',
  'delivery_charge_base',
  'delivery_charge_per_km',
  'delivery_radius_km',
  'free_delivery_above',
  'theme_color',
  'primary_color',
  'header_color',
  'kot_auto_print',
  'kot_item_grouping',
  'auto_generate_kot',
  'allow_partial_payment',
  'allow_credit_orders',
  'enable_table_qr',
  'enable_delivery',
  'enable_takeaway',
  'receipt_header',
  'receipt_footer',
  'is_open',
  'opening_time',
  'closing_time',
  'banner_url',
  'gallery_images',
  'invoice_sequence_prefix',
  'invoice_next_number',
  'restaurant_id',
  'updated_at',
]);

function cleanLogoOnly(rawLogoUrl?: string | null): string {
  if (!rawLogoUrl) return '';
  return rawLogoUrl.split('#printer=')[0].trim();
}

export const settingsService = {
  async getPublicRestaurantInfo(restaurantId?: string): Promise<Partial<RestaurantSettings>> {
    const targetRestId = restaurantId;
    if (!targetRestId) return {};

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('get_public_restaurant_info', {
          p_restaurant_id: targetRestId,
        });
        if (!error && data) {
          return data as Partial<RestaurantSettings>;
        }
      } catch (err) {
        console.warn('get_public_restaurant_info RPC failed:', err);
      }

      // Safe fallback to public profiles view (never private restaurant_settings)
      try {
        const { data: prof, error: profErr } = await supabase
          .from('restaurant_public_profiles')
          .select('*')
          .eq('restaurant_id', targetRestId)
          .maybeSingle();
        if (!profErr && prof) {
          return {
            restaurant_id: targetRestId,
            name: (prof as any).restaurant_name || (prof as any).name || '',
            logo_url: (prof as any).logo_url || '',
            banner_url: (prof as any).banner_url || '',
            banner_urls: (prof as any).banner_urls || [],
            gallery_urls: (prof as any).gallery_urls || [],
            phone: (prof as any).phone || '',
            address: (prof as any).address || '',
            online_orders_enabled: (prof as any).marketplace_enabled ?? true,
          };
        }
      } catch (profErr) {
        console.warn('restaurant_public_profiles fallback failed:', profErr);
      }
    }
    return {};
  },

  async getSettings(restaurantId?: string): Promise<RestaurantSettings> {
    const targetRestId = restaurantId || '';
    if (!targetRestId) {
      return mockStorage.getSettings();
    }
    // 0. Load local printer & GST settings cache if available
    let localPrinterSettings: { kot_paper_size?: PaperSize; bill_paper_size?: PaperSize; auto_print_kot?: boolean } | null = null;
    let localGstSettings: { gst_registered?: boolean; is_gst_enabled?: boolean; tax_invoice_enabled?: boolean } | null = null;

    try {
      const [cachedPrinterStr, cachedGstStr] = await Promise.all([
        AsyncStorage.getItem(`${STORAGE_KEY_PRINTER_PREFIX}${targetRestId}`),
        AsyncStorage.getItem(`${STORAGE_KEY_GST_PREFIX}${targetRestId}`),
      ]);
      if (cachedPrinterStr) {
        localPrinterSettings = JSON.parse(cachedPrinterStr);
      }
      if (cachedGstStr) {
        localGstSettings = JSON.parse(cachedGstStr);
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
          .eq('restaurant_id', targetRestId)
          .maybeSingle();

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
          .eq('id', targetRestId)
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
        const resolvedKotPaper: PaperSize = (localPrinterSettings?.kot_paper_size || '80mm') as PaperSize;
        const resolvedBillPaper: PaperSize = (localPrinterSettings?.bill_paper_size || '80mm') as PaperSize;
        const resolvedAutoPrint: boolean = data?.kot_auto_print !== undefined && data?.kot_auto_print !== null
          ? Boolean(data.kot_auto_print)
          : (localPrinterSettings?.auto_print_kot !== undefined ? localPrinterSettings.auto_print_kot : false);

        // Resolve GST & Tax configuration
        const effectiveGstin = (data?.gstin || '').trim();
        const resolvedGstRegistered: boolean = localGstSettings?.gst_registered !== undefined
          ? localGstSettings.gst_registered
          : Boolean(effectiveGstin);

        const resolvedIsGstEnabled: boolean = resolvedGstRegistered
          ? (localGstSettings?.is_gst_enabled !== undefined ? localGstSettings.is_gst_enabled : Boolean(effectiveGstin))
          : false;

        const resolvedTaxInvoiceEnabled: boolean = resolvedGstRegistered
          ? (localGstSettings?.tax_invoice_enabled !== undefined ? localGstSettings.tax_invoice_enabled : Boolean(effectiveGstin))
          : false;

        // Sync local cache with Supabase values
        AsyncStorage.setItem(
          `${STORAGE_KEY_PRINTER_PREFIX}${targetRestId}`,
          JSON.stringify({
            kot_paper_size: resolvedKotPaper,
            bill_paper_size: resolvedBillPaper,
            auto_print_kot: resolvedAutoPrint,
          })
        ).catch(() => {});

        AsyncStorage.setItem(
          `${STORAGE_KEY_GST_PREFIX}${targetRestId}`,
          JSON.stringify({
            gst_registered: resolvedGstRegistered,
            is_gst_enabled: resolvedIsGstEnabled,
            tax_invoice_enabled: resolvedTaxInvoiceEnabled,
          })
        ).catch(() => {});

        const cleanLogo = cleanLogoOnly(restLogo || '');

        if (data) {
          const loaded: RestaurantSettings = {
            ...mockStorage.getSettings(),
            ...data,
            name: restName || data.name || 'Restaurant POS',
            logo_url: cleanLogo,
            phone: restPhone || data.phone || '',
            address: restAddress || data.address || '',
            gstin: effectiveGstin || data.gstin || '',
            banner_url: bannerUrl,
            banner_urls: bannerUrls,
            gallery_urls: bannerUrls,
            restaurant_id: data.restaurant_id || targetRestId,
            kot_paper_size: resolvedKotPaper,
            bill_paper_size: resolvedBillPaper,
            auto_print_kot: resolvedAutoPrint,
            gst_registered: resolvedGstRegistered,
            is_gst_enabled: resolvedIsGstEnabled,
            tax_invoice_enabled: resolvedTaxInvoiceEnabled,
            default_tax_rate: Number(data.default_tax_rate ?? data.tax_rate ?? 5.0),
          };
          mockStorage.saveSettings(loaded);
          return loaded;
        } else if (restData) {
          const loaded: RestaurantSettings = {
            ...mockStorage.getSettings(),
            id: 'rest-' + targetRestId,
            name: restName || 'Restaurant POS',
            logo_url: cleanLogo,
            phone: restPhone || '',
            address: restAddress || '',
            gstin: effectiveGstin,
            banner_url: bannerUrl,
            banner_urls: bannerUrls,
            gallery_urls: bannerUrls,
            restaurant_id: targetRestId,
            kot_paper_size: resolvedKotPaper,
            bill_paper_size: resolvedBillPaper,
            auto_print_kot: resolvedAutoPrint,
            gst_registered: resolvedGstRegistered,
            is_gst_enabled: resolvedIsGstEnabled,
            tax_invoice_enabled: resolvedTaxInvoiceEnabled,
            default_tax_rate: 5.0,
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
      gst_registered: localGstSettings?.gst_registered !== undefined ? localGstSettings.gst_registered : Boolean(localSettings.gstin),
      is_gst_enabled: localGstSettings?.is_gst_enabled !== undefined ? localGstSettings.is_gst_enabled : (localSettings.is_gst_enabled ?? Boolean(localSettings.gstin)),
      tax_invoice_enabled: localGstSettings?.tax_invoice_enabled !== undefined ? localGstSettings.tax_invoice_enabled : (localSettings.tax_invoice_enabled ?? Boolean(localSettings.gstin)),
    };
  },

  async saveSettings(
    settings: Partial<RestaurantSettings>,
    restaurantId?: string
  ): Promise<RestaurantSettings> {
    let targetRestId = restaurantId || settings.restaurant_id;
    if (!targetRestId) {
      const def = await restaurantService.getDefaultRestaurant();
      targetRestId = def?.id || '';
    }
    const current = await this.getSettings(targetRestId);
    const updated: RestaurantSettings = { ...current, ...settings, restaurant_id: targetRestId };

    const targetKotPaper = updated.kot_paper_size || '80mm';
    const targetBillPaper = updated.bill_paper_size || '80mm';
    const targetAutoPrint = Boolean(updated.auto_print_kot);

    const targetGstRegistered = updated.gst_registered !== undefined
      ? Boolean(updated.gst_registered)
      : Boolean((updated.gstin || '').trim());
    const targetIsGstEnabled = targetGstRegistered
      ? (updated.is_gst_enabled !== undefined ? Boolean(updated.is_gst_enabled) : Boolean((updated.gstin || '').trim()))
      : false;
    const targetTaxInvoiceEnabled = targetGstRegistered
      ? (updated.tax_invoice_enabled !== undefined ? Boolean(updated.tax_invoice_enabled) : Boolean((updated.gstin || '').trim()))
      : false;

    // Save to local AsyncStorage cache for instant response
    try {
      await Promise.all([
        AsyncStorage.setItem(
          `${STORAGE_KEY_PRINTER_PREFIX}${targetRestId}`,
          JSON.stringify({
            kot_paper_size: targetKotPaper,
            bill_paper_size: targetBillPaper,
            auto_print_kot: targetAutoPrint,
          })
        ),
        AsyncStorage.setItem(
          `${STORAGE_KEY_GST_PREFIX}${targetRestId}`,
          JSON.stringify({
            gst_registered: targetGstRegistered,
            is_gst_enabled: targetIsGstEnabled,
            tax_invoice_enabled: targetTaxInvoiceEnabled,
          })
        ),
      ]);
    } catch (e) {
      console.warn('Failed to cache settings locally:', e);
    }

    // Format banner payload for restaurants & public profiles
    let bannerPayload: string | undefined = undefined;
    if (settings.banner_urls !== undefined) {
      bannerPayload = settings.banner_urls.length > 0 ? JSON.stringify(settings.banner_urls) : '';
    } else if (settings.banner_url !== undefined) {
      bannerPayload = settings.banner_url;
    }

    if (isSupabaseConfigured) {
      // Auto-upload any legacy Base64 to Supabase Storage before updating DB
      const safeLogoUrl = settings.logo_url !== undefined
        ? await storageService.ensureCdnUrl(settings.logo_url, 'restaurant-assets', `restaurants/${targetRestId}/logos`)
        : undefined;

      const safeBannerPayload = bannerPayload !== undefined
        ? (bannerPayload.startsWith('data:') ? await storageService.ensureCdnUrl(bannerPayload, 'restaurant-assets', `restaurants/${targetRestId}/banners`) : bannerPayload)
        : undefined;

      // 1. Update restaurants table (banner_url, logo_url, name, phone, address, legal_name, email)
      const restUpdates: Record<string, any> = {};
      if (safeBannerPayload !== undefined) restUpdates.banner_url = safeBannerPayload || null;
      if (safeLogoUrl !== undefined) restUpdates.logo_url = safeLogoUrl || null;
      if (settings.name !== undefined) restUpdates.name = settings.name.trim();
      if (settings.legal_name !== undefined) restUpdates.legal_name = settings.legal_name.trim();
      if (settings.phone !== undefined) restUpdates.phone = settings.phone.trim();
      if (settings.address !== undefined) restUpdates.address = settings.address.trim();
      if (settings.email !== undefined) restUpdates.email = settings.email.trim();

      if (Object.keys(restUpdates).length > 0) {
        try {
          await supabase.from('restaurants').update(restUpdates).eq('id', targetRestId);
        } catch (rErr) {
          console.warn('Failed to update restaurants table:', rErr);
        }
      }

      // 2. Update restaurant_public_profiles table with banner_url
      if (safeBannerPayload !== undefined) {
        try {
          await supabase
            .from('restaurant_public_profiles')
            .update({ banner_url: safeBannerPayload || null })
            .eq('restaurant_id', targetRestId);
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
      sanitizedSettingsPayload.restaurant_id = targetRestId;
      sanitizedSettingsPayload.updated_at = new Date().toISOString();

      if (settings.auto_print_kot !== undefined || updated.auto_print_kot !== undefined) {
        sanitizedSettingsPayload.kot_auto_print = Boolean(settings.auto_print_kot ?? updated.auto_print_kot);
      }

      if (settings.default_tax_rate !== undefined || settings.tax_rate !== undefined || updated.default_tax_rate !== undefined) {
        const rate = Number(settings.default_tax_rate ?? settings.tax_rate ?? updated.default_tax_rate ?? 5.0);
        sanitizedSettingsPayload.default_tax_rate = rate;
        sanitizedSettingsPayload.tax_rate = rate;
        sanitizedSettingsPayload.cgst_rate = Number((rate / 2).toFixed(2));
        sanitizedSettingsPayload.sgst_rate = Number((rate / 2).toFixed(2));
      }

      if (safeBannerPayload !== undefined) {
        sanitizedSettingsPayload.banner_url = safeBannerPayload || null;
      }

      const { data, error } = await supabase
        .from('restaurant_settings')
        .upsert(sanitizedSettingsPayload, { onConflict: 'restaurant_id' })
        .select()
        .single();

      if (error) {
        console.error('Supabase restaurant_settings error:', error);
        throw new Error(`Failed to save restaurant settings: ${error.message || error.details || 'Database error'}`);
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
        gst_registered: targetGstRegistered,
        is_gst_enabled: targetIsGstEnabled,
        tax_invoice_enabled: targetTaxInvoiceEnabled,
        default_tax_rate: Number(data?.default_tax_rate ?? data?.tax_rate ?? updated.default_tax_rate ?? 5.0),
      };
      mockStorage.saveSettings(persisted);
      try {
        marketplaceService.clearRestaurantCache();
      } catch (e) {
        // ignore
      }
      return persisted;
    }

    mockStorage.saveSettings(updated);
    try {
      marketplaceService.clearRestaurantCache();
    } catch (e) {
      // ignore
    }
    return updated;
  },
};

