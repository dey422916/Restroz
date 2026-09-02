import { Coupon } from '../../types';
import { mockStorage } from '../mockStorage';
import { supabase, isSupabaseConfigured } from '../supabase';
import { DEFAULT_RESTAURANT_ID } from './restaurantService';

export const couponService = {
  async getCoupons(restaurantId?: string): Promise<Coupon[]> {
    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('coupons')
          .select('*')
          .order('created_at', { ascending: false });

        if (restaurantId) {
          query = query.eq('restaurant_id', restaurantId);
        }

        const { data, error } = await query;
        if (!error && data) {
          const list = (data as Coupon[]).map(c => ({
            ...c,
            restaurant_id: c.restaurant_id || restaurantId || DEFAULT_RESTAURANT_ID,
            discount_type: c.discount_type || 'percentage',
            discount_value: Number(c.discount_value) || 0,
            min_order_value: Number(c.min_order_value) || 0,
            max_discount: c.max_discount ? Number(c.max_discount) : undefined,
            usage_limit: c.usage_limit ? Number(c.usage_limit) : undefined,
            used_count: Number(c.used_count) || 0,
            is_active: c.is_active ?? true,
          }));
          mockStorage.saveCoupons(list);
          return list;
        }
      } catch (e) {
        console.warn('Supabase getCoupons failed, using local cache:', e);
      }
    }
    const local = mockStorage.getCoupons();
    if (restaurantId) {
      return local.filter((c) => c.restaurant_id === restaurantId);
    }
    return local;
  },

  async getValidMarketplaceCoupons(restaurantId: string): Promise<Coupon[]> {
    const coupons = await this.getCoupons(restaurantId);
    const now = new Date();

    return coupons.filter((c) => {
      // Must belong to this restaurant
      if (c.restaurant_id && c.restaurant_id !== restaurantId) return false;
      // Must be active
      if (!c.is_active) return false;
      // Must have started
      if (c.start_date && new Date(c.start_date) > now) return false;
      // Must not be expired
      if (c.expiry_date && new Date(c.expiry_date) < now) return false;
      // Must not have reached total allotment limit
      if (c.usage_limit !== undefined && c.usage_limit !== null && (c.used_count || 0) >= c.usage_limit) {
        return false;
      }
      return true;
    });
  },

  async validateCouponCode(
    code: string,
    subtotal: number,
    restaurantId: string = DEFAULT_RESTAURANT_ID
  ): Promise<{ isValid: boolean; message: string; discountAmount: number; coupon?: Coupon }> {
    if (!code || !code.trim()) {
      return { isValid: false, message: 'Please enter a coupon code.', discountAmount: 0 };
    }

    const coupons = await this.getCoupons(restaurantId);
    const found = coupons.find(
      (c) => c.code.toUpperCase() === code.trim().toUpperCase() && c.restaurant_id === restaurantId
    );

    if (!found) {
      // Check if code exists on platform for another restaurant
      const allCoupons = await this.getCoupons();
      const codeExistsElsewhere = allCoupons.some(
        (c) => c.code.toUpperCase() === code.trim().toUpperCase()
      );
      if (codeExistsElsewhere) {
        return { isValid: false, message: 'Coupon not valid for this restaurant', discountAmount: 0 };
      }
      return { isValid: false, message: 'Invalid coupon code', discountAmount: 0 };
    }

    if (!found.is_active) {
      return { isValid: false, message: 'Coupon inactive', discountAmount: 0 };
    }

    const now = new Date();
    if (found.start_date && new Date(found.start_date) > now) {
      return { isValid: false, message: 'Coupon not active yet', discountAmount: 0 };
    }

    if (found.expiry_date && new Date(found.expiry_date) < now) {
      return { isValid: false, message: 'Coupon expired', discountAmount: 0 };
    }

    if (found.usage_limit !== undefined && found.usage_limit !== null && (found.used_count || 0) >= found.usage_limit) {
      return { isValid: false, message: 'Coupon usage limit reached', discountAmount: 0 };
    }

    if (found.min_order_value && subtotal < found.min_order_value) {
      return {
        isValid: false,
        message: `Minimum order ₹${found.min_order_value} required`,
        discountAmount: 0,
      };
    }

    // Calculate discount amount server-side accurately
    let discountAmount = 0;
    if (found.discount_type === 'percentage') {
      const calcDiscount = (subtotal * (found.discount_value || 0)) / 100;
      discountAmount = found.max_discount ? Math.min(calcDiscount, found.max_discount) : calcDiscount;
    } else {
      // Flat fixed ₹ off
      discountAmount = Math.min(found.discount_value || 0, subtotal);
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    return {
      isValid: true,
      message: `Coupon ${found.code} applied! Saved ₹${discountAmount.toFixed(2)}`,
      discountAmount,
      coupon: found,
    };
  },

  async saveCoupon(coupon: Partial<Coupon>, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Coupon> {
    const targetRestId = coupon.restaurant_id || restaurantId;
    const cpnId = coupon.id || 'cpn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);

    const payload: any = {
      id: cpnId,
      restaurant_id: targetRestId,
      code: (coupon.code || 'SAVE10').trim().toUpperCase(),
      description: coupon.description?.trim() || '',
      discount_type: coupon.discount_type || 'percentage',
      discount_value: Number(coupon.discount_value) || 0,
      min_order_value: Number(coupon.min_order_value) || 0,
      max_discount: coupon.max_discount ? Number(coupon.max_discount) : null,
      usage_limit: coupon.usage_limit ? Number(coupon.usage_limit) : null,
      used_count: Number(coupon.used_count) || 0,
      is_active: coupon.is_active ?? true,
      start_date: coupon.start_date ? new Date(coupon.start_date).toISOString() : null,
      expiry_date: coupon.expiry_date ? new Date(coupon.expiry_date).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        if (coupon.id) {
          const { data, error } = await supabase
            .from('coupons')
            .update(payload)
            .eq('id', coupon.id)
            .select()
            .single();

          if (!error && data) {
            await this.getCoupons(targetRestId);
            return data as Coupon;
          }
          if (error) throw error;
        } else {
          payload.created_at = new Date().toISOString();
          const { data, error } = await supabase
            .from('coupons')
            .insert([payload])
            .select()
            .single();

          if (!error && data) {
            await this.getCoupons(targetRestId);
            return data as Coupon;
          }
          if (error) throw error;
        }
      } catch (e: any) {
        console.error('Supabase saveCoupon error:', e);
        throw new Error(e.message || 'Failed to save coupon in Supabase.');
      }
    }

    if (coupon.id) {
      const updated = mockStorage.updateCoupon(coupon.id, payload as any);
      if (!updated) throw new Error('Coupon not found in local cache.');
      return updated;
    } else {
      return mockStorage.addCoupon(payload as any);
    }
  },

  async deleteCoupon(id: string, restaurantId?: string): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        // Check if coupon has historical usages
        let query = supabase.from('coupons').select('used_count, restaurant_id').eq('id', id);
        if (restaurantId) query = query.eq('restaurant_id', restaurantId);
        const { data: cpn } = await query.maybeSingle();

        if (cpn && (cpn.used_count || 0) > 0) {
          // Deactivate/archive instead of hard-deleting to preserve historical orders
          let updateQuery = supabase.from('coupons').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
          if (restaurantId) updateQuery = updateQuery.eq('restaurant_id', restaurantId);
          await updateQuery;
        } else {
          let deleteQuery = supabase.from('coupons').delete().eq('id', id);
          if (restaurantId) deleteQuery = deleteQuery.eq('restaurant_id', restaurantId);
          const { error } = await deleteQuery;
          if (error) throw error;
        }
        await this.getCoupons(restaurantId);
        return;
      } catch (e: any) {
        console.error('Supabase deleteCoupon error:', e);
        throw new Error(e.message || 'Failed to archive/delete coupon from Supabase.');
      }
    }

    const local = mockStorage.getCoupons().find((c) => c.id === id);
    if (local && (local.used_count || 0) > 0) {
      mockStorage.updateCoupon(id, { is_active: false } as any);
    } else {
      mockStorage.deleteCoupon(id);
    }
  },

  async incrementCouponUsage(couponId: string, restaurantId: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.rpc('increment_coupon_usage', {
          p_coupon_id: couponId,
          p_restaurant_id: restaurantId,
        });

        if (!error && typeof data === 'boolean') {
          return data;
        }

        // Optimistic concurrency fallback
        const { data: cpn, error: fetchErr } = await supabase
          .from('coupons')
          .select('id, used_count, usage_limit, is_active')
          .eq('id', couponId)
          .single();

        if (fetchErr || !cpn || !cpn.is_active) {
          // If customer RLS prevents reading private coupon row, do NOT falsely reject the order;
          // validateCouponCode already verified the coupon before order placement.
          return true;
        }

        const currentUsed = cpn.used_count || 0;
        if (cpn.usage_limit !== null && cpn.usage_limit !== undefined && currentUsed >= cpn.usage_limit) {
          return false; // Genuine usage limit reached!
        }

        const newCount = currentUsed + 1;
        const { data: updRows, error: updErr } = await supabase
          .from('coupons')
          .update({ used_count: newCount, updated_at: new Date().toISOString() })
          .eq('id', couponId)
          .eq('used_count', currentUsed)
          .select('id');

        if (updErr || !updRows || updRows.length === 0) {
          // Customer RLS restricts direct UPDATE on coupons table to ADMIN/STAFF.
          // Since validateCouponCode already verified the usage limit, do NOT block the order.
          return true;
        }

        return true;
      } catch (e) {
        console.warn('incrementCouponUsage error:', e);
        return true;
      }
    }

    const local = mockStorage.getCoupons().find((c) => c.id === couponId);
    if (local) {
      if (local.usage_limit !== undefined && local.usage_limit !== null && (local.used_count || 0) >= local.usage_limit) {
        return false;
      }
      local.used_count = (local.used_count || 0) + 1;
      return true;
    }
    return false;
  },

  async decrementCouponUsage(couponId: string, restaurantId: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      try {
        const { data: cpn } = await supabase
          .from('coupons')
          .select('id, used_count')
          .eq('id', couponId)
          .single();

        if (cpn && (cpn.used_count || 0) > 0) {
          await supabase
            .from('coupons')
            .update({ used_count: Math.max(0, (cpn.used_count || 0) - 1), updated_at: new Date().toISOString() })
            .eq('id', couponId);
          return true;
        }
      } catch (e) {
        console.warn('decrementCouponUsage error:', e);
      }
    }
    const local = mockStorage.getCoupons().find((c) => c.id === couponId);
    if (local && (local.used_count || 0) > 0) {
      local.used_count = (local.used_count || 0) - 1;
      return true;
    }
    return false;
  },
};

