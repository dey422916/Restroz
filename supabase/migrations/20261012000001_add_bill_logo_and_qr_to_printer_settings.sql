-- ============================================================================
-- MIGRATION 20261012000001: ADD BILL LOGO AND PAYMENT QR TO RESTAURANT_SETTINGS
-- ============================================================================

ALTER TABLE public.restaurant_settings
ADD COLUMN IF NOT EXISTS bill_logo_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS print_bill_logo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bill_payment_qr_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS print_bill_payment_qr BOOLEAN DEFAULT FALSE;
