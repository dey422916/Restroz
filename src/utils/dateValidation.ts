import { getLocalRestaurantDate } from '../services/api/dayRegisterService';

export interface DateRangeValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates whether a string is a real calendar date in YYYY-MM-DD format.
 * Rejects non-existent dates like 2026-02-31, 2026-13-45, or invalid strings.
 */
export function isValidCalendarDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() + 1 === month &&
    dt.getDate() === day
  );
}

/**
 * Computes the earliest valid reporting date for a restaurant from orders, registers, and creation timestamp.
 */
export function getEarliestRestaurantReportingDate(
  orders?: Array<{ created_at?: string }>,
  registers?: Array<{ opened_at?: string; register_date?: string; created_at?: string }>,
  restaurantCreatedAt?: string
): string | null {
  let earliestTimestamp: number | null = null;

  if (orders && orders.length > 0) {
    for (const o of orders) {
      if (o.created_at) {
        const ts = new Date(o.created_at).getTime();
        if (!isNaN(ts) && (earliestTimestamp === null || ts < earliestTimestamp)) {
          earliestTimestamp = ts;
        }
      }
    }
  }

  if (registers && registers.length > 0) {
    for (const r of registers) {
      const dStr = r.opened_at || r.register_date || r.created_at;
      if (dStr) {
        const ts = new Date(dStr).getTime();
        if (!isNaN(ts) && (earliestTimestamp === null || ts < earliestTimestamp)) {
          earliestTimestamp = ts;
        }
      }
    }
  }

  if (restaurantCreatedAt) {
    const ts = new Date(restaurantCreatedAt).getTime();
    if (!isNaN(ts) && (earliestTimestamp === null || ts < earliestTimestamp)) {
      earliestTimestamp = ts;
    }
  }

  if (earliestTimestamp === null) {
    return null;
  }

  return getLocalRestaurantDate(new Date(earliestTimestamp));
}

/**
 * Validates a From / To reporting date range according to restaurant-local cycle constraints:
 * 1. Invalid calendar dates -> "Please select a valid date."
 * 2. From date > To date -> "From date cannot be later than To date."
 * 3. Future dates -> "Future dates cannot be selected."
 * 4. Dates before earliest available data -> "No report data is available before <earliest-date>."
 */
export function validateReportDateRange(
  startDateStr?: string | null,
  endDateStr?: string | null,
  options?: {
    earliestAvailableDate?: string | null;
    referenceDate?: Date;
  }
): DateRangeValidationResult {
  const s = (startDateStr || '').trim();
  const e = (endDateStr || '').trim();

  // 1. Invalid calendar date validation
  if (!isValidCalendarDate(s) || !isValidCalendarDate(e)) {
    return {
      isValid: false,
      error: 'Please select a valid date.',
    };
  }

  // 2. From date > To date
  if (s > e) {
    return {
      isValid: false,
      error: 'From date cannot be later than To date.',
    };
  }

  // 3. Future date validation using restaurant-local timezone
  const todayStr = getLocalRestaurantDate(options?.referenceDate || new Date());
  if (s > todayStr || e > todayStr) {
    return {
      isValid: false,
      error: 'Future dates cannot be selected.',
    };
  }

  // 4. Before earliest available reporting data validation
  const earliest = options?.earliestAvailableDate?.trim();
  if (earliest && isValidCalendarDate(earliest)) {
    if (s < earliest || e < earliest) {
      return {
        isValid: false,
        error: `No report data is available before ${earliest}.`,
      };
    }
  }

  return { isValid: true };
}
