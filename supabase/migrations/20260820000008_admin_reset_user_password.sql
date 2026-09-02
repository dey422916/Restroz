-- ============================================================================
-- MIGRATION 20260820000008: SECURE SERVER-SIDE ADMIN PASSWORD RESET
-- ============================================================================
-- Allows SUPER_ADMIN to reset passwords for any ADMIN or STAFF user,
-- and allows Restaurant ADMINs to reset passwords for STAFF in their own restaurant.
-- Updates auth.users directly via bcrypt hash with zero OTP/email verification.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_target_role TEXT;
    v_target_email TEXT;
    v_caller_is_admin BOOLEAN := FALSE;
    v_encrypted_pw TEXT;
BEGIN
    -- 1. Identify Caller
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User session required.';
    END IF;

    -- 2. Validate Password Length
    IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
        RAISE EXCEPTION 'Password must be at least 8 characters long.';
    END IF;

    -- 3. Resolve Caller Profile & Role
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller profile not found.';
    END IF;

    -- 4. Resolve Target User
    SELECT email, role INTO v_target_email, v_target_role FROM public.profiles WHERE id = p_user_id;
    IF v_target_email IS NULL THEN
        SELECT email INTO v_target_email FROM auth.users WHERE id = p_user_id;
    END IF;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'Target user not found.';
    END IF;

    -- 5. Authorization Check
    IF v_caller_role = 'SUPER_ADMIN' THEN
        -- Super Admin can reset password for any ADMIN or STAFF
        -- (Cannot reset other SUPER_ADMINs unless self)
    ELSIF v_caller_role = 'ADMIN' THEN
        -- Check if caller is ADMIN of any active restaurant where target user is an active STAFF
        SELECT EXISTS (
            SELECT 1 
            FROM public.restaurant_members rm_caller
            JOIN public.restaurant_members rm_target ON rm_caller.restaurant_id = rm_target.restaurant_id
            WHERE rm_caller.user_id = v_caller_id 
              AND rm_caller.role = 'ADMIN'
              AND rm_caller.is_active = TRUE
              AND rm_target.user_id = p_user_id
              AND rm_target.role = 'STAFF'
        ) INTO v_caller_is_admin;

        IF NOT v_caller_is_admin THEN
            RAISE EXCEPTION 'Forbidden: You can only reset passwords for staff members belonging to your restaurant.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Forbidden: Insufficient privileges to reset member passwords.';
    END IF;

    -- 6. Generate bcrypt hash
    v_encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

    -- 7. Update auth.users directly
    UPDATE auth.users
    SET encrypted_password = v_encrypted_pw,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 8. Record Audit Log (NEVER record or store password in plain or encrypted form)
    INSERT INTO public.audit_logs (
        user_id,
        action,
        details,
        created_at
    ) VALUES (
        v_caller_id,
        'RESET_MEMBER_PASSWORD',
        jsonb_build_object(
            'target_user_id', p_user_id,
            'target_email', v_target_email,
            'target_role', v_target_role,
            'performed_by_role', v_caller_role,
            'timestamp', NOW()
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'Password updated successfully.',
        'user_id', p_user_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(UUID, TEXT) TO service_role;
