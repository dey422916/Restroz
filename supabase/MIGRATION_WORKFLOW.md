# RestroZ Database Migration & Schema Workflow

## Core Principle: Zero Schema Drift

All database schema, RLS policy, RPC, constraint, and index changes across RestroZ must adhere strictly to this lifecycle:

```text
DEV Environment
↓
Implement database migration + frontend changes
↓
Test completely on DEV
↓
Commit version-controlled migration (.sql) + application code
↓
Merge into production branch
↓
Apply EXACT SAME migration to PROD
↓
Production smoke test & validation
```

---

## Mandatory Rules

1. **Version-Controlled Migrations**:
   - Every database change must be represented as a timestamped, version-controlled `.sql` file in `supabase/migrations/`.
   - Never make manual schema changes directly in production without committing the corresponding migration file to the repository.

2. **DEV Tested First**:
   - All migrations must be tested and verified against the DEV Supabase environment (`restroz-dev`) before promoting to production.

3. **Parity Between Environments**:
   - The exact same migration file must be executed on DEV and PROD.
   - Do NOT maintain separate DEV and PROD migration files for the same feature.
   - The database schema, column types, column defaults, NOT NULL constraints, CHECK constraints, indexes, RLS policies, RPCs, and triggers must remain 100% identical between DEV and PROD.

4. **Environment Isolation**:
   - Customer business data, orders, payment records, and secrets must remain environment-specific and never cross environments.
   - Super Admin and test accounts must follow environment-specific provisioning.

5. **Safety Constraints**:
   - Migrations modifying constraints or adding unique indexes must include pre-flight validation and transaction wrapping (`BEGIN; ... COMMIT;`).
   - RLS policies must strictly enforce multi-tenant isolation via `restaurant_id` membership and `is_super_admin()`.
   - Stored procedures / RPCs must use `SECURITY DEFINER`, pin `search_path = pg_catalog`, and derive authentication identity from `auth.uid()`.
