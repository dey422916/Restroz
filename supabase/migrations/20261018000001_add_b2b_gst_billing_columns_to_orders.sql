-- Migration: 20261018000001_add_b2b_gst_billing_columns_to_orders.sql
-- Description: Add optional, nullable B2B GST tax invoice snapshot columns to public.orders.
-- Ensures B2C orders and standard KOT creation remain fully functional with NULL values.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS customer_gstin text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS customer_business_name text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS billing_address text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS billing_state text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS billing_state_code text DEFAULT NULL;

-- Notify PostgREST schema cache to reload
NOTIFY pgrst, 'reload schema';
