/**
 * Utility to sanitize customer order notes.
 * Strips internal system routing and idempotency tags such as [IDEM:...], [POS],
 * [ONLINE_DELIVERY], [QR_DINE_IN], [DISC:...], and fallback placeholder strings so that ONLY the
 * genuine customer instructions / notes are presented in the UI or printed receipts.
 */
export function cleanCustomerOrderNotes(notes?: string | null): string {
  if (!notes || typeof notes !== 'string') return '';

  const cleaned = notes
    .replace(/\[IDEM:[^\]]+\]/gi, '')
    .replace(/\[DISC:[^\]]+\]/gi, '')
    .replace(/\[REWARD:[^\]]+\]/gi, '')
    .replace(/\[WALLET:[^\]]+\]/gi, '')
    .replace(/\[GSTIN:[^\]]+\]/gi, '')
    .replace(/\[B2B:[^\]]+\]/gi, '')
    .replace(/\[B2B_BIZ:[^\]]+\]/gi, '')
    .replace(/\[B2B_ADDR:[^\]]+\]/gi, '')
    .replace(/\[B2B_STATE:[^\]]+\]/gi, '')
    .replace(/\[B2B_CODE:[^\]]+\]/gi, '')
    .replace(/\[ONLINE_DELIVERY\]/gi, '')
    .replace(/\[ONLINE_APP\]/gi, '')
    .replace(/\[DELIVERY\]/gi, '')
    .replace(/\[MARKETPLACE\]/gi, '')
    .replace(/\[QR_DINE_IN\]/gi, '')
    .replace(/\[QR_ORDER\]/gi, '')
    .replace(/\[QR\]/gi, '')
    .replace(/\[POS\]/gi, '')
    .replace(/\[AUTO_PRINTED\]/gi, '')
    .replace(/Customer Online Order\s*(\[[^\]]+\])?\s*(\([^)]+\))?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

/**
 * Interface representing B2B billing snapshot metadata stored in order notes.
 */
export interface B2BBillingDetails {
  business_name?: string;
  customer_business_name?: string;
  customerBusinessName?: string;
  customer_gstin?: string;
  customerGstin?: string;
  billing_address?: string;
  billingAddress?: string;
  billing_state?: string;
  billingState?: string;
  billing_state_code?: string;
  billingStateCode?: string;
}

/**
 * Attaches B2B billing details safely to order notes for schema-safe persistence.
 */
export function attachB2bToNotes(
  notes: string | undefined | null,
  b2b?: B2BBillingDetails | null
): string {
  let baseNotes = (notes || '')
    .replace(/\[B2B:[^\]]+\]/gi, '')
    .replace(/\[B2B_BIZ:[^\]]+\]/gi, '')
    .replace(/\[B2B_ADDR:[^\]]+\]/gi, '')
    .replace(/\[B2B_STATE:[^\]]+\]/gi, '')
    .replace(/\[B2B_CODE:[^\]]+\]/gi, '')
    .trim();

  if (!b2b) return baseNotes;

  const biz = b2b.business_name || b2b.customer_business_name || b2b.customerBusinessName;
  const addr = b2b.billing_address || b2b.billingAddress;
  const state = b2b.billing_state || b2b.billingState;
  const code = b2b.billing_state_code || b2b.billingStateCode;

  const parts: string[] = [];
  if (biz?.trim()) {
    parts.push(`[B2B_BIZ:${biz.trim().replace(/[\[\]]/g, '')}]`);
  }
  if (addr?.trim()) {
    parts.push(`[B2B_ADDR:${addr.trim().replace(/[\[\]]/g, '')}]`);
  }
  if (state?.trim()) {
    parts.push(`[B2B_STATE:${state.trim().replace(/[\[\]]/g, '')}]`);
  }
  if (code?.trim()) {
    parts.push(`[B2B_CODE:${code.trim().replace(/[\[\]]/g, '')}]`);
  }

  if (parts.length === 0) return baseNotes;
  const tags = parts.join(' ');
  return baseNotes ? `${baseNotes} ${tags}`.trim() : tags;
}

/**
 * Extracts B2B billing details from order notes.
 */
export function extractB2bFromNotes(notes?: string | null): B2BBillingDetails | null {
  if (!notes || typeof notes !== 'string') return null;
  const bizMatch = notes.match(/\[B2B_BIZ:([^\]]+)\]/i);
  const addrMatch = notes.match(/\[B2B_ADDR:([^\]]+)\]/i);
  const stateMatch = notes.match(/\[B2B_STATE:([^\]]+)\]/i);
  const codeMatch = notes.match(/\[B2B_CODE:([^\]]+)\]/i);

  if (!bizMatch && !addrMatch && !stateMatch && !codeMatch) {
    return null;
  }

  const biz = bizMatch ? bizMatch[1].trim() : undefined;
  const addr = addrMatch ? addrMatch[1].trim() : undefined;
  const state = stateMatch ? stateMatch[1].trim() : undefined;
  const code = codeMatch ? codeMatch[1].trim() : undefined;

  return {
    business_name: biz,
    customer_business_name: biz,
    customerBusinessName: biz,
    billing_address: addr,
    billingAddress: addr,
    billing_state: state,
    billingState: state,
    billing_state_code: code,
    billingStateCode: code,
  };
}

/**
 * Attaches discount metadata to notes string safely without altering Supabase table schema.
 */
export function attachDiscountToNotes(
  notes: string | undefined | null,
  type?: 'none' | 'fixed' | 'percentage',
  value?: number
): string {
  const baseNotes = (notes || '').replace(/\[DISC:[^\]]+\]/gi, '').trim();
  if (!type || type === 'none' || !value || value <= 0) {
    return baseNotes;
  }
  const tag = `[DISC:${type}:${value}]`;
  return baseNotes ? `${baseNotes} ${tag}` : tag;
}

/**
 * Extracts discount type and rate/value from order notes.
 */
export function extractDiscountFromNotes(
  notes?: string | null
): { discount_type: 'none' | 'fixed' | 'percentage'; discount_value: number } | null {
  if (!notes || typeof notes !== 'string') return null;
  const match = notes.match(/\[DISC:(none|fixed|percentage):([0-9.]+)\]/i);
  if (match) {
    const type = match[1].toLowerCase() as 'none' | 'fixed' | 'percentage';
    const value = parseFloat(match[2]) || 0;
    return { discount_type: type, discount_value: value };
  }
  return null;
}

/**
 * Attaches customer GSTIN safely to notes string for schema-safe persistence.
 */
export function attachGstinToNotes(
  notes: string | undefined | null,
  gstin?: string | null
): string {
  const baseNotes = (notes || '').replace(/\[GSTIN:[^\]]+\]/gi, '').trim();
  const cleanGstin = (gstin || '').trim().toUpperCase();
  if (!cleanGstin) return baseNotes;
  const tag = `[GSTIN:${cleanGstin}]`;
  return baseNotes ? `${baseNotes} ${tag}` : tag;
}

/**
 * Extracts customer GSTIN from order notes if present.
 */
export function extractGstinFromNotes(notes?: string | null): string | null {
  if (!notes || typeof notes !== 'string') return null;
  const match = notes.match(/\[GSTIN:([A-Z0-9]{15})\]/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}

/**
 * Attaches customer loyalty reward / wallet redemption amount safely to notes string.
 */
export function attachRewardToNotes(
  notes: string | undefined | null,
  rewardAmount?: number
): string {
  const baseNotes = (notes || '')
    .replace(/\[REWARD:[^\]]+\]/gi, '')
    .replace(/\[WALLET:[^\]]+\]/gi, '')
    .trim();
  const amt = Number(rewardAmount) || 0;
  if (amt <= 0) {
    return baseNotes;
  }
  const tag = `[REWARD:${amt.toFixed(2)}]`;
  return baseNotes ? `${baseNotes} ${tag}` : tag;
}

/**
 * Extracts redeemed loyalty reward / wallet amount from order notes if present.
 */
export function extractRewardFromNotes(notes?: string | null): number {
  if (!notes || typeof notes !== 'string') return 0;
  const match = notes.match(/\[(?:REWARD|WALLET):([0-9.]+)\]/i);
  if (match) {
    const val = parseFloat(match[1]);
    return !isNaN(val) && val > 0 ? val : 0;
  }
  return 0;
}


