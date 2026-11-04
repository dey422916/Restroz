/**
 * Utility functions for Kitchen Order Tickets (KOT)
 */

/**
 * Sanitizes item names for KOT printing and kitchen display.
 * Strips unnecessary restaurant suffixes (e.g. " from @49 Restaurant.", " from @49")
 * commonly appended by marketplace platforms, multi-restaurant aggregators, or external catalog imports,
 * while strictly preserving product variations, modifiers, quantities, and legitimate dish names.
 *
 * @param productName Raw product name string
 * @param restaurantName Optional restaurant name from settings or order context
 * @returns Cleaned product name suitable for kitchen copies
 */
export function cleanKotItemName(
  productName: string | undefined | null,
  restaurantName?: string | null
): string {
  if (!productName || typeof productName !== 'string') return '';

  let name = productName.trim();
  if (!name) return '';

  // 1. If restaurant name is provided, match against restaurant-specific patterns
  if (restaurantName && typeof restaurantName === 'string') {
    const trimmedRest = restaurantName.trim();
    if (trimmedRest) {
      const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const candidateRestNames: string[] = [trimmedRest];

      const baseName = trimmedRest.replace(/\s+(Restaurant|Cafe|Kitchen|Bistro|Dhaba|Outlet)$/i, '').trim();
      if (baseName && baseName !== trimmedRest) {
        candidateRestNames.push(baseName);
      }
      if (!/Restaurant$/i.test(trimmedRest)) {
        candidateRestNames.push(`${trimmedRest} Restaurant`);
      }

      for (const cand of candidateRestNames) {
        const escaped = escapeRegex(cand);
        const specificRegex = new RegExp(`\\s+from\\s+${escaped}(?:\\s+Restaurant)?\\.?$`, 'i');
        if (specificRegex.test(name)) {
          name = name.replace(specificRegex, '').trim();
          break;
        }
      }
    }
  }

  // 2. Specific safety net for user reported scenario: "from @49 Restaurant." or "from @49"
  name = name.replace(/\s+from\s+@49(?:\s+Restaurant)?\.?$/i, '').trim();

  // 3. General pattern: " from <RestaurantName> Restaurant." or " from <RestaurantName> Restaurant"
  // Safe because legitimate dish names do not end with " from <Words> Restaurant."
  name = name.replace(/\s+from\s+[@\w\s&'-]+\s+Restaurant\.?$/i, '').trim();

  return name;
}
