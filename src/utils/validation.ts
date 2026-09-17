/**
 * Shared Reusable Validation Utilities for RestroZ
 * Provides standardized email and Indian phone number validation and normalization.
 */

// Strict RFC-compliant email regex:
// - No spaces
// - Valid local part without consecutive dots
// - Exactly one '@'
// - Valid domain with alphanumeric/hyphen labels
// - TLD with at least 2 alphabetic characters
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;

/**
 * Normalizes an email address (trims whitespace and converts to lowercase).
 */
export function normalizeEmail(value?: string | null): string {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

/**
 * Validates whether an email string is structurally valid.
 * Rejects:
 * - Empty/whitespace-only
 * - Spaces anywhere in email
 * - Missing '@' or multiple '@'
 * - Missing domain or missing TLD (e.g. 'abc@gmail')
 * - Consecutive dots (e.g. 'abc..test@gmail.com' or 'abc@gmail..com')
 * - Leading/trailing dot in local part (e.g. '.abc@gmail.com')
 */
export function isValidEmail(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Reject spaces inside email
  if (/\s/.test(trimmed)) return false;

  // Reject consecutive dots anywhere
  if (trimmed.includes('..')) return false;

  // Split into local part and domain
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts;

  // Local part cannot start or end with a dot
  if (!localPart || localPart.startsWith('.') || localPart.endsWith('.')) return false;

  // Domain cannot start or end with a dot or hyphen
  if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.startsWith('-') || domain.endsWith('-')) {
    return false;
  }

  return EMAIL_REGEX.test(trimmed);
}

/**
 * Returns an inline error message for an email field, or null if valid.
 */
export function getEmailValidationError(value?: string | null, required: boolean = false): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return required ? 'Enter a valid email address' : null;
  }
  if (!isValidEmail(trimmed)) {
    return 'Enter a valid email address';
  }
  return null;
}

/**
 * Throws an Error if email is invalid or missing when required.
 */
export function validateEmailOrThrow(value?: string | null, fieldLabel: string = 'Email Address'): void {
  if (!value || !value.trim()) {
    throw new Error(`${fieldLabel} is required.`);
  }
  if (!isValidEmail(value)) {
    throw new Error(`Enter a valid email address for ${fieldLabel}.`);
  }
}

/**
 * Normalizes an Indian phone/mobile number to standard 10 digits.
 * Accepts:
 * - '9876543210'
 * - '+91 9876543210' / '+919876543210'
 * - '91 9876543210' / '919876543210'
 * - '09876543210'
 * Returns clean 10 digits (e.g. '9876543210') or digits string.
 */
export function normalizeIndianPhone(value?: string | null): string {
  if (!value || typeof value !== 'string') return '';
  let digits = value.replace(/\D/g, '');

  // Strip leading 91 if full 12-digit Indian number (+91 / 91)
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.substring(2);
  }
  // Strip leading 0 if 11-digit number (09876543210)
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  return digits;
}

/**
 * Validates whether a phone number is a valid 10-digit Indian mobile number.
 * Valid Indian mobile:
 * - Exactly 10 digits after normalization
 * - Starts with 6, 7, 8, or 9
 * - Disallows invalid country codes (e.g. +1), letters, or invalid lengths
 */
export function isValidIndianPhone(value?: string | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Reject if raw string contains alphabets or disallowed characters
  if (/[a-zA-Z]/.test(trimmed)) return false;

  // Check if international prefix other than +91 / +0 was supplied
  if (trimmed.startsWith('+') && !trimmed.startsWith('+91')) {
    return false;
  }

  const normalized = normalizeIndianPhone(trimmed);
  // Must be exactly 10 digits starting with 6, 7, 8, or 9
  return /^[6-9]\d{9}$/.test(normalized);
}

/**
 * Returns an inline error message for an Indian phone/mobile field, or null if valid.
 */
export function getIndianPhoneValidationError(value?: string | null, required: boolean = false): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return required ? 'Enter a valid 10-digit Indian mobile number' : null;
  }
  if (!isValidIndianPhone(trimmed)) {
    return 'Enter a valid 10-digit Indian mobile number';
  }
  return null;
}

/**
 * Throws an Error if phone is invalid or missing when required.
 */
export function validateIndianPhoneOrThrow(value?: string | null, fieldLabel: string = 'Phone Number'): void {
  if (!value || !value.trim()) {
    throw new Error(`${fieldLabel} is required.`);
  }
  if (!isValidIndianPhone(value)) {
    throw new Error(`Enter a valid 10-digit Indian mobile number for ${fieldLabel}.`);
  }
}

/**
 * Formats a 10-digit Indian mobile number for display: +91 98765 43210
 */
export function formatIndianPhoneDisplay(value?: string | null): string {
  if (!value) return '';
  const normalized = normalizeIndianPhone(value);
  if (normalized.length === 10) {
    return `+91 ${normalized.slice(0, 5)} ${normalized.slice(5)}`;
  }
  return value.trim();
}
