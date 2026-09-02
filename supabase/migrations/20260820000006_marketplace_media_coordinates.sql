-- ============================================================================
-- RATNADEEP POS SAAS — MARKETPLACE MEDIA & COORDINATES EXTENSION
-- Migration Version: 20260820000006_marketplace_media_coordinates.sql
-- Strictly Additive — Phase 1–5 schema & data preserved 100%
-- ============================================================================

-- 1. Add banner_url and coordinate columns to restaurants
ALTER TABLE IF EXISTS public.restaurants 
ADD COLUMN IF NOT EXISTS banner_url TEXT,
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- 2. Add coordinates to restaurant_public_profiles
ALTER TABLE IF EXISTS public.restaurant_public_profiles 
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- 3. Ensure customer_addresses coordinate columns and index
ALTER TABLE IF EXISTS public.customer_addresses
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC;

CREATE INDEX IF NOT EXISTS idx_restaurants_coords ON public.restaurants (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_public_profiles_coords ON public.restaurant_public_profiles (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_coords ON public.customer_addresses (latitude, longitude);
