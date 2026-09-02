import { supabase, isSupabaseConfigured } from '../supabase';

export interface AuditLogEntry {
  id?: string;
  user_id?: string;
  user_name?: string;
  action: string;
  details?: Record<string, any>;
  created_at?: string;
}

export const auditService = {
  async log(actionOrEntry: string | { action: string; entity_type?: string; entity_id?: string; details?: Record<string, any> }, details?: Record<string, any>): Promise<void> {
    try {
      let userId: string | undefined;
      let userName: string | undefined;

      const action = typeof actionOrEntry === 'string' ? actionOrEntry : actionOrEntry.action;
      const finalDetails = typeof actionOrEntry === 'string' ? (details || {}) : (actionOrEntry.details || {});

      if (isSupabaseConfigured) {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          userId = userData.user.id;
          userName = userData.user.user_metadata?.full_name || userData.user.email;
        }

        await supabase.from('audit_logs').insert([
          {
            user_id: userId,
            user_name: userName || 'Staff / System',
            action,
            details: finalDetails,
            created_at: new Date().toISOString(),
          },
        ]);
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
