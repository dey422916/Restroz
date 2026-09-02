-- ============================================================================
-- MIGRATION 20260820000011: ADD PRINTER SETTINGS TO RESTAURANT_SETTINGS
-- ============================================================================

ALTER TABLE public.restaurant_settings
ADD COLUMN IF NOT EXISTS kot_paper_size TEXT DEFAULT '80mm',
ADD COLUMN IF NOT EXISTS bill_paper_size TEXT DEFAULT '80mm',
ADD COLUMN IF NOT EXISTS auto_print_kot BOOLEAN DEFAULT FALSE;

-- Ensure constraint for valid paper sizes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_settings_kot_paper_size_check'
    ) THEN
        ALTER TABLE public.restaurant_settings
        ADD CONSTRAINT restaurant_settings_kot_paper_size_check
        CHECK (kot_paper_size IN ('58mm', '80mm', 'A4'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_settings_bill_paper_size_check'
    ) THEN
        ALTER TABLE public.restaurant_settings
        ADD CONSTRAINT restaurant_settings_bill_paper_size_check
        CHECK (bill_paper_size IN ('58mm', '80mm', 'A4'));
    END IF;
END $$;
