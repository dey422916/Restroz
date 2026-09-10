import { supabase, isSupabaseConfigured } from '../supabase';

export interface AuditLogEntry {
  id?: string;
  restaurant_id?: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at?: string;
}

export const auditService = {
  async log(
    actionOrEntry: string | { action: string; entity_type?: string; entity_id?: string; details?: Record<string, any>; new_values?: Record<string, any>; old_values?: Record<string, any>; restaurant_id?: string },
    details?: Record<string, any>
  ): Promise<void> {
    try {
      let userId: string | undefined;
      let restaurantId: string | undefined;

      let action = '';
      let entityType = 'GENERAL';
      let entityId: string | undefined;
      let newValues: Record<string, any> | undefined;
      let oldValues: Record<string, any> | undefined;

      if (typeof actionOrEntry === 'string') {
        action = actionOrEntry;
        newValues = details || {};
        if (action.includes('ORDER')) entityType = 'ORDER';
        else if (action.includes('KOT')) entityType = 'KOT';
        else if (action.includes('STAFF')) entityType = 'STAFF';
        else if (action.includes('REGISTER') || action.includes('SESSION')) entityType = 'DAY_REGISTER';
        else if (action.includes('AUTH') || action.includes('LOGIN')) entityType = 'AUTH';

        if (newValues?.order_id) entityId = String(newValues.order_id);
        else if (newValues?.kot_id) entityId = String(newValues.kot_id);
        else if (newValues?.session_id) entityId = String(newValues.session_id);
        else if (newValues?.id) entityId = String(newValues.id);

        if (newValues?.restaurant_id) {
          restaurantId = String(newValues.restaurant_id);
        }
      } else {
        action = actionOrEntry.action;
        entityType = actionOrEntry.entity_type || 'GENERAL';
        entityId = actionOrEntry.entity_id;
        newValues = actionOrEntry.new_values || actionOrEntry.details || details || {};
        oldValues = actionOrEntry.old_values;
        restaurantId = actionOrEntry.restaurant_id || newValues?.restaurant_id;
      }

      if (isSupabaseConfigured) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          userId = userData.user.id;
        }

        // If restaurantId is not provided in payload, resolve it from the user's active restaurant membership
        if (!restaurantId && userId) {
          try {
            const { data: member } = await supabase
              .from('restaurant_members')
              .select('restaurant_id')
              .eq('user_id', userId)
              .eq('is_active', true)
              .limit(1)
              .maybeSingle();

            if (member?.restaurant_id) {
              restaurantId = member.restaurant_id;
            }
          } catch (mErr) {
            console.warn('AuditLog member lookup fallback:', mErr);
          }
        }

        // Fallback to active restaurant if still not resolved
        if (!restaurantId) {
          try {
            const { data: defaultRest } = await supabase
              .from('restaurants')
              .select('id')
              .eq('status', 'ACTIVE')
              .limit(1)
              .maybeSingle();
            if (defaultRest?.id) {
              restaurantId = defaultRest.id;
            }
          } catch (dErr) {
            console.warn('AuditLog default restaurant fallback:', dErr);
          }
        }

        if (!restaurantId) {
          console.warn('Skipping audit_logs insert: No valid restaurant_id available for RLS policy.');
          return;
        }

        const insertPayload: Record<string, any> = {
          restaurant_id: restaurantId,
          user_id: userId || null,
          action,
          entity_type: entityType,
          entity_id: entityId || null,
          new_values: newValues || null,
          old_values: oldValues || null,
          created_at: new Date().toISOString(),
        };

        const { error: insErr } = await supabase.from('audit_logs').insert([insertPayload]);
        if (insErr) {
          console.warn('Audit log write error:', insErr.message || insErr);
        }
      }
    } catch (err) {
      console.warn('Audit log write exception:', err);
    }
  },

  async getLogs(limit = 50): Promise<AuditLogEntry[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (!error && data) {
          return data as AuditLogEntry[];
        }
      } catch (err) {
        console.warn('Failed to fetch audit logs:', err);
      }
    }
    return [];
  },
};

