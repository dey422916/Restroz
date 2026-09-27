import { supabase, isSupabaseConfigured } from '../supabase';
import {
  LoyaltyRewardSettings,
  CustomerWalletInfo,
  CustomerMarketplaceWalletsResponse,
} from '../../types';
import { normalizeIndianPhone } from '../../utils/validation';

export const loyaltyService = {
  /**
   * Fetch loyalty rewards configuration for a restaurant
   */
  async getLoyaltySettings(restaurantId: string): Promise<LoyaltyRewardSettings> {
    if (!restaurantId) {
      return {
        restaurant_id: '',
        is_enabled: false,
        spend_amount: 100,
        reward_amount: 1,
        min_redeem_balance: 50,
      };
    }

    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('loyalty_reward_settings')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      if (error) {
        console.warn('[loyaltyService] Error fetching loyalty settings:', error);
      }

      if (data) {
        return {
          id: data.id,
          restaurant_id: data.restaurant_id,
          is_enabled: Boolean(data.is_enabled),
          spend_amount: Number(data.spend_amount) || 100,
          reward_amount: Number(data.reward_amount) || 1,
          min_redeem_balance: Number(data.min_redeem_balance) || 50,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }
    }

    return {
      restaurant_id: restaurantId,
      is_enabled: false,
      spend_amount: 100,
      reward_amount: 1,
      min_redeem_balance: 50,
    };
  },

  /**
   * Save / update loyalty rewards settings for a restaurant
   */
  async saveLoyaltySettings(params: {
    restaurant_id: string;
    is_enabled: boolean;
    spend_amount: number;
    reward_amount: number;
    min_redeem_balance: number;
  }): Promise<LoyaltyRewardSettings> {
    const { restaurant_id, is_enabled, spend_amount, reward_amount, min_redeem_balance } = params;

    if (!restaurant_id) {
      throw new Error('Restaurant ID is required to save loyalty settings.');
    }

    if (spend_amount <= 0) {
      throw new Error('Spend amount must be greater than 0.');
    }
    if (reward_amount < 0) {
      throw new Error('Reward amount cannot be negative.');
    }
    if (min_redeem_balance < 0) {
      throw new Error('Minimum redeem balance cannot be negative.');
    }

    if (isSupabaseConfigured) {
      let savedData: any = null;

      try {
        const { data, error } = await supabase.rpc('save_loyalty_settings', {
          p_restaurant_id: restaurant_id,
          p_is_enabled: is_enabled,
          p_spend_amount: spend_amount,
          p_reward_amount: reward_amount,
          p_min_redeem_balance: min_redeem_balance,
        });

        if (!error && data) {
          savedData = data;
        } else if (error) {
          console.warn('[loyaltyService] save_loyalty_settings RPC warning, attempting direct upsert:', error.message || error);
        }
      } catch (rpcErr) {
        console.warn('[loyaltyService] RPC call exception, attempting direct upsert:', rpcErr);
      }

      // If RPC was not found or failed, execute direct table upsert
      if (!savedData) {
        const { data: upsertData, error: upsertErr } = await supabase
          .from('loyalty_reward_settings')
          .upsert(
            {
              restaurant_id,
              is_enabled,
              spend_amount,
              reward_amount,
              min_redeem_balance,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'restaurant_id' }
          )
          .select()
          .single();

        if (upsertErr) {
          console.error('[loyaltyService] direct upsert error:', upsertErr);
          throw new Error(upsertErr.message || 'Failed to save loyalty settings.');
        }
        savedData = upsertData;
      }

      return {
        id: savedData?.id,
        restaurant_id: savedData?.restaurant_id || restaurant_id,
        is_enabled: Boolean(savedData?.is_enabled),
        spend_amount: Number(savedData?.spend_amount) || spend_amount,
        reward_amount: Number(savedData?.reward_amount) || reward_amount,
        min_redeem_balance: Number(savedData?.min_redeem_balance) || min_redeem_balance,
        created_at: savedData?.created_at,
        updated_at: savedData?.updated_at,
      };
    }

    return {
      restaurant_id,
      is_enabled,
      spend_amount,
      reward_amount,
      min_redeem_balance,
    };
  },

  /**
   * Get customer wallet balance & eligibility for a specific restaurant
   */
  async getCustomerWallet(restaurantId: string, customerMobile?: string | null): Promise<CustomerWalletInfo> {
    const defaultInfo: CustomerWalletInfo = {
      is_enabled: false,
      spend_amount: 100,
      reward_amount: 1,
      min_redeem_balance: 50,
      customer_mobile: null,
      balance: 0,
      total_earned: 0,
      total_redeemed: 0,
      can_redeem: false,
    };

    if (!restaurantId) return defaultInfo;

    const cleanMobile = normalizeIndianPhone(customerMobile);

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('get_customer_wallet', {
        p_restaurant_id: restaurantId,
        p_customer_mobile: cleanMobile || null,
      });

      if (error) {
        console.warn('[loyaltyService] Error in get_customer_wallet RPC:', error);
        return defaultInfo;
      }

      if (data) {
        return {
          is_enabled: Boolean(data.is_enabled),
          spend_amount: Number(data.spend_amount) || 100,
          reward_amount: Number(data.reward_amount) || 1,
          min_redeem_balance: Number(data.min_redeem_balance) || 50,
          customer_mobile: data.customer_mobile || null,
          balance: Number(data.balance) || 0,
          total_earned: Number(data.total_earned) || 0,
          total_redeemed: Number(data.total_redeemed) || 0,
          can_redeem: Boolean(data.can_redeem),
        };
      }
    }

    return defaultInfo;
  },

  /**
   * Get all customer wallets and ledger transactions for marketplace profile
   */
  async getCustomerMarketplaceWallets(customerMobile?: string | null): Promise<CustomerMarketplaceWalletsResponse> {
    const defaultResp: CustomerMarketplaceWalletsResponse = {
      wallets: [],
      transactions: [],
    };

    const cleanMobile = normalizeIndianPhone(customerMobile);
    if (!cleanMobile) return defaultResp;

    if (isSupabaseConfigured) {
      const { data, error } = await supabase.rpc('get_customer_marketplace_wallets', {
        p_customer_mobile: cleanMobile,
      });

      if (error) {
        console.warn('[loyaltyService] Error in get_customer_marketplace_wallets RPC:', error);
        return defaultResp;
      }

      if (data) {
        return data as CustomerMarketplaceWalletsResponse;
      }
    }

    return defaultResp;
  },

  /**
   * Get list of customer wallets for a restaurant (Admin lookup)
   */
  async getRestaurantCustomerWallets(restaurantId: string, limit = 50): Promise<Array<{
    id: string;
    customer_mobile: string;
    balance: number;
    total_earned: number;
    total_redeemed: number;
    updated_at: string;
  }>> {
    if (!restaurantId || !isSupabaseConfigured) return [];

    const { data, error } = await supabase
      .from('customer_wallets')
      .select('id, customer_mobile, balance, total_earned, total_redeemed, updated_at')
      .eq('restaurant_id', restaurantId)
      .order('balance', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[loyaltyService] Error fetching customer wallets:', error);
      return [];
    }

    return (data || []).map((w) => ({
      id: w.id,
      customer_mobile: w.customer_mobile,
      balance: Number(w.balance) || 0,
      total_earned: Number(w.total_earned) || 0,
      total_redeemed: Number(w.total_redeemed) || 0,
      updated_at: w.updated_at,
    }));
  },

  /**
   * Get transaction history for a customer wallet in a restaurant
   */
  async getCustomerWalletTransactions(restaurantId: string, customerMobile: string, limit = 20): Promise<Array<{
    id: string;
    transaction_type: 'earn' | 'redeem' | 'expire' | 'adjustment';
    amount: number;
    order_id?: string;
    notes?: string;
    created_at: string;
  }>> {
    if (!restaurantId || !customerMobile || !isSupabaseConfigured) return [];

    const cleanMobile = normalizeIndianPhone(customerMobile);
    if (!cleanMobile) return [];

    // First find wallet
    const { data: wallet } = await supabase
      .from('customer_wallets')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('customer_mobile', cleanMobile)
      .maybeSingle();

    if (!wallet) return [];

    const { data, error } = await supabase
      .from('customer_wallet_transactions')
      .select('id, transaction_type, amount, order_id, notes, created_at')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[loyaltyService] Error fetching customer wallet transactions:', error);
      return [];
    }

    return (data || []).map((t) => ({
      id: t.id,
      transaction_type: t.transaction_type,
      amount: Number(t.amount) || 0,
      order_id: t.order_id,
      notes: t.notes,
      created_at: t.created_at,
    }));
  },
};

