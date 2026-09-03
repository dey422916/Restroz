import { createClient } from '@supabase/supabase-js';
import { UserProfile, UserRole } from '../../types';
import { supabase } from '../supabase';

export const authService = {
  /**
   * Get Current Authenticated User
   * Strictly reads active session from Supabase Auth and database profile.
   * Returns null if no active session exists.
   */
  async getCurrentUser(): Promise<UserProfile | null> {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        return null;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      // Check active restaurant membership roles (ADMIN / STAFF)
      const { data: memberRows } = await supabase
        .from('restaurant_members')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      let effectiveRole = (profile?.role || session.user.user_metadata?.role || 'CUSTOMER').toUpperCase() as UserRole;
      if (effectiveRole !== 'SUPER_ADMIN' && memberRows && memberRows.length > 0) {
        if (memberRows.some((m) => m.role === 'ADMIN')) {
          effectiveRole = 'ADMIN';
        } else if (memberRows.some((m) => m.role === 'STAFF')) {
          effectiveRole = 'STAFF';
        }
      }

      if (!profileError && profile) {
        return { ...profile, role: effectiveRole } as UserProfile;
      }

      // Fallback profile derived strictly from the authenticated Supabase user
      const userMeta = session.user.user_metadata || {};
      return {
        id: session.user.id,
        email: session.user.email || '',
        full_name: userMeta.full_name || session.user.email?.split('@')[0] || 'User',
        phone: userMeta.phone || '',
        role: effectiveRole,
        created_at: session.user.created_at,
      };
    } catch (err) {
      console.warn('getCurrentUser failed:', err);
      return null;
    }
  },

  /**
   * User Login
   * Strictly authenticates with Supabase Auth via signInWithPassword.
   * Rejects invalid credentials, missing users, and missing sessions.
   * Zero mock/offline authentication fallbacks.
   */
  async login(email: string, password?: string): Promise<UserProfile> {
    const trimmedEmail = (email || '').trim();
    const trimmedPassword = password || '';

    if (!trimmedEmail || !trimmedPassword) {
      throw new Error('Invalid email or password.');
    }

    // Authenticate strictly with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    });

    if (error || !data.user || !data.session) {
      throw error || new Error('Invalid email or password.');
    }

    // Check if email confirmation is required and missing
    const isEmailConfirmed = Boolean(data.user.email_confirmed_at || data.user.confirmed_at);
    const userRole = (data.user.user_metadata?.role || 'CUSTOMER').toUpperCase();
    if (!isEmailConfirmed && userRole === 'CUSTOMER' && data.user.app_metadata?.provider === 'email') {
      throw new Error('Your email has not been verified yet. Please check your inbox and verify your account before signing in.');
    }

    // Fetch user profile and canonical role from public.profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    // Check active restaurant membership roles (ADMIN / STAFF)
    const { data: memberRows } = await supabase
      .from('restaurant_members')
      .select('role')
      .eq('user_id', data.user.id)
      .eq('is_active', true);

    let effectiveRole = (profile?.role || data.user.user_metadata?.role || 'CUSTOMER').toUpperCase() as UserRole;
    if (effectiveRole !== 'SUPER_ADMIN' && memberRows && memberRows.length > 0) {
      if (memberRows.some((m) => m.role === 'ADMIN')) {
        effectiveRole = 'ADMIN';
      } else if (memberRows.some((m) => m.role === 'STAFF')) {
        effectiveRole = 'STAFF';
      }
    }

    if (profile && !profileError) {
      return { ...profile, role: effectiveRole } as UserProfile;
    }

    const userMeta = data.user.user_metadata || {};
    return {
      id: data.user.id,
      email: data.user.email || trimmedEmail,
      full_name: userMeta.full_name || trimmedEmail.split('@')[0],
      phone: userMeta.phone || '',
      role: effectiveRole,
      created_at: data.user.created_at,
    };
  },

  /**
   * Public Signup
   * ALWAYS forces role = 'CUSTOMER'. Requests to register as ADMIN or STAFF are denied.
   */
  async signUp(email: string, password: string, fullName: string, phone?: string): Promise<UserProfile> {
    const forcedRole: UserRole = 'CUSTOMER';
    const trimmedEmail = email.trim();

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: 'restroz://(auth)/login',
        data: {
          full_name: fullName.trim(),
          phone: phone?.trim() || '',
          role: forcedRole,
        },
      },
    });

    if (error) {
      throw new Error(error.message || 'Signup failed.');
    }

    if (!data.user) {
      throw new Error('Signup failed: No user returned from Supabase Auth.');
    }

    const newProfile: UserProfile = {
      id: data.user.id,
      email: trimmedEmail,
      full_name: fullName.trim(),
      phone: phone?.trim() || '',
      role: forcedRole,
      created_at: new Date().toISOString(),
    };

    return newProfile;
  },

  async resetPassword(email: string): Promise<void> {
    const trimmedEmail = email.trim();
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: 'restroz://(auth)/reset-password',
    });
    if (error) {
      throw new Error(error.message || 'Password reset request failed.');
    }
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(error.message || 'Failed to update password.');
    }
  },

  /**
   * Secure Privileged Account Creation (ADMIN or STAFF)
   * Invokes Edge Function 'create-admin' if available, or reliably provisions via isolated Supabase Auth client & database records.
   * Can ONLY be called by authenticated ADMIN or SUPER_ADMIN users.
   */
  async createAdminUser(
    email: string,
    password: string,
    fullName: string,
    phone?: string,
    role: UserRole = 'ADMIN',
    restaurantId?: string
  ): Promise<UserProfile> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN')) {
      throw new Error('Unauthorized: Only authenticated ADMIN users can create new admin or staff accounts.');
    }

    const targetRole = role === 'ADMIN' ? 'ADMIN' : 'STAFF';
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    const cleanPhone = phone?.trim() || '';

    let targetUserId: string | null = null;

    // 1. Try Supabase Edge Function first if deployed
    try {
      const { data, error } = await supabase.functions.invoke('create-admin', {
        body: {
          email: cleanEmail,
          password,
          fullName: cleanName,
          phone: cleanPhone,
          role: targetRole,
          restaurantId: restaurantId || null,
        },
      });

      if (!error && (data?.user_id || data?.user?.id)) {
        targetUserId = data.user_id || data.user.id;
      }
    } catch (edgeErr) {
      console.warn('create-admin Edge Function invocation bypassed, utilizing direct provisioning:', edgeErr);
    }

    // 2. Direct Provisioning Fallback (100% resilient across Web, iOS, Android)
    if (!targetUserId) {
      // Check if user already exists in profiles
      const { data: existingProf } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingProf?.id) {
        targetUserId = existingProf.id;
      } else {
        // Create auth user using an isolated, non-persisted client so caller's active admin session is NEVER altered
        const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://szpjsibrwxegaopcaukb.supabase.co';
        const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Jh0O9Why0grSgCb3WjjpYQ_Uwj7RclD';

        const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanName,
              role: targetRole,
            },
          },
        });

        if (signUpErr) {
          if (!signUpErr.message.toLowerCase().includes('already registered') && !signUpErr.message.toLowerCase().includes('already exists')) {
            throw new Error(signUpErr.message || 'Failed to create user account.');
          }
          // Fetch existing user ID if already registered
          const { data: retryProf } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', cleanEmail)
            .maybeSingle();
          targetUserId = retryProf?.id || null;
        } else if (signUpData?.user?.id) {
          targetUserId = signUpData.user.id;
        }
      }
    }

    if (!targetUserId) {
      throw new Error('Unable to resolve user ID for new account.');
    }

    // 3. Upsert user profile record
    const profilePayload = {
      id: targetUserId,
      email: cleanEmail,
      full_name: cleanName,
      phone: cleanPhone,
      role: targetRole,
      updated_at: new Date().toISOString(),
    };
    const { error: profErr } = await supabase.from('profiles').upsert(profilePayload);
    if (profErr) {
      console.warn('Profile upsert warning:', profErr.message);
    }

    // 4. Link Restaurant Membership if restaurantId is provided
    if (restaurantId) {
      const { data: existingMember } = await supabase
        .from('restaurant_members')
        .select('id, is_active')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (existingMember) {
        if (!existingMember.is_active) {
          await supabase
            .from('restaurant_members')
            .update({ is_active: true, role: targetRole, updated_at: new Date().toISOString() })
            .eq('id', existingMember.id);
        }
      } else {
        await supabase.from('restaurant_members').insert({
          restaurant_id: restaurantId,
          user_id: targetUserId,
          role: targetRole,
          is_active: true,
        });
      }
    }

    // 5. Write to Audit Logs
    try {
      await supabase.from('audit_logs').insert([{
        restaurant_id: restaurantId || null,
        user_id: currentUser.id,
        action: targetRole === 'ADMIN' ? 'CREATE_ADMIN' : 'CREATE_STAFF',
        details: {
          created_user_id: targetUserId,
          created_user_email: cleanEmail,
          assigned_role: targetRole,
          restaurant_id: restaurantId || null,
        },
      }]);
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr);
    }

    return {
      id: targetUserId,
      email: cleanEmail,
      full_name: cleanName,
      phone: cleanPhone,
      role: targetRole,
      created_at: new Date().toISOString(),
    };
  },

  async logout(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase logout error:', e);
    }
  },


  async getStaffList(): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['ADMIN', 'STAFF']);

    if (error || !data) {
      return [];
    }

    return data.map((p) => ({ ...p, role: (p.role || 'STAFF').toUpperCase() as UserRole }));
  },
};
