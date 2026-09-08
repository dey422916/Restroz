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
    .replace(/\[GSTIN:[^\]]+\]/gi, '')
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

