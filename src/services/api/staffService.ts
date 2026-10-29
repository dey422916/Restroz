import { createClient } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase';
import {
  StaffMemberWithDetails,
  RestaurantMemberPermissions,
  StaffPermissionPreset,
  PERMISSION_PRESETS,
} from '../../types';
import { auditService } from './auditService';
import { subscriptionGuardService } from './subscriptionGuardService';

export const staffService = {
  // 1. Get All Staff Members for a Restaurant
  async getStaffMembers(restaurantId: string): Promise<StaffMemberWithDetails[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('restaurant_members')
          .select(`
            id,
            user_id,
            restaurant_id,
            role,
            is_active,
            created_at,
            permissions:restaurant_member_permissions(*)
          `)
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          const userIds = data.map((item: any) => item.user_id).filter(Boolean);
          let profileMap: Record<string, any> = {};

          if (userIds.length > 0) {
            try {
              const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, email, phone, role')
                .in('id', userIds);

              (profiles || []).forEach((p: any) => {
                profileMap[p.id] = p;
              });
            } catch (pErr) {
              console.warn('Failed to load member profiles:', pErr);
            }
          }

          return data.map((item: any) => {
            const profile = profileMap[item.user_id] || {};
            const rawPerms = Array.isArray(item.permissions) ? item.permissions[0] : item.permissions;
            const perms: RestaurantMemberPermissions = rawPerms || {
              restaurant_member_id: item.id,
              can_use_pos: true,
              can_view_orders: true,
              can_edit_orders: item.role === 'ADMIN',
              can_cancel_orders: item.role === 'ADMIN',
              can_manage_products: item.role === 'ADMIN',
              can_manage_categories: item.role === 'ADMIN',
              can_manage_tables: item.role === 'ADMIN',
              can_manage_coupons: item.role === 'ADMIN',
              can_view_reports: item.role === 'ADMIN',
              can_manage_register: item.role === 'ADMIN',
              can_view_settings: item.role === 'ADMIN',
              can_manage_settings: item.role === 'ADMIN',
              can_manage_staff: item.role === 'ADMIN',
            };

            return {
              id: item.id,
              user_id: item.user_id,
              restaurant_id: item.restaurant_id,
              role: item.role,
              is_active: item.is_active,
              created_at: item.created_at,
              full_name: profile.full_name || 'Staff Member',
              email: profile.email || 'staff@example.com',
              phone: profile.phone || '',
              permissions: perms,
              profile: profileMap[item.user_id] || undefined,
            };
          });
        }
      } catch (err: any) {
        console.warn('getStaffMembers error:', err.message);
      }
    }

    // Mock Fallback
    return [
      {
        id: 'mem-admin-1',
        user_id: 'usr-admin-1',
        restaurant_id: restaurantId,
        role: 'ADMIN',
        is_active: true,
        created_at: new Date().toISOString(),
        full_name: 'Ratnadeep Dey (Owner)',
        email: 'ratnadeepdey13@gmail.com',
        phone: '+91 99999 00000',
        permissions: {
          restaurant_member_id: 'mem-admin-1',
          can_use_pos: true,
          can_view_orders: true,
          can_edit_orders: true,
          can_cancel_orders: true,
          can_manage_products: true,
          can_manage_categories: true,
          can_manage_tables: true,
          can_manage_coupons: true,
          can_view_reports: true,
          can_manage_register: true,
          can_view_settings: true,
          can_manage_settings: true,
          can_manage_staff: true,
        },
      },
    ];
  },

  // 2. Provision / Add a New Staff or Admin Member
  async provisionStaff(
    restaurantId: string,
    staffData: {
      full_name: string;
      email: string;
      phone?: string;
      password?: string;
      role?: 'ADMIN' | 'STAFF';
      preset?: StaffPermissionPreset;
      permissions?: Partial<RestaurantMemberPermissions>;
    }
  ): Promise<{ success: boolean; member_id?: string; message?: string }> {
    const memberRole: 'ADMIN' | 'STAFF' = staffData.role === 'ADMIN' ? 'ADMIN' : 'STAFF';
    const cleanEmail = staffData.email.trim().toLowerCase();
    const cleanName = staffData.full_name.trim();

    // 1. Check Plan Limits (2 Admins, 3 Staff minimum across all plans)
    if (memberRole === 'STAFF') {
      const limitCheck = await subscriptionGuardService.checkPlanLimit(restaurantId, 'STAFF', 1);
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.message || 'Staff limit reached for your current plan. Please upgrade to add more staff.');
      }
    } else if (memberRole === 'ADMIN' && isSupabaseConfigured) {
      try {
        const { count: adminCount } = await supabase
          .from('restaurant_members')
          .select('*', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('role', 'ADMIN')
          .eq('is_active', true);

        if ((adminCount || 0) >= 2) {
          const { data: existingProf } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', cleanEmail)
            .maybeSingle();

          let isExistingMember = false;
          if (existingProf) {
            const { data: mem } = await supabase
              .from('restaurant_members')
              .select('id')
              .eq('restaurant_id', restaurantId)
              .eq('user_id', existingProf.id)
              .maybeSingle();
            if (mem) isExistingMember = true;
          }

          if (!isExistingMember) {
            throw new Error(`Admin limit reached: You can have up to 2 Admin accounts per restaurant.`);
          }
        }
      } catch (err: any) {
        if (err.message?.includes('Admin limit reached')) throw err;
      }
    }

    if (isSupabaseConfigured) {
      try {
        const resolvedPassword = staffData.password && staffData.password.trim() ? staffData.password.trim() : 'Staff12345!';

        // 1. Authoritative Server-Side Provisioning RPC (Bypasses SMTP email rate limits completely, sets confirmed email)
        const { data: rpcData, error: rpcErr } = await supabase.rpc('provision_privileged_user', {
          p_restaurant_id: restaurantId,
          p_email: cleanEmail,
          p_password: resolvedPassword,
          p_full_name: cleanName,
          p_phone: staffData.phone?.trim() || null,
          p_role: memberRole,
          p_preset: staffData.preset || (memberRole === 'STAFF' ? 'CASHIER' : null),
          p_permissions: staffData.permissions ? staffData.permissions : null,
        });

        if (rpcErr) {
          console.error('provision_privileged_user RPC error in staffService:', rpcErr);
          throw new Error(rpcErr.message || `Failed to provision ${memberRole.toLowerCase()} account.`);
        }

        if (rpcData?.user_id) {
          return {
            success: true,
            member_id: rpcData.member_id,
            message: `${memberRole} account provisioned immediately without email verification.`,
          };
        }

        throw new Error(`Failed to provision ${memberRole.toLowerCase()} account: no user ID returned.`);
      } catch (err: any) {
        throw new Error(err.message || 'Failed to provision member.');
      }
    }

    return { success: true, member_id: 'mem-mock-' + Date.now() };
  },

  // 3. Update Permissions
  async updateStaffPermissions(
    memberId: string,
    permissions: Partial<RestaurantMemberPermissions>
  ): Promise<boolean> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('update_staff_permissions', {
          p_restaurant_member_id: memberId,
          p_permissions: permissions,
        });

        if (error) {
          // Fallback direct upsert
          const { error: upsertErr } = await supabase
            .from('restaurant_member_permissions')
            .upsert({
              restaurant_member_id: memberId,
              ...permissions,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'restaurant_member_id' });

          return !upsertErr;
        }
        return true;
      } catch (err: any) {
        console.warn('updateStaffPermissions error:', err.message);
      }
    }
    return true;
  },

  // 4. Activate / Deactivate / Remove Staff Membership (Preserves global user and other restaurant memberships)
  async setMembershipStatus(
    memberId: string,
    action: 'ACTIVATE' | 'DEACTIVATE' | 'REMOVE'
  ): Promise<boolean> {
    if (isSupabaseConfigured) {
      try {
        if (action === 'REMOVE') {
          // Delete permissions row first to guarantee clean deletion even without DB cascade
          await supabase.from('restaurant_member_permissions').delete().eq('restaurant_member_id', memberId);
          const { error: delErr } = await supabase.from('restaurant_members').delete().eq('id', memberId);
          if (delErr) {
            console.warn('Direct delete failed, trying RPC:', delErr.message);
            await supabase.rpc('set_staff_membership_status', {
              p_restaurant_member_id: memberId,
              p_action: 'REMOVE',
            });
          }
          return true;
        } else if (action === 'ACTIVATE') {
          await supabase.from('restaurant_members').update({ is_active: true, updated_at: new Date().toISOString() }).eq('id', memberId);
          return true;
        } else if (action === 'DEACTIVATE') {
          await supabase.from('restaurant_members').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', memberId);
          return true;
        }
      } catch (err: any) {
        console.warn('setMembershipStatus error:', err.message);
      }
    }
    return true;
  },

  // Dedicated Remove Member Method
  async removeMember(memberId: string): Promise<boolean> {
    return this.setMembershipStatus(memberId, 'REMOVE');
  },

  // 5. Get Permissions for Current User in Active Restaurant
  async getCurrentUserPermissions(
    userId: string,
    restaurantId: string
  ): Promise<RestaurantMemberPermissions> {
    const defaultAdminPerms: RestaurantMemberPermissions = {
      restaurant_member_id: '',
      can_use_pos: true,
      can_view_orders: true,
      can_edit_orders: true,
      can_cancel_orders: true,
      can_manage_products: true,
      can_manage_categories: true,
      can_manage_tables: true,
      can_manage_coupons: true,
      can_view_reports: true,
      can_manage_register: true,
      can_view_settings: true,
      can_manage_settings: true,
      can_manage_staff: true,
    };

    if (isSupabaseConfigured) {
      try {
        const { data: member } = await supabase
          .from('restaurant_members')
          .select(`
            id,
            role,
            is_active,
            permissions:restaurant_member_permissions(*)
          `)
          .eq('user_id', userId)
          .eq('restaurant_id', restaurantId)
          .maybeSingle();

        if (member) {
          if (member.role === 'ADMIN') {
            return defaultAdminPerms;
          }
          const rawPerms = Array.isArray(member.permissions) ? member.permissions[0] : member.permissions;
          if (rawPerms) {
            return rawPerms as RestaurantMemberPermissions;
          }
        }
      } catch (err: any) {
        console.warn('getCurrentUserPermissions error:', err.message);
      }
    }

    return defaultAdminPerms;
  },

  // 6. Reset Member Password (Direct Server-Side Secure Reset via RPC / Edge Function)
  async resetStaffPassword(userId: string, newPassword: string, restaurantId?: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');
    if (!userId) throw new Error('User ID is required.');
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    // 1. Try Direct PostgreSQL RPC
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_reset_user_password', {
        p_user_id: userId,
        p_new_password: newPassword,
      });

      if (!rpcErr && (rpcData?.success || rpcData?.user_id)) {
        return;
      }
      if (rpcErr) {
        if (rpcErr.message.includes('Forbidden') || rpcErr.message.includes('Password must be') || rpcErr.message.includes('Target user not found')) {
          throw new Error(rpcErr.message);
        }
      }
    } catch (rpcEx: any) {
      if (rpcEx.message?.includes('Forbidden') || rpcEx.message?.includes('Password must be') || rpcEx.message?.includes('Target user not found')) {
        throw rpcEx;
      }
      console.warn('admin_reset_user_password RPC fallback:', rpcEx?.message);
    }

    // 2. Fallback to Edge Function
    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('admin-reset-password', {
        body: {
          targetUserId: userId,
          newPassword: newPassword,
          restaurantId: restaurantId || undefined,
        },
      });

      if (!edgeErr && edgeData?.success) {
        return;
      }
      if (edgeErr || edgeData?.error) {
        throw new Error(edgeData?.error || edgeErr?.message || 'Password update failed.');
      }
    } catch (edgeEx: any) {
      throw new Error(edgeEx.message || 'Failed to update password.');
    }
  },
};
