-- ============================================================================
-- MIGRATION: 20260927000004_restaurant_printers_multi_printer_foundation.sql
-- DESCRIPTION: Phase 1 Additive Multi-Printer & Calibration Foundation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.restaurant_printers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  connection_type TEXT NOT NULL CHECK (connection_type IN ('bluetooth', 'usb', 'lan', 'wifi')),
  paper_width TEXT NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('58mm', '80mm')),
  printer_role TEXT NOT NULL DEFAULT 'kot' CHECK (printer_role IN ('kot', 'bill', 'both')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  fallback_printer_id UUID NULL REFERENCES public.restaurant_printers(id) ON DELETE SET NULL,

  -- Network details (LAN / Wi-Fi)
  ip_address TEXT NULL,
  port INTEGER DEFAULT 9100 CHECK (port IS NULL OR (port >= 1 AND port <= 65535)),

  -- Bluetooth details (Cloud metadata)
  bluetooth_device_name TEXT NULL,

  -- Calibration settings
  alignment TEXT NOT NULL DEFAULT 'center' CHECK (alignment IN ('left', 'center', 'right')),
  horizontal_shift_mm NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (horizontal_shift_mm >= -10.0 AND horizontal_shift_mm <= 10.0),
  margin_left_mm NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (margin_left_mm >= 0.0 AND margin_left_mm <= 15.0),
  margin_right_mm NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (margin_right_mm >= 0.0 AND margin_right_mm <= 15.0),
  margin_top_mm NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (margin_top_mm >= 0.0 AND margin_top_mm <= 20.0),
  margin_bottom_mm NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (margin_bottom_mm >= 0.0 AND margin_bottom_mm <= 20.0),

  -- Routing configuration
  category_ids UUID[] DEFAULT '{}',
  section_names TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_restaurant_printers_no_self_fallback CHECK (fallback_printer_id IS NULL OR fallback_printer_id <> id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_restaurant_printers_rest ON public.restaurant_printers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_printers_active ON public.restaurant_printers(restaurant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_restaurant_printers_role ON public.restaurant_printers(restaurant_id, printer_role);

-- Enable RLS
ALTER TABLE public.restaurant_printers ENABLE ROW LEVEL SECURITY;

-- Strict Tenant RLS Policies
DROP POLICY IF EXISTS "restaurant_printers_select" ON public.restaurant_printers;
CREATE POLICY "restaurant_printers_select"
ON public.restaurant_printers
FOR SELECT
TO authenticated, anon
USING (
  public.is_restaurant_member(restaurant_id, 'STAFF'::text)
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "restaurant_printers_insert" ON public.restaurant_printers;
CREATE POLICY "restaurant_printers_insert"
ON public.restaurant_printers
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "restaurant_printers_update" ON public.restaurant_printers;
CREATE POLICY "restaurant_printers_update"
ON public.restaurant_printers
FOR UPDATE
TO authenticated
USING (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
)
WITH CHECK (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "restaurant_printers_delete" ON public.restaurant_printers;
CREATE POLICY "restaurant_printers_delete"
ON public.restaurant_printers
FOR DELETE
TO authenticated
USING (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);
