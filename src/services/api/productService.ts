import { Product, FoodType } from '../../types';
import { mockStorage } from '../mockStorage';
import { supabase, isSupabaseConfigured } from '../supabase';
import { CsvProductRow } from '../../utils/validators';
import { DEFAULT_RESTAURANT_ID } from './restaurantService';
import { subscriptionGuardService } from './subscriptionGuardService';
import { storageService } from './storageService';

// High-performance in-memory cache for products per tenant (15s TTL)
const inMemoryProductsCache: Record<string, { timestamp: number; data: Product[] }> = {};
const PRODUCTS_CACHE_TTL = 15 * 1000;

export function clearProductsCache(restaurantId?: string) {
  if (restaurantId) {
    delete inMemoryProductsCache[restaurantId];
  } else {
    Object.keys(inMemoryProductsCache).forEach((k) => delete inMemoryProductsCache[k]);
  }
}

export const productService = {
  clearProductsCache,

  async getProducts(restaurantId: string = DEFAULT_RESTAURANT_ID, forceRefresh: boolean = false): Promise<Product[]> {
    const targetRestId = restaurantId || DEFAULT_RESTAURANT_ID;
    const now = Date.now();
    if (!forceRefresh && inMemoryProductsCache[targetRestId] && (now - inMemoryProductsCache[targetRestId].timestamp < PRODUCTS_CACHE_TTL)) {
      return inMemoryProductsCache[targetRestId].data;
    }

    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('products')
          .select('id, restaurant_id, category_id, category_name, name, description, price, discounted_price, tax_rate, is_active, is_available, food_type, image_url, sku, stock_quantity, unit, preparation_time_mins, hsn_code')
          .order('name', { ascending: true });

        if (targetRestId) {
          query = query.eq('restaurant_id', targetRestId);
        }

        const { data, error } = await query;
        if (!error && data) {
          const list = (data as Product[]).map(p => ({ ...p, restaurant_id: p.restaurant_id || targetRestId }));
          inMemoryProductsCache[targetRestId] = {
            timestamp: now,
            data: list,
          };
          mockStorage.saveProducts(list);
          return list;
        }
      } catch (e) {
        console.warn('Supabase fetch products failed, using local cache:', e);
      }
    }
    const local = mockStorage.getProducts();
    inMemoryProductsCache[targetRestId] = {
      timestamp: now,
      data: local,
    };
    return local;
  },

  async saveProduct(product: Partial<Product>, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Product> {
    const targetRestId = product.restaurant_id || restaurantId;

    // Check Plan Product Limit if creating a new product
    if (!product.id) {
      const limitCheck = await subscriptionGuardService.checkPlanLimit(targetRestId, 'PRODUCTS', 1);
      if (!limitCheck.allowed) {
        throw new Error(limitCheck.message || 'Product limit reached for your current plan. Please upgrade to add more products.');
      }
    }
    const name = (product.name || '').trim();
    if (!name) {
      throw new Error('Product Name is required.');
    }
    const sku = (product.sku || '').trim().toUpperCase();
    if (!sku) {
      throw new Error('Product SKU is required.');
    }
    const price = Number(product.price);
    if (isNaN(price) || price <= 0) {
      throw new Error('Product price must be greater than 0.');
    }
    const stock = product.stock_quantity !== undefined ? Number(product.stock_quantity) : 100;
    if (isNaN(stock) || stock < 0) {
      throw new Error('Stock quantity cannot be negative.');
    }
    const categoryId = product.category_id;
    if (!categoryId) {
      throw new Error('Please select a valid Category for this product.');
    }

    // Check SKU uniqueness scoped to this restaurant
    const existingProducts = await this.getProducts(targetRestId);
    const isSkuDuplicate = existingProducts.some(
      (p) => p.id !== product.id && p.sku.toUpperCase() === sku
    );
    if (isSkuDuplicate) {
      throw new Error(`SKU "${sku}" is already in use by another product in this restaurant. Please enter a unique SKU.`);
    }

    // Lookup Category Name
    let catName = product.category_name;
    if (!catName) {
      if (isSupabaseConfigured) {
        const { data: catData } = await supabase
          .from('categories')
          .select('name')
          .eq('id', categoryId)
          .maybeSingle();
        if (catData) catName = catData.name;
      }
      if (!catName) {
        const cats = mockStorage.getCategories();
        catName = cats.find((c) => c.id === categoryId)?.name || 'General';
      }
    }

    const payload: any = {
      restaurant_id: targetRestId,
      name,
      sku,
      category_id: categoryId,
      category_name: catName,
      price,
      discounted_price: product.discounted_price ? Number(product.discounted_price) : null,
      stock_quantity: stock,
      food_type: product.food_type || 'veg',
      unit: product.unit || 'portion',
      tax_rate: product.tax_rate !== undefined ? Number(product.tax_rate) : 5,
      hsn_code: product.hsn_code || '996331',
      preparation_time_mins: product.preparation_time_mins ? Number(product.preparation_time_mins) : 15,
      image_url:
        (await storageService.ensureCdnUrl(
          product.image_url,
          'product-images',
          `restaurants/${targetRestId}/products/${product.id || 'new'}`
        )) ||
        'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
      description: product.description ? product.description.trim() : null,
      is_available: product.is_available ?? (stock > 0),
      is_active: product.is_active ?? true,
    };

    if (product.id) {
      payload.id = product.id;
    }

    if (isSupabaseConfigured) {
      try {
        if (product.id) {
          const { data, error } = await supabase
            .from('products')
            .update(payload)
            .eq('id', product.id)
            .select()
            .single();

          if (error) {
            console.error('Supabase UPDATE product error:', error);
            throw error;
          }
          if (data) {
            console.log('✅ Product updated in Supabase:', data.id, 'restaurant_id:', data.restaurant_id);
            await this.getProducts(targetRestId);
            return data as Product;
          }
        } else {
          const { data, error } = await supabase
            .from('products')
            .insert([payload])
            .select()
            .single();

          if (error) {
            console.error('Supabase INSERT product error:', error);
            throw error;
          }
          if (data) {
            console.log('✅ Product inserted in Supabase:', data.id, 'restaurant_id:', data.restaurant_id);
            await this.getProducts(targetRestId);
            return data as Product;
          }
        }
      } catch (e: any) {
        console.error('Supabase save product error:', e);
        throw new Error(e.message || 'Failed to save product in Supabase.');
      }
    }

    // Local fallback
    if (product.id) {
      const updated = mockStorage.updateProduct(product.id, payload);
      if (!updated) throw new Error('Product not found in local cache.');
      return updated;
    } else {
      return mockStorage.addProduct(payload as Omit<Product, 'id'>);
    }
  },

  async deleteProduct(id: string, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<{ deleted: boolean; deactivated: boolean }> {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (!error) {
          await this.getProducts(restaurantId);
          return { deleted: true, deactivated: false };
        }
        // If error (e.g. referenced in order_items), fallback to deactivation
        await supabase.from('products').update({ is_active: false, is_available: false }).eq('id', id);
        await this.getProducts(restaurantId);
        return { deleted: false, deactivated: true };
      } catch (e: any) {
        console.error('Supabase delete product error:', e);
        throw new Error(e.message || 'Failed to delete product from Supabase.');
      }
    }
    mockStorage.deleteProduct(id);
    return { deleted: true, deactivated: false };
  },

  async toggleAvailability(id: string, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Product> {
    const products = await this.getProducts(restaurantId);
    const product = products.find((p) => p.id === id);
    if (!product) throw new Error('Product not found.');

    const newAvailable = !product.is_available;
    return this.saveProduct({ ...product, is_available: newAvailable }, restaurantId);
  },

  async toggleProductActive(id: string, active?: boolean, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Product> {
    const products = await this.getProducts(restaurantId);
    const product = products.find((p) => p.id === id);
    if (!product) throw new Error('Product not found.');

    const newActive = active !== undefined ? active : !product.is_active;
    return this.saveProduct({ ...product, is_active: newActive }, restaurantId);
  },

  async updateStock(id: string, newStock: number, restaurantId: string = DEFAULT_RESTAURANT_ID): Promise<Product> {
    const products = await this.getProducts(restaurantId);
    const product = products.find((p) => p.id === id);
    if (!product) throw new Error('Product not found.');

    const clampedStock = Math.max(0, newStock);
    return this.saveProduct({
      ...product,
      stock_quantity: clampedStock,
      is_available: clampedStock > 0,
    }, restaurantId);
  },

  async bulkImportProducts(
    rows: CsvProductRow[],
    restaurantId: string = DEFAULT_RESTAURANT_ID
  ): Promise<{ imported: number; importedCount: number; errors: string[] }> {
    // Check bulk product limit upfront atomically
    const limitCheck = await subscriptionGuardService.checkPlanLimit(restaurantId, 'PRODUCTS', rows.length);
    if (!limitCheck.allowed) {
      throw new Error(limitCheck.message || `Your plan limit does not permit importing ${rows.length} new products. Please upgrade your subscription.`);
    }

    const errors: string[] = [];
    let imported = 0;

    const existingCategories = await (await import('./categoryService')).categoryService.getCategories(restaurantId);
    const catMap = new Map<string, string>();
    existingCategories.forEach((c) => catMap.set(c.name.toLowerCase(), c.id));

    const categoryIdByName = async (catName: string): Promise<string> => {
      const cleanName = catName.trim();
      const lower = cleanName.toLowerCase();
      if (catMap.has(lower)) {
        return catMap.get(lower)!;
      }
      const newCat = await (await import('./categoryService')).categoryService.saveCategory({
        name: cleanName,
        restaurant_id: restaurantId,
      });
      catMap.set(lower, newCat.id);
      return newCat.id;
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const catId = await categoryIdByName(row.category || 'General');

        let foodType: FoodType = 'veg';
        const ft = String(row.foodType || '').toLowerCase();
        if (ft.includes('non') || ft === 'non-veg' || ft === 'nv') foodType = 'non-veg';
        else if (ft.includes('egg')) foodType = 'egg';

        await this.saveProduct({
          restaurant_id: restaurantId,
          name: row.name,
          sku: row.sku,
          category_id: catId,
          category_name: row.category || 'General',
          description: row.description || '',
          price: Number(row.price),
          tax_rate: row.tax !== undefined ? Number(row.tax) : 5,
          hsn_code: row.hsn || '996331',
          food_type: foodType,
          stock_quantity: row.quantity !== undefined ? Number(row.quantity) : 100,
          unit: row.unit || 'portion',
          image_url: row.imageUrl || undefined,
          is_available: true,
          is_active: true,
        }, restaurantId);

        imported++;
      } catch (err: any) {
        errors.push(`Row ${i + 1} (${row.name || 'Unnamed'}): ${err.message}`);
      }
    }

    return { imported, importedCount: imported, errors };
  },
};
