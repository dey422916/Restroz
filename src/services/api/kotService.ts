import { KOT, Order, KOTItem, OrderItem } from '../../types';
import { mockStorage } from '../mockStorage';
import { settingsService } from './settingsService';
import { supabase, isSupabaseConfigured } from '../supabase';
import { auditService } from './auditService';
import { DEFAULT_RESTAURANT_ID } from './restaurantService';
import { clearOrdersCache } from './orderService';

// High-performance in-memory cache for KOTs per tenant (10s TTL)
const inMemoryKotsCache: Record<string, { timestamp: number; data: KOT[] }> = {};
const KOTS_CACHE_TTL = 10 * 1000;

export function clearKotsCache(restaurantId?: string) {
  if (restaurantId) {
    delete inMemoryKotsCache[restaurantId];
  } else {
    Object.keys(inMemoryKotsCache).forEach((k) => delete inMemoryKotsCache[k]);
  }
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function getTodayDateBounds(): { startISO: string; endISO: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
}

export const kotService = {
  clearKotsCache,

  async getKots(restaurantId?: string, forceRefresh: boolean = false): Promise<KOT[]> {
    if (!restaurantId) return [];
    const now = Date.now();
    if (!forceRefresh && inMemoryKotsCache[restaurantId] && (now - inMemoryKotsCache[restaurantId].timestamp < KOTS_CACHE_TTL)) {
      return inMemoryKotsCache[restaurantId].data;
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('kots')
          .select('id, restaurant_id, kot_number, order_id, order_number, order_type, table_number, customer_name, kitchen_notes, status, created_at, items:kot_items(id, kot_id, product_name, quantity, notes)')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && data) {
          const scoped = (data as KOT[]).filter((k) => k.restaurant_id === restaurantId);
          inMemoryKotsCache[restaurantId] = {
            timestamp: now,
            data: scoped,
          };
          mockStorage.saveKots(scoped, restaurantId);
          return scoped;
        }
      } catch (e) {
        console.warn('Supabase getKots failed, using local cache:', e);
      }
    }
    const local = mockStorage.getKots(restaurantId).filter((k) => k.restaurant_id === restaurantId);
    inMemoryKotsCache[restaurantId] = {
      timestamp: now,
      data: local,
    };
    return local;
  },

  /**
   * Generates a unique sequential KOT number for a new order, resetting daily.
   * Format: KOT-001, KOT-002, KOT-003...
   */
  async generateNextUniqueKotNumber(restaurantId: string): Promise<string> {
    const settings = await settingsService.getSettings(restaurantId);
    const prefix = settings.kot_prefix || 'KOT-';
    const now = new Date();
    const { startISO, endISO } = getTodayDateBounds();
    let maxSeq = 0;

    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase
          .from('kots')
          .select('kot_number, created_at')
          .eq('restaurant_id', restaurantId)
          .gte('created_at', startISO)
          .lte('created_at', endISO)
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          for (const row of data) {
            if (row.kot_number) {
              const baseMatch = row.kot_number.replace(/-SUP.*$/i, '').match(/(\d+)/);
              if (baseMatch) {
                const num = parseInt(baseMatch[1], 10);
                if (!isNaN(num) && num > maxSeq) {
                  maxSeq = num;
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Supabase daily kot_number lookup failed:', e);
      }
    }

    const localKots = mockStorage.getKots(restaurantId);
    for (const k of localKots) {
      if (k.kot_number && k.created_at) {
        const kotDate = new Date(k.created_at);
        if (isSameDay(kotDate, now)) {
          const baseMatch = k.kot_number.replace(/-SUP.*$/i, '').match(/(\d+)/);
          if (baseMatch) {
            const num = parseInt(baseMatch[1], 10);
            if (!isNaN(num) && num > maxSeq) {
              maxSeq = num;
            }
          }
        }
      }
    }

    const nextSeq = (maxSeq + 1).toString().padStart(3, '0');
    return `${prefix}${nextSeq}`;
  },

  async generateKot(order: Order, kitchenNotes?: string, itemsToInclude?: OrderItem[]): Promise<KOT> {
    const targetRestId = order.restaurant_id || DEFAULT_RESTAURANT_ID;
    const settings = await settingsService.getSettings(targetRestId);
    const existingKots = await this.getKots(targetRestId);
    
    // Find all existing KOTs for THIS specific order
    const orderKots = (order.kots && order.kots.length > 0)
      ? order.kots
      : existingKots.filter((k) => k.order_id === order.id);
    const isSupplementary = orderKots.length > 0;

    let kotNumber: string;
    if (isSupplementary) {
      // Re-use the existing KOT number from the same order and append SUP
      const initialKot = orderKots[0];
      const rawNum = initialKot?.kot_number || `${settings.kot_prefix || 'KOT-'}001`;
      const baseKotNumber = rawNum.replace(/-SUP.*$/i, '').replace(/\s*\(SUP.*\)$/i, '').trim();
      const supCount = orderKots.length;
      kotNumber = supCount === 1 ? `${baseKotNumber}-SUP` : `${baseKotNumber}-SUP${supCount}`;
    } else {
      // Brand new order -> Generate next unique sequential KOT number resetting daily
      kotNumber = await this.generateNextUniqueKotNumber(targetRestId);
    }

    // If itemsToInclude is passed, generate KOT for those specific items; otherwise use all order.items
    const targetItems = itemsToInclude || order.items || [];

    const kotItems: KOTItem[] = targetItems.map((item) => ({
      id: 'kot-item-' + Date.now() + Math.random().toString(36).substr(2, 4),
      kot_id: '',
      product_name: item.product_name,
      quantity: item.quantity,
      notes: item.item_notes,
    }));

    const noteText =
      kitchenNotes ||
      (isSupplementary
        ? `[SUPPLEMENTARY KOT - SUP] ${order.notes ? order.notes : 'New items added'}`
        : order.notes || '');

    const newKot: KOT = {
      id: 'kot-' + Date.now() + Math.random().toString(36).substr(2, 4),
      restaurant_id: targetRestId,
      kot_number: kotNumber,
      order_id: order.id,
      order_number: order.order_number,
      order_type: order.order_type,
      table_number: order.table_number,
      customer_name: order.customer_name,
      kitchen_notes: noteText,
      status: 'pending',
      items: kotItems,
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        const { items, ...kotRecord } = newKot;
        const { data, error } = await supabase.from('kots').insert([kotRecord]).select().single();
        if (!error && data) {
          if (items && items.length > 0) {
            const formatted = items.map((i) => ({ ...i, kot_id: data.id }));
            await supabase.from('kot_items').insert(formatted);
          }
          await auditService.log(isSupplementary ? 'CREATE_SUPPLEMENTARY_KOT' : 'CREATE_KOT', {
            kot_number: kotNumber,
            order_number: order.order_number,
            items_count: items.length,
          });

          // Also update order in local mock storage
          const localOrders = mockStorage.getOrders(targetRestId);
          const orderIdx = localOrders.findIndex((o) => o.id === order.id);
          if (orderIdx !== -1) {
            const currentKots = localOrders[orderIdx].kots || [];
            localOrders[orderIdx] = {
              ...localOrders[orderIdx],
              status: 'kot_generated',
              kots: [...currentKots, { ...data, items } as KOT],
            };
            mockStorage.saveOrders(localOrders, targetRestId);
          }

          clearKotsCache(targetRestId);
          clearOrdersCache(targetRestId);
          await this.getKots(targetRestId, true);
          return { ...data, items } as KOT;
        }
      } catch (e) {
        console.warn('Supabase generateKot failed, fallback to local:', e);
      }
    }

    clearKotsCache(targetRestId);
    clearOrdersCache(targetRestId);
    existingKots.unshift(newKot);
    mockStorage.saveKots(existingKots, targetRestId);

    const localOrders = mockStorage.getOrders(targetRestId);
    const orderIdx = localOrders.findIndex((o) => o.id === order.id);
    if (orderIdx !== -1) {
      const currentKots = localOrders[orderIdx].kots || [];
      localOrders[orderIdx] = {
        ...localOrders[orderIdx],
        status: 'kot_generated',
        kots: [...currentKots, newKot],
      };
      mockStorage.saveOrders(localOrders, targetRestId);
    }

    return newKot;
  },

  /**
   * Generates a Kitchen Cancellation / Reduction Ticket when an item is removed or quantity reduced.
   */
  async generateCancellationTicket(
    order: Order,
    item: { product_name: string; old_quantity: number; new_quantity: number; reason?: string }
  ): Promise<KOT> {
    const cancelledQty = item.old_quantity - item.new_quantity;
    const reasonText = item.reason || 'Customer request / Item unavailable';
    const noteText = `⚠️ CANCELLED ITEM: ${cancelledQty}x ${item.product_name} (${item.old_quantity} -> ${item.new_quantity}). Reason: ${reasonText}`;

    const targetRestId = order.restaurant_id || DEFAULT_RESTAURANT_ID;
    const existingKots = await this.getKots(targetRestId);
    const baseKotNum = await this.generateNextUniqueKotNumber(targetRestId);
    const kotNumber = `${baseKotNum}-CNL`;

    const cancelItem: KOTItem = {
      id: 'kot-item-' + Date.now(),
      kot_id: '',
      product_name: item.product_name,
      quantity: -cancelledQty,
      notes: reasonText,
    };

    const newKot: KOT = {
      id: 'kot-cnl-' + Date.now(),
      restaurant_id: targetRestId,
      order_id: order.id,
      order_number: order.order_number,
      table_number: order.table_number,
      order_type: order.order_type,
      customer_name: order.customer_name,
      kitchen_notes: noteText,
      status: 'served',
      created_at: new Date().toISOString(),
      items: [cancelItem],
      kot_number: kotNumber,
    };

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('kots')
          .insert({
            restaurant_id: targetRestId,
            order_id: newKot.order_id,
            order_number: newKot.order_number,
            table_number: newKot.table_number,
            order_type: newKot.order_type,
            customer_name: newKot.customer_name,
            kitchen_notes: newKot.kitchen_notes,
            status: newKot.status,
            kot_number: newKot.kot_number,
          })
          .select()
          .single();

        if (!error && data) {
          await supabase.from('kot_items').insert([
            {
              kot_id: data.id,
              product_id: null,
              product_name: item.product_name,
              quantity: -cancelledQty,
              notes: reasonText,
            },
          ]);

          await auditService.log('CANCEL_KOT_ITEM', {
            order_number: order.order_number,
            item: item.product_name,
            cancelled_qty: cancelledQty,
            reason: reasonText,
          });
          await this.getKots(targetRestId);
          return { ...data, items: [cancelItem] } as KOT;
        }
      } catch (e) {
        console.warn('Supabase generateCancellationTicket failed:', e);
      }
    }

    existingKots.unshift(newKot);
    mockStorage.saveKots(existingKots, targetRestId);
    return newKot;
  },

  async updateKotStatus(kotId: string, status: 'pending' | 'in_progress' | 'ready' | 'served'): Promise<KOT> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('kots')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', kotId)
          .select('*, items:kot_items(*)')
          .single();

        if (!error && data) {
          // Sync with parent order status
          const parentOrderId = data.order_id;
          if (parentOrderId) {
            const mappedOrderStatus =
              status === 'in_progress'
                ? 'preparing'
                : status === 'ready'
                ? 'ready'
                : status === 'served'
                ? 'served'
                : 'confirmed';

            await supabase
              .from('orders')
              .update({ status: mappedOrderStatus, updated_at: new Date().toISOString() })
              .eq('id', parentOrderId);
          }

          await auditService.log('UPDATE_KOT_STATUS', {
            kot_id: kotId,
            status,
            order_id: parentOrderId,
          });

          await this.getKots(data.restaurant_id);
          return data as KOT;
        }
      } catch (e) {
        console.warn('Supabase updateKotStatus failed:', e);
      }
    }

    const kots = mockStorage.getKots();
    const idx = kots.findIndex((k) => k.id === kotId);
    if (idx !== -1) {
      kots[idx].status = status;
      mockStorage.saveKots(kots, kots[idx].restaurant_id);
      return kots[idx];
    }
    throw new Error('KOT not found');
  },
};
