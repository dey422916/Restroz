/**
 * Phone Number Validation and Formatting Utilities
 * Standardized across all order types (POS Dine-in, Takeaway, Delivery, Marketplace, QR Digital Menu)
 */

export function normalizePhoneNumber(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return '';
  let digits = phone.replace(/\D/g, '');
  // Strip leading 91 if full 12-digit Indian number (+91)
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.substring(2);
  }
  // Strip leading 0 if 11-digit number
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  return digits;
}

export function isValidPhoneNumber(phone?: string | null): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  if (!trimmed) return false;

  const normalized = normalizePhoneNumber(trimmed);
  // Standard Indian 10-digit mobile number starting with 6, 7, 8, or 9
  if (/^[6-9]\d{9}$/.test(normalized)) {
    return true;
  }

  // Support international numbers prefixed with + (10 to 15 digits)
  if (trimmed.startsWith('+')) {
    const intlDigits = trimmed.replace(/\D/g, '');
    return intlDigits.length >= 10 && intlDigits.length <= 15;
  }

  return false;
}

export function validatePhoneNumberOrThrow(
  phone?: string | null,
  fieldLabel: string = 'Phone Number'
): void {
  if (!phone || !phone.trim()) {
    throw new Error(`${fieldLabel} is required.`);
  }
  if (!isValidPhoneNumber(phone)) {
    throw new Error(`Invalid ${fieldLabel}. Please enter a valid 10-digit mobile number.`);
  }
}

export function formatPhoneNumberDisplay(phone?: string | null): string {
  if (!phone) return '';
  const normalized = normalizePhoneNumber(phone);
  if (normalized.length === 10) {
    return `+91 ${normalized.slice(0, 5)} ${normalized.slice(5)}`;
  }
  return phone.trim();
}
