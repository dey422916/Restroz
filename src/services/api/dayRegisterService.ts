import AsyncStorage from '@react-native-async-storage/async-storage';
import { DayRegister, Order, Payment } from '../../types';
import { supabase, isSupabaseConfigured } from '../supabase';
import { auditService } from './auditService';
import { orderService } from './orderService';
import { DEFAULT_RESTAURANT_ID } from './restaurantService';

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
  async getRegisters(restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<DayRegister[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('day_registers')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('opened_at', { ascending: false });

        if (!error && data && data.length > 0) {
          const mapped = data.map((r: any) => ({
            id: r.id,
            restaurant_id: r.restaurant_id || restaurantId,
            register_date: r.register_date,
            status: (r.status || 'open').toLowerCase() as 'open' | 'closed',
            opening_cash_float: Number(r.opening_cash_float) || 0,
            cash_sales: Number(r.cash_sales) || 0,
            upi_sales: Number(r.upi_sales) || 0,
            card_sales: Number(r.card_sales) || 0,
            total_sales: Number(r.total_sales) || 0,
            expected_cash: Number(r.expected_cash) || 0,
            actual_cash_counted: r.actual_cash_counted ? Number(r.actual_cash_counted) : undefined,
            cash_difference: r.cash_difference ? Number(r.cash_difference) : undefined,
            notes: r.notes || undefined,
            opened_at: r.opened_at,
            opened_by: r.opened_by,
            closed_at: r.closed_at || undefined,
            closed_by: r.closed_by || undefined,
          }));
          await AsyncStorage.setItem(`${STORAGE_KEY_REGISTERS}_${restaurantId}`, JSON.stringify(mapped));
          return mapped;
        }
      } catch (e) {
        console.warn('Supabase fetch day_registers failed, falling back to local storage:', e);
      }
    }

    try {
      const data = await AsyncStorage.getItem(`${STORAGE_KEY_REGISTERS}_${restaurantId}`);
      if (data) {
        return JSON.parse(data) as DayRegister[];
      }
      // Fallback to legacy key for Ratnadeep
      if (restaurantId === DEFAULT_RESTAURANT_ID) {
        const legacy = await AsyncStorage.getItem(STORAGE_KEY_REGISTERS);
        if (legacy) {
          const list = JSON.parse(legacy) as DayRegister[];
          return list.map((r) => ({ ...r, restaurant_id: DEFAULT_RESTAURANT_ID }));
        }
      }
    } catch (e) {
      console.warn('Failed to load registers from storage:', e);
    }
    return [];
  },

  /**
   * Save registers to storage
   */
  async saveRegisters(registers: DayRegister[], restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<void> {
    try {
      await AsyncStorage.setItem(`${STORAGE_KEY_REGISTERS}_${restaurantId}`, JSON.stringify(registers));
    } catch (e) {
      console.warn('Failed to save registers to storage:', e);
    }
  },

  /**
   * Get currently active open register or latest register
   */
  async getCurrentRegister(restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<DayRegister | null> {
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
   * Check if the register is currently open (auto-opens if no register is found so POS is never blocked)
   */
  async isRegisterOpen(restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<boolean> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('day_registers')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('status', 'open')
          .limit(1);

        if (!error && data && data.length > 0) {
          return true;
        }
      } catch (e) {
        console.warn('Supabase isRegisterOpen check failed, checking local:', e);
      }
    }

    const current = await this.getCurrentRegister(restaurantId);
    if (current && current.status === 'open') {
      return true;
    }

    // If no register is open, auto-open a business register so POS orders are never blocked
    try {
      await this.openRegister({
        opening_cash_float: 1000,
        opened_by: 'POS Cashier',
        notes: 'Auto-initialized business shift for POS operations',
        restaurant_id: restaurantId,
      });
      return true;
    } catch (err) {
      console.warn('Auto openRegister fallback notice:', err);
      return true;
    }
  },

  /**
   * Calculate live sales reconciliation from payments and orders within the register's active period
   */
  async calculateRegisterReconciliation(
    register: DayRegister,
    restaurantId: string = DEFAULT_RESTAURANT_ID
  ): Promise<{
    cash_sales: number;
    upi_sales: number;
    card_sales: number;
    other_sales: number;
    digital_sales: number;
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
      return ordTime >= openTime && ordTime <= closeTime && ord.status !== 'cancelled';
    });

    let cash_sales = 0;
    let upi_sales = 0;
    let card_sales = 0;
    let other_sales = 0;

    // Aggregate payments accurately from payment records where available
    for (const ord of shiftOrders) {
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
    const expected_cash = register.opening_cash_float + cash_sales;

    return {
      cash_sales: Math.round(cash_sales * 100) / 100,
      upi_sales: Math.round(upi_sales * 100) / 100,
      card_sales: Math.round(card_sales * 100) / 100,
      other_sales: Math.round(other_sales * 100) / 100,
      digital_sales: Math.round(digital_sales * 100) / 100,
      total_sales: Math.round(total_sales * 100) / 100,
      total_orders_count: shiftOrders.length,
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
    const targetRestId = params.restaurant_id || DEFAULT_RESTAURANT_ID;
    const registers = await this.getRegisters(targetRestId);

    // Rule: Allow ONLY ONE open register per restaurant scope at a time
    const existingOpen = registers.find((r) => r.status === 'open');
    if (existingOpen) {
      throw new Error(
        `Register for ${existingOpen.register_date} is already OPEN. Please close the active shift before opening a new register.`
      );
    }

    const now = new Date();
    const todayDate = getLocalRestaurantDate(now);

    const newRegister: DayRegister = {
      id: `reg-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      restaurant_id: targetRestId,
      register_date: todayDate,
      status: 'open',
      opening_cash_float: Math.max(0, Number(params.opening_cash_float) || 0),
      cash_sales: 0,
      upi_sales: 0,
      card_sales: 0,
      total_sales: 0,
      expected_cash: Math.max(0, Number(params.opening_cash_float) || 0),
      notes: params.notes || undefined,
      opened_at: now.toISOString(),
      opened_by: params.opened_by || 'Admin',
    };

    const updatedList = [newRegister, ...registers];
    await this.saveRegisters(updatedList, targetRestId);

    if (isSupabaseConfigured) {
      try {
        await supabase.from('day_registers').insert([{
          id: newRegister.id,
          restaurant_id: targetRestId,
          register_date: newRegister.register_date,
          status: 'open',
          opening_cash_float: newRegister.opening_cash_float,
          cash_sales: 0,
          upi_sales: 0,
          card_sales: 0,
          total_sales: 0,
          expected_cash: newRegister.opening_cash_float,
          notes: newRegister.notes || null,
          opened_at: newRegister.opened_at,
          opened_by: newRegister.opened_by,
        }]);
      } catch (sbErr) {
        console.warn('Supabase insert day_register exception:', sbErr);
      }
    }

    await auditService.log({
      action: 'REGISTER_OPENED',
      entity_type: 'day_register',
      entity_id: newRegister.id,
      details: {
        restaurant_id: targetRestId,
        register_date: newRegister.register_date,
        opening_cash_float: newRegister.opening_cash_float,
        opened_by: newRegister.opened_by,
      },
    });

    return newRegister;
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
    const targetRestId = params.restaurant_id || DEFAULT_RESTAURANT_ID;
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
      try {
        await supabase.from('day_registers').update({
          status: 'closed',
          cash_sales: closedRegister.cash_sales,
          upi_sales: closedRegister.upi_sales,
          card_sales: closedRegister.card_sales,
          total_sales: closedRegister.total_sales,
          expected_cash: closedRegister.expected_cash,
          actual_cash_counted: closedRegister.actual_cash_counted,
          cash_difference: closedRegister.cash_difference,
          closed_at: closedRegister.closed_at,
          closed_by: closedRegister.closed_by,
          notes: closedRegister.notes || null,
        }).eq('id', closedRegister.id);
      } catch (sbCloseErr) {
        console.warn('Supabase update day_register close exception:', sbCloseErr);
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
