-- ============================================================================
-- MIGRATION: 20261016000001_print_jobs_tenant_isolation.sql
-- DESCRIPTION: Tighten Row-Level Security on public.print_jobs for strict tenant isolation.
-- Enforces:
-- 1. Restaurant A Staff/Admin can INSERT/SELECT/UPDATE jobs for Restaurant A.
-- 2. Staff of Restaurant B is strictly DENIED access to Restaurant A jobs.
-- 3. Unauthenticated (anon) requests are strictly DENIED access.
-- ============================================================================

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- 1. SELECT POLICY
DROP POLICY IF EXISTS "print_jobs_select" ON public.print_jobs;
CREATE POLICY "print_jobs_select"
ON public.print_jobs
FOR SELECT
TO authenticated
USING (
  restaurant_id IS NOT NULL
  AND (
    public.is_restaurant_member(restaurant_id, 'STAFF'::text)
    OR public.is_super_admin()
  )
);

-- 2. INSERT POLICY
DROP POLICY IF EXISTS "print_jobs_insert" ON public.print_jobs;
CREATE POLICY "print_jobs_insert"
ON public.print_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  restaurant_id IS NOT NULL
  AND (
    public.is_restaurant_member(restaurant_id, 'STAFF'::text)
    OR public.is_super_admin()
  )
);

-- 3. UPDATE POLICY
DROP POLICY IF EXISTS "print_jobs_update" ON public.print_jobs;
CREATE POLICY "print_jobs_update"
ON public.print_jobs
FOR UPDATE
TO authenticated
USING (
  restaurant_id IS NOT NULL
  AND (
    public.is_restaurant_member(restaurant_id, 'STAFF'::text)
    OR public.is_super_admin()
  )
)
WITH CHECK (
  restaurant_id IS NOT NULL
  AND (
    public.is_restaurant_member(restaurant_id, 'STAFF'::text)
    OR public.is_super_admin()
  )
);

-- 4. DELETE POLICY
DROP POLICY IF EXISTS "print_jobs_delete" ON public.print_jobs;
CREATE POLICY "print_jobs_delete"
ON public.print_jobs
FOR DELETE
TO authenticated
USING (
  restaurant_id IS NOT NULL
  AND (
    public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
    OR public.is_super_admin()
  )
);
