-- Add banner_urls and gallery_urls arrays to restaurants, restaurant_public_profiles, and restaurant_settings
ALTER TABLE public.restaurants
ADD COLUMN IF NOT EXISTS banner_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT '{}';

ALTER TABLE public.restaurant_public_profiles
ADD COLUMN IF NOT EXISTS banner_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT '{}';

ALTER TABLE public.restaurant_settings
ADD COLUMN IF NOT EXISTS banner_url text,
ADD COLUMN IF NOT EXISTS banner_urls text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT '{}';

-- Create RPC to save restaurant showcase gallery images across all tables
CREATE OR REPLACE FUNCTION public.save_restaurant_gallery_images(
  p_restaurant_id uuid,
  p_banner_urls text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_banner text := NULL;
BEGIN
  IF array_length(p_banner_urls, 1) > 0 THEN
    v_first_banner := p_banner_urls[1];
  END IF;

  -- 1. Update restaurants
  UPDATE public.restaurants
  SET 
    banner_url = COALESCE(v_first_banner, banner_url),
    banner_urls = p_banner_urls,
    gallery_urls = p_banner_urls,
    updated_at = now()
  WHERE id = p_restaurant_id;

  -- 2. Update restaurant_public_profiles
  UPDATE public.restaurant_public_profiles
  SET 
    banner_url = COALESCE(v_first_banner, banner_url),
    banner_urls = p_banner_urls,
    gallery_urls = p_banner_urls,
    updated_at = now()
  WHERE restaurant_id = p_restaurant_id;

  -- 3. Update restaurant_settings
  UPDATE public.restaurant_settings
  SET 
    banner_url = COALESCE(v_first_banner, banner_url),
    banner_urls = p_banner_urls,
    gallery_urls = p_banner_urls,
    updated_at = now()
  WHERE restaurant_id = p_restaurant_id;

  RETURN jsonb_build_object(
    'success', true,
    'restaurant_id', p_restaurant_id,
    'banner_urls', p_banner_urls
  );
END;
$$;
