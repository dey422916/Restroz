-- ============================================================================
-- RESTROZ SAAS — DEV ONLY CLEANUP MIGRATION
-- Migration Version: 20260914000002_dev_cleanup_legacy_kot_product_id
-- Target: DEV Supabase Project ONLY (ymonclyfwtdyjagrnvpo)
-- DO NOT RUN ON PROD (PROD already correctly omits this column)
--
-- Safety Guarantees:
-- 1. Strictly non-destructive for application logic — kot_items is an immutable
--    kitchen snapshot using product_name, quantity, notes, status, created_at.
-- 2. No application code, trigger, RPC, or RLS policy depends on kot_items.product_id.
-- 3. Idempotent — Safe to run with IF EXISTS.
-- ============================================================================

ALTER TABLE public.kot_items DROP COLUMN IF EXISTS product_id;
