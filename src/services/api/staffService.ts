import { supabase, isSupabaseConfigured } from '../supabase';
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

    // 1. Check Plan Staff Limit if creating STAFF
    if (memberRole === 'STAFF') {
      const limitCheck = await subscriptionGuardService.checkPlanLimit(restaurantId, 'STAFF', 1);
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.message || 'Staff limit reached for your current plan. Please upgrade to add more staff.');
      }
    }

    if (isSupabaseConfigured) {
      try {
        // Attempt Server-Side RPC Provisioning first (Bypasses email rate limit, confirms immediately)
        const { data: rpcData, error: rpcErr } = await supabase.rpc('provision_privileged_user', {
          p_restaurant_id: restaurantId,
          p_email: cleanEmail,
          p_password: staffData.password || (memberRole === 'ADMIN' ? 'Ratnadeep1@' : 'Staff12345!'),
          p_full_name: cleanName,
          p_phone: staffData.phone?.trim() || null,
          p_role: memberRole,
          p_preset: staffData.preset || null,
          p_permissions: staffData.permissions || null,
        });

        if (!rpcErr && rpcData?.user_id) {
          return {
            success: true,
            member_id: rpcData.member_id,
            message: `${memberRole === 'ADMIN' ? 'Admin' : 'Staff'} member provisioned successfully.`,
          };
        }

        if (rpcErr) {
          if (rpcErr.message?.includes('already an active member')) {
            throw new Error(`This user (${cleanEmail}) is already an active member of this restaurant.`);
          }
          console.warn('provision_privileged_user RPC failed, evaluating fallback:', rpcErr.message);
        }
      } catch (rpcEx: any) {
        if (rpcEx.message?.includes('already an active member') || rpcEx.message?.includes('Forbidden') || rpcEx.message?.includes('Unauthorized')) {
          throw rpcEx;
        }
      }

      try {
        // Find or check existing profile by email
        let targetUserId: string | null = null;
        const { data: existingProf } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (existingProf) {
          targetUserId = existingProf.id;
        }

        // If user does not exist, create auth user
        if (!targetUserId) {
          const tempPassword = staffData.password || (memberRole === 'ADMIN' ? 'Ratnadeep1@' : 'Staff12345!');
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: cleanEmail,
            password: tempPassword,
            options: {
              data: {
                full_name: cleanName,
                role: memberRole,
              },
            },
          });

          if (signUpErr) {
            if (signUpErr.message.includes('rate limit') || signUpErr.message.includes('over_email_send_rate_limit')) {
              throw new Error(
                'Email provisioning rate limit reached. Please provision via database migration or assign an existing registered user.'
              );
            }
            if (!signUpErr.message.includes('already registered')) {
              throw new Error(`Failed to create account: ${signUpErr.message}`);
            }
          }
          targetUserId = signUpData.user?.id || null;
        }

        if (!targetUserId) {
          throw new Error('Unable to resolve user ID for new member.');
        }

        // Check if user is already a member of this specific restaurant
        const { data: existingMember } = await supabase
          .from('restaurant_members')
          .select('id, is_active, role')
          .eq('restaurant_id', restaurantId)
          .eq('user_id', targetUserId)
          .single();

        let memberId: string;
        if (existingMember) {
          if (existingMember.is_active) {
            throw new Error('This user is already an active member of this restaurant.');
          }
          // Reactivate
          await supabase
            .from('restaurant_members')
            .update({
              is_active: true,
              role: memberRole,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingMember.id);
          memberId = existingMember.id;
        } else {
          // Insert membership scoped to this restaurant
          const { data: newMem, error: memErr } = await supabase
            .from('restaurant_members')
            .insert({
              restaurant_id: restaurantId,
              user_id: targetUserId,
              role: memberRole,
              is_active: true,
            })
            .select()
            .single();

          if (memErr || !newMem) {
            throw new Error(`Failed to assign restaurant membership: ${memErr?.message}`);
          }
          memberId = newMem.id;
        }

        // Determine permissions
        let resolvedPerms: Partial<RestaurantMemberPermissions>;
        if (memberRole === 'ADMIN') {
          resolvedPerms = {
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
        } else {
          const resolvedPreset = staffData.preset && staffData.preset !== 'CUSTOM' ? PERMISSION_PRESETS[staffData.preset] : null;
          resolvedPerms = resolvedPreset || staffData.permissions || PERMISSION_PRESETS.CASHIER;
        }

        // Set permissions
        await this.updateStaffPermissions(memberId, resolvedPerms);

        await auditService.log('CREATE_STAFF', {
          restaurant_id: restaurantId,
          target_user_id: targetUserId,
          target_member_id: memberId,
          role: memberRole,
          email: staffData.email,
          preset: staffData.preset || (memberRole === 'ADMIN' ? 'ADMIN_FULL' : 'CUSTOM'),
        });

        return { success: true, member_id: memberId };
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
          // Delete only the restaurant_members row for this tenant (cascades permissions)
          // Preserves global profile, auth user, historical order references, and other memberships
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
          .single();

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

  // 6. Reset Member Password (Direct Server-Side Secure Reset via Edge Function)
  async resetStaffPassword(userId: string, newPassword: string, restaurantId?: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase not configured.');
    if (!userId) throw new Error('User ID is required.');
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('admin-reset-password', {
      body: {
        targetUserId: userId,
        newPassword: newPassword,
        restaurantId: restaurantId || undefined,
      },
    });

    if (edgeErr) {
      let detailMsg = edgeErr.message || 'Failed to update password.';
      if (edgeData?.error) {
        detailMsg = edgeData.error;
      }
      throw new Error(detailMsg);
    }

    if (edgeData?.error) {
      throw new Error(edgeData.error);
    }

    if (!edgeData?.success) {
      throw new Error('Password update request could not be completed by Edge Function.');
    }
  },
};
