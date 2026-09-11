import { Category } from '../../types';
import { mockStorage } from '../mockStorage';
import { supabase, isSupabaseConfigured } from '../supabase';

// High-performance in-memory cache for categories per tenant (15s TTL)
const inMemoryCategoriesCache: Record<string, { timestamp: number; data: Category[] }> = {};
const CATEGORIES_CACHE_TTL = 15 * 1000;

export function clearCategoriesCache(restaurantId?: string) {
  if (restaurantId) {
    delete inMemoryCategoriesCache[restaurantId];
  } else {
    Object.keys(inMemoryCategoriesCache).forEach((k) => delete inMemoryCategoriesCache[k]);
  }
}

export const categoryService = {
  clearCategoriesCache,

  async getCategories(restaurantId?: string, forceRefresh: boolean = false): Promise<Category[]> {
    const targetRestId = restaurantId || '';
    const now = Date.now();
    const cacheKey = targetRestId || '__all__';
    if (!forceRefresh && inMemoryCategoriesCache[cacheKey] && (now - inMemoryCategoriesCache[cacheKey].timestamp < CATEGORIES_CACHE_TTL)) {
      return inMemoryCategoriesCache[cacheKey].data;
    }

    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('categories')
          .select('id, restaurant_id, name, slug, description, image_url, display_order, is_active')
          .order('display_order', { ascending: true });

        if (targetRestId) {
          query = query.eq('restaurant_id', targetRestId);
        }

        const { data, error } = await query;
        if (!error && data) {
          const list = (data as Category[]).map(c => ({ ...c, restaurant_id: c.restaurant_id || targetRestId }));
          inMemoryCategoriesCache[cacheKey] = {
            timestamp: now,
            data: list,
          };
          mockStorage.saveCategories(list);
          return list;
        }
      } catch (e) {
        console.warn('Supabase getCategories failed, using cache:', e);
      }
    }
    const local = mockStorage.getCategories();
    const filtered = targetRestId ? local.filter(c => c.restaurant_id === targetRestId) : local;
    inMemoryCategoriesCache[cacheKey] = {
      timestamp: now,
      data: filtered,
    };
    return filtered;
  },

  async saveCategory(category: Partial<Category>, restaurantId?: string): Promise<Category> {
    const targetRestId = category.restaurant_id || restaurantId;
    if (!targetRestId) {
      throw new Error('Restaurant ID is required to save category.');
    }
    const name = (category.name || '').trim();
    if (!name) {
      throw new Error('Category Name is required.');
    }
    const slug = (category.slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const displayOrder = category.display_order !== undefined ? Number(category.display_order) : 1;

    const payload: any = {
      restaurant_id: targetRestId,
      name,
      slug,
      display_order: displayOrder,
      description: category.description || '',
      image_url:
        category.image_url ||
        'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
      is_active: category.is_active ?? true,
    };

    if (category.id) {
      payload.id = category.id;
    }

    if (isSupabaseConfigured) {
      try {
        if (category.id) {
          const { data, error } = await supabase
            .from('categories')
            .update(payload)
            .eq('id', category.id)
            .select()
            .single();

          if (!error && data) {
            clearCategoriesCache(targetRestId);
            await this.getCategories(targetRestId, true);
            return data as Category;
          }
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('categories')
            .insert([payload])
            .select()
            .single();

          if (!error && data) {
            clearCategoriesCache(targetRestId);
            await this.getCategories(targetRestId, true);
            return data as Category;
          }
          if (error) throw error;
        }
      } catch (e: any) {
        console.error('Supabase saveCategory error:', e);
        throw new Error(e.message || 'Failed to save category in Supabase.');
      }
    }

    if (category.id) {
      const updated = mockStorage.updateCategory(category.id, payload);
      if (!updated) throw new Error('Category not found in local cache.');
      clearCategoriesCache(targetRestId);
      return updated;
    } else {
      payload.id = 'cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
      clearCategoriesCache(targetRestId);
      return mockStorage.addCategory(payload as Omit<Category, 'id'>);
    }
  },

  async deleteCategory(id: string, restaurantId?: string): Promise<void> {
    clearCategoriesCache(restaurantId);
    if (isSupabaseConfigured) {
      try {
        let query = supabase.from('categories').delete().eq('id', id);
        if (restaurantId) query = query.eq('restaurant_id', restaurantId);
        const { error } = await query;
        if (error) throw error;
        mockStorage.deleteCategory(id);
        await this.getCategories(restaurantId, true);
        return;
      } catch (e: any) {
        console.error('Supabase deleteCategory error:', e);
        throw new Error(e.message || 'Failed to delete category from Supabase.');
      }
    }
    mockStorage.deleteCategory(id);
  },

  async toggleCategoryActive(id: string, active?: boolean): Promise<Category> {
    const cats = await this.getCategories();
    const found = cats.find((c) => c.id === id);
    if (!found) throw new Error('Category not found.');
    const newActive = active !== undefined ? active : !found.is_active;
    return this.saveCategory({ ...found, is_active: newActive });
  },
};
