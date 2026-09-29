import { RestaurantSubscription, SubscriptionPlan } from '../types/saas';

export interface ResolvedSubscriptionDisplay {
  planName: string;
  priceDisplay: string;
  rawPrice: number | null;
  billingCycleDisplay: string;
  startDateDisplay: string;
  endDateDisplay: string;
  maxTablesDisplay: string | number;
  maxProductsDisplay: string | number;
}

/**
 * Resolves the display properties for an active or historical restaurant subscription
 * following strict pricing precedence and null-aware formatting.
 *
 * Precedence:
 * 1. Assigned restaurant-specific price on subscription row (if explicitly set and > 0)
 * 2. Referenced plan's configured price (from activeSub.plan or plans lookup by plan_id)
 * 3. Legitimate free tier (0)
 * 4. Fallback to '—' if pricing is genuinely missing/null
 */
export function resolveSubscriptionDisplay(
  subscription: RestaurantSubscription | null | undefined,
  plans: SubscriptionPlan[] = []
): ResolvedSubscriptionDisplay | null {
  if (!subscription) return null;

  // 1. Resolve exact referenced plan by plan_id (never by name or price)
  const referencedPlan =
    subscription.plan ||
    plans.find((p) => p.id === subscription.plan_id) ||
    null;

  // 2. Plan Name
  const planName = referencedPlan?.name || (subscription as any).plan_name || 'Custom Plan';

  // 3. Pricing Precedence Rule
  const assignedAmountRaw =
    subscription.amount !== null && subscription.amount !== undefined
      ? subscription.amount
      : (subscription as any).assigned_price !== null && (subscription as any).assigned_price !== undefined
      ? (subscription as any).assigned_price
      : (subscription as any).amount_charged !== null && (subscription as any).amount_charged !== undefined
      ? (subscription as any).amount_charged
      : (subscription as any).agreed_price !== null && (subscription as any).agreed_price !== undefined
      ? (subscription as any).agreed_price
      : (subscription as any).subscription_price !== null && (subscription as any).subscription_price !== undefined
      ? (subscription as any).subscription_price
      : null;

  const assignedAmount =
    assignedAmountRaw !== null && assignedAmountRaw !== undefined && !isNaN(Number(assignedAmountRaw))
      ? Number(assignedAmountRaw)
      : null;

  const planConfiguredPrice =
    referencedPlan &&
    referencedPlan.price !== null &&
    referencedPlan.price !== undefined &&
    !isNaN(Number(referencedPlan.price))
      ? Number(referencedPlan.price)
      : null;

  let resolvedPrice: number | null = null;

  if (assignedAmount !== null && assignedAmount > 0) {
    resolvedPrice = assignedAmount;
  } else if (planConfiguredPrice !== null && planConfiguredPrice > 0) {
    resolvedPrice = planConfiguredPrice;
  } else if (assignedAmount === 0 || planConfiguredPrice === 0) {
    resolvedPrice = 0;
  } else if (assignedAmount !== null) {
    resolvedPrice = assignedAmount;
  } else if (planConfiguredPrice !== null) {
    resolvedPrice = planConfiguredPrice;
  } else {
    resolvedPrice = null;
  }

  const priceDisplay =
    resolvedPrice !== null
      ? `₹${resolvedPrice.toLocaleString('en-IN')}`
      : '—';

  // 4. Billing Period Precedence Rule:
  // 1) subscription.billing_cycle / billing_interval
  // 2) referenced plan.billing_cycle / billing_period
  // 3) duration-based fallback
  const subCycle =
    (subscription as any).billing_cycle ||
    (subscription as any).billing_interval ||
    (subscription as any).cycle;

  const planCycle =
    referencedPlan?.billing_cycle ||
    (referencedPlan as any)?.billing_period;

  let billingCycleDisplay = '';
  if (subCycle && typeof subCycle === 'string' && subCycle.trim()) {
    billingCycleDisplay = subCycle.toLowerCase().trim();
  } else if (planCycle && typeof planCycle === 'string' && planCycle.trim()) {
    billingCycleDisplay = planCycle.toLowerCase().trim();
  } else if (subscription.start_date && subscription.end_date) {
    const start = new Date(subscription.start_date).getTime();
    const end = new Date(subscription.end_date).getTime();
    const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
    if (days >= 300) {
      billingCycleDisplay = 'yearly';
    } else if (days >= 80 && days <= 100) {
      billingCycleDisplay = 'quarterly';
    } else if (days >= 25 && days <= 35) {
      billingCycleDisplay = 'monthly';
    } else {
      billingCycleDisplay = 'yearly';
    }
  } else {
    billingCycleDisplay = 'yearly';
  }

  // 5. Limits: Max Tables & Max Products
  const maxTablesDisplay =
    referencedPlan?.max_tables !== null && referencedPlan?.max_tables !== undefined
      ? referencedPlan.max_tables
      : (subscription as any).max_tables !== null && (subscription as any).max_tables !== undefined
      ? (subscription as any).max_tables
      : 'Unlimited';

  const maxProductsDisplay =
    referencedPlan?.max_products !== null && referencedPlan?.max_products !== undefined
      ? referencedPlan.max_products
      : (subscription as any).max_products !== null && (subscription as any).max_products !== undefined
      ? (subscription as any).max_products
      : 'Unlimited';

  // 6. Dates
  const startDateDisplay = subscription.start_date
    ? new Date(subscription.start_date).toLocaleDateString()
    : '—';
  const endDateDisplay = subscription.end_date
    ? new Date(subscription.end_date).toLocaleDateString()
    : '—';

  return {
    planName,
    priceDisplay,
    rawPrice: resolvedPrice,
    billingCycleDisplay,
    startDateDisplay,
    endDateDisplay,
    maxTablesDisplay,
    maxProductsDisplay,
  };
}
