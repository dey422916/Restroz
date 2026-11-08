-- ============================================================================
-- MIGRATION: 20261108000001_fix_print_agent_pairing_and_staff_routing.sql
-- DESCRIPTION: Ensure persistent pairing validity for active print agents,
--              automatic primary printer assignment, and staff print routing.
-- ============================================================================

-- 1. FIX register_print_agent: Refresh pairing expiration when expired
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
      -- Device exists but is not paired yet.
      -- If pairing code is missing or expired, keep/renew code and refresh expiration
      UPDATE public.print_agents
      SET device_name = p_device_name,
          pairing_code = COALESCE(v_agent.pairing_code, v_code),
          pairing_expires_at = CASE
            WHEN v_agent.pairing_expires_at IS NULL OR v_agent.pairing_expires_at <= NOW()
            THEN NOW() + interval '15 minutes'
            ELSE v_agent.pairing_expires_at
          END,
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

-- 2. FIX sync_print_agent_printers: Keep un-paired code alive while agent is running, and ensure primary printer exists
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
  v_has_primary BOOLEAN;
  v_is_first BOOLEAN := true;
BEGIN
  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE agent_token = p_agent_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid agent token');
  END IF;

  -- Update agent heartbeat and keep un-paired pairing_expires_at alive while agent is running
  UPDATE public.print_agents
  SET status = 'online',
      last_seen = NOW(),
      updated_at = NOW(),
      pairing_expires_at = CASE
        WHEN NOT is_paired AND (pairing_expires_at IS NULL OR pairing_expires_at <= NOW())
        THEN NOW() + interval '15 minutes'
        ELSE pairing_expires_at
      END
  WHERE id = v_agent.id;

  IF v_agent.restaurant_id IS NOT NULL AND jsonb_typeof(p_printers) = 'array' THEN
    -- Check if restaurant already has a primary printer configured
    SELECT EXISTS (
      SELECT 1 FROM public.printer_devices
      WHERE restaurant_id = v_agent.restaurant_id AND is_primary = true AND is_active = true
    ) INTO v_has_primary;

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
          is_primary,
          is_online
        ) VALUES (
          v_agent.restaurant_id,
          v_agent.id,
          trim(v_printer_name),
          COALESCE(v_printer->>'role', 'both'),
          COALESCE(v_printer->>'paper_width', '80mm'),
          true,
          (NOT v_has_primary AND v_is_first),
          true
        )
        ON CONFLICT (agent_id, printer_name)
        DO UPDATE SET
          is_online = true,
          updated_at = NOW();

        IF NOT v_has_primary AND v_is_first THEN
          v_has_primary := true;
        END IF;
        v_is_first := false;
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

-- 3. FIX pair_print_agent: Allow pairing if agent was active within 5 minutes even if timer expired
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
  -- Validate pairing code: allow if unexpired OR if agent heartbeated within 5 minutes
  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE pairing_code = trim(p_pairing_code)
    AND (pairing_expires_at > NOW() OR last_seen > NOW() - interval '5 minutes')
    AND NOT is_paired;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired pairing code. Please check the code displayed on your Print Agent.'
    );
  END IF;

  -- Associate with restaurant and mark paired
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

-- 4. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION public.register_print_agent(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_print_agent_printers(TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pair_print_agent(TEXT, UUID) TO anon, authenticated, service_role;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
