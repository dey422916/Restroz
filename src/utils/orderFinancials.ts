import { Order, Payment } from '../types';
import { roundToTwoDecimals } from './currency';
import { extractRewardFromNotes } from './orderNotes';

export interface OrderPaymentBreakdown {
  cash: number;
  upi: number;
  card: number;
  wallet: number;
  other: number;
}

export interface OrderFinancialSummary {
  grossTotal: number;
  walletRedeemed: number;
  externalPaid: number;
  totalPaid: number;
  remainingBalance: number;
  netPayableAfterRewards: number;
  isFullyPaid: boolean;
  paymentBreakdown: OrderPaymentBreakdown;
  paymentMethodLabel: string;
}

/**
 * Resolves the canonical financial interpretation for any order (active, draft, or completed).
 * Ensures that:
 * 1. grossTotal is the original order total before wallet redemption.
 * 2. walletRedeemed is the actual loyalty/wallet redemption amount applied.
 * 3. externalPaid is non-wallet payment (Cash + UPI + Card + Other).
 * 4. totalPaid = walletRedeemed + externalPaid.
 * 5. remainingBalance = max(0, grossTotal - totalPaid).
 * 6. netPayableAfterRewards = max(0, grossTotal - walletRedeemed).
 */
export function resolveOrderFinancials(order: Partial<Order>): OrderFinancialSummary {
  // 1. Gross Total (Original bill before wallet redemption)
  let grossTotal = 0;
  if (order.grand_total !== undefined && order.grand_total !== null && Number(order.grand_total) > 0) {
    grossTotal = roundToTwoDecimals(Number(order.grand_total));
  } else if (order.items && order.items.length > 0) {
    const itemsGross = order.items.reduce(
      (sum, item) => sum + ((Number(item.unit_price) * Number(item.quantity)) || Number(item.subtotal) || Number(item.total) || 0),
      0
    );
    grossTotal = roundToTwoDecimals(itemsGross);
  } else {
    grossTotal = roundToTwoDecimals(Number(order.payable_amount || order.subtotal || 0));
  }

  // 2. Wallet Redeemed
  let walletRedeemed = 0;
  if ((order as any)?.wallet_redeemed !== undefined && (order as any)?.wallet_redeemed !== null) {
    const wr = Number((order as any).wallet_redeemed);
    if (!isNaN(wr) && wr > 0) {
      walletRedeemed = wr;
    }
  }

  // Check notes for [REWARD:amount] tag
  if (walletRedeemed === 0 && order.notes) {
    const fromNotes = extractRewardFromNotes(order.notes);
    if (fromNotes > 0) {
      walletRedeemed = fromNotes;
    }
  }

  // Check customer_wallet_transactions ledger if joined
  if (walletRedeemed === 0 && Array.isArray((order as any)?.wallet_tx)) {
    const ledgerRedeem = (order as any).wallet_tx
      .filter((t: any) => t.transaction_type === 'redeem')
      .reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
    if (ledgerRedeem > 0) {
      walletRedeemed = ledgerRedeem;
    }
  }

  // Check payments table for wallet tender if explicitly recorded
  if (walletRedeemed === 0 && Array.isArray(order.payments)) {
    const payRedeem = order.payments
      .filter((p: any) => String(p.payment_method).toLowerCase() === 'wallet')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (payRedeem > 0) {
      walletRedeemed = payRedeem;
    }
  }

  // For settled / completed orders: If grand_total exceeds payable_amount,
  // the difference is the atomic wallet redemption applied by settle_order RPC
  const storedPayable = Number(order.payable_amount);
  if (!isNaN(storedPayable) && storedPayable >= 0 && grossTotal > storedPayable) {
    const roundOff = Number(order.round_off) || 0;
    const impliedRedeem = roundToTwoDecimals((grossTotal + roundOff) - storedPayable);
    if (impliedRedeem > 0) {
      walletRedeemed = Math.max(walletRedeemed, impliedRedeem);
    }
  }

  walletRedeemed = roundToTwoDecimals(Math.min(walletRedeemed, grossTotal));

  // 3. External Paid (Cash + UPI + Card + Other non-wallet tenders)
  let externalPaid = 0;
  if (order.payments && order.payments.length > 0) {
    const completedNonWallet = order.payments
      .filter((p: any) => {
        const m = String(p.payment_method || '').toLowerCase();
        return m !== 'wallet' && m !== 'rewards' && m !== 'restroz_points';
      })
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    if (completedNonWallet > 0) {
      externalPaid = completedNonWallet;
    } else {
      const pm = String(order.payment_method || '').toLowerCase();
      if (pm === 'wallet' || pm === 'rewards' || pm === 'restroz_points') {
        externalPaid = 0;
      } else {
        const rawPaid = Number(order.paid_amount || 0);
        if (rawPaid > 0 && walletRedeemed > 0 && Math.abs(rawPaid - grossTotal) < 0.01) {
          externalPaid = Math.max(0, rawPaid - walletRedeemed);
        } else {
          externalPaid = rawPaid;
        }
      }
    }
  } else {
    const pm = String(order.payment_method || '').toLowerCase();
    if (pm === 'wallet' || pm === 'rewards' || pm === 'restroz_points') {
      externalPaid = 0;
    } else {
      const rawPaid = Number(order.paid_amount || 0);
      if (rawPaid > 0 && walletRedeemed > 0 && Math.abs(rawPaid - grossTotal) < 0.01) {
        externalPaid = Math.max(0, rawPaid - walletRedeemed);
      } else {
        externalPaid = rawPaid;
      }
    }
  }
  externalPaid = roundToTwoDecimals(Math.max(0, externalPaid));

  // 4. Net Payable After Rewards
  const netPayableAfterRewards = roundToTwoDecimals(Math.max(0, grossTotal - walletRedeemed));

  // 5. Total Paid & Remaining Balance
  const isMarkedPaid = order.payment_status === 'paid' || order.status === 'completed';
  const totalPaid = roundToTwoDecimals(Math.min(grossTotal, externalPaid + walletRedeemed));
  const remainingBalance = isMarkedPaid && externalPaid >= netPayableAfterRewards
    ? 0
    : roundToTwoDecimals(Math.max(0, grossTotal - (externalPaid + walletRedeemed)));

  const isFullyPaid = isMarkedPaid || (totalPaid >= grossTotal && grossTotal > 0);

  // 6. Tender breakdown
  const breakdown: OrderPaymentBreakdown = {
    cash: 0,
    upi: 0,
    card: 0,
    wallet: walletRedeemed,
    other: 0,
  };

  if (order.payments && order.payments.length > 0) {
    order.payments.forEach((p: any) => {
      const m = String(p.payment_method || '').toLowerCase();
      const amt = Number(p.amount) || 0;
      if (m === 'cash' || m === 'cod') breakdown.cash += amt;
      else if (m === 'upi' || m === 'online') breakdown.upi += amt;
      else if (m === 'card') breakdown.card += amt;
      else if (m === 'wallet' || m === 'rewards' || m === 'restroz_points') breakdown.wallet = Math.max(breakdown.wallet, amt);
      else breakdown.other += amt;
    });
  } else if (externalPaid > 0) {
    const m = (order.payment_method || 'cash').toLowerCase();
    if (m === 'cash' || m === 'cod') breakdown.cash = externalPaid;
    else if (m === 'upi' || m === 'online') breakdown.upi = externalPaid;
    else if (m === 'card') breakdown.card = externalPaid;
    else if (m === 'wallet' || m === 'rewards' || m === 'restroz_points') {
      // Points tender already in breakdown.wallet
    } else breakdown.other = externalPaid;
  }

  // 7. Payment method label
  let paymentMethodLabel = '';
  if (isFullyPaid) {
    const parts: string[] = [];
    if (breakdown.cash > 0) parts.push('CASH');
    if (breakdown.upi > 0) parts.push('UPI');
    if (breakdown.card > 0) parts.push('CARD');
    if (breakdown.other > 0) parts.push('OTHER');
    if (walletRedeemed > 0) {
      parts.push('RESTROZ POINTS');
    }
    if (parts.length === 0) {
      const fallbackMethod = String(order.payment_method || '').toLowerCase();
      if (fallbackMethod === 'wallet' || fallbackMethod === 'rewards' || fallbackMethod === 'restroz_points') {
        parts.push('RESTROZ POINTS');
      } else {
        parts.push((order.payment_method || 'CASH').toUpperCase());
      }
    }
    paymentMethodLabel = parts.join(' + ');
  } else {
    const fallbackMethod = String(order.payment_method || '').toLowerCase();
    if (fallbackMethod === 'wallet' || fallbackMethod === 'rewards' || fallbackMethod === 'restroz_points') {
      paymentMethodLabel = 'RESTROZ POINTS';
    } else {
      paymentMethodLabel = (order.payment_method || 'UNPAID').toUpperCase();
    }
  }

  return {
    grossTotal,
    walletRedeemed,
    externalPaid,
    totalPaid,
    remainingBalance,
    netPayableAfterRewards,
    isFullyPaid,
    paymentBreakdown: breakdown,
    paymentMethodLabel,
  };
}
