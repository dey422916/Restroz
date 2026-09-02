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
        .single();

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
      .single();

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
   * Secure Server-Side Privileged Account Creation (ADMIN or STAFF)
   * Invokes Edge Function 'create-admin' using the caller's authenticated session JWT.
   * Can ONLY be called by existing authenticated ADMIN users.
   */
  async createAdminUser(
    email: string,
    password: string,
    fullName: string,
    phone?: string,
    role: UserRole = 'ADMIN'
  ): Promise<UserProfile> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser || currentUser.role !== 'ADMIN') {
      throw new Error('Unauthorized: Only authenticated ADMIN users can create new admin or staff accounts.');
    }

    const targetRole = role === 'ADMIN' ? 'ADMIN' : 'STAFF';

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Authentication required: Valid session token missing.');
    }

    const { data, error } = await supabase.functions.invoke('create-admin', {
      body: { email: email.trim(), password, fullName: fullName.trim(), phone: phone?.trim() || '', role: targetRole },
    });

    if (error) {
      throw new Error(error.message || 'Edge Function failed to create account.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.user) {
      throw new Error('Failed to create account: No user returned.');
    }

    return {
      id: data.user.id,
      email: data.user.email,
      full_name: fullName.trim(),
      phone: phone?.trim() || '',
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
