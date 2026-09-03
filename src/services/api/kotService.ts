import { KOT, Order, KOTItem, OrderItem } from '../../types';
import { mockStorage } from '../mockStorage';
import { settingsService } from './settingsService';
import { supabase, isSupabaseConfigured } from '../supabase';
import { auditService } from './auditService';
import { DEFAULT_RESTAURANT_ID } from './restaurantService';

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

  async generateKot(order: Order, kitchenNotes?: string, itemsToInclude?: OrderItem[]): Promise<KOT> {
    const targetRestId = order.restaurant_id || DEFAULT_RESTAURANT_ID;
    const settings = await settingsService.getSettings(targetRestId);
    const existingKots = await this.getKots(targetRestId);
    const orderKots = existingKots.filter((k) => k.order_id === order.id);
    const isSupplementary = orderKots.length > 0;

    const kotSeq = (existingKots.length + 1).toString().padStart(4, '0');
    const baseKotNumber = `${settings.kot_prefix || 'KOT-'}${kotSeq}`;
    const kotNumber = isSupplementary ? `${baseKotNumber}-SUP` : baseKotNumber;

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
        ? `[SUPPLEMENTARY KOT] ${order.notes ? order.notes : 'New items added'}`
        : order.notes || '');

    const newKot: KOT = {
      id: 'kot-' + Date.now() + Math.random().toString(36).substr(2, 4),
      restaurant_id: order.restaurant_id,
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
          await this.getKots();
          return { ...data, items } as KOT;
        }
      } catch (e) {
        console.warn('Supabase generateKot failed, fallback to local:', e);
      }
    }

    existingKots.unshift(newKot);
    mockStorage.saveKots(existingKots, targetRestId);
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
    const settings = await settingsService.getSettings(targetRestId);
    const existingKots = await this.getKots(targetRestId);
    const kotSeq = (existingKots.length + 1).toString().padStart(4, '0');
    const kotNumber = `${settings.kot_prefix || 'KOT-'}${kotSeq}-CNL`;

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
