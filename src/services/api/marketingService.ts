import { supabase, isSupabaseConfigured } from '../supabase';
import { CreateWebsiteLeadPayload, WebsiteBanner, WebsiteLead } from '../../types/marketing';

export const marketingService = {
  /**
   * Fetch currently active & scheduled promotional banners for public display
   */
  async getActiveBanners(): Promise<WebsiteBanner[]> {
    if (!isSupabaseConfigured) return [];
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('website_banners')
        .select('*')
        .eq('is_active', true)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[marketingService] Failed to load active banners:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn('[marketingService] Banner fetch exception:', err);
      return [];
    }
  },

  /**
   * Submit a new sales/demo/contact lead
   */
  async submitLead(payload: CreateWebsiteLeadPayload): Promise<{ success: boolean; leadId?: string; error?: string }> {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Database service is temporarily unavailable.' };
    }

    // Honeypot spam trap
    if (payload.honeypot && payload.honeypot.trim() !== '') {
      // Silently pretend success to mislead bots
      return { success: true };
    }

    // Client-side payload sanitization and validation
    const fullName = (payload.full_name || '').trim();
    const businessName = (payload.business_name || '').trim();
    const phone = (payload.phone || '').trim();
    const email = (payload.email || '').trim().toLowerCase();
    const city = (payload.city || '').trim();

    if (!fullName || !businessName || !phone || !email || !city) {
      return { success: false, error: 'Please fill in all required fields (Name, Business, Phone, Email, City).' };
    }

    // Basic email format validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    // Basic phone validation (at least 8 digits)
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 8 || digitsOnly.length > 15) {
      return { success: false, error: 'Please enter a valid phone/mobile number.' };
    }

    try {
      const { data, error } = await supabase
        .from('website_leads')
        .insert({
          lead_type: payload.lead_type || 'demo',
          full_name: fullName,
          business_name: businessName,
          phone: phone,
          email: email,
          city: city,
          state: (payload.state || '').trim() || null,
          country: (payload.country || 'India').trim(),
          number_of_outlets: Math.max(1, payload.number_of_outlets || 1),
          restaurant_type: payload.restaurant_type || null,
          interested_features: payload.interested_features || [],
          preferred_contact_method: payload.preferred_contact_method || 'phone',
          preferred_demo_date: payload.preferred_demo_date || null,
          preferred_demo_time: payload.preferred_demo_time || null,
          current_pos_software: payload.current_pos_software || null,
          message: (payload.message || '').trim() || null,
          source_page: payload.source_page || '/info',
          utm_source: payload.utm_source || null,
          utm_medium: payload.utm_medium || null,
          utm_campaign: payload.utm_campaign || null,
          utm_content: payload.utm_content || null,
          utm_term: payload.utm_term || null,
          status: 'new',
        })
        .select('id')
        .single();

      if (error) {
        console.error('[marketingService] Lead submission error:', error);
        return { success: false, error: error.message || 'Failed to submit enquiry. Please try again.' };
      }

      return { success: true, leadId: data?.id };
    } catch (err: any) {
      console.error('[marketingService] Lead submission exception:', err);
      return { success: false, error: err.message || 'An unexpected error occurred.' };
    }
  },
};
