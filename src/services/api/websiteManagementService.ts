import { supabase, isSupabaseConfigured } from '../supabase';
import { storageService, compressAndResizeImage } from './storageService';
import {
  WebsiteLead,
  LeadStatus,
  WebsiteBanner,
  CreateWebsiteBannerPayload,
} from '../../types/marketing';

export interface LeadFilterOptions {
  status?: LeadStatus | 'all';
  searchQuery?: string;
  leadType?: string;
  limit?: number;
  offset?: number;
}

export interface LeadStatsSummary {
  totalLeads: number;
  newLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  demoScheduledLeads: number;
  convertedLeads: number;
  closedLostLeads: number;
}

export const websiteManagementService = {
  // ============================================================================
  // LEADS MANAGEMENT
  // ============================================================================

  /**
   * Fetch paginated and filtered website leads
   */
  async getLeads(options: LeadFilterOptions = {}): Promise<{ leads: WebsiteLead[]; total: number }> {
    if (!isSupabaseConfigured) return { leads: [], total: 0 };

    try {
      let query = supabase.from('website_leads').select('*', { count: 'exact' });

      if (options.status && options.status !== 'all') {
        query = query.eq('status', options.status);
      }

      if (options.leadType && options.leadType !== 'all') {
        query = query.eq('lead_type', options.leadType);
      }

      if (options.searchQuery && options.searchQuery.trim() !== '') {
        const q = options.searchQuery.trim();
        query = query.or(`full_name.ilike.%${q}%,business_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%`);
      }

      query = query.order('created_at', { ascending: false });

      if (options.limit) {
        const offset = options.offset || 0;
        query = query.range(offset, offset + options.limit - 1);
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('[websiteManagementService] getLeads error:', error);
        return { leads: [], total: 0 };
      }

      return { leads: (data as WebsiteLead[]) || [], total: count || 0 };
    } catch (err) {
      console.error('[websiteManagementService] getLeads exception:', err);
      return { leads: [], total: 0 };
    }
  },

  /**
   * Fetch aggregate metrics for website leads
   */
  async getLeadStats(): Promise<LeadStatsSummary> {
    if (!isSupabaseConfigured) {
      return {
        totalLeads: 0,
        newLeads: 0,
        contactedLeads: 0,
        qualifiedLeads: 0,
        demoScheduledLeads: 0,
        convertedLeads: 0,
        closedLostLeads: 0,
      };
    }

    try {
      const { data, error } = await supabase.from('website_leads').select('status');
      if (error || !data) {
        return {
          totalLeads: 0,
          newLeads: 0,
          contactedLeads: 0,
          qualifiedLeads: 0,
          demoScheduledLeads: 0,
          convertedLeads: 0,
          closedLostLeads: 0,
        };
      }

      const stats: LeadStatsSummary = {
        totalLeads: data.length,
        newLeads: 0,
        contactedLeads: 0,
        qualifiedLeads: 0,
        demoScheduledLeads: 0,
        convertedLeads: 0,
        closedLostLeads: 0,
      };

      for (const row of data) {
        if (row.status === 'new') stats.newLeads++;
        else if (row.status === 'contacted') stats.contactedLeads++;
        else if (row.status === 'qualified') stats.qualifiedLeads++;
        else if (row.status === 'demo_scheduled') stats.demoScheduledLeads++;
        else if (row.status === 'converted') stats.convertedLeads++;
        else if (row.status === 'closed_lost') stats.closedLostLeads++;
      }

      return stats;
    } catch (err) {
      console.error('[websiteManagementService] getLeadStats exception:', err);
      return {
        totalLeads: 0,
        newLeads: 0,
        contactedLeads: 0,
        qualifiedLeads: 0,
        demoScheduledLeads: 0,
        convertedLeads: 0,
        closedLostLeads: 0,
      };
    }
  },

  /**
   * Update lead status and internal notes
   */
  async updateLeadStatus(
    leadId: string,
    status: LeadStatus,
    internalNotes?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase unconfigured' };

    try {
      const updatePayload: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (internalNotes !== undefined) {
        updatePayload.internal_notes = internalNotes;
      }

      const { error } = await supabase
        .from('website_leads')
        .update(updatePayload)
        .eq('id', leadId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Delete lead
   */
  async deleteLead(leadId: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase unconfigured' };
    try {
      const { error } = await supabase.from('website_leads').delete().eq('id', leadId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  // ============================================================================
  // BANNER MANAGEMENT
  // ============================================================================

  /**
   * Fetch all banners for Super Admin management
   */
  async getAllBanners(): Promise<WebsiteBanner[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const { data, error } = await supabase
        .from('website_banners')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[websiteManagementService] getAllBanners error:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[websiteManagementService] getAllBanners exception:', err);
      return [];
    }
  },

  /**
   * Create a new promotional banner
   */
  async createBanner(payload: CreateWebsiteBannerPayload): Promise<{ success: boolean; banner?: WebsiteBanner; error?: string }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase unconfigured' };

    try {
      const { data, error } = await supabase
        .from('website_banners')
        .insert({
          title: payload.title.trim(),
          headline: payload.headline.trim(),
          subheadline: payload.subheadline?.trim() || null,
          desktop_image_url: payload.desktop_image_url.trim(),
          mobile_image_url: payload.mobile_image_url?.trim() || null,
          cta_label: payload.cta_label?.trim() || null,
          cta_url: payload.cta_url?.trim() || null,
          is_external_link: payload.is_external_link || false,
          badge_text: payload.badge_text?.trim() || null,
          display_order: payload.display_order || 0,
          is_active: payload.is_active !== undefined ? payload.is_active : true,
          start_date: payload.start_date || null,
          end_date: payload.end_date || null,
        })
        .select('*')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, banner: data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Update an existing banner
   */
  async updateBanner(
    bannerId: string,
    updates: Partial<CreateWebsiteBannerPayload>
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase unconfigured' };

    try {
      const { error } = await supabase
        .from('website_banners')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bannerId);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Delete banner
   */
  async deleteBanner(bannerId: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase unconfigured' };
    try {
      const { error } = await supabase.from('website_banners').delete().eq('id', bannerId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Upload promotional banner asset to Supabase Storage
   */
  async uploadBannerImage(
    file: File | Blob | string,
    type: 'desktop' | 'mobile'
  ): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const filePath = `banners/${type}-${timestamp}-${randomStr}.webp`;

      const compressed = await compressAndResizeImage(file, {
        maxWidth: type === 'desktop' ? 1920 : 900,
        maxHeight: type === 'desktop' ? 800 : 700,
        quality: 0.85,
        format: 'webp',
      });

      const uploadBody = compressed.blob || compressed.uri || file;
      const { error: uploadErr } = await supabase.storage
        .from('website-banners')
        .upload(filePath, uploadBody, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadErr) {
        return { success: false, error: uploadErr.message };
      }

      const { data: urlData } = supabase.storage
        .from('website-banners')
        .getPublicUrl(filePath);

      return { success: true, publicUrl: urlData.publicUrl };
    } catch (err: any) {
      return { success: false, error: err.message || 'Image upload failed.' };
    }
  },
};
