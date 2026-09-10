import { DiningTable, TableSection } from '../../types';
import { mockStorage } from '../mockStorage';
import { supabase, isSupabaseConfigured } from '../supabase';
import { getTableQrUrl } from '../../utils/qr';
import { subscriptionGuardService } from './subscriptionGuardService';

export const tableService = {
  async resolveTable(identifier: string): Promise<DiningTable | null> {
    if (!identifier || identifier === 'general') return null;

    let resolved: DiningTable | null = null;

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('resolve_qr_table', {
          p_identifier: identifier,
        });
        if (!error && data) {
          const row = Array.isArray(data) ? data[0] : data;
          if (row && (row.table_id || row.id)) {
            resolved = {
              id: row.table_id || row.id || identifier,
              table_number: row.table_number || (identifier.startsWith('tbl-') ? identifier.replace('tbl-', 'Table ') : `Table ${identifier}`),
              restaurant_id: row.restaurant_id,
              status: (row.table_status || row.status || 'available') as 'available' | 'occupied' | 'reserved',
              section: (row.section || 'Ground Floor') as TableSection,
              seating_capacity: Number(row.seating_capacity) || 4,
              is_active: row.is_active !== undefined ? Boolean(row.is_active) : true,
              qr_code_hash: row.qr_code_url || row.qr_code_hash || `QR_${identifier}`,
              restaurant_name: row.restaurant_name,
              restaurant_slug: row.restaurant_slug,
            } as DiningTable;
          }
        }
      } catch (err) {
        console.warn('resolve_qr_table RPC failed, falling back to direct table query:', err);
      }

      if (!resolved) {
        try {
          const { data, error } = await supabase
            .from('tables')
            .select('*')
            .or(`id.eq.${identifier},qr_code_hash.eq.${identifier},table_number.ilike.${identifier}`)
            .maybeSingle();

          if (!error && data) {
            resolved = data as DiningTable;
          }
        } catch (tblErr) {
          console.warn('Direct table query error:', tblErr);
        }
      }

      return resolved;
    }

    // Fallback to local cache for offline/mock
    const all = mockStorage.getTables();
    return all.find(t => t.id === identifier || t.qr_code_hash === identifier || t.table_number.toLowerCase() === identifier.toLowerCase()) || null;
  },

  async getTables(restaurantId?: string): Promise<DiningTable[]> {
    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('tables')
          .select('*')
          .order('table_number', { ascending: true });

        let ordersQuery = supabase
          .from('orders')
          .select('id, table_id, table_number, status, payment_status')
          .not('status', 'in', '("completed","cancelled")')
          .neq('payment_status', 'paid');

        if (restaurantId) {
          query = query.eq('restaurant_id', restaurantId);
          ordersQuery = ordersQuery.eq('restaurant_id', restaurantId);
        }

        const [{ data: tableData, error: tableError }, { data: activeOrders }] = await Promise.all([
          query,
          ordersQuery,
        ]);

        if (!tableError && tableData) {
          const activeOrderMap = new Map<string, string>();
          (activeOrders || []).forEach((o) => {
            if (o.table_id) activeOrderMap.set(o.table_id, o.id);
            if (o.table_number) activeOrderMap.set(o.table_number.toLowerCase().trim(), o.id);
          });

          const list: DiningTable[] = (tableData as DiningTable[]).map((t) => {
            const currentOrderId = activeOrderMap.get(t.id) || activeOrderMap.get(t.table_number.toLowerCase().trim());
            const status: 'available' | 'occupied' | 'reserved' = currentOrderId
              ? 'occupied'
              : t.status === 'reserved'
              ? 'reserved'
              : 'available';

            return {
              ...t,
              restaurant_id: t.restaurant_id || restaurantId,
              status,
              current_order_id: currentOrderId,
            };
          });

          mockStorage.saveTables(list);
          return list;
        }
      } catch (e) {
        console.warn('Supabase getTables failed, using local cache:', e);
      }
    }
    return mockStorage.getTables();
  },

  async saveTable(table: Partial<DiningTable>, restaurantId?: string): Promise<DiningTable> {
    const targetRestId = table.restaurant_id || restaurantId || '';

    // Check Plan Table Limit if creating a new table
    if (!table.id) {
      const limitCheck = await subscriptionGuardService.checkPlanLimit(targetRestId, 'TABLES', 1);
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.message || 'Table limit reached for your current plan. Please upgrade to add more tables.');
      }
    }
    const tableNumber = (table.table_number || '').trim();
    if (!tableNumber) {
      throw new Error('Table number is required.');
    }
    const seatingCapacity = Number(table.seating_capacity) || 4;
    if (seatingCapacity <= 0) {
      throw new Error('Seating capacity must be a positive number.');
    }

    // Check for duplicate table number within this restaurant
    const existingTables = await this.getTables(targetRestId);
    const isDuplicate = existingTables.some(
      (t) => t.id !== table.id && t.table_number.toLowerCase() === tableNumber.toLowerCase()
    );
    if (isDuplicate) {
      throw new Error(`Table number "${tableNumber}" already exists in this restaurant.`);
    }

    const tableId =
      table.id ||
      'tbl-' + targetRestId.slice(0, 8) + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    const qrHash = table.qr_code_hash || `QR_TBL_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload = {
      ...table,
      id: tableId,
      restaurant_id: targetRestId,
      table_number: tableNumber,
      seating_capacity: seatingCapacity,
      section: table.section || 'Ground Floor',
      qr_code_hash: qrHash,
      status: table.status || 'available',
      is_active: table.is_active ?? true,
    };

    if (isSupabaseConfigured) {
      try {
        if (table.id) {
          const { data, error } = await supabase
            .from('tables')
            .update(payload)
            .eq('id', table.id)
            .select()
            .single();

          if (!error && data) {
            await this.getTables(targetRestId);
            return data as DiningTable;
          }
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('tables')
            .insert([payload])
            .select()
            .single();

          if (!error && data) {
            await this.getTables(targetRestId);
            return data as DiningTable;
          }
          if (error) throw error;
        }
      } catch (e: any) {
        console.error('Supabase saveTable error:', e);
        throw new Error(e.message || 'Failed to save table in Supabase.');
      }
    }

    if (table.id) {
      const updated = mockStorage.updateTable(table.id, payload);
      if (!updated) throw new Error('Table not found in local cache.');
      return updated;
    } else {
      return mockStorage.addTable(payload as Omit<DiningTable, 'id'>);
    }
  },

  async deleteTable(id: string, restaurantId?: string): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        let query = supabase.from('tables').delete().eq('id', id);
        if (restaurantId) {
          query = query.eq('restaurant_id', restaurantId);
        }
        const { error } = await query;
        if (error) throw error;
        await this.getTables(restaurantId);
        return;
      } catch (e: any) {
        console.error('Supabase deleteTable error:', e);
        throw new Error(e.message || 'Failed to delete table from Supabase.');
      }
    }
    mockStorage.deleteTable(id);
  },

  async updateTableStatus(id: string, status: 'available' | 'occupied' | 'reserved'): Promise<DiningTable> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('tables')
          .update({ status })
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          return data as DiningTable;
        }
      } catch (e) {
        console.warn('Supabase updateTableStatus failed, falling back:', e);
      }
    }
    const updated = mockStorage.updateTable(id, { status });
    if (updated) return updated;

    // Graceful fallback representation for newly created database tables
    return {
      id,
      table_number: id,
      seating_capacity: 4,
      section: 'Main Area' as TableSection,
      status,
      is_active: true,
      qr_code_hash: `QR_${id}`,
    };
  },

  async createBulkTables(
    paramsOrCount: { count: number; startingNumber?: number; section?: TableSection; seatingCapacity?: number } | number,
    sectionOrRestId: TableSection | string = 'Ground Floor',
    capacity: number = 4,
    startNumber: number = 1,
    restaurantId?: string
  ): Promise<{ createdCount: number; tables: DiningTable[] }> {
    let count: number;
    let section: TableSection = 'Ground Floor';
    let cap = 4;
    let start = 1;
    let restId = restaurantId;

    if (typeof paramsOrCount === 'object') {
      count = paramsOrCount.count;
      section = paramsOrCount.section || 'Ground Floor';
      cap = paramsOrCount.seatingCapacity || 4;
      start = paramsOrCount.startingNumber || 1;
      if (typeof sectionOrRestId === 'string' && sectionOrRestId.length > 15) {
        restId = sectionOrRestId;
      }
    } else {
      count = paramsOrCount;
      section = typeof sectionOrRestId === 'string' ? (sectionOrRestId as TableSection) : 'Ground Floor';
      cap = capacity;
      start = startNumber;
    }

    if (!restId) {
      throw new Error('Restaurant ID is required to create tables.');
    }

    const tables = await this.bulkCreateTables(count, section, cap, start, restId);
    return { createdCount: tables.length, tables };
  },

  async bulkCreateTables(
    count: number,
    section: TableSection = 'Ground Floor',
    capacity: number = 4,
    startNumber: number = 1,
    restaurantId?: string
  ): Promise<DiningTable[]> {
    if (!restaurantId) {
      throw new Error('Restaurant ID is required to bulk create tables.');
    }
    // Check bulk table plan limit upfront
    const limitCheck = await subscriptionGuardService.checkPlanLimit(restaurantId, 'TABLES', count);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.message || `Your plan does not permit adding ${count} more tables. Please upgrade your subscription.`);
    }

    const created: DiningTable[] = [];
    for (let i = 0; i < count; i++) {
      const tableNum = `Table ${startNumber + i}`;
      try {
        const t = await this.saveTable({
          restaurant_id: restaurantId,
          table_number: tableNum,
          section,
          seating_capacity: capacity,
          status: 'available',
          is_active: true,
        }, restaurantId);
        created.push(t);
      } catch (e) {
        // Skip duplicate
      }
    }
    return created;
  },

  async toggleTableActive(id: string, active?: boolean, restaurantId?: string): Promise<DiningTable> {
    const tbls = await this.getTables(restaurantId);
    const found = tbls.find((t) => t.id === id);
    if (!found) throw new Error('Table not found.');
    const newActive = active !== undefined ? active : !found.is_active;
    return this.saveTable({ ...found, is_active: newActive }, restaurantId || found.restaurant_id);
  },

  getTableQrUrl(tableId: string): string {
    return getTableQrUrl(tableId);
  },

  async exportAllTableQrsPdf(providedTables?: DiningTable[], restaurantId?: string): Promise<void> {
    const { printService } = await import('../printService');
    const tbls = providedTables || (await this.getTables(restaurantId));
    const { settingsService } = await import('./settingsService');
    const settings = await settingsService.getSettings(restaurantId);
    await printService.exportAllTablesPdf(tbls, settings);
  },
};
