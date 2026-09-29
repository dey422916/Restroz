-- ============================================================================
-- MIGRATION: 20260928000001_restroz_print_agent_subsystem.sql
-- DESCRIPTION: Native RestroZ Print Agent Subsystem (Dev)
-- Replaces QZ Tray with secure outbound Print Agent communication.
-- ============================================================================

-- 1. PRINT AGENTS TABLE
CREATE TABLE IF NOT EXISTS public.print_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  agent_token TEXT NOT NULL UNIQUE,
  pairing_code TEXT NULL,
  pairing_expires_at TIMESTAMPTZ NULL,
  is_paired BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'printing', 'error')),
  ip_address TEXT NULL,
  os_info TEXT NULL,
  agent_version TEXT NULL DEFAULT '1.0.0',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PRINTER DEVICES TABLE (Installed queues detected by the Print Agent)
CREATE TABLE IF NOT EXISTS public.printer_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.print_agents(id) ON DELETE CASCADE,
  printer_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'both' CHECK (role IN ('kot', 'bill', 'both')),
  paper_width TEXT NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('58mm', '80mm')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_online BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_agent_printer UNIQUE (agent_id, printer_name)
);

-- 3. PRINT JOBS TABLE
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.print_agents(id) ON DELETE CASCADE,
  printer_name TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('kot', 'bill', 'test', 'custom')),
  job_title TEXT NOT NULL DEFAULT 'Print Job',
  payload_base64 TEXT NOT NULL,
  paper_width TEXT NOT NULL DEFAULT '80mm' CHECK (paper_width IN ('58mm', '80mm')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'received', 'printing', 'printed', 'failed', 'cancelled')),
  nonce TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  error_message TEXT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  printed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + interval '10 minutes')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_print_agents_rest ON public.print_agents(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_print_agents_pairing ON public.print_agents(pairing_code) WHERE pairing_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_print_agents_token ON public.print_agents(agent_token);

CREATE INDEX IF NOT EXISTS idx_printer_devices_agent ON public.printer_devices(agent_id);
CREATE INDEX IF NOT EXISTS idx_printer_devices_rest ON public.printer_devices(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_print_jobs_agent_status ON public.print_jobs(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_rest_created ON public.print_jobs(restaurant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.print_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printer_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_agents;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.printer_devices;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 4. RLS POLICIES FOR PRINT AGENTS
DROP POLICY IF EXISTS "print_agents_select" ON public.print_agents;
CREATE POLICY "print_agents_select"
ON public.print_agents
FOR SELECT
TO authenticated, anon
USING (
  restaurant_id IS NULL
  OR public.is_restaurant_member(restaurant_id, 'STAFF'::text)
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "print_agents_update" ON public.print_agents;
CREATE POLICY "print_agents_update"
ON public.print_agents
FOR UPDATE
TO authenticated
USING (
  restaurant_id IS NULL
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
)
WITH CHECK (
  restaurant_id IS NULL
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "print_agents_delete" ON public.print_agents;
CREATE POLICY "print_agents_delete"
ON public.print_agents
FOR DELETE
TO authenticated
USING (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

-- 5. RLS POLICIES FOR PRINTER DEVICES
DROP POLICY IF EXISTS "printer_devices_select" ON public.printer_devices;
CREATE POLICY "printer_devices_select"
ON public.printer_devices
FOR SELECT
TO authenticated, anon
USING (
  public.is_restaurant_member(restaurant_id, 'STAFF'::text)
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "printer_devices_insert" ON public.printer_devices;
CREATE POLICY "printer_devices_insert"
ON public.printer_devices
FOR INSERT
TO authenticated, anon
WITH CHECK (true);

DROP POLICY IF EXISTS "printer_devices_update" ON public.printer_devices;
CREATE POLICY "printer_devices_update"
ON public.printer_devices
FOR UPDATE
TO authenticated, anon
USING (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
  OR true
);

DROP POLICY IF EXISTS "printer_devices_delete" ON public.printer_devices;
CREATE POLICY "printer_devices_delete"
ON public.printer_devices
FOR DELETE
TO authenticated
USING (
  public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
);

-- 6. RLS POLICIES FOR PRINT JOBS
DROP POLICY IF EXISTS "print_jobs_select" ON public.print_jobs;
CREATE POLICY "print_jobs_select"
ON public.print_jobs
FOR SELECT
TO authenticated, anon
USING (
  public.is_restaurant_member(restaurant_id, 'STAFF'::text)
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
  OR true
);

DROP POLICY IF EXISTS "print_jobs_insert" ON public.print_jobs;
CREATE POLICY "print_jobs_insert"
ON public.print_jobs
FOR INSERT
TO authenticated, anon
WITH CHECK (
  public.is_restaurant_member(restaurant_id, 'STAFF'::text)
  OR public.is_restaurant_member(restaurant_id, 'ADMIN'::text)
  OR public.is_super_admin()
  OR true
);

DROP POLICY IF EXISTS "print_jobs_update" ON public.print_jobs;
CREATE POLICY "print_jobs_update"
ON public.print_jobs
FOR UPDATE
TO authenticated, anon
USING (true);

-- 7. RPC FUNCTIONS FOR PRINT AGENT SECURITY & WORKFLOWS

-- A. Register or heartbeat initial un-paired agent and generate pairing code
CREATE OR REPLACE FUNCTION public.register_print_agent(
  p_device_id TEXT,
  p_device_name TEXT,
  p_os_info TEXT DEFAULT NULL,
  p_agent_version TEXT DEFAULT '1.0.0'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent public.print_agents%ROWTYPE;
  v_code TEXT;
  v_token TEXT;
BEGIN
  -- Generate 6-digit pairing code
  v_code := lpad(floor(random() * 900000 + 100000)::text, 6, '0');
  v_token := encode(gen_random_bytes(32), 'hex');

  SELECT * INTO v_agent FROM public.print_agents WHERE device_id = p_device_id;

  IF FOUND THEN
    IF v_agent.is_paired THEN
      -- Already paired, update heartbeat and info
      UPDATE public.print_agents
      SET device_name = p_device_name,
          os_info = COALESCE(p_os_info, os_info),
          agent_version = COALESCE(p_agent_version, agent_version),
          status = 'online',
          last_seen = NOW(),
          updated_at = NOW()
      WHERE id = v_agent.id
      RETURNING * INTO v_agent;

      RETURN jsonb_build_object(
        'success', true,
        'is_paired', true,
        'agent_id', v_agent.id,
        'restaurant_id', v_agent.restaurant_id,
        'agent_token', v_agent.agent_token,
        'device_id', v_agent.device_id,
        'device_name', v_agent.device_name
      );
    ELSE
      -- Device exists but is not paired yet. PRESERVE existing pairing_code!
      UPDATE public.print_agents
      SET device_name = p_device_name,
          pairing_code = COALESCE(v_agent.pairing_code, v_code),
          pairing_expires_at = COALESCE(v_agent.pairing_expires_at, NOW() + interval '15 minutes'),
          os_info = COALESCE(p_os_info, os_info),
          agent_version = COALESCE(p_agent_version, agent_version),
          status = 'online',
          last_seen = NOW(),
          updated_at = NOW()
      WHERE id = v_agent.id
      RETURNING * INTO v_agent;

      RETURN jsonb_build_object(
        'success', true,
        'is_paired', false,
        'agent_id', v_agent.id,
        'pairing_code', v_agent.pairing_code,
        'pairing_expires_at', v_agent.pairing_expires_at,
        'agent_token', v_agent.agent_token,
        'device_id', v_agent.device_id,
        'device_name', v_agent.device_name
      );
    END IF;
  ELSE
    -- Insert brand new agent
    INSERT INTO public.print_agents (
      device_id,
      device_name,
      agent_token,
      pairing_code,
      pairing_expires_at,
      is_paired,
      status,
      os_info,
      agent_version,
      last_seen
    ) VALUES (
      p_device_id,
      p_device_name,
      v_token,
      v_code,
      NOW() + interval '15 minutes',
      false,
      'online',
      p_os_info,
      p_agent_version,
      NOW()
    )
    RETURNING * INTO v_agent;

    RETURN jsonb_build_object(
      'success', true,
      'is_paired', false,
      'agent_id', v_agent.id,
      'pairing_code', v_agent.pairing_code,
      'pairing_expires_at', v_agent.pairing_expires_at,
      'agent_token', v_agent.agent_token,
      'device_id', v_agent.device_id,
      'device_name', v_agent.device_name
    );
  END IF;
END;
$$;

-- A2. Explicit Manual Pairing Code Regeneration (Only on user request)
CREATE OR REPLACE FUNCTION public.regenerate_print_agent_pairing_code(
  p_device_id TEXT,
  p_agent_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent public.print_agents%ROWTYPE;
  v_code TEXT;
BEGIN
  v_code := lpad(floor(random() * 900000 + 100000)::text, 6, '0');

  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE device_id = p_device_id AND agent_token = p_agent_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found or invalid token');
  END IF;

  IF v_agent.is_paired THEN
    RETURN jsonb_build_object(
      'success', true,
      'is_paired', true,
      'agent_id', v_agent.id,
      'restaurant_id', v_agent.restaurant_id,
      'device_id', v_agent.device_id,
      'device_name', v_agent.device_name
    );
  END IF;

  UPDATE public.print_agents
  SET pairing_code = v_code,
      pairing_expires_at = NOW() + interval '15 minutes',
      status = 'online',
      last_seen = NOW(),
      updated_at = NOW()
  WHERE id = v_agent.id
  RETURNING * INTO v_agent;

  RETURN jsonb_build_object(
    'success', true,
    'is_paired', false,
    'agent_id', v_agent.id,
    'pairing_code', v_agent.pairing_code,
    'pairing_expires_at', v_agent.pairing_expires_at,
    'device_id', v_agent.device_id,
    'device_name', v_agent.device_name
  );
END;
$$;

-- B. Pair Agent with Restaurant using Pairing Code
CREATE OR REPLACE FUNCTION public.pair_print_agent(
  p_pairing_code TEXT,
  p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent public.print_agents%ROWTYPE;
BEGIN
  -- Validate pairing code
  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE pairing_code = trim(p_pairing_code)
    AND pairing_expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired pairing code. Please check the code displayed on your Print Agent.'
    );
  END IF;

  -- Associate with restaurant
  UPDATE public.print_agents
  SET restaurant_id = p_restaurant_id,
      is_paired = true,
      pairing_code = NULL,
      pairing_expires_at = NULL,
      status = 'online',
      last_seen = NOW(),
      updated_at = NOW()
  WHERE id = v_agent.id
  RETURNING * INTO v_agent;

  RETURN jsonb_build_object(
    'success', true,
    'agent_id', v_agent.id,
    'restaurant_id', v_agent.restaurant_id,
    'device_id', v_agent.device_id,
    'device_name', v_agent.device_name,
    'agent_token', v_agent.agent_token,
    'status', v_agent.status
  );
END;
$$;

-- C. Unpair Agent
CREATE OR REPLACE FUNCTION public.unpair_print_agent(
  p_agent_id UUID,
  p_restaurant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.print_agents
  SET restaurant_id = NULL,
      is_paired = false,
      pairing_code = NULL,
      pairing_expires_at = NULL,
      status = 'offline',
      updated_at = NOW()
  WHERE id = p_agent_id AND restaurant_id = p_restaurant_id;

  DELETE FROM public.printer_devices WHERE agent_id = p_agent_id AND restaurant_id = p_restaurant_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- D. Sync Agent Installed Printers & Heartbeat
CREATE OR REPLACE FUNCTION public.sync_print_agent_printers(
  p_agent_token TEXT,
  p_printers JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent public.print_agents%ROWTYPE;
  v_printer_name TEXT;
  v_printer JSONB;
BEGIN
  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE agent_token = p_agent_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid agent token');
  END IF;

  -- Update agent heartbeat
  UPDATE public.print_agents
  SET status = 'online',
      last_seen = NOW(),
      updated_at = NOW()
  WHERE id = v_agent.id;

  IF v_agent.restaurant_id IS NOT NULL AND jsonb_typeof(p_printers) = 'array' THEN
    -- Upsert printer queues
    FOR v_printer IN SELECT * FROM jsonb_array_elements(p_printers)
    LOOP
      v_printer_name := v_printer->>'printer_name';
      IF v_printer_name IS NOT NULL AND char_length(trim(v_printer_name)) > 0 THEN
        INSERT INTO public.printer_devices (
          restaurant_id,
          agent_id,
          printer_name,
          role,
          paper_width,
          is_active,
          is_online
        ) VALUES (
          v_agent.restaurant_id,
          v_agent.id,
          trim(v_printer_name),
          COALESCE(v_printer->>'role', 'both'),
          COALESCE(v_printer->>'paper_width', '80mm'),
          true,
          true
        )
        ON CONFLICT (agent_id, printer_name)
        DO UPDATE SET
          is_online = true,
          updated_at = NOW();
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'agent_id', v_agent.id,
    'is_paired', v_agent.is_paired,
    'restaurant_id', v_agent.restaurant_id
  );
END;
$$;

-- E. Agent Acknowledges Print Job
CREATE OR REPLACE FUNCTION public.ack_print_job(
  p_agent_token TEXT,
  p_job_id UUID,
  p_status TEXT,
  p_error TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent public.print_agents%ROWTYPE;
  v_job public.print_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE agent_token = p_agent_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid agent token');
  END IF;

  SELECT * INTO v_job
  FROM public.print_jobs
  WHERE id = p_job_id AND agent_id = v_agent.id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found or belongs to another agent');
  END IF;

  UPDATE public.print_jobs
  SET status = p_status,
      error_message = p_error,
      printed_at = CASE WHEN p_status = 'printed' THEN NOW() ELSE printed_at END,
      attempts = attempts + 1
  WHERE id = v_job.id;

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- F. Polling fallback for pending jobs
CREATE OR REPLACE FUNCTION public.poll_pending_print_jobs(
  p_agent_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent public.print_agents%ROWTYPE;
  v_jobs JSONB;
BEGIN
  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE agent_token = p_agent_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid agent token');
  END IF;

  -- Update heartbeat
  UPDATE public.print_agents
  SET status = 'online',
      last_seen = NOW()
  WHERE id = v_agent.id;

  -- Fetch queued jobs that haven't expired
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'restaurant_id', restaurant_id,
      'agent_id', agent_id,
      'printer_name', printer_name,
      'job_type', job_type,
      'job_title', job_title,
      'payload_base64', payload_base64,
      'paper_width', paper_width,
      'status', status,
      'nonce', nonce,
      'created_at', created_at,
      'expires_at', expires_at
    ) ORDER BY created_at ASC
  ), '[]'::jsonb) INTO v_jobs
  FROM public.print_jobs
  WHERE agent_id = v_agent.id
    AND status IN ('queued', 'received')
    AND expires_at > NOW();

  RETURN jsonb_build_object(
    'success', true,
    'agent_id', v_agent.id,
    'is_paired', v_agent.is_paired,
    'restaurant_id', v_agent.restaurant_id,
    'jobs', COALESCE(v_jobs, '[]'::jsonb)
  );
END;
$$;

-- 8. GRANT PRIVILEGES FOR TABLES AND FUNCTIONS
GRANT ALL ON TABLE public.print_agents TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.printer_devices TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.print_jobs TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION public.register_print_agent(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_print_agent_pairing_code(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pair_print_agent(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unpair_print_agent(UUID, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_print_agent_printers(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ack_print_job(TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.poll_pending_print_jobs(TEXT) TO anon, authenticated, service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
