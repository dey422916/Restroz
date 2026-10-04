export type LeadType = 'demo' | 'contact' | 'pricing' | 'general';
export type PreferredContactMethod = 'phone' | 'email' | 'whatsapp';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'demo_scheduled' | 'converted' | 'closed_lost';

export interface WebsiteLead {
  id: string;
  lead_type: LeadType;
  full_name: string;
  business_name: string;
  phone: string;
  email: string;
  city: string;
  state?: string | null;
  country: string;
  number_of_outlets: number;
  restaurant_type?: string | null;
  interested_features?: string[] | null;
  preferred_contact_method: PreferredContactMethod;
  preferred_demo_date?: string | null;
  preferred_demo_time?: string | null;
  current_pos_software?: string | null;
  message?: string | null;
  source_page?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  status: LeadStatus;
  assigned_to?: string | null;
  internal_notes?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CreateWebsiteLeadPayload {
  lead_type?: LeadType;
  full_name: string;
  business_name: string;
  phone: string;
  email: string;
  city: string;
  state?: string;
  country?: string;
  number_of_outlets?: number;
  restaurant_type?: string;
  interested_features?: string[];
  preferred_contact_method?: PreferredContactMethod;
  preferred_demo_date?: string;
  preferred_demo_time?: string;
  current_pos_software?: string;
  message?: string;
  source_page?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  honeypot?: string; // spam trap
}

export interface WebsiteBanner {
  id: string;
  title: string;
  headline: string;
  subheadline?: string | null;
  desktop_image_url: string;
  mobile_image_url?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  is_external_link: boolean;
  badge_text?: string | null;
  display_order: number;
  is_active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CreateWebsiteBannerPayload {
  title: string;
  headline: string;
  subheadline?: string;
  desktop_image_url: string;
  mobile_image_url?: string;
  cta_label?: string;
  cta_url?: string;
  is_external_link?: boolean;
  badge_text?: string;
  display_order?: number;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface MarketingSEOMetadata {
  title: string;
  description: string;
  canonicalPath: string; // e.g. /info/features/pos-billing
  keywords?: string[];
  ogImage?: string;
  structuredData?: Record<string, any> | Array<Record<string, any>>;
}
