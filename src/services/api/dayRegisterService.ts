import AsyncStorage from '@react-native-async-storage/async-storage';
import { DayRegister, Order, Payment } from '../../types';
import { supabase, isSupabaseConfigured } from '../supabase';
import { auditService } from './auditService';
import { orderService } from './orderService';
import { restaurantService } from './restaurantService';
import { subscriptionGuardService } from './subscriptionGuardService';

const STORAGE_KEY_REGISTERS = '@kullad_chai_day_registers';

/**
 * Returns YYYY-MM-DD formatted date in local restaurant timezone.
 */
export function getLocalRestaurantDate(dateInput: Date = new Date()): string {
  const year = dateInput.getFullYear();
  const month = String(dateInput.getMonth() + 1).padStart(2, '0');
  const day = String(dateInput.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const dayRegisterService = {
  /**
   * Get all registers from storage scoped by restaurant
   */
  async getRegisters(restaurantId?: string): Promise<DayRegister[]> {
    const targetRestId = restaurantId || (await restaurantService.getDefaultRestaurant())?.id || '';
    if (isSupabaseConfigured && targetRestId) {
      try {
        const { data, error } = await supabase
          .from('day_registers')
          .select('*')
          .eq('restaurant_id', targetRestId)
          .order('opened_at', { ascending: false });

        if (!error && data && data.length > 0) {
          const mapped = data.map((r: any) => ({
            id: r.id,
            restaurant_id: r.restaurant_id || targetRestId,
            register_date: r.register_date || (r.opened_at ? getLocalRestaurantDate(new Date(r.opened_at)) : getLocalRestaurantDate()),
            status: (r.status || 'open').toLowerCase() as 'open' | 'closed',
            opening_cash_float: Number(r.opening_cash ?? r.opening_cash_float) || 0,
            cash_sales: Number(r.cash_sales) || 0,
            upi_sales: Number(r.upi_sales) || 0,
            card_sales: Number(r.card_sales) || 0,
            total_sales: Number(r.total_sales) || 0,
            expected_cash: Number(r.expected_cash) || 0,
            actual_cash_counted: r.actual_cash != null ? Number(r.actual_cash) : (r.actual_cash_counted != null ? Number(r.actual_cash_counted) : undefined),
            cash_difference: r.difference != null ? Number(r.difference) : (r.cash_difference != null ? Number(r.cash_difference) : undefined),
            notes: r.notes || undefined,
            opened_at: r.opened_at,
            opened_by: r.opened_by,
            closed_at: r.closed_at || undefined,
            closed_by: r.closed_by || undefined,
          }));
          await AsyncStorage.setItem(`${STORAGE_KEY_REGISTERS}_${targetRestId}`, JSON.stringify(mapped));
          return mapped;
        }
      } catch (e) {
        console.warn('Supabase fetch day_registers failed, falling back to local storage:', e);
      }
    }

    try {
      const data = await AsyncStorage.getItem(`${STORAGE_KEY_REGISTERS}_${targetRestId}`);
      if (data) {
        return JSON.parse(data) as DayRegister[];
      }
    } catch (e) {
      console.warn('Failed to load registers from storage:', e);
    }
    return [];
  },

  /**
   * Save registers to storage
   */
  async saveRegisters(registers: DayRegister[], restaurantId?: string): Promise<void> {
    try {
      const targetRestId = restaurantId || registers[0]?.restaurant_id || '';
      if (targetRestId) {
        await AsyncStorage.setItem(`${STORAGE_KEY_REGISTERS}_${targetRestId}`, JSON.stringify(registers));
      }
    } catch (e) {
      console.warn('Failed to save registers to storage:', e);
    }
  },

  /**
   * Get currently active open register or latest register
   */
  async getCurrentRegister(restaurantId?: string): Promise<DayRegister | null> {
    const registers = await this.getRegisters(restaurantId);
    // 1. Find currently open register (only one open register allowed per restaurant)
    const openRegister = registers.find((r) => r.status === 'open');
    if (openRegister) {
      return openRegister;
    }
    // 2. Otherwise return the latest closed register
    if (registers.length > 0) {
      return registers[0];
    }
    return null;
  },

  /**
   * Check if the register is currently open for the given restaurant
   */
  async isRegisterOpen(restaurantId?: string): Promise<boolean> {
    const targetRestId = restaurantId || (await restaurantService.getDefaultRestaurant())?.id || '';
    if (isSupabaseConfigured && targetRestId) {
      try {
        const { data, error } = await supabase
          .from('day_registers')
          .select('id, status')
          .eq('restaurant_id', targetRestId)
          .eq('status', 'open')
          .limit(1);

        if (!error && data && data.length > 0) {
          return true;
        }
        if (!error && data && data.length === 0) {
          return false;
        }
      } catch (e) {
        console.warn('Supabase isRegisterOpen check failed, checking local:', e);
      }
    }

    const current = await this.getCurrentRegister(targetRestId);
    return Boolean(current && current.status === 'open');
  },

  /**
   * Calculate live sales reconciliation from payments and orders within the register's active period
   */
  async calculateRegisterReconciliation(
    register: DayRegister,
    restaurantId?: string
  ): Promise<{
    cash_sales: number;
    upi_sales: number;
    card_sales: number;
    other_sales: number;
    digital_sales: number;
    refunds: number;
    cash_out: number;
    total_sales: number;
    total_orders_count: number;
    expected_cash: number;
  }> {
    const targetRestId = register.restaurant_id || restaurantId;
    const allOrders = await orderService.getOrders(targetRestId);
    const openTime = new Date(register.opened_at).getTime();
    const closeTime = register.closed_at ? new Date(register.closed_at).getTime() : Date.now();

    // Filter orders created or paid during this register shift
    const shiftOrders = allOrders.filter((ord) => {
      const ordTime = new Date(ord.created_at).getTime();
      return ordTime >= openTime && ordTime <= closeTime;
    });

    let cash_sales = 0;
    let upi_sales = 0;
    let card_sales = 0;
    let other_sales = 0;
    let refunds = 0;

    for (const ord of shiftOrders) {
      if (ord.status === 'cancelled') {
        if (ord.payment_status === 'paid') {
          refunds += Number(ord.payable_amount) || 0;
        }
        continue;
      }

      if (ord.payments && ord.payments.length > 0) {
        for (const p of ord.payments) {
          const amount = Number(p.amount) || 0;
          if (p.payment_method === 'cash') cash_sales += amount;
          else if (p.payment_method === 'upi') upi_sales += amount;
          else if (p.payment_method === 'card') card_sales += amount;
          else other_sales += amount;
        }
      } else if (ord.payment_status === 'paid') {
        const amount = Number(ord.payable_amount) || 0;
        const method = (ord as any).payment_method || 'cash';
        if (method === 'cash') cash_sales += amount;
        else if (method === 'upi') upi_sales += amount;
        else if (method === 'card') card_sales += amount;
        else other_sales += amount;
      }
    }

    const digital_sales = upi_sales + card_sales + other_sales;
    const total_sales = cash_sales + digital_sales;
    const cash_out = Number(register.cash_out) || 0;
    const expected_cash = register.opening_cash_float + cash_sales - refunds - cash_out;

    return {
      cash_sales: Math.round(cash_sales * 100) / 100,
      upi_sales: Math.round(upi_sales * 100) / 100,
      card_sales: Math.round(card_sales * 100) / 100,
      other_sales: Math.round(other_sales * 100) / 100,
      digital_sales: Math.round(digital_sales * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
      cash_out: Math.round(cash_out * 100) / 100,
      total_sales: Math.round(total_sales * 100) / 100,
      total_orders_count: shiftOrders.filter(o => o.status !== 'cancelled').length,
      expected_cash: Math.round(expected_cash * 100) / 100,
    };
  },

  /**
   * Open the restaurant register for a business day/shift
   */
  async openRegister(params: {
    opening_cash_float: number;
    opened_by?: string;
    notes?: string;
    restaurant_id?: string;
  }): Promise<DayRegister> {
    const targetRestId = params.restaurant_id || (await restaurantService.getDefaultRestaurant())?.id || '';
    if (!targetRestId) {
      throw new Error('Unable to identify your restaurant. Please contact your administrator.');
    }

    // 1. Session and Auth Check
    if (isSupabaseConfigured) {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session?.user) {
        throw new Error('Your session has expired. Please login again.');
      }
    }

    // 2. Subscription Check
    if (targetRestId && isSupabaseConfigured) {
      const hasSub = await subscriptionGuardService.hasActiveSubscription(targetRestId);
      if (!hasSub) {
        throw new Error("You don't have any active subscription");
      }
    }

    const cleanFloat = Math.max(0, Number(params.opening_cash_float) || 0);
    const now = new Date();
    const todayDate = getLocalRestaurantDate(now);

    // 3. Prevent Duplicates: Direct Supabase Check
    if (isSupabaseConfigured) {
      try {
        const { data: existingDbOpen, error: checkErr } = await supabase
          .from('day_registers')
          .select('id, register_date, opened_at')
          .eq('restaurant_id', targetRestId)
          .eq('status', 'open')
          .maybeSingle();

        if (!checkErr && existingDbOpen) {
          throw new Error(
            `A register is already OPEN for this restaurant (Shift: ${existingDbOpen.register_date || 'today'}). Please close the active shift before opening a new register.`
          );
        }
      } catch (checkEx: any) {
        if (checkEx.message?.includes('already OPEN')) {
          throw checkEx;
        }
        console.warn('Pre-check existing open register warning:', checkEx);
      }
    }

    const registers = await this.getRegisters(targetRestId);
    const existingOpen = registers.find((r) => r.status === 'open');
    if (existingOpen) {
      throw new Error(
        `Register for ${existingOpen.register_date} is already OPEN. Please close the active shift before opening a new register.`
      );
    }

    let createdRegister: DayRegister | null = null;
    let rpcHandledAudit = false;

    // 4. Primary Execution: Atomic Database RPC
    if (isSupabaseConfigured) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('open_day_register', {
          p_restaurant_id: targetRestId,
          p_opening_cash: cleanFloat,
          p_notes: params.notes || null,
        });

        if (rpcErr) {
          const isMissingFunction =
            rpcErr.code === 'PGRST202' ||
            rpcErr.code === '42883' ||
            rpcErr.message.toLowerCase().includes('could not find the function') ||
            (rpcErr.message.toLowerCase().includes('function') && rpcErr.message.toLowerCase().includes('not found'));

          if (!isMissingFunction) {
            console.error({
              operation: 'open_day_register_rpc',
              code: rpcErr.code,
              message: rpcErr.message,
              details: rpcErr.details,
              hint: rpcErr.hint,
            });
            throw new Error(rpcErr.message || 'Unable to open register. Please try again.');
          }
        } else if (rpcData) {
          const r = rpcData as any;
          createdRegister = {
            id: r.id,
            restaurant_id: r.restaurant_id || targetRestId,
            register_date: r.register_date || todayDate,
            status: 'open',
            opening_cash_float: Number(r.opening_cash_float ?? r.opening_cash ?? cleanFloat),
            cash_sales: 0,
            upi_sales: 0,
            card_sales: 0,
            total_sales: 0,
            expected_cash: Number(r.expected_cash ?? cleanFloat),
            notes: r.notes || undefined,
            opened_at: r.opened_at || now.toISOString(),
            opened_by: r.opened_by || 'Staff',
          };
          rpcHandledAudit = true;
        }
      } catch (rpcEx: any) {
        if (
          rpcEx.message?.includes('already OPEN') ||
          rpcEx.message?.includes('already open') ||
          rpcEx.message?.includes('subscription') ||
          rpcEx.message?.includes('session') ||
          rpcEx.message?.includes('Access denied') ||
          rpcEx.message?.includes('Authentication required')
        ) {
          throw rpcEx;
        }
        console.warn('open_day_register RPC fallback to direct insert:', rpcEx?.message || rpcEx);
      }
    }

    // 5. Fallback Execution: Safe Direct Insert with All Schema Fields
    if (!createdRegister) {
      const newRegister: DayRegister = {
        id: `reg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        restaurant_id: targetRestId,
        register_date: todayDate,
        status: 'open',
        opening_cash_float: cleanFloat,
        cash_sales: 0,
        upi_sales: 0,
        card_sales: 0,
        total_sales: 0,
        expected_cash: cleanFloat,
        notes: params.notes || undefined,
        opened_at: now.toISOString(),
        opened_by: params.opened_by || 'Admin',
      };

      if (isSupabaseConfigured) {
        const insertPayload = {
          id: newRegister.id,
          restaurant_id: targetRestId,
          register_date: newRegister.register_date,
          status: 'open',
          opening_cash: cleanFloat,
          opening_cash_float: cleanFloat,
          cash_sales: 0,
          upi_sales: 0,
          card_sales: 0,
          other_sales: 0,
          total_sales: 0,
          total_orders: 0,
          expected_cash: cleanFloat,
          notes: newRegister.notes || null,
          opened_at: newRegister.opened_at,
          opened_by: newRegister.opened_by,
        };

        const { error: insertErr } = await supabase.from('day_registers').insert([insertPayload]);
        if (insertErr) {
          console.error({
            operation: 'open_register_direct_insert',
            code: insertErr.code,
            message: insertErr.message,
            details: insertErr.details,
            hint: insertErr.hint,
          });
          if (insertErr.code === '23505') {
            throw new Error('A register is already OPEN for this restaurant. Please close the active shift before opening a new register.');
          }
          throw new Error(`Unable to open register: ${insertErr.message || 'Database insert failed'}`);
        }
      }

      createdRegister = newRegister;
    }

    // 6. Update Local Persistent State
    const updatedList = [createdRegister, ...registers.filter((r) => r.id !== createdRegister!.id)];
    await this.saveRegisters(updatedList, targetRestId);

    // 7. Audit Logging (Only if not already recorded by RPC)
    if (!rpcHandledAudit) {
      await auditService.log({
        action: 'REGISTER_OPENED',
        entity_type: 'day_register',
        entity_id: createdRegister.id,
        details: {
          restaurant_id: targetRestId,
          register_date: createdRegister.register_date,
          opening_cash_float: createdRegister.opening_cash_float,
          opened_by: createdRegister.opened_by,
        },
      });
    }

    return createdRegister;
  },

  /**
   * Get all active / unsettled orders for a restaurant.
   * An order is considered settled if:
   * 1. It is cancelled (`status === 'cancelled'`), OR
   * 2. It is completed, delivered or settled (`status === 'completed' || status === 'delivered' || status === 'settled'`)
   *
   * Optionally filtered by registerOpenedAt so only orders from the current open shift are considered.
   */
  async getUnsettledOrders(restaurantId?: string, registerOpenedAt?: string): Promise<Order[]> {
    const allOrders = await orderService.getOrders(restaurantId);
    return allOrders.filter((ord) => {
      if (ord.status === 'cancelled') return false;
      if (ord.status === 'completed' || ord.status === 'delivered' || (ord.status as string) === 'settled') {
        return false;
      }
      if (registerOpenedAt) {
        const ordTime = new Date(ord.created_at).getTime();
        const openTime = new Date(registerOpenedAt).getTime();
        if (ordTime < openTime) return false;
      }
      return true;
    });
  },

  /**
   * Close the currently open register, compute discrepancy and produce Z-Report
   */
  async closeRegister(params: {
    register_id: string;
    actual_cash_counted: number;
    closed_by?: string;
    closing_notes?: string;
    restaurant_id?: string;
  }): Promise<DayRegister> {
    const targetRestId = params.restaurant_id || (await restaurantService.getDefaultRestaurant())?.id || '';
    if (!targetRestId) {
      throw new Error('Unable to identify your restaurant.');
    }

    if (isSupabaseConfigured) {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session?.user) {
        throw new Error('Your session has expired. Please login again.');
      }
    }

    const registers = await this.getRegisters(targetRestId);
    const index = registers.findIndex((r) => r.id === params.register_id);

    if (index === -1) {
      throw new Error('Register record not found.');
    }

    const targetRegister = registers[index];

    // Prevent closing an already closed register twice
    if (targetRegister.status === 'closed') {
      throw new Error(`Register for ${targetRegister.register_date} has already been closed.`);
    }

    // Strict restriction: All orders must be settled or cancelled before closing the register
    const unsettledOrders = await this.getUnsettledOrders(targetRestId, targetRegister.opened_at);
    if (unsettledOrders.length > 0) {
      const orderListPreview = unsettledOrders
        .slice(0, 5)
        .map((o) => `#${o.order_number}`)
        .join(', ');
      const moreCount = unsettledOrders.length > 5 ? ` and ${unsettledOrders.length - 5} more` : '';
      throw new Error(
        `Cannot close register: There are ${unsettledOrders.length} unsettled order(s) (${orderListPreview}${moreCount}). Please settle or cancel all orders before closing the register.`
      );
    }

    const now = new Date();
    const reconciliation = await this.calculateRegisterReconciliation(targetRegister, targetRestId);
    const counted = Number(params.actual_cash_counted) || 0;
    const difference = Math.round((counted - reconciliation.expected_cash) * 100) / 100;

    const closedRegister: DayRegister = {
      ...targetRegister,
      status: 'closed',
      cash_sales: reconciliation.cash_sales,
      upi_sales: reconciliation.upi_sales,
      card_sales: reconciliation.card_sales,
      refunds: reconciliation.refunds,
      cash_out: reconciliation.cash_out,
      total_sales: reconciliation.total_sales,
      expected_cash: reconciliation.expected_cash,
      actual_cash_counted: counted,
      cash_difference: difference,
      closed_at: now.toISOString(),
      closed_by: params.closed_by || 'Admin',
      notes: params.closing_notes
        ? `${targetRegister.notes ? `${targetRegister.notes} | ` : ''}Closing Note: ${params.closing_notes}`
        : targetRegister.notes,
    };

    registers[index] = closedRegister;
    await this.saveRegisters(registers, targetRestId);

    if (isSupabaseConfigured) {
      const updatePayload = {
        status: 'closed',
        cash_sales: closedRegister.cash_sales,
        upi_sales: closedRegister.upi_sales,
        card_sales: closedRegister.card_sales,
        other_sales: (closedRegister as any).other_sales || 0,
        total_sales: closedRegister.total_sales,
        expected_cash: closedRegister.expected_cash,
        actual_cash: closedRegister.actual_cash_counted,
        actual_cash_counted: closedRegister.actual_cash_counted,
        difference: closedRegister.cash_difference,
        cash_difference: closedRegister.cash_difference,
        closing_cash: closedRegister.actual_cash_counted,
        closed_at: closedRegister.closed_at,
        closed_by: closedRegister.closed_by,
        notes: closedRegister.notes || null,
      };

      const { error: updateErr } = await supabase
        .from('day_registers')
        .update(updatePayload)
        .eq('id', closedRegister.id)
        .eq('restaurant_id', targetRestId);

      if (updateErr) {
        console.error({
          operation: 'close_register_db_update',
          code: updateErr.code,
          message: updateErr.message,
          details: updateErr.details,
          hint: updateErr.hint,
        });
        throw new Error(`Failed to update register close record in database: ${updateErr.message}`);
      }
    }

    await auditService.log({
      action: 'REGISTER_CLOSED',
      entity_type: 'day_register',
      entity_id: closedRegister.id,
      details: {
        restaurant_id: targetRestId,
        register_date: closedRegister.register_date,
        total_sales: closedRegister.total_sales,
        expected_cash: closedRegister.expected_cash,
        actual_cash_counted: closedRegister.actual_cash_counted,
        cash_difference: closedRegister.cash_difference,
        closed_by: closedRegister.closed_by,
      },
    });

    return closedRegister;
  },
};
