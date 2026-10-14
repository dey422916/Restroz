import { OrderItem, Product } from '../types';

/**
 * Normalizes an item note or customization string.
 * Empty, null, undefined, or whitespace-only notes become ''.
 */
export function normalizeItemNotes(notes?: string | null): string {
  if (!notes) return '';
  return notes.trim().toLowerCase();
}

/**
 * Generates a deterministic canonical key representing the sellable configuration
 * of an order item (product, variant, size, unit price, tax rate, modifiers/notes).
 */
export function getOrderItemCanonicalKey(item: Partial<OrderItem> & {
  name?: string;
  price?: number;
  notes?: string;
  variant_id?: string;
  variant_name?: string;
  size?: string;
  modifiers?: any;
}): string {
  const prodId = (item.product_id || '').trim();
  const name = (item.product_name || item.name || '').trim().toLowerCase();
  const unitPrice = Number(Number(item.unit_price ?? item.price ?? 0).toFixed(2));
  const taxRate = Number(Number(item.tax_rate ?? 0).toFixed(2));
  const notes = normalizeItemNotes(item.item_notes ?? item.notes);
  const variant = ((item as any).variant_id || (item as any).variant_name || (item as any).size || '').trim().toLowerCase();
  const modifiers = (item as any).modifiers
    ? (typeof (item as any).modifiers === 'string' ? (item as any).modifiers.trim().toLowerCase() : JSON.stringify((item as any).modifiers))
    : '';

  return `${prodId || 'no-prod'}::${name}::${unitPrice}::${taxRate}::${variant}::${modifiers}::${notes}`;
}

/**
 * Determines whether two order items represent the EXACT SAME sellable configuration
 * and should therefore be consolidated into a single line quantity.
 *
 * Rules:
 * 1. If both items have valid product IDs, they must match.
 * 2. Variant / Size (if present on either) must match.
 * 3. Modifiers / Customizations (if present on either) must match.
 * 4. Product Name must match (normalized).
 * 5. Unit Price must match.
 * 6. Tax Rate must match.
 * 7. Notes / special instructions must match (e.g. 'No Cheese' vs 'Extra Cheese' remain separate).
 */
export function areOrderItemsIdentical(
  a: Partial<OrderItem> & { name?: string; price?: number; notes?: string; [key: string]: any },
  b: Partial<OrderItem> & { name?: string; price?: number; notes?: string; [key: string]: any }
): boolean {
  // 1. If both have non-empty product_id and they don't match, they are NOT identical
  const aProdId = (a.product_id || '').trim();
  const bProdId = (b.product_id || '').trim();
  if (aProdId && bProdId && aProdId !== bProdId) {
    return false;
  }

  // 2. Variant / Size checks
  const aVar = ((a as any).variant_id || (a as any).variant_name || (a as any).size || '').trim().toLowerCase();
  const bVar = ((b as any).variant_id || (b as any).variant_name || (b as any).size || '').trim().toLowerCase();
  if (aVar !== bVar) {
    return false;
  }

  // 3. Modifiers / Customizations checks
  const aMod = (a as any).modifiers
    ? (typeof (a as any).modifiers === 'string' ? (a as any).modifiers.trim().toLowerCase() : JSON.stringify((a as any).modifiers))
    : '';
  const bMod = (b as any).modifiers
    ? (typeof (b as any).modifiers === 'string' ? (b as any).modifiers.trim().toLowerCase() : JSON.stringify((b as any).modifiers))
    : '';
  if (aMod !== bMod) {
    return false;
  }

  // 4. Product Name must match (normalized)
  const aName = (a.product_name || a.name || '').trim().toLowerCase();
  const bName = (b.product_name || b.name || '').trim().toLowerCase();
  if (aName !== bName) {
    return false;
  }

  // 5. Unit price must match
  const aPrice = Number(Number(a.unit_price ?? a.price ?? 0).toFixed(2));
  const bPrice = Number(Number(b.unit_price ?? b.price ?? 0).toFixed(2));
  if (Math.abs(aPrice - bPrice) >= 0.01) {
    return false;
  }

  // 6. Tax rate must match (if specified on both)
  if (
    a.tax_rate !== undefined && a.tax_rate !== null && !isNaN(Number(a.tax_rate)) &&
    b.tax_rate !== undefined && b.tax_rate !== null && !isNaN(Number(b.tax_rate))
  ) {
    const aTax = Number(Number(a.tax_rate).toFixed(2));
    const bTax = Number(Number(b.tax_rate).toFixed(2));
    if (Math.abs(aTax - bTax) >= 0.01) {
      return false;
    }
  }

  // 7. Notes / special preparation instructions must match
  const aNotes = normalizeItemNotes(a.item_notes ?? a.notes);
  const bNotes = normalizeItemNotes(b.item_notes ?? b.notes);
  if (aNotes !== bNotes) {
    return false;
  }

  return true;
}

/**
 * Consolidates a list of order items, merging identical items into a single line
 * with cumulative quantity, subtotal, and tax amount.
 * Preserves the original line id of the first occurrence.
 */
export function consolidateOrderItems(items: OrderItem[]): OrderItem[] {
  if (!items || items.length === 0) return [];

  const consolidated: OrderItem[] = [];

  for (const item of items) {
    const existingIdx = consolidated.findIndex((c) => areOrderItemsIdentical(c, item));

    if (existingIdx !== -1) {
      const existing = consolidated[existingIdx];
      const combinedQty = Number(existing.quantity || 0) + Number(item.quantity || 0);
      const unitPrice = Number(existing.unit_price) || 0;
      const taxRate = (existing.tax_rate !== undefined && existing.tax_rate !== null && !isNaN(Number(existing.tax_rate)))
        ? Number(existing.tax_rate)
        : ((item.tax_rate !== undefined && item.tax_rate !== null && !isNaN(Number(item.tax_rate))) ? Number(item.tax_rate) : 0);
      const combinedSubtotal = Number((combinedQty * unitPrice).toFixed(2));
      const combinedTax = Number(((combinedSubtotal * taxRate) / 100).toFixed(2));

      // If existing had no product_id but incoming has product_id, heal product_id
      const healedProductId = existing.product_id || item.product_id || '';

      consolidated[existingIdx] = {
        ...existing,
        product_id: healedProductId,
        quantity: combinedQty,
        unit_price: unitPrice,
        tax_rate: taxRate,
        subtotal: combinedSubtotal,
        total: combinedSubtotal,
        total_price: combinedSubtotal,
        tax_amount: combinedTax,
        product: existing.product || item.product,
        image_url: existing.image_url || item.image_url,
      };
    } else {
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unit_price) || (item.subtotal && qty ? Number(item.subtotal) / qty : 0);
      const taxRate = (item.tax_rate !== undefined && item.tax_rate !== null && !isNaN(Number(item.tax_rate))) ? Number(item.tax_rate) : 0;
      const subtotal = Number((qty * unitPrice).toFixed(2));
      const taxAmount = Number(((subtotal * taxRate) / 100).toFixed(2));

      consolidated.push({
        ...item,
        quantity: qty,
        unit_price: unitPrice,
        tax_rate: taxRate,
        subtotal,
        total: subtotal,
        total_price: subtotal,
        tax_amount: taxAmount,
      });
    }
  }

  return consolidated;
}
