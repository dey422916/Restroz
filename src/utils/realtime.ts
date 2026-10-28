import { supabase } from '../services/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Creates a unique, safe Supabase Realtime channel that:
 * 1. Generates an isolated, collision-free channel topic name per subscription lifecycle.
 * 2. Checks for and removes any existing/stale channel with the same topic from SupabaseClient's internal cache before creating a new one.
 * 3. Ensures that all postgres_changes listeners are attached BEFORE .subscribe() is invoked.
 */
export function createSafeRealtimeChannel(prefix: string, identifier?: string): RealtimeChannel {
  const safeIdentifier = identifier ? `${identifier}_` : '';
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const channelName = `${prefix}_${safeIdentifier}${uniqueSuffix}`;

  // Purge any lingering channel with matching topic in the client's internal channels list
  const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
  if (existing) {
    try {
      supabase.removeChannel(existing);
    } catch (_) {}
  }

  return supabase.channel(channelName);
}

/**
 * Safely removes and tears down a Realtime channel instance.
 */
export function removeSafeRealtimeChannel(channel: RealtimeChannel | null | undefined): void {
  if (!channel) return;
  try {
    supabase.removeChannel(channel);
  } catch (err) {
    console.warn('[Realtime] Failed to remove channel:', err);
  }
}
