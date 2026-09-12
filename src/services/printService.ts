import { Platform } from 'react-native';
import { Order, KOT, RestaurantSettings, OrderItem, DayRegister } from '../types';
import { formatCurrency, numberToWords } from '../utils/currency';
import { getOrderSubtotal } from '../utils/gst';
import { cleanCustomerOrderNotes } from '../utils/orderNotes';
import { formatOrderDateTime } from '../utils/dateUtils';
import { supabase } from './supabase';

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

// Sequential execution queue to prevent concurrent expo-print collisions
let activePrintQueue: Promise<void> = Promise.resolve();

/**
 * Isolated Web / Native Printing Helper.
 * On Web: Spawns an isolated invisible iframe to execute printing exclusively on the target document.
 * NEVER prints or screenshots the active POS application window.
 * On Native: Uses expo-print printAsync with standalone HTML document and sequential queueing.
 */
async function executeIsolatedPrint(html: string): Promise<void> {
  activePrintQueue = activePrintQueue
    .catch(() => {})
    .then(async () => {
      if (Platform.OS === 'web') {
        return new Promise<void>((resolve) => {
          try {
            if (typeof document === 'undefined') {
              resolve();
              return;
            }

            // Clean up any existing print iframe
            const existing = document.getElementById('ratnadeep-pos-print-frame');
            if (existing) {
              try { existing.remove(); } catch (_) {}
            }

            const iframe = document.createElement('iframe');
            iframe.id = 'ratnadeep-pos-print-frame';
            iframe.name = 'ratnadeep-pos-print-frame';
            // Position off-screen with non-zero dimensions so Chromium renders print styles fully
            iframe.style.position = 'fixed';
            iframe.style.top = '-9999px';
            iframe.style.left = '-9999px';
            iframe.style.width = '320px';
            iframe.style.height = '480px';
            iframe.style.border = 'none';
            iframe.style.visibility = 'hidden';
            document.body.appendChild(iframe);

            const performPrint = () => {
              try {
                if (iframe.contentWindow) {
                  iframe.contentWindow.focus();
                  iframe.contentWindow.print();
                }
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
                }, 800);
              }
            };

            const doc = iframe.contentWindow?.document || iframe.contentDocument;
            if (doc) {
              doc.open();
              doc.write(html);
              doc.close();

              // Ensure images and fonts are loaded before triggering print dialog
              const imgs = Array.from(doc.images);
              if (imgs.length === 0) {
                setTimeout(performPrint, 200);
              } else {
                let fired = false;
                const onComplete = () => {
                  if (!fired) {
                    fired = true;
                    setTimeout(performPrint, 200);
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
                ).then(onComplete);

                setTimeout(onComplete, 800);
              }
            } else {
              resolve();
            }
          } catch (err) {
            console.warn('executeIsolatedPrint web error:', err);
            resolve();
          }
        });
      } else {
        // Native (Android / iOS) printing using expo-print
        try {
          const Print = await import('expo-print');
          await Print.printAsync({ html });
        } catch (nativeErr: any) {
          const msg = nativeErr?.message || '';
          if (msg.includes('Another print request is already in progress')) {
            console.warn('[printService] Print request in progress, retrying after short delay...');
            await new Promise((r) => setTimeout(r, 600));
            try {
              const Print = await import('expo-print');
              await Print.printAsync({ html });
            } catch (retryErr) {
              console.warn('[printService] Retry printAsync safely handled:', retryErr);
            }
          } else {
            console.warn('[printService] Native printAsync safely handled:', nativeErr);
          }
        }
      }
    });

  return activePrintQueue;
}

export const printService = {
  /**
   * Dedicated Thermal / Standard KOT Slip (58mm / 80mm / A4 Kitchen Ticket)
   * Matches the official KOT reference specification with responsive layout per paper size.
   */
  async printKotThermal(order: Order, settings: RestaurantSettings, kot?: KOT, isReprint: boolean = false): Promise<void> {
    const activeKot = kot || (order.kots && order.kots[0]);
    let kotNum = activeKot?.kot_number || 'KOT-001';

    const formattedOrderDateTime = formatOrderDateTime(activeKot?.created_at || order.created_at);

    const paperSize = settings.kot_paper_size || '80mm';
    const showReprintBanner = isReprint || Boolean(activeKot?.kitchen_notes && activeKot.kitchen_notes.includes('[AUTO_PRINTED]'));
    const isSupplementary =
      Boolean(kotNum.includes('SUP')) ||
      Boolean(activeKot?.kitchen_notes && activeKot.kitchen_notes.toUpperCase().includes('SUP')) ||
      Boolean(order.kots && order.kots.length > 1 && activeKot?.id !== order.kots[0]?.id);

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
         .sup-banner { font-size: 16px; font-weight: 900; letter-spacing: 2px; color: #000; margin-bottom: 6px; }
         table th { font-size: 14px; font-weight: 900; padding: 8px; border-bottom: 2px solid #000; background-color: #f1f5f9; }`
      : is58
      ? `@page { size: 58mm auto; margin: 1mm 1.5mm; }
         body { width: 48mm; margin: 0 auto; padding: 1mm 0; font-size: 11px; line-height: 1.15; color: #000; }
         .kot-title { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; margin: 1px 0; }
         .bill-no { font-size: 11px; font-weight: bold; margin: 1px 0; }
         .date-time { font-size: 10px; margin: 1px 0; }
         .reprint-banner { font-size: 12px; font-weight: 900; letter-spacing: 1px; color: #000; margin-bottom: 2px; }
         .sup-banner { font-size: 12px; font-weight: 900; letter-spacing: 1px; color: #000; margin-bottom: 2px; }
         table th { font-size: 11px; font-weight: 900; padding: 3px 0; border-bottom: 1px solid #000; }`
      : `@page { size: 80mm auto; margin: 2mm 3mm; }
         body { width: 74mm; margin: 0 auto; padding: 2mm 0; font-size: 12px; line-height: 1.25; color: #000; }
         .kot-title { font-size: 20px; font-weight: 900; letter-spacing: 0.5px; margin: 2px 0; }
         .bill-no { font-size: 13px; font-weight: bold; margin: 2px 0; }
         .date-time { font-size: 11px; margin: 1px 0; }
         .reprint-banner { font-size: 14px; font-weight: 900; letter-spacing: 1.5px; color: #000; margin-bottom: 4px; }
         .sup-banner { font-size: 14px; font-weight: 900; letter-spacing: 1.5px; color: #000; margin-bottom: 4px; }
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
          ${isSupplementary ? `<div class="center sup-banner">*** SUPPLEMENTARY KOT (SUP) ***</div>` : ''}
          <div class="center kot-title">${kotNum.startsWith('KOT') ? kotNum : `KOT #${kotNum}`}${isSupplementary && !kotNum.toUpperCase().includes('SUP') ? ' (SUP)' : ''}</div>

          <div class="dashed"></div>
          
          <div class="center bill-no">Bill No.: ${order.order_number}</div>
          <div class="center date-time">Date & Time: ${formattedOrderDateTime}</div>

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
            cleanCustomerOrderNotes(order.notes)
              ? `
            <div class="dashed"></div>
            <div style="font-size: ${is58 ? '10px' : '11px'}; margin: 4px 0;">
              <b>Notes:</b> ${cleanCustomerOrderNotes(order.notes)}
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
    const formattedOrderDateTime = formatOrderDateTime(order.created_at);

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
        const rate = (Number(item.unit_price) || 0).toFixed(2);
        const itemTotal = Number(item.total) || Number((item as any).total_price) || Number(item.subtotal) || ((Number(item.unit_price) || 0) * (Number(item.quantity) || 1));
        const amount = itemTotal.toFixed(2);
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
    const taxTotal = (order.cgst_amount || 0) + (order.sgst_amount || 0) + (order.igst_amount || 0);
    const roundOffStr = order.round_off
      ? `INR ${(order.round_off > 0 ? '+' : '') + order.round_off.toFixed(2)}`
      : 'INR 0.00';
    const payableAmountStr = `INR ${order.payable_amount.toFixed(2)}`;

    // Preserved Historical Tax & Setting Determination
    const effectiveGstRegistered =
      settings.is_gst_enabled !== false &&
      (settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim()));
    const isTaxInvoice =
      taxTotal > 0 || (effectiveGstRegistered && settings.tax_invoice_enabled !== false && Boolean(settings.gstin?.trim()));

    const dynamicTaxRate =
      settings.default_tax_rate !== undefined && settings.default_tax_rate !== null
        ? Number(settings.default_tax_rate)
        : 5.0;
    const halfTaxRateStr = (dynamicTaxRate / 2).toFixed(1);

    const invoiceNumber = order.invoice_number || order.order_number;
    const customerGstin = order.customer_gstin;

    const orderTypeLabel =
      order.order_type === 'dine_in'
        ? 'Dine In'
        : order.order_type === 'takeaway'
        ? 'Takeaway'
        : 'Delivery';

    const logoUrl = formatLogoDataUri(settings?.logo_url || (order as any)?.restaurant?.logo_url);

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
          <title>${isTaxInvoice ? 'Tax Invoice' : 'Retail Bill'} #${invoiceNumber} (${billPaperSize})</title>
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
          ${isTaxInvoice && settings.gstin ? `<div class="center legal-meta">GSTIN: <b>${settings.gstin}</b></div>` : ''}
          ${settings.phone ? `<div class="center legal-meta">Phone: ${settings.phone}</div>` : ''}

          <div class="dashed"></div>

          <div class="flex-between">
            <span><b>${isTaxInvoice ? 'Invoice No.:' : 'Bill No.:'}</b> ${invoiceNumber}</span>
            <span style="font-weight: 800;">${isTaxInvoice ? 'TAX INVOICE' : 'RETAIL BILL'}</span>
          </div>
          <div><b>Order ID:</b> ${order.order_number}</div>
          <div><b>KOT No.:</b> ${kotRefs}</div>
          <div><b>Date & Time:</b> ${formattedOrderDateTime}</div>
          ${
            isTaxInvoice
              ? `<div><b>Place of Supply:</b> ${settings.state || 'West Bengal'} (${settings.state_code || '19'})</div>
                 <div><b>Reverse Charge:</b> No</div>`
              : ''
          }

          <div style="margin-top: 4px;"></div>
          <div class="flex-between">
            <span><b>Type:</b> ${orderTypeLabel}</span>
            <span><b>${totalItemCount} Item (${totalQty} Qty)</b></span>
          </div>
          <div><b>Customer:</b> ${order.customer_name || 'Walk-in Customer'}</div>
          ${order.customer_phone ? `<div><b>Phone:</b> ${order.customer_phone}</div>` : ''}
          ${isTaxInvoice && customerGstin ? `<div><b>Customer GSTIN (B2B):</b> ${customerGstin}</div>` : ''}
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

          ${
            isTaxInvoice && taxTotal > 0
              ? `
          <div class="flex-between">
            <span>Taxable Amount:</span>
            <span>${(order.taxable_amount !== undefined && order.taxable_amount > 0 ? order.taxable_amount : Math.max(0, subTotalNum - (order.discount_amount || 0) - (order.coupon_discount || 0))).toFixed(2)}</span>
          </div>

          <div class="flex-between">
            <span>CGST (${halfTaxRateStr}%):</span>
            <span>${(order.cgst_amount || 0).toFixed(2)}</span>
          </div>

          <div class="flex-between">
            <span>SGST (${halfTaxRateStr}%):</span>
            <span>${(order.sgst_amount || 0).toFixed(2)}</span>
          </div>

          ${
            order.igst_amount && order.igst_amount > 0
              ? `<div class="flex-between"><span>IGST:</span><span>${order.igst_amount.toFixed(2)}</span></div>`
              : ''
          }
          `
              : ''
          }

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
   * Tax Invoice (A4 Standard Format for PDF & Printing)
   */
  async printTaxInvoiceA4(order: Order, settings: RestaurantSettings): Promise<void> {
    const kotRefs = (order.kots || []).map((k) => k.kot_number).join(', ') || 'N/A';
    const isPaid = order.payment_status === 'paid';
    const logoUrl = formatLogoDataUri(settings?.logo_url || (order as any)?.restaurant?.logo_url);

    const taxTotal = (order.cgst_amount || 0) + (order.sgst_amount || 0) + (order.igst_amount || 0);
    const effectiveGstRegistered =
      settings.is_gst_enabled !== false &&
      (settings.gst_registered !== undefined ? Boolean(settings.gst_registered) : Boolean(settings.gstin?.trim()));
    const isTaxInvoice =
      taxTotal > 0 || (effectiveGstRegistered && settings.tax_invoice_enabled !== false && Boolean(settings.gstin?.trim()));

    const dynamicTaxRate =
      settings.default_tax_rate !== undefined && settings.default_tax_rate !== null
        ? Number(settings.default_tax_rate)
        : 5.0;
    const halfTaxRate = dynamicTaxRate / 2;
    const halfTaxRateStr = halfTaxRate.toFixed(1);

    const invoiceNumber = order.invoice_number || order.order_number;
    const customerGstin = order.customer_gstin;
    const fssaiNo = (settings as any).fssai_number || (settings as any).fssai_license_number || '';
    const stateName = settings.state || 'West Bengal';
    const stateCode = settings.state_code || '19';
    const subtotal = getOrderSubtotal(order);
    const taxableAmount = order.taxable_amount !== undefined && order.taxable_amount > 0
      ? order.taxable_amount
      : Math.max(0, subtotal - (order.discount_amount || 0) - (order.coupon_discount || 0));

    const paymentMethodStr = order.payments && order.payments.length > 0
      ? order.payments.map((p) => p.payment_method.toUpperCase()).join(', ')
      : isPaid ? 'CASH' : 'PENDING';

    const itemsHtml = (order.items || [])
      .filter((i) => i.quantity > 0)
      .map((i, idx) => {
        const rowTotal = Number(i.total) || Number((i as any).total_price) || Number(i.subtotal) || ((Number(i.unit_price) || 0) * (Number(i.quantity) || 1));
        return `
        <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background-color: #f8fafc;' : ''}">
          <td style="padding: 8px 10px; text-align: center; color: #64748b; font-weight: 600;">${idx + 1}</td>
          <td style="padding: 8px 10px;">
            <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${i.product_name}</div>
            ${i.item_notes ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 2px;">Note: ${i.item_notes}</div>` : ''}
          </td>
          ${isTaxInvoice ? `<td style="padding: 8px 10px; text-align: center; color: #475569; font-size: 12px;">${(i as any).hsn_code || '996331'}</td>` : ''}
          <td style="padding: 8px 10px; text-align: center; font-weight: 800; color: #0f172a; font-size: 13px;">${i.quantity}</td>
          <td style="padding: 8px 10px; text-align: right; color: #334155; font-size: 12.5px;">${formatCurrency(i.unit_price)}</td>
          <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #0f172a; font-size: 13px;">${formatCurrency(rowTotal)}</td>
        </tr>`;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${isTaxInvoice ? 'Tax Invoice' : 'Retail Invoice'} - ${invoiceNumber}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 12mm 15mm;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              font-size: 12px;
              color: #0f172a;
              background-color: #ffffff;
              line-height: 1.4;
              width: 100%;
            }
            .invoice-container {
              width: 100%;
              max-width: 780px;
              margin: 0 auto;
              border: 1.5px solid #0f172a;
              border-radius: 6px;
              padding: 16px;
            }
            .header-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 12px;
              margin-bottom: 14px;
            }
            .restaurant-info {
              flex: 1;
              display: flex;
              gap: 12px;
              align-items: flex-start;
            }
            .restaurant-logo {
              width: 60px;
              height: 60px;
              max-width: 60px;
              max-height: 60px;
              object-fit: contain;
              border-radius: 6px;
              border: 1px solid #e2e8f0;
            }
            .brand-name {
              font-size: 22px;
              font-weight: 900;
              color: #0f172a;
              letter-spacing: -0.5px;
            }
            .legal-name {
              font-size: 12px;
              font-weight: 600;
              color: #475569;
              margin-top: 1px;
            }
            .rest-meta {
              font-size: 11px;
              color: #334155;
              margin-top: 2px;
              line-height: 1.35;
            }
            .invoice-badge-box {
              text-align: right;
              min-width: 220px;
            }
            .invoice-type-title {
              font-size: 18px;
              font-weight: 900;
              color: #1e3a8a;
              letter-spacing: 0.5px;
            }
            .invoice-subtitle {
              font-size: 10px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .meta-line {
              font-size: 11px;
              color: #334155;
              margin-top: 2px;
            }
            .meta-line b {
              color: #0f172a;
            }
            .details-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin-bottom: 14px;
            }
            .detail-card {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 10px 12px;
            }
            .card-title {
              font-size: 10px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #1e40af;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 4px;
              margin-bottom: 6px;
            }
            .card-item {
              font-size: 11.5px;
              color: #334155;
              margin-bottom: 3px;
            }
            .card-item b {
              color: #0f172a;
            }
            .badge-paid {
              display: inline-block;
              background-color: #dcfce7;
              color: #15803d;
              padding: 2px 8px;
              border-radius: 4px;
              font-weight: 800;
              font-size: 10px;
            }
            .badge-unpaid {
              display: inline-block;
              background-color: #fee2e2;
              color: #b91c1c;
              padding: 2px 8px;
              border-radius: 4px;
              font-weight: 800;
              font-size: 10px;
            }
            table.items-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 14px;
              border: 1px solid #cbd5e1;
            }
            table.items-table th {
              background-color: #0f172a;
              color: #ffffff;
              font-weight: 800;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              padding: 8px 10px;
              border: 1px solid #0f172a;
            }
            .summary-section {
              display: flex;
              gap: 14px;
              align-items: flex-start;
              margin-bottom: 14px;
            }
            .left-summary {
              flex: 1.1;
            }
            .right-summary {
              flex: 0.9;
            }
            .tax-table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #cbd5e1;
              margin-bottom: 10px;
            }
            .tax-table th {
              background: #f1f5f9;
              font-size: 10px;
              font-weight: 800;
              color: #334155;
              padding: 5px 6px;
              border: 1px solid #cbd5e1;
              text-align: center;
            }
            .tax-table td {
              font-size: 10.5px;
              color: #0f172a;
              padding: 5px 6px;
              border: 1px solid #cbd5e1;
              text-align: center;
            }
            .totals-card {
              background: #f8fafc;
              border: 1.5px solid #cbd5e1;
              border-radius: 6px;
              padding: 10px 14px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              padding: 3px 0;
              font-size: 11.5px;
              color: #334155;
            }
            .total-row b {
              color: #0f172a;
            }
            .grand-total-row {
              display: flex;
              justify-content: space-between;
              border-top: 2px solid #0f172a;
              padding-top: 6px;
              margin-top: 6px;
              font-size: 15px;
              font-weight: 900;
              color: #0f172a;
            }
            .grand-total-val {
              color: #15803d;
              font-size: 16px;
            }
            .words-box {
              margin-top: 8px;
              padding: 6px 8px;
              background: #f1f5f9;
              border-radius: 4px;
              font-size: 10px;
              color: #334155;
              border-left: 3px solid #1e40af;
            }
            .terms-box {
              font-size: 9.5px;
              color: #64748b;
              line-height: 1.35;
              margin-top: 8px;
            }
            .footer-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              border-top: 1px solid #cbd5e1;
              padding-top: 10px;
              margin-top: 12px;
            }
            .signatory-box {
              text-align: right;
              min-width: 180px;
            }
            .sign-line {
              height: 36px;
            }
            .sign-label {
              font-size: 10.5px;
              font-weight: 700;
              color: #0f172a;
              border-top: 1px dashed #0f172a;
              padding-top: 4px;
            }
          </style>
        </head>
        <body>
          <div class="invoice-container">
            <!-- Header -->
            <div class="header-row">
              <div class="restaurant-info">
                ${logoUrl ? `<img src="${logoUrl}" class="restaurant-logo" alt="Logo" />` : ''}
                <div>
                  <div class="brand-name">${settings.name || 'Restaurant'}</div>
                  ${settings.legal_name ? `<div class="legal-name">${settings.legal_name}</div>` : ''}
                  <div class="rest-meta">${settings.address || ''}</div>
                  <div class="rest-meta">Phone: <b>${settings.phone || 'N/A'}</b> ${settings.email ? `• Email: ${settings.email}` : ''}</div>
                  ${isTaxInvoice && settings.gstin ? `<div class="rest-meta">GSTIN: <b>${settings.gstin}</b></div>` : ''}
                  ${fssaiNo ? `<div class="rest-meta">FSSAI Lic No: <b>${fssaiNo}</b></div>` : ''}
                </div>
              </div>
              <div class="invoice-badge-box">
                <div class="invoice-type-title">${isTaxInvoice ? 'TAX INVOICE' : 'RETAIL INVOICE'}</div>
                <div class="invoice-subtitle">Original for Recipient</div>
                <div class="meta-line">${isTaxInvoice ? 'Invoice No:' : 'Bill No:'} <b style="font-size: 12.5px;">${invoiceNumber}</b></div>
                <div class="meta-line">Date & Time: <b>${formatOrderDateTime(order.created_at)}</b></div>
                <div class="meta-line">Order ID: <b>${order.order_number}</b></div>
                <div class="meta-line">Order Type: <b>${order.order_type.toUpperCase()}</b> ${order.table_number ? `(Table: <b>${order.table_number}</b>)` : ''}</div>
                ${kotRefs && kotRefs !== 'N/A' ? `<div class="meta-line">KOT Ref: <b>${kotRefs}</b></div>` : ''}
                ${
                  isTaxInvoice
                    ? `<div class="meta-line">Place of Supply: <b>${stateName} (${stateCode})</b></div>
                       <div class="meta-line">Reverse Charge: <b>No</b></div>`
                    : ''
                }
              </div>
            </div>

            <!-- Details Grid -->
            <div class="details-grid">
              <div class="detail-card">
                <div class="card-title">Customer / Billed To Details</div>
                <div class="card-item">Customer Name: <b>${order.customer_name || 'Walk-in Guest'}</b></div>
                <div class="card-item">Phone: <b>${order.customer_phone || 'N/A'}</b></div>
                ${isTaxInvoice && customerGstin ? `<div class="card-item">Customer GSTIN: <b style="color: #1e40af;">${customerGstin}</b> (B2B)</div>` : ''}
                ${order.delivery_address ? `<div class="card-item">Delivery Address: <b>${order.delivery_address}${order.delivery_landmark ? ` (${order.delivery_landmark})` : ''}</b></div>` : ''}
              </div>
              <div class="detail-card">
                <div class="card-title">Payment & Settlement Details</div>
                <div class="card-item">Payment Status: <span class="${isPaid ? 'badge-paid' : 'badge-unpaid'}">${isPaid ? 'PAID' : 'UNPAID / PENDING'}</span></div>
                <div class="card-item">Payment Method: <b>${paymentMethodStr}</b></div>
                ${order.payments && order.payments[0]?.transaction_reference ? `<div class="card-item">Transaction Ref: <b>${order.payments[0].transaction_reference}</b></div>` : ''}
              </div>
            </div>

            <!-- Items Table -->
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 36px; text-align: center;">#</th>
                  <th style="text-align: left;">Item Description</th>
                  ${isTaxInvoice ? '<th style="width: 75px; text-align: center;">HSN/SAC</th>' : ''}
                  <th style="width: 45px; text-align: center;">Qty</th>
                  <th style="width: 95px; text-align: right;">Rate (₹)</th>
                  <th style="width: 105px; text-align: right;">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Summary & Totals -->
            <div class="summary-section">
              <div class="left-summary">
                ${
                  isTaxInvoice && taxTotal > 0
                    ? `
                  <table class="tax-table">
                    <thead>
                      <tr>
                        <th>Tax Rate</th>
                        <th>Taxable Amt (₹)</th>
                        <th>CGST (₹)</th>
                        <th>SGST (₹)</th>
                        ${order.igst_amount && order.igst_amount > 0 ? '<th>IGST (₹)</th>' : ''}
                        <th>Total Tax (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><b>${dynamicTaxRate}%</b></td>
                        <td>${formatCurrency(taxableAmount)}</td>
                        <td>${formatCurrency(order.cgst_amount || 0)}</td>
                        <td>${formatCurrency(order.sgst_amount || 0)}</td>
                        ${order.igst_amount && order.igst_amount > 0 ? `<td>${formatCurrency(order.igst_amount)}</td>` : ''}
                        <td><b>${formatCurrency(taxTotal)}</b></td>
                      </tr>
                    </tbody>
                  </table>
                  `
                    : ''
                }

                <div class="words-box">
                  <b>Amount in Words:</b> ${numberToWords(order.payable_amount)}
                </div>

                <div class="terms-box">
                  <b>Terms & Conditions:</b><br />
                  1. Goods once sold will not be taken back or exchanged.<br />
                  2. All disputes subject to ${settings.state || 'local'} jurisdiction.<br />
                  3. Thank you for dining with us! Visit again.
                </div>
              </div>

              <div class="right-summary">
                <div class="totals-card">
                  <div class="total-row"><span>Item Subtotal:</span><b>${formatCurrency(subtotal)}</b></div>
                  ${order.discount_amount ? `<div class="total-row" style="color: #16a34a;"><span>Discount ${order.discount_type === 'percentage' ? `(${order.discount_value || ''}%)` : (order.discount_value ? `(₹${order.discount_value})` : '')}:</span><b>-${formatCurrency(order.discount_amount)}</b></div>` : ''}
                  ${order.coupon_discount ? `<div class="total-row" style="color: #16a34a;"><span>Coupon (${order.coupon_code || ''}):</span><b>-${formatCurrency(order.coupon_discount)}</b></div>` : ''}
                  ${
                    isTaxInvoice && taxTotal > 0
                      ? `
                    <div class="total-row"><span>Taxable Value:</span><b>${formatCurrency(taxableAmount)}</b></div>
                    <div class="total-row"><span>CGST (${halfTaxRateStr}%):</span><b>${formatCurrency(order.cgst_amount || 0)}</b></div>
                    <div class="total-row"><span>SGST (${halfTaxRateStr}%):</span><b>${formatCurrency(order.sgst_amount || 0)}</b></div>
                    ${order.igst_amount && order.igst_amount > 0 ? `<div class="total-row"><span>IGST:</span><b>${formatCurrency(order.igst_amount)}</b></div>` : ''}
                  `
                      : ''
                  }
                  ${order.delivery_charge ? `<div class="total-row"><span>Delivery Charge:</span><b>${formatCurrency(order.delivery_charge)}</b></div>` : ''}
                  ${order.service_charge ? `<div class="total-row"><span>Service Charge:</span><b>${formatCurrency(order.service_charge)}</b></div>` : ''}
                  ${order.round_off ? `<div class="total-row"><span>Round Off:</span><b>${order.round_off > 0 ? '+' : ''}${formatCurrency(order.round_off)}</b></div>` : ''}

                  <div class="grand-total-row">
                    <span>Grand Total:</span>
                    <span class="grand-total-val">${formatCurrency(order.payable_amount)}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer-row">
              <div style="font-size: 10px; color: #94a3b8;">
                This is a computer generated invoice. No signature required.
              </div>
              <div class="signatory-box">
                <div style="font-size: 10.5px; font-weight: 700; color: #334155;">For ${settings.name || 'Restaurant'}</div>
                <div class="sign-line"></div>
                <div class="sign-label">Authorized Signatory</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await executeIsolatedPrint(html);
    } catch (e) {
      console.error('Invoice Print Error:', e);
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
      if (Platform.OS === 'web') {
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
        } else {
          await Print.printAsync({ uri });
        }
      }
    } catch (e) {
      console.error('exportAllTablesPdf error:', e);
      try {
        await executeIsolatedPrint(html);
      } catch (_) {}
    }
  },

  /**
   * Official A4 Z-Report / Day Settlement & Shift Audit Statement
   */
  async printZReportA4(
    register: DayRegister,
    settings?: Partial<RestaurantSettings>,
    restaurantName?: string,
    restaurantAddress?: string
  ): Promise<void> {
    const storeName = restaurantName || settings?.name || 'Restaurant POS';
    const storeAddress = restaurantAddress || settings?.address || '';
    const storePhone = settings?.phone || '';
    const storeEmail = settings?.email || '';
    const gstin = settings?.gstin || '';

    const openTimeStr = register.opened_at ? new Date(register.opened_at).toLocaleString() : 'N/A';
    const closeTimeStr = register.closed_at ? new Date(register.closed_at).toLocaleString() : 'N/A';
    const printTimeStr = new Date().toLocaleString();

    const diff = register.cash_difference || 0;
    const diffStatus =
      diff === 0
        ? 'BALANCED (0.00)'
        : diff > 0
        ? `CASH OVER (+₹${diff.toFixed(2)})`
        : `CASH SHORTAGE (-₹${Math.abs(diff).toFixed(2)})`;
    const diffColor = diff === 0 ? '#16a34a' : diff > 0 ? '#2563eb' : '#dc2626';

    const openingFloat = register.opening_cash_float || 0;
    const cashSales = register.cash_sales || 0;
    const upiSales = register.upi_sales || 0;
    const cardSales = register.card_sales || 0;
    const refunds = register.refunds || 0;
    const cashOut = register.cash_out || 0;
    const totalSales = register.total_sales || (cashSales + upiSales + cardSales);
    const expectedCash = register.expected_cash || (openingFloat + cashSales - refunds - cashOut);
    const countedCash = register.actual_cash_counted || 0;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Z-Report — ${register.register_date} — ${storeName}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 10mm;
            }
            @media print {
              html, body {
                height: 100%;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .z-report-wrapper {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #0f172a;
              background-color: #ffffff;
              font-size: 11px;
              line-height: 1.35;
              width: 100%;
            }
            .z-report-wrapper {
              width: 100%;
              max-width: 760px;
              margin: 0 auto;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .header-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 8px;
              margin-bottom: 10px;
            }
            .brand-col {
              flex: 1;
            }
            .brand-name {
              font-size: 20px;
              font-weight: 900;
              color: #0f172a;
              margin: 0 0 2px 0;
              letter-spacing: -0.5px;
            }
            .brand-meta {
              font-size: 10.5px;
              color: #475569;
              margin: 1px 0;
            }
            .doc-title-box {
              text-align: right;
            }
            .doc-main-badge {
              display: inline-block;
              background-color: #0f172a;
              color: #ffffff;
              padding: 4px 10px;
              border-radius: 4px;
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 0.5px;
            }
            .doc-sub-badge {
              font-size: 9.5px;
              font-weight: 800;
              color: #64748b;
              margin-top: 3px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 6px;
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 8px 10px;
              margin-bottom: 10px;
            }
            .meta-item {
              display: flex;
              flex-direction: column;
            }
            .meta-label {
              font-size: 9px;
              font-weight: 800;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 1px;
            }
            .meta-val {
              font-size: 11.5px;
              font-weight: 800;
              color: #0f172a;
            }
            .section-title {
              font-size: 11.5px;
              font-weight: 900;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              margin: 8px 0 4px 0;
              display: flex;
              align-items: center;
              gap: 4px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 8px;
            }
            th {
              background-color: #f1f5f9;
              color: #334155;
              font-size: 10px;
              font-weight: 900;
              text-transform: uppercase;
              text-align: left;
              padding: 5px 8px;
              border-top: 1px solid #cbd5e1;
              border-bottom: 1.5px solid #94a3b8;
            }
            td {
              padding: 4.5px 8px;
              font-size: 11px;
              border-bottom: 1px solid #e2e8f0;
              color: #1e293b;
            }
            .text-right {
              text-align: right;
            }
            .text-bold {
              font-weight: 800;
            }
            .table-total-row {
              background-color: #f8fafc;
              border-top: 1.5px solid #0f172a;
              border-bottom: 1.5px solid #0f172a;
              font-weight: 900;
            }
            .table-total-row td {
              font-size: 11.5px;
              font-weight: 900;
              color: #0f172a;
              padding: 6px 8px;
            }
            .notes-box {
              background-color: #fffbeb;
              border: 1px solid #fef3c7;
              border-radius: 6px;
              padding: 6px 10px;
              margin: 6px 0;
              font-size: 10px;
              color: #92400e;
            }
            .signatures-row {
              display: flex;
              justify-content: space-between;
              margin-top: 14px;
              padding-top: 6px;
            }
            .signature-card {
              width: 44%;
              border-top: 1px dashed #64748b;
              padding-top: 4px;
              text-align: center;
              font-size: 10.5px;
              color: #475569;
              font-weight: 700;
            }
            .footer-row {
              margin-top: 10px;
              border-top: 1px solid #e2e8f0;
              padding-top: 6px;
              display: flex;
              justify-content: space-between;
              font-size: 9px;
              color: #94a3b8;
            }
          </style>
        </head>
        <body>
          <div class="z-report-wrapper">
            <!-- 1. Header Section -->
            <div class="header-row">
              <div class="brand-col">
                <div class="brand-name">${storeName}</div>
                ${storeAddress ? `<div class="brand-meta">📍 ${storeAddress}</div>` : ''}
                ${storePhone ? `<div class="brand-meta">📞 ${storePhone} ${storeEmail ? `| ✉️ ${storeEmail}` : ''}</div>` : ''}
                ${gstin ? `<div class="brand-meta"><b>GSTIN:</b> ${gstin}</div>` : ''}
              </div>
              <div class="doc-title-box">
                <div class="doc-main-badge">OFFICIAL Z-REPORT</div>
                <div class="doc-sub-badge">Day Settlement & Shift Audit Statement</div>
              </div>
            </div>

            <!-- 2. Shift Metadata Grid -->
            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Register Date</span>
                <span class="meta-val">${register.register_date}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Shift Opened</span>
                <span class="meta-val">${openTimeStr}</span>
                <span style="font-size: 9.5px; color: #64748b;">By: ${register.opened_by || 'Admin'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Shift Closed</span>
                <span class="meta-val">${closeTimeStr}</span>
                <span style="font-size: 9.5px; color: #64748b;">By: ${register.closed_by || 'Admin'}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Register Status</span>
                <span class="meta-val" style="color: #16a34a;">🔒 CLOSED</span>
                <span style="font-size: 9px; color: #64748b;">Batch ID: ${register.id.slice(0, 16)}</span>
              </div>
            </div>

            <!-- 3. Sales & Revenue Breakdown -->
            <div class="section-title">📊 1. Shift Sales & Revenue Breakdown</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 40%;">Payment Category</th>
                  <th style="width: 35%;">Description</th>
                  <th style="width: 25%;" class="text-right">Settled Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="text-bold">💵 Cash Sales</td>
                  <td>POS counter & dine-in physical cash collections</td>
                  <td class="text-right text-bold">₹${cashSales.toFixed(2)}</td>
                </tr>
                <tr>
                  <td class="text-bold">📱 UPI / QR Digital Sales</td>
                  <td>Direct UPI QR payments (PhonePe, GPay, Paytm)</td>
                  <td class="text-right text-bold">₹${upiSales.toFixed(2)}</td>
                </tr>
                <tr>
                  <td class="text-bold">💳 Card & POS Machine</td>
                  <td>Credit / Debit card EDC machine swipe settlements</td>
                  <td class="text-right text-bold">₹${cardSales.toFixed(2)}</td>
                </tr>
                ${
                  refunds > 0
                    ? `
                  <tr>
                    <td class="text-bold" style="color: #dc2626;">↩️ Customer Refunds</td>
                    <td style="color: #dc2626;">Approved order cancellations and refunds paid</td>
                    <td class="text-right text-bold" style="color: #dc2626;">-₹${refunds.toFixed(2)}</td>
                  </tr>
                `
                    : ''
                }
                ${
                  cashOut > 0
                    ? `
                  <tr>
                    <td class="text-bold" style="color: #ea580c;">💸 Cash Out / Expenses</td>
                    <td style="color: #ea580c;">Petty cash expenses and supplier cash payouts</td>
                    <td class="text-right text-bold" style="color: #ea580c;">-₹${cashOut.toFixed(2)}</td>
                  </tr>
                `
                    : ''
                }
                <tr class="table-total-row">
                  <td colspan="2">TOTAL NET REVENUE REALIZED</td>
                  <td class="text-right">₹${totalSales.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <!-- 4. Cash Drawer Reconciliation & Audit -->
            <div class="section-title">🔒 2. Physical Cash Drawer Reconciliation & Audit</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 50%;">Audit Parameter</th>
                  <th style="width: 25%;">Calculation Basis</th>
                  <th style="width: 25%;" class="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="text-bold">Shift Opening Cash Float</td>
                  <td>Starting cash drawer float at opening</td>
                  <td class="text-right text-bold">₹${openingFloat.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>(+) Shift Cash Sales Collected</td>
                  <td>Net physical cash collected during shift</td>
                  <td class="text-right">+₹${cashSales.toFixed(2)}</td>
                </tr>
                ${
                  refunds > 0
                    ? `
                  <tr>
                    <td>(-) Cash Refunds Disbursed</td>
                    <td>Cash refunded to customers</td>
                    <td class="text-right">-₹${refunds.toFixed(2)}</td>
                  </tr>
                `
                    : ''
                }
                ${
                  cashOut > 0
                    ? `
                  <tr>
                    <td>(-) Cash Out / Petty Expenses</td>
                    <td>Cash taken from drawer for expenses</td>
                    <td class="text-right">-₹${cashOut.toFixed(2)}</td>
                  </tr>
                `
                    : ''
                }
                <tr style="background-color: #f1f5f9; font-weight: 800;">
                  <td class="text-bold">Expected Cash in Drawer</td>
                  <td>Opening Float + Cash Sales - Refunds - Cash Out</td>
                  <td class="text-right text-bold">₹${expectedCash.toFixed(2)}</td>
                </tr>
                <tr style="background-color: #f8fafc; font-weight: 800;">
                  <td class="text-bold">Actual Physical Cash Counted</td>
                  <td>Physical drawer cash verified by closing staff</td>
                  <td class="text-right text-bold">₹${countedCash.toFixed(2)}</td>
                </tr>
                <tr class="table-total-row">
                  <td>CASH DRAWER DISCREPANCY (VARIANCE)</td>
                  <td>Actual Counted - Expected Cash</td>
                  <td class="text-right" style="color: ${diffColor};">${diffStatus}</td>
                </tr>
              </tbody>
            </table>

            <!-- 5. Closing Notes (if any) -->
            ${
              register.notes
                ? `
              <div class="notes-box">
                <b>Shift Closing Notes / Remarks:</b> ${register.notes}
              </div>
            `
                : ''
            }

            <!-- 6. Verification & Signatures -->
            <div class="signatures-row">
              <div class="signature-card">
                Shift Cashier / Operator Signature<br />
                <span style="font-size: 9.5px; font-weight: normal; color: #64748b;">${register.closed_by || 'Cashier In-Charge'}</span>
              </div>
              <div class="signature-card">
                Restaurant Manager / Admin Verification<br />
                <span style="font-size: 9.5px; font-weight: normal; color: #64748b;">Authorized Signatory</span>
              </div>
            </div>

            <!-- 7. Footer -->
            <div class="footer-row">
              <span>Printed on: ${printTimeStr}</span>
              <span>RestroZ POS — Official Day Settlement & Z-Report Statement</span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </body>
      </html>
    `;

    try {
      await executeIsolatedPrint(html);
    } catch (e) {
      console.error('printZReportA4 error:', e);
    }
  },
};
