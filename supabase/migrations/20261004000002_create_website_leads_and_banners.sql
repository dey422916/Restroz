-- Migration: 20261004000002_create_website_leads_and_banners.sql
-- Description: Create public website leads, promotional banners, and storage bucket
-- Target: DEV ONLY (ymonclyfwtdyjagrnvpo)

-- 1. Table: website_leads
CREATE TABLE IF NOT EXISTS public.website_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_type TEXT NOT NULL DEFAULT 'demo' CHECK (lead_type IN ('demo', 'contact', 'pricing', 'general')),
    full_name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT,
    country TEXT NOT NULL DEFAULT 'India',
    number_of_outlets INTEGER NOT NULL DEFAULT 1,
    restaurant_type TEXT,
    interested_features TEXT[],
    preferred_contact_method TEXT DEFAULT 'phone' CHECK (preferred_contact_method IN ('phone', 'email', 'whatsapp')),
    preferred_demo_date DATE,
    preferred_demo_time TEXT,
    current_pos_software TEXT,
    message TEXT,
    source_page TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'demo_scheduled', 'converted', 'closed_lost')),
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    internal_notes TEXT,
    ip_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_leads_status ON public.website_leads(status);
CREATE INDEX IF NOT EXISTS idx_website_leads_created_at ON public.website_leads(created_at DESC);

-- 2. Table: website_banners
CREATE TABLE IF NOT EXISTS public.website_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    headline TEXT NOT NULL,
    subheadline TEXT,
    desktop_image_url TEXT NOT NULL,
    mobile_image_url TEXT,
    cta_label TEXT,
    cta_url TEXT,
    is_external_link BOOLEAN NOT NULL DEFAULT FALSE,
    badge_text TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_banners_active_schedule
ON public.website_banners(is_active, display_order ASC, start_date, end_date);

-- 3. Enable RLS
ALTER TABLE public.website_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_banners ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for website_leads
-- Anyone (anonymous or authenticated) can INSERT a lead
DROP POLICY IF EXISTS "public_insert_website_leads" ON public.website_leads;
CREATE POLICY "public_insert_website_leads"
ON public.website_leads
FOR INSERT
WITH CHECK (
    LENGTH(TRIM(full_name)) > 0
    AND LENGTH(TRIM(business_name)) > 0
    AND LENGTH(TRIM(phone)) > 0
    AND LENGTH(TRIM(email)) > 0
);

-- Only SUPER ADMIN or service_role can SELECT, UPDATE, DELETE leads
DROP POLICY IF EXISTS "super_admin_all_website_leads" ON public.website_leads;
CREATE POLICY "super_admin_all_website_leads"
ON public.website_leads
FOR ALL
USING (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR current_user = 'postgres'
    OR public.is_super_admin()
)
WITH CHECK (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR current_user = 'postgres'
    OR public.is_super_admin()
);

-- 5. RLS Policies for website_banners
-- Public (anonymous or authenticated) can SELECT only active and scheduled banners
DROP POLICY IF EXISTS "public_select_active_website_banners" ON public.website_banners;
CREATE POLICY "public_select_active_website_banners"
ON public.website_banners
FOR SELECT
USING (
    (
        is_active = TRUE
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
    )
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR current_user = 'postgres'
    OR public.is_super_admin()
);

-- Only SUPER ADMIN or service_role can INSERT, UPDATE, DELETE banners
DROP POLICY IF EXISTS "super_admin_manage_website_banners" ON public.website_banners;
CREATE POLICY "super_admin_manage_website_banners"
ON public.website_banners
FOR ALL
USING (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR current_user = 'postgres'
    OR public.is_super_admin()
)
WITH CHECK (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR current_user = 'postgres'
    OR public.is_super_admin()
);

-- 6. Storage Bucket: website-banners
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'website-banners',
    'website-banners',
    true,
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

-- Storage Policies for website-banners
DROP POLICY IF EXISTS "Public can view website banners" ON storage.objects;
CREATE POLICY "Public can view website banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'website-banners');

DROP POLICY IF EXISTS "Super admin can upload website banners" ON storage.objects;
CREATE POLICY "Super admin can upload website banners"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'website-banners'
    AND (
        COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
        OR current_user = 'postgres'
        OR public.is_super_admin()
    )
);

DROP POLICY IF EXISTS "Super admin can update website banners" ON storage.objects;
CREATE POLICY "Super admin can update website banners"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'website-banners'
    AND (
        COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
        OR current_user = 'postgres'
        OR public.is_super_admin()
    )
);

DROP POLICY IF EXISTS "Super admin can delete website banners" ON storage.objects;
CREATE POLICY "Super admin can delete website banners"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'website-banners'
    AND (
        COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
        OR current_user = 'postgres'
        OR public.is_super_admin()
    )
);

-- 7. Grant Permissions
GRANT ALL ON TABLE public.website_leads TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.website_banners TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
