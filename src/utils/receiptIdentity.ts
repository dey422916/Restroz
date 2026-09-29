import { RestaurantSettings, UserProfile } from '../types';

export interface ReceiptIdentity {
  billedBy: string;
  restaurantPhone: string;
}

/**
 * Extracts the canonical display name of the currently logged-in user.
 * Priority:
 * 1. user.full_name (trimmed)
 * 2. split first_name + last_name
 * 3. user.name
 * 4. email username prefix (before @)
 * 5. 'Staff' fallback
 */
export function getCurrentLoggedInUserDisplayName(user?: Partial<UserProfile> | null): string {
  if (!user) return 'Staff';

  if (user.full_name && typeof user.full_name === 'string' && user.full_name.trim()) {
    // Strip mock/debug role suffixes like "(Admin)", "(Owner)", "(Staff)" if present
    const clean = user.full_name.replace(/\s*\((Admin|Owner|Staff|Cashier|Waiter)\)/gi, '').trim();
    if (clean) return clean;
  }

  const firstName = (user as any).first_name;
  const lastName = (user as any).last_name;
  if (firstName || lastName) {
    const combined = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (combined) return combined;
  }

  if ((user as any).name && typeof (user as any).name === 'string' && (user as any).name.trim()) {
    return (user as any).name.trim();
  }

  if (user.email && typeof user.email === 'string') {
    const prefix = user.email.split('@')[0].trim();
    if (prefix && prefix !== 'undefined' && prefix !== 'null') {
      return prefix;
    }
  }

  return 'Staff';
}

/**
 * Extracts the authoritative restaurant phone number configured in Restaurant Settings.
 * Returns empty string if not configured.
 */
export function getRestaurantSettingsPhone(settings?: Partial<RestaurantSettings> | null): string {
  if (!settings) return '';
  const rawPhone = settings.phone || (settings as any).contact_number || (settings as any).phone_number || '';
  if (typeof rawPhone === 'string' && rawPhone.trim()) {
    const trimmed = rawPhone.trim();
    if (trimmed !== 'undefined' && trimmed !== 'null') {
      return trimmed;
    }
  }
  return '';
}

/**
 * Canonical receipt identity resolver for thermal and browser bills.
 */
export function resolveReceiptIdentity(
  settings?: Partial<RestaurantSettings> | null,
  user?: Partial<UserProfile> | null,
  explicitBilledBy?: string
): ReceiptIdentity {
  const billedBy = explicitBilledBy && explicitBilledBy.trim() && explicitBilledBy !== 'Staff' && explicitBilledBy !== 'Ratnadeep Dey'
    ? explicitBilledBy.trim()
    : getCurrentLoggedInUserDisplayName(user);

  const restaurantPhone = getRestaurantSettingsPhone(settings);

  return {
    billedBy: billedBy || 'Staff',
    restaurantPhone,
  };
}
