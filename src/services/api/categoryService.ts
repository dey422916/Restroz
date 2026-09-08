import { Category } from '../../types';
import { mockStorage } from '../mockStorage';
import { supabase, isSupabaseConfigured } from '../supabase';
import { DEFAULT_RESTAURANT_ID } from './restaurantService';

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

  async getCategories(restaurantId: string = DEFAULT_RESTAURANT_ID, forceRefresh: boolean = false): Promise<Category[]> {
    const targetRestId = restaurantId || DEFAULT_RESTAURANT_ID;
    const now = Date.now();
    if (!forceRefresh && inMemoryCategoriesCache[targetRestId] && (now - inMemoryCategoriesCache[targetRestId].timestamp < CATEGORIES_CACHE_TTL)) {
      return inMemoryCategoriesCache[targetRestId].data;
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
          inMemoryCategoriesCache[targetRestId] = {
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
    inMemoryCategoriesCache[targetRestId] = {
      timestamp: now,
      data: local,
    };
    return local;
  },

  async saveCategory(category: Partial<Category>, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Category> {
    const targetRestId = category.restaurant_id || restaurantId || DEFAULT_RESTAURANT_ID;
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

  async deleteCategory(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) throw error;
        await this.getCategories();
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
