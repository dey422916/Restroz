/**
 * Utility to sanitize customer order notes.
 * Strips internal system routing and idempotency tags such as [IDEM:...], [POS],
 * [ONLINE_DELIVERY], [QR_DINE_IN], and fallback placeholder strings so that ONLY the
 * genuine customer instructions / notes are presented in the UI or printed receipts.
 */
export function cleanCustomerOrderNotes(notes?: string | null): string {
  if (!notes || typeof notes !== 'string') return '';

  const cleaned = notes
    .replace(/\[IDEM:[^\]]+\]/gi, '')
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
