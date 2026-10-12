import { PaymentMethod } from '../types';
import { roundToTwoDecimals, formatPrice } from './currency';

export interface SplitPaymentEntry {
  id: string;
  method: PaymentMethod;
  amount: string;
  ref: string;
}

/**
 * Auto-calculates and fills the opposite split amount when there are EXACTLY 2 split methods.
 * Formula: remaining = currentRemainingDue - manuallyEnteredSplitAmount
 *
 * Rules:
 * 1. Only auto-fills if splits.length === 2.
 * 2. If splits.length > 2 (or < 2), ONLY the edited split is updated; no other split is modified.
 * 3. Never produces negative auto-filled amounts (clamped to '0').
 * 4. Respects decimals without floating-point artifacts using RestroZ roundToTwoDecimals and formatPrice.
 * 5. If the user clears the edited field (blank), the other field is also cleared.
 * 6. Reference number fields and payment methods are never touched.
 */
export function calculateSplitAutoFill(
  splits: SplitPaymentEntry[],
  editedSplitId: string,
  newAmountRaw: string,
  currentRemainingDue: number
): SplitPaymentEntry[] {
  // Sanitize numeric text input allowing only digits and at most one decimal point
  let clean = newAmountRaw.replace(/[^0-9.]/g, '');
  const dotParts = clean.split('.');
  if (dotParts.length > 2) {
    clean = dotParts[0] + '.' + dotParts.slice(1).join('');
  }

  // If not exactly 2 splits, update only the target split without auto-filling
  if (splits.length !== 2) {
    return splits.map((item) =>
      item.id === editedSplitId ? { ...item, amount: clean } : item
    );
  }

  const editedIndex = splits.findIndex((item) => item.id === editedSplitId);
  if (editedIndex === -1) return splits;

  const otherIndex = editedIndex === 0 ? 1 : 0;
  let otherAmount = '';

  const cleanNum = parseFloat(clean);
  if (clean !== '' && !isNaN(cleanNum)) {
    const due = Math.max(0, currentRemainingDue);
    const remaining = roundToTwoDecimals(due - cleanNum);
    otherAmount = remaining > 0 ? formatPrice(remaining) : '0';
  }

  return splits.map((item, idx) => {
    if (idx === editedIndex) {
      return { ...item, amount: clean };
    }
    if (idx === otherIndex) {
      return { ...item, amount: otherAmount };
    }
    return item;
  });
}
