import { Order, KOT, RestaurantSettings, OrderItem } from '../types';
import { formatCurrency, numberToWords } from '../utils/currency';
import { getOrderSubtotal } from '../utils/gst';
import { supabase } from './supabase';

const isWebEnvironment = typeof window !== 'undefined' && typeof document !== 'undefined';

export function formatLogoDataUri(urlOrBase64?: string | null): string {
  if (!urlOrBase64) return '';
  const trimmed = urlOrBase64.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (trimmed.startsWith('data:image/')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex !== -1) {
      const rawData = trimmed.substring(commaIndex + 1).trim();
      if (rawData.startsWith('/9j/') && trimmed.startsWith('data:image/png')) {
        return `data:image/jpeg;base64,${rawData}`;
      }
      return trimmed;
    }
  }

  if (trimmed.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${trimmed}`;
  }
  if (trimmed.startsWith('iVBORw0KGgo')) {
    return `data:image/png;base64,${trimmed}`;
  }
  if (trimmed.startsWith('R0lGOD')) {
    return `data:image/gif;base64,${trimmed}`;
  }
  if (trimmed.startsWith('PHN2Zy') || trimmed.startsWith('PD94bWw')) {
    return `data:image/svg+xml;base64,${trimmed}`;
  }

  return `data:image/png;base64,${trimmed}`;
}

/**
 * Isolated Web / Native Printing Helper.
 * On Web: Spawns an isolated invisible iframe to execute printing exclusively on the target document.
 * NEVER prints or screenshots the active POS application window.
 * On Native: Uses expo-print printAsync with standalone HTML document.
 */
async function executeIsolatedPrint(html: string): Promise<void> {
  if (isWebEnvironment) {
    return new Promise<void>((resolve) => {
      // Remove previous print iframe if existing
      const existing = document.getElementById('ratnadeep-pos-print-frame');
      if (existing) {
        try { existing.remove(); } catch (_) {}
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'ratnadeep-pos-print-frame';
      iframe.name = 'ratnadeep-pos-print-frame';
      // Use in-DOM rendered dimensions with low opacity so modern browsers do not suppress print()
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.border = 'none';
      iframe.style.opacity = '0.01';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);

      const triggerPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print failed, falling back to window.print():', e);
          try {
            window.print();
          } catch (winErr) {
            console.warn('Direct window.print fallback failed:', winErr);
          }
        } finally {
          setTimeout(() => {
            try { iframe.remove(); } catch (_) {}
            resolve();
          }, 300);
        }
      };

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        // Wait for all images inside the iframe to fully load before printing
        const imgs = Array.from(doc.images);
        if (imgs.length === 0) {
          setTimeout(triggerPrint, 100);
        } else {
          let finished = false;
          const finalize = () => {
            if (!finished) {
              finished = true;
              setTimeout(triggerPrint, 100);
            }
          };

          Promise.all(
            imgs.map((img) => {
              if (img.complete) return Promise.resolve(null);
              return new Promise((res) => {
                img.onload = res;
                img.onerror = res;
              });
            })
          ).then(finalize);

          // Safety fallback timeout
          setTimeout(finalize, 600);
        }
      } else {
        resolve();
      }
    });
  } else if (typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative') {
    // Android / iOS native printing
    const Print = await import('expo-print');
    await Print.printAsync({ html });
  } else {
    // Node / test environment: print is a no-op / success
    return;
  }
}

export const printService = {
  /**
   * Dedicated Thermal / Standard KOT Slip (58mm / 80mm / A4 Kitchen Ticket)
   * Matches the official KOT reference specification with responsive layout per paper size.
   */
  async printKotThermal(order: Order, settings: RestaurantSettings, kot?: KOT, isReprint: boolean = false): Promise<void> {
    const activeKot = kot || (order.kots && order.kots[0]);
    let kotNum = activeKot?.kot_number || 'KOT-0001';

    const rawDate = activeKot?.created_at ? new Date(activeKot.created_at) : new Date();
    const formattedDate = rawDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const formattedTime = rawDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const paperSize = settings.kot_paper_size || '80mm';
    const showReprintBanner = isReprint || Boolean(activeKot?.kitchen_notes && activeKot.kitchen_notes.includes('[AUTO_PRINTED]'));

    // Print ONLY the specific items for this KOT (for delta KOTs, only the newly added/increased items)
    const itemsToPrint: Array<{ name: string; quantity: number; notes?: string }> = [];

    if (activeKot && activeKot.items && activeKot.items.length > 0) {
      activeKot.items.forEach((ki) => {
        itemsToPrint.push({
          name: ki.product_name.replace('[CANCELLED]', '').trim(),
          quantity: ki.quantity,
          notes: ki.notes,
        });
      });
    } else if (order.items && order.items.length > 0) {
      order.items.forEach((oi) => {
        itemsToPrint.push({
          name: oi.product_name,
          quantity: oi.quantity,
          notes: oi.item_notes,
        });
      });
    }

    const is58 = paperSize === '58mm';
    const isA4 = paperSize === 'A4';

    const itemsHtml = itemsToPrint
      .map((item) => {
        if (isA4) {
          return `
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 8px; font-size: 15px; font-weight: bold; line-height: 1.3;">
                ${item.name}
                ${
                  item.notes
                    ? `<div style="font-size: 13px; font-weight: normal; font-style: italic; margin-top: 3px; color: #475569;">• ${item.notes}</div>`
                    : ''
                }
              </td>
              <td style="padding: 8px; text-align: right; font-size: 16px; font-weight: 900; vertical-align: top; width: 80px;">
                ${item.quantity}
              </td>
            </tr>
          `;
        }
        if (is58) {
          return `
            <tr style="border-bottom: 1px dashed #666;">
              <td style="padding: 3px 0; font-size: 12px; font-weight: bold; line-height: 1.2; word-break: break-word;">
                ${item.name}
                ${
                  item.notes
                    ? `<div style="font-size: 10px; font-weight: normal; font-style: italic; margin-top: 1px; padding-left: 4px;">• ${item.notes}</div>`
                    : ''
                }
              </td>
              <td style="padding: 3px 0; text-align: right; font-size: 14px; font-weight: 900; vertical-align: top; width: 32px;">
                ${item.quantity}
              </td>
            </tr>
          `;
        }
        // Default 80mm
        return `
          <tr style="border-bottom: 1px dashed #444;">
            <td style="padding: 5px 0; font-size: 14px; font-weight: bold; line-height: 1.3; word-break: break-word;">
              ${item.name}
              ${
                item.notes
                  ? `<div style="font-size: 11px; font-weight: normal; font-style: italic; margin-top: 2px; padding-left: 6px;">• ${item.notes}</div>`
                  : ''
              }
            </td>
            <td style="padding: 5px 0; text-align: right; font-size: 16px; font-weight: 900; vertical-align: top; width: 45px;">
              ${item.quantity}
            </td>
          </tr>
        `;
      })
      .join('');

    const orderTypeLabel =
      order.order_type === 'dine_in'
        ? 'Dine In'
        : order.order_type === 'takeaway'
        ? 'Takeaway'
        : 'Delivery';

    const pageCss = isA4
      ? `@page { size: A4 portrait; margin: 12mm 15mm; }
         body { width: 100%; max-width: 180mm; margin: 0 auto; padding: 10px 0; font-size: 14px; line-height: 1.4; color: #111; }
         .kot-title { font-size: 26px; font-weight: 900; letter-spacing: 1px; margin: 4px 0; }
         .bill-no { font-size: 16px; font-weight: bold; margin: 3px 0; }
         .date-time { font-size: 13px; margin: 2px 0; }
         .reprint-banner { font-size: 16px; font-weight: 900; letter-spacing: 2px; color: #d97706; margin-bottom: 6px; }
         table th { font-size: 14px; font-weight: 900; padding: 8px; border-bottom: 2px solid #000; background-color: #f1f5f9; }`
      : is58
      ? `@page { size: 58mm auto; margin: 1mm 1.5mm; }
         body { width: 48mm; margin: 0 auto; padding: 1mm 0; font-size: 11px; line-height: 1.15; color: #000; }
         .kot-title { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; margin: 1px 0; }
         .bill-no { font-size: 11px; font-weight: bold; margin: 1px 0; }
         .date-time { font-size: 10px; margin: 1px 0; }
         .reprint-banner { font-size: 12px; font-weight: 900; letter-spacing: 1px; color: #000; margin-bottom: 2px; }
         table th { font-size: 11px; font-weight: 900; padding: 3px 0; border-bottom: 1px solid #000; }`
      : `@page { size: 80mm auto; margin: 2mm 3mm; }
         body { width: 74mm; margin: 0 auto; padding: 2mm 0; font-size: 12px; line-height: 1.25; color: #000; }
         .kot-title { font-size: 20px; font-weight: 900; letter-spacing: 0.5px; margin: 2px 0; }
         .bill-no { font-size: 13px; font-weight: bold; margin: 2px 0; }
         .date-time { font-size: 11px; margin: 1px 0; }
         .reprint-banner { font-size: 14px; font-weight: 900; letter-spacing: 1.5px; color: #000; margin-bottom: 4px; }
         table th { font-size: 13px; font-weight: 900; padding: 4px 0; border-bottom: 1px solid #000; }`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>KOT #${kotNum} (${paperSize})</title>
          <style>
            ${pageCss}
            * {
              box-sizing: border-box;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .dashed { border-bottom: 1px dashed #000; margin: ${is58 ? '4px' : '6px'} 0; }
            .double { border-bottom: 2px solid #000; margin: ${is58 ? '4px' : '6px'} 0; }
            .flex-between { display: flex; justify-content: space-between; margin: ${is58 ? '2px' : '3px'} 0; font-size: ${is58 ? '11px' : isA4 ? '14px' : '12px'}; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            th { text-align: left; }
          </style>
        </head>
        <body>
          ${showReprintBanner ? `<div class="center reprint-banner">*** REPRINT ***</div>` : ''}
          <div class="center kot-title">KOT #${kotNum}</div>

          <div class="dashed"></div>
          
          <div class="center bill-no">Bill No.: ${order.order_number}</div>
          <div class="center date-time">Date: ${formattedDate} ${formattedTime}</div>

          <div class="dashed"></div>

          <div class="flex-between">
            <span><b>Type:</b> ${orderTypeLabel}</span>
            ${order.table_number ? `<span><b>Table:</b> ${order.table_number}</span>` : ''}
          </div>

          ${order.customer_name ? `<div><b>Customer:</b> ${order.customer_name}</div>` : ''}
          ${order.customer_phone ? `<div><b>Phone:</b> ${order.customer_phone}</div>` : ''}
          ${order.delivery_address ? `<div><b>Address:</b> ${order.delivery_address}</div>` : ''}

          <div class="dashed"></div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: right; width: ${isA4 ? '80px' : is58 ? '32px' : '45px'};">Qty</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          ${
            order.notes
              ? `
            <div class="dashed"></div>
            <div style="font-size: ${is58 ? '10px' : '11px'}; margin: 4px 0;">
              <b>Notes:</b> ${order.notes}
            </div>
          `
              : ''
          }

          <div class="dashed"></div>

          <div class="center" style="font-size: ${is58 ? '9px' : '10px'}; margin-top: 6px; color: #333;">
            --- END OF KOT (${paperSize}) ---
          </div>
        </body>
      </html>
    `;

    await executeIsolatedPrint(html);
  },

  /**
   * Final Bill / Customer Receipt (80mm Thermal Format)
   * Matches the official Ratnadeep Restaurant Final Bill reference layout.
   */
  async printBillThermal(order: Order, settings: RestaurantSettings): Promise<void> {
    return this.printFinalReceiptThermal(order, settings);
  },

  async printFinalReceiptThermal(
    order: Order,
    settings: RestaurantSettings,
    billedBy: string = 'Ratnadeep Dey'
  ): Promise<void> {
    const rawDate = order.created_at ? new Date(order.created_at) : new Date();
    const formattedDate = rawDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const formattedTime = rawDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const kotRefs =
      (order.kots || []).map((k) => k.kot_number).join(', ') ||
      (order.kots && order.kots.length ? order.kots[0].kot_number : '1');

    const isPaid = order.payment_status === 'paid';
    const paymentMethodStr =
      order.payments && order.payments.length > 0
        ? order.payments[0].payment_method.toUpperCase()
        : 'CASH';
    const txnRef =
      order.payments && order.payments.length > 0
        ? order.payments[0].reference_number
        : undefined;

    // Filter out cancelled items so they never appear on the final bill
    const activeItems = (order.items || []).filter((i) => i.quantity > 0);
    const totalItemCount = activeItems.length;
    const totalQty = activeItems.reduce((sum, i) => sum + i.quantity, 0);

    const itemsHtml = activeItems
      .map((item) => {
        const rate = item.unit_price.toFixed(2);
        const amount = item.total.toFixed(2);
        return `
          <tr style="border-bottom: 1px dashed #e2e8f0;">
            <td style="padding: 4px 0; font-size: 12px; font-weight: bold; line-height: 1.2;">
              ${item.product_name}
            </td>
            <td style="padding: 4px 0; text-align: center; font-size: 12px; width: 35px;">
              ${item.quantity}
            </td>
            <td style="padding: 4px 0; text-align: right; font-size: 12px; width: 55px;">
              ${rate}
            </td>
            <td style="padding: 4px 0; text-align: right; font-size: 12px; font-weight: bold; width: 65px;">
              ${amount}
            </td>
          </tr>
        `;
      })
      .join('');

    const subTotalNum = getOrderSubtotal(order);
    const subTotalStr = subTotalNum.toFixed(2);
    const taxTotal = (order.cgst_amount || 0) + (order.sgst_amount || 0);
    const taxTotalStr = taxTotal.toFixed(2);
    const billTotalStr = `INR ${order.grand_total.toFixed(2)}`;
    const roundOffStr = order.round_off
      ? `INR ${(order.round_off > 0 ? '+' : '') + order.round_off.toFixed(2)}`
      : 'INR 0.00';
    const payableAmountStr = `INR ${order.payable_amount.toFixed(2)}`;

    const orderTypeLabel =
      order.order_type === 'dine_in'
        ? 'Dine In'
        : order.order_type === 'takeaway'
        ? 'Takeaway'
        : 'Delivery';

    const logoUrl = formatLogoDataUri(settings?.logo_url || (order as any)?.restaurant?.logo_url);
    console.log('FINAL THERMAL LOGO SRC:\n', logoUrl);

    const billPaperSize = settings.bill_paper_size || settings.kot_paper_size || '80mm';
    const is58 = billPaperSize === '58mm';
    const isA4 = billPaperSize === 'A4';

    const billPageCss = isA4
      ? `@page { size: A4 portrait; margin: 12mm 15mm; }
         body { width: 100%; max-width: 180mm; margin: 0 auto; padding: 10px 0; font-size: 14px; line-height: 1.4; color: #000; }
         .restaurant-title { font-size: 24px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.2; }
         .branch-title { font-size: 13px; margin-top: 2px; }
         .legal-meta { font-size: 12px; color: #333; margin-top: 2px; }
         .flex-between { font-size: 13px; margin: 3px 0; }
         table th { font-size: 13px; padding: 6px 0; }
         .paid-badge { font-size: 14px; font-weight: 900; padding: 4px 10px; }`
      : is58
      ? `@page { size: 58mm auto; margin: 1mm 1.5mm; }
         body { width: 48mm; margin: 0 auto; padding: 1mm 0; font-size: 11px; line-height: 1.15; color: #000; }
         .restaurant-title { font-size: 14px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.15; }
         .branch-title { font-size: 10px; margin-top: 1px; }
         .legal-meta { font-size: 9px; color: #333; margin-top: 1px; }
         .flex-between { font-size: 10.5px; margin: 1.5px 0; }
         table th { font-size: 10.5px; padding: 2px 0; }
         .paid-badge { font-size: 11px; font-weight: 900; padding: 2px 5px; }`
      : `@page { size: 80mm auto; margin: 2mm 3mm; }
         body { width: 74mm; margin: 0 auto; padding: 2mm 0; font-size: 12px; line-height: 1.25; color: #000; }
         .restaurant-title { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; line-height: 1.15; }
         .branch-title { font-size: 11px; margin-top: 1px; }
         .legal-meta { font-size: 10px; color: #333; margin-top: 1px; }
         .flex-between { font-size: 12px; margin: 2px 0; }
         table th { font-size: 11px; padding: 4px 0; }
         .paid-badge { font-size: 12px; font-weight: 900; padding: 2px 6px; }`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Bill #${order.order_number} (${billPaperSize})</title>
          <style>
            ${billPageCss}
            * {
              box-sizing: border-box;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .dashed { border-bottom: 1px dashed #000; margin: ${is58 ? '4px' : '6px'} 0; }
            .double { border-bottom: 2px solid #000; margin: ${is58 ? '4px' : '6px'} 0; }
            .brand-header-row {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              margin-bottom: 3px;
            }
            .restaurant-logo {
              width: ${isA4 ? '48px' : '36px'};
              height: ${isA4 ? '48px' : '36px'};
              max-width: ${isA4 ? '48px' : '36px'};
              max-height: ${isA4 ? '48px' : '36px'};
              object-fit: contain;
              border-radius: 4px;
              flex-shrink: 0;
            }
            .restaurant-text-wrap {
              text-align: ${logoUrl ? 'left' : 'center'};
            }
            .flex-between { display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; margin-top: 4px; }
            th { text-align: left; border-bottom: 1px solid #000; }
            .paid-badge { border: 1px solid #000; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="brand-header-row">
            ${logoUrl ? `<img src="${logoUrl}" width="36" height="36" class="restaurant-logo" alt="Logo" />` : ''}
            <div class="restaurant-text-wrap">
              <div class="restaurant-title">${settings.name || 'RESTAURANT'}</div>
              ${settings.legal_name ? `<div class="branch-title">${settings.legal_name}</div>` : ''}
            </div>
          </div>
          ${settings.address ? `<div class="center legal-meta">${settings.address}</div>` : ''}
          ${settings.gstin ? `<div class="center legal-meta">GSTIN: <b>${settings.gstin}</b></div>` : ''}
          ${settings.phone ? `<div class="center legal-meta">Phone: ${settings.phone}</div>` : ''}

          <div class="dashed"></div>

          <div class="flex-between">
            <span><b>Bill No.:</b> ${order.order_number}</span>
          </div>
          <div><b>KOT No.:</b> ${kotRefs}</div>
          <div><b>Date:</b> ${formattedDate} ${formattedTime}</div>

          <div style="margin-top: 4px;"></div>
          <div class="flex-between">
            <span><b>Type:</b> ${orderTypeLabel}</span>
            <span><b>${totalItemCount} Item (${totalQty} Qty)</b></span>
          </div>
          <div><b>Customer:</b> ${order.customer_name || 'Walk-in Customer'}</div>
          ${order.customer_phone ? `<div><b>Phone:</b> ${order.customer_phone}</div>` : ''}
          ${order.table_number ? `<div><b>Table:</b> ${order.table_number}</div>` : ''}
          ${order.delivery_address ? `<div><b>Address:</b> ${order.delivery_address}</div>` : ''}

          <div class="dashed"></div>

          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Description</th>
                <th style="text-align: center; width: 35px;">Qty</th>
                <th style="text-align: right; width: 55px;">Rate</th>
                <th style="text-align: right; width: 65px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="dashed"></div>

          <div class="flex-between">
            <span>Subtotal:</span>
            <span>${subTotalStr}</span>
          </div>

          ${
            order.discount_amount
              ? `<div class="flex-between"><span>Discount ${order.discount_type === 'percentage' ? `(${order.discount_value || ''}%)` : (order.discount_value ? `(₹${order.discount_value})` : '')}:</span><span>-${order.discount_amount.toFixed(2)}</span></div>`
              : ''
          }
          ${
            order.coupon_discount
              ? `<div class="flex-between"><span>Coupon (${order.coupon_code || ''}):</span><span>-${order.coupon_discount.toFixed(2)}</span></div>`
              : ''
          }

          <div class="flex-between">
            <span>Taxable Amount:</span>
            <span>${Math.max(0, subTotalNum - (order.discount_amount || 0) - (order.coupon_discount || 0)).toFixed(2)}</span>
          </div>

          <div class="flex-between">
            <span>CGST (2.5%):</span>
            <span>${(order.cgst_amount || 0).toFixed(2)}</span>
          </div>

          <div class="flex-between">
            <span>SGST (2.5%):</span>
            <span>${(order.sgst_amount || 0).toFixed(2)}</span>
          </div>

          ${
            order.delivery_charge
              ? `<div class="flex-between"><span>Delivery Charge:</span><span>${order.delivery_charge.toFixed(2)}</span></div>`
              : ''
          }
          ${
            order.service_charge
              ? `<div class="flex-between"><span>Service Charge:</span><span>${order.service_charge.toFixed(2)}</span></div>`
              : ''
          }

          <div class="flex-between">
            <span>Round Off:</span>
            <span>${roundOffStr}</span>
          </div>

          <div class="dashed"></div>

          <div class="flex-between bold" style="font-size: 14px;">
            <span>Grand Total:</span>
            <span>${payableAmountStr}</span>
          </div>

          <div class="dashed"></div>

          <div class="flex-between bold">
            <span>Payment Method:</span>
            <span>${paymentMethodStr}</span>
          </div>

          <div class="flex-between">
            <span>Payment Status:</span>
            <span class="bold">${isPaid ? 'PAID' : 'UNPAID'}</span>
          </div>

          ${txnRef ? `<div class="flex-between"><span>Ref #:</span><span>${txnRef}</span></div>` : ''}

          <div class="dashed"></div>

          <div class="center" style="font-size: 10px; margin-top: 2px;">All prices are in Indian Rupee (INR)</div>
          
          <div class="center" style="margin-top: 6px; font-size: 11px;">
            <b>Billed By:</b> ${billedBy}
          </div>

          <div class="center bold" style="margin-top: 8px; font-size: 13px; letter-spacing: 0.5px;">
            Thank You Visit Again!
          </div>
        </body>
      </html>
    `;

    await executeIsolatedPrint(html);
  },

  /**
   * Reprint an existing persisted KOT without generating a new KOT number.
   */
  async reprintKot(kotId: string, settings: RestaurantSettings): Promise<void> {
    const { data: kotData, error: kotErr } = await supabase
      .from('kots')
      .select('*, items:kot_items(*)')
      .eq('id', kotId)
      .single();

    if (kotErr || !kotData) {
      throw new Error(`Could not load KOT: ${kotErr?.message || 'Not found'}`);
    }

    const { data: orderData } = await supabase
      .from('orders')
      .select('*')
      .eq('id', kotData.order_id)
      .single();

    await this.printKotThermal(
      orderData || {
        id: kotData.order_id,
        order_number: kotData.order_number || 'N/A',
        order_type: kotData.order_type,
        table_number: kotData.table_number,
        customer_name: kotData.customer_name,
        status: 'confirmed',
        subtotal: 0,
        discount_amount: 0,
        coupon_discount: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        igst_amount: 0,
        service_charge: 0,
        delivery_charge: 0,
        grand_total: 0,
        round_off: 0,
        payable_amount: 0,
        payment_status: 'unpaid',
        items: [],
        created_at: kotData.created_at,
      },
      settings,
      kotData
    );
  },

  /**
   * Reprint Final Tax Receipt for an existing Order.
   */
  async reprintFinalBill(orderId: string, settings: RestaurantSettings, billedBy?: string): Promise<void> {
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .select('*, items:order_items(*), kots(*), payments(*)')
      .eq('id', orderId)
      .single();

    if (orderErr || !orderData) {
      throw new Error(`Could not load Order: ${orderErr?.message || 'Not found'}`);
    }

    await this.printFinalReceiptThermal(orderData, settings, billedBy);
  },

  /**
   * Tax Invoice (A4 Standard Format for PDF & Sharing)
   */
  async printTaxInvoiceA4(order: Order, settings: RestaurantSettings): Promise<void> {
    const kotRefs = (order.kots || []).map((k) => k.kot_number).join(', ') || 'N/A';
    const isPaid = order.payment_status === 'paid';
    const logoUrl = formatLogoDataUri(settings?.logo_url || (order as any)?.restaurant?.logo_url);
    console.log('FINAL INVOICE LOGO SRC:\n', logoUrl);

    const itemsHtml = (order.items || [])
      .filter((i) => i.quantity > 0)
      .map(
        (i, idx) => `
        <tr>
          <td style="padding: 7px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
          <td style="padding: 7px; border: 1px solid #cbd5e1; font-weight: bold;">${i.product_name}</td>
          <td style="padding: 7px; border: 1px solid #cbd5e1; text-align: center;">996331</td>
          <td style="padding: 7px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${i.quantity}</td>
          <td style="padding: 7px; border: 1px solid #cbd5e1; text-align: right;">${formatCurrency(i.unit_price)}</td>
          <td style="padding: 7px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${formatCurrency(i.total)}</td>
        </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #0f172a; padding: 0; margin: 0; }
            .header { display: flex; justify-content: space-between; border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
            .brand { font-size: 24px; font-weight: 900; color: #0f172a; }
            .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f1f5f9; padding: 8px; border: 1px solid #cbd5e1; text-align: left; font-weight: 800; font-size: 11px; }
            .totals-container { margin-top: 16px; display: flex; justify-content: flex-end; }
            .totals-box { width: 320px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; background: #f8fafc; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; }
            .grand-total { font-size: 16px; font-weight: 900; color: #16a34a; border-top: 2px solid #0f172a; padding-top: 6px; margin-top: 6px; }
            .footer { margin-top: 30px; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-size: 11px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="display: flex; align-items: center; gap: 14px;">
              ${logoUrl ? `<img src="${logoUrl}" width="56" height="56" style="width: 56px; height: 56px; max-width: 56px; max-height: 56px; object-fit: contain; border-radius: 8px; flex-shrink: 0; display: inline-block;" alt="Logo" />` : ''}
              <div>
                <div class="brand">${settings.name || 'Restaurant'}</div>
                <div style="font-size: 13px; font-weight: 600; color: #475569;">${settings.legal_name || ''}</div>
                <div>${settings.address || ''}</div>
                <div>GSTIN: <b>${settings.gstin || ''}</b></div>
                <div>Contact: ${settings.phone || ''}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <h2 style="margin: 0; color: #0f172a; font-size: 20px;">TAX INVOICE</h2>
              <div style="font-size: 13px; font-weight: 900; margin-top: 4px;">Invoice #: ${order.order_number}</div>
              <div>Date: ${new Date(order.created_at).toLocaleDateString('en-IN')} ${new Date(order.created_at).toLocaleTimeString('en-IN')}</div>
              <div>Order Type: <b>${order.order_type.toUpperCase()}</b></div>
              ${order.table_number ? `<div>Table: <b>${order.table_number}</b></div>` : ''}
              <div>KOT Ref: <b>${kotRefs}</b></div>
            </div>
          </div>

          <div class="meta-box">
            <div><b>Customer Name:</b> ${order.customer_name || 'Walk-in Guest'}</div>
            <div><b>Phone Number:</b> ${order.customer_phone || 'N/A'}</div>
            ${order.delivery_address ? `<div style="grid-column: span 2;"><b>Delivery Address:</b> ${order.delivery_address}${order.delivery_landmark ? ` (Landmark: ${order.delivery_landmark})` : ''}</div>` : ''}
            <div><b>Payment Status:</b> <span style="font-weight: 900; color: ${isPaid ? '#16a34a' : '#e11d48'}">${isPaid ? 'PAID' : 'UNPAID / COD'}</span></div>
            <div><b>Payment Mode:</b> ${order.payments && order.payments.length > 0 ? order.payments[0].payment_method.toUpperCase() : 'N/A'}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;">#</th>
                <th>Item Description</th>
                <th style="width: 70px; text-align: center;">HSN/SAC</th>
                <th style="width: 50px; text-align: center;">Qty</th>
                <th style="width: 90px; text-align: right;">Rate (₹)</th>
                <th style="width: 100px; text-align: right;">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>

          <div class="totals-container">
            <div class="totals-box">
              <div class="row"><span>Item Subtotal:</span><span>${formatCurrency(getOrderSubtotal(order))}</span></div>
              ${order.discount_amount ? `<div class="row" style="color: #16a34a;"><span>Discount ${order.discount_type === 'percentage' ? `(${order.discount_value || ''}%)` : (order.discount_value ? `(₹${order.discount_value})` : '')}:</span><span>-${formatCurrency(order.discount_amount)}</span></div>` : ''}
              ${order.coupon_discount ? `<div class="row" style="color: #16a34a;"><span>Coupon (${order.coupon_code || ''}):</span><span>-${formatCurrency(order.coupon_discount)}</span></div>` : ''}
              <div class="row"><span>Taxable Amount:</span><span>${formatCurrency(Math.max(0, getOrderSubtotal(order) - (order.discount_amount || 0) - (order.coupon_discount || 0)))}</span></div>
              <div class="row"><span>CGST (2.5%):</span><span>${formatCurrency(order.cgst_amount)}</span></div>
              <div class="row"><span>SGST (2.5%):</span><span>${formatCurrency(order.sgst_amount)}</span></div>
              ${order.delivery_charge ? `<div class="row"><span>Delivery Charge:</span><span>${formatCurrency(order.delivery_charge)}</span></div>` : ''}
              ${order.service_charge ? `<div class="row"><span>Service Charge:</span><span>${formatCurrency(order.service_charge)}</span></div>` : ''}
              ${order.round_off ? `<div class="row"><span>Round Off:</span><span>${order.round_off > 0 ? '+' : ''}${formatCurrency(order.round_off)}</span></div>` : ''}
              <div class="row grand-total">
                <span>Grand Total:</span>
                <span>${formatCurrency(order.payable_amount)}</span>
              </div>
              <div style="font-size: 10px; font-style: italic; margin-top: 4px; color: #475569;">
                Amount in Words: ${numberToWords(order.payable_amount)}
              </div>
            </div>
          </div>

          <div class="footer">
            <div>This is a computer generated invoice and requires no physical signature.</div>
            <div style="font-weight: 700; margin-top: 2px;">Thank you for dining at ${settings.name || 'Ratnadeep Restaurant'}!</div>
          </div>
        </body>
      </html>
    `;

    try {
      if (isWebEnvironment) {
        await executeIsolatedPrint(html);
      } else if (typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative') {
        const Print = await import('expo-print');
        const Sharing = await import('expo-sharing');
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Tax Invoice ${order.order_number}`,
            UTI: '.pdf',
          });
        } else {
          await Print.printAsync({ uri });
        }
      }
    } catch (e) {
      console.error('Invoice Print/Share Error:', e);
    }
  },

  async exportAllTablesPdf(tables: any[], settings: RestaurantSettings): Promise<void> {
    const tableCards = (tables || [])
      .map(
        (t) => `
        <div style="border: 2px dashed #0f172a; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; margin-bottom: 20px; width: 45%; display: inline-block; vertical-align: top; box-sizing: border-box;">
          <h2 style="margin: 0; font-size: 20px; color: #0f172a;">${t.table_number}</h2>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${t.section} • Capacity: ${t.seating_capacity}</div>
          <div style="margin: 14px auto; width: 140px; height: 140px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(`https://ratnadeep.app/menu/table/${t.id}`)}" style="width: 140px; height: 140px;" />
          </div>
          <div style="font-size: 11px; font-weight: 700; color: #0f172a;">Scan for Digital Menu & Ordering</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">${settings.name || 'Ratnadeep Restaurant'}</div>
        </div>
      `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 0; margin: 0; }
            .container { display: flex; flex-wrap: wrap; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h1 style="text-align: center; font-size: 24px; margin-bottom: 20px;">${settings.name || 'Ratnadeep Restaurant'} — Dining Table QR Codes</h1>
          <div class="container">${tableCards}</div>
        </body>
      </html>
    `;

    try {
      if (isWebEnvironment) {
        await executeIsolatedPrint(html);
      } else {
        const Print = await import('expo-print');
        const Sharing = await import('expo-sharing');
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Table QR Codes',
            UTI: '.pdf',
          });
        }
      }
    } catch (e) {
      console.error('exportAllTablesPdf error:', e);
    }
  },
};
