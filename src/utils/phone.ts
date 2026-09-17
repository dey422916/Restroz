/**
 * Phone Number Validation and Formatting Utilities
 * Standardized across all order types (POS Dine-in, Takeaway, Delivery, Marketplace, QR Digital Menu)
 * Re-exports and delegates to the central validation utility in validation.ts
 */

import {
  normalizeIndianPhone,
  isValidIndianPhone,
  validateIndianPhoneOrThrow,
  formatIndianPhoneDisplay,
  getIndianPhoneValidationError,
} from './validation';

export const normalizePhoneNumber = normalizeIndianPhone;
export const isValidPhoneNumber = isValidIndianPhone;
export const validatePhoneNumberOrThrow = validateIndianPhoneOrThrow;
export const formatPhoneNumberDisplay = formatIndianPhoneDisplay;
export const getPhoneValidationError = getIndianPhoneValidationError;
