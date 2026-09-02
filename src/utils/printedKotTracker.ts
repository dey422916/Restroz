import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { KOT } from '../types';

const STORAGE_KEY_PRINTED_KOTS = '@printed_kot_ids';
const inMemoryPrintedKots = new Set<string>();
let isInitialized = false;

async function ensureInitialized() {
  if (isInitialized) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_PRINTED_KOTS);
    if (raw) {
      const ids: string[] = JSON.parse(raw);
      ids.forEach((id) => inMemoryPrintedKots.add(id));
    }
  } catch (err) {
    console.warn('[printedKotTracker] Error loading printed KOTs from cache:', err);
  } finally {
    isInitialized = true;
  }
}

export const printedKotTracker = {
  /**
   * Checks if this KOT has already been auto-printed.
   * Checks both local cache and persisted KOT record state in Supabase.
   */
  async hasKotBeenAutoPrinted(kot: KOT | { id: string; kitchen_notes?: string }): Promise<boolean> {
    if (!kot || !kot.id) return false;

    // 1. Check in-memory / local cache
    await ensureInitialized();
    if (inMemoryPrintedKots.has(kot.id)) {
      return true;
    }

    // 2. Check if kitchen_notes already tagged in the record
    if (kot.kitchen_notes && kot.kitchen_notes.includes('[AUTO_PRINTED]')) {
      inMemoryPrintedKots.add(kot.id);
      return true;
    }

    // 3. Fallback: check Supabase directly if available
    if (isSupabaseConfigured) {
      try {
        const { data } = await supabase
          .from('kots')
          .select('kitchen_notes')
          .eq('id', kot.id)
          .maybeSingle();

        if (data?.kitchen_notes && data.kitchen_notes.includes('[AUTO_PRINTED]')) {
          inMemoryPrintedKots.add(kot.id);
          return true;
        }
      } catch (e) {
        // Non-fatal, fallback to local tracking
      }
    }

    return false;
  },

  /**
   * Marks a KOT as auto-printed both locally and in the Supabase DB.
   * Prevents duplicate prints across refreshes, double clicks, and multiple terminals.
   */
  async markKotAsAutoPrinted(kotId: string, currentNotes?: string): Promise<void> {
    if (!kotId) return;

    await ensureInitialized();
    inMemoryPrintedKots.add(kotId);

    // 1. Persist locally to AsyncStorage
    try {
      const ids = Array.from(inMemoryPrintedKots).slice(-200); // keep last 200
      await AsyncStorage.setItem(STORAGE_KEY_PRINTED_KOTS, JSON.stringify(ids));
    } catch (e) {
      console.warn('[printedKotTracker] Failed to save to AsyncStorage:', e);
    }

    // 2. Persist to Supabase KOT record so all devices know it was auto-printed
    if (isSupabaseConfigured) {
      try {
        let updatedNotes = currentNotes ? currentNotes.trim() : '';
        if (!updatedNotes.includes('[AUTO_PRINTED]')) {
          updatedNotes = updatedNotes ? `${updatedNotes} [AUTO_PRINTED]` : '[AUTO_PRINTED]';
          await supabase
            .from('kots')
            .update({
              kitchen_notes: updatedNotes,
              updated_at: new Date().toISOString(),
            })
            .eq('id', kotId);
        }
      } catch (err) {
        console.warn('[printedKotTracker] Failed to persist auto-print status to Supabase:', err);
      }
    }
  },

  /**
   * Resets local print cache (e.g. for testing / debugging)
   */
  async resetLocalPrintCache(): Promise<void> {
    inMemoryPrintedKots.clear();
    isInitialized = true;
    await AsyncStorage.removeItem(STORAGE_KEY_PRINTED_KOTS).catch(() => {});
  },
};
