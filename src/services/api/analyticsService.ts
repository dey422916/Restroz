import { Order, Product, ItemSalesSummary, DaySalesSummary } from '../../types';
import { getLocalRestaurantDate } from './dayRegisterService';

export const analyticsService = {
  /**
   * Filter orders within a local timezone date range (inclusive 00:00:00 to 23:59:59)
   */
  filterOrdersByDateRange(orders: Order[], startDateStr: string, endDateStr: string): Order[] {
    const start = new Date(`${startDateStr}T00:00:00`);
    const end = new Date(`${endDateStr}T23:59:59.999`);

    return orders.filter((ord) => {
      const ordDate = new Date(ord.created_at);
      return ordDate >= start && ordDate <= end;
    });
  },

  /**
   * Calculate Day-wise Sales Summary for each day within a date range
   */
  getDayWiseSales(orders: Order[], startDateStr: string, endDateStr: string): {
    dailySummaries: DaySalesSummary[];
    totals: DaySalesSummary;
  } {
    const filteredOrders = this.filterOrdersByDateRange(orders, startDateStr, endDateStr);

    // Group orders by local date (YYYY-MM-DD)
    const ordersByDay: Record<string, Order[]> = {};

    filteredOrders.forEach((ord) => {
      const dayKey = getLocalRestaurantDate(new Date(ord.created_at));
      if (!ordersByDay[dayKey]) ordersByDay[dayKey] = [];
      ordersByDay[dayKey].push(ord);
    });

    const dailySummaries: DaySalesSummary[] = Object.keys(ordersByDay)
      .sort((a, b) => b.localeCompare(a)) // Latest date first
      .map((dayKey) => {
        const dayOrders = ordersByDay[dayKey];
        return this.computeDaySummary(dayKey, dayOrders);
      });

    const overallTotals = this.computeDaySummary('Total Period', filteredOrders);

    return { dailySummaries, totals: overallTotals };
  },

  /**
   * Compute comprehensive summary for a set of orders
   */
  computeDaySummary(dateKey: string, dayOrders: Order[]): DaySalesSummary {
    let gross_sales = 0;
    let net_sales = 0;
    let tax_collected = 0;
    let discount_amount = 0;
    let paid_orders_count = 0;
    let cancelled_orders_count = 0;

    let cash_sales = 0;
    let upi_sales = 0;
    let card_sales = 0;

    let dine_in_sales = 0;
    let takeaway_sales = 0;
    let delivery_sales = 0;
    let qr_sales = 0;

    dayOrders.forEach((ord) => {
      if (ord.status === 'cancelled') {
        cancelled_orders_count++;
        return;
      }

      const payable = Number(ord.payable_amount) || 0;
      const subtotal = Number(ord.subtotal) || 0;
      const tax = (Number(ord.cgst_amount) || 0) + (Number(ord.sgst_amount) || 0) + (Number(ord.igst_amount) || 0);
      const discount = (Number(ord.discount_amount) || 0) + (Number(ord.coupon_discount) || 0);

      gross_sales += Number(ord.grand_total) || (subtotal + tax);
      net_sales += payable;
      tax_collected += tax;
      discount_amount += discount;

      if (ord.payment_status === 'paid' || ord.status === 'completed') {
        paid_orders_count++;
      }

      // Reconcile payments from payment records where available
      if (ord.payments && ord.payments.length > 0) {
        ord.payments.forEach((p) => {
          const amt = Number(p.amount) || 0;
          if (p.payment_method === 'cash') cash_sales += amt;
          else if (p.payment_method === 'upi') upi_sales += amt;
          else if (p.payment_method === 'card') card_sales += amt;
          else cash_sales += amt;
        });
      } else if (ord.payment_status === 'paid') {
        const method = (ord as any).payment_method || 'cash';
        if (method === 'cash') cash_sales += payable;
        else if (method === 'upi') upi_sales += payable;
        else if (method === 'card') card_sales += payable;
        else cash_sales += payable;
      }

      // Order Channel Sales
      const src = ord.order_source;
      const type = ord.order_type;
      if (src === 'CUSTOMER_QR' || ord.notes?.includes('[QR_DINE_IN]')) {
        qr_sales += payable;
      } else if (type === 'dine_in') {
        dine_in_sales += payable;
      } else if (type === 'takeaway') {
        takeaway_sales += payable;
      } else {
        delivery_sales += payable;
      }
    });

    const average_order_value = paid_orders_count > 0 ? Math.round(net_sales / paid_orders_count) : 0;

    let formattedDate = dateKey;
    if (dateKey !== 'Total Period') {
      try {
        const [y, m, d] = dateKey.split('-');
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        formattedDate = dateObj.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      } catch {
        formattedDate = dateKey;
      }
    }

    return {
      date: dateKey,
      formatted_date: formattedDate,
      gross_sales: Math.round(gross_sales * 100) / 100,
      net_sales: Math.round(net_sales * 100) / 100,
      tax_collected: Math.round(tax_collected * 100) / 100,
      discount_amount: Math.round(discount_amount * 100) / 100,
      total_orders: dayOrders.length,
      paid_orders_count,
      cancelled_orders_count,
      average_order_value,
      cash_sales: Math.round(cash_sales * 100) / 100,
      upi_sales: Math.round(upi_sales * 100) / 100,
      card_sales: Math.round(card_sales * 100) / 100,
      dine_in_sales: Math.round(dine_in_sales * 100) / 100,
      takeaway_sales: Math.round(takeaway_sales * 100) / 100,
      delivery_sales: Math.round(delivery_sales * 100) / 100,
      qr_sales: Math.round(qr_sales * 100) / 100,
    };
  },

  /**
   * Calculate Item-Wise Sales Ranking ("Which item is selling more")
   */
  getItemWiseSales(
    orders: Order[],
    products: Product[],
    startDateStr: string,
    endDateStr: string
  ): {
    items: ItemSalesSummary[];
    topSellingItems: ItemSalesSummary[];
    categorySales: { category_name: string; units_sold: number; total_revenue: number }[];
    totalUnitsSold: number;
    totalItemRevenue: number;
  } {
    const filteredOrders = this.filterOrdersByDateRange(orders, startDateStr, endDateStr);
    const nonCancelled = filteredOrders.filter((o) => o.status !== 'cancelled');

    // Create a product lookup map
    const productMap = new Map<string, Product>();
    products.forEach((p) => productMap.set(p.id, p));

    // Aggregate by product_name or product_id
    const itemMap = new Map<
      string,
      {
        product_id: string;
        product_name: string;
        sku: string;
        category_name: string;
        food_type: any;
        units_sold: number;
        total_revenue: number;
        image_url?: string;
      }
    >();

    let totalUnitsSold = 0;
    let totalItemRevenue = 0;

    nonCancelled.forEach((ord) => {
      if (ord.items && ord.items.length > 0) {
        ord.items.forEach((item) => {
          const qty = Number(item.quantity) || 1;
          const rev = Number(item.total) || Number(item.subtotal) || Number(item.unit_price) * qty;

          totalUnitsSold += qty;
          totalItemRevenue += rev;

          const key = item.product_id || item.product_name;
          const matchedProd = item.product_id ? productMap.get(item.product_id) : undefined;

          if (!itemMap.has(key)) {
            itemMap.set(key, {
              product_id: item.product_id || key,
              product_name: item.product_name || matchedProd?.name || 'Dish',
              sku: matchedProd?.sku || 'DISH',
              category_name: matchedProd?.category_name || 'General',
              food_type: matchedProd?.food_type || 'veg',
              units_sold: 0,
              total_revenue: 0,
              image_url: matchedProd?.image_url || (item as any).image_url,
            });
          }

          const existing = itemMap.get(key)!;
          existing.units_sold += qty;
          existing.total_revenue += rev;
        });
      }
    });

    const items: ItemSalesSummary[] = Array.from(itemMap.values())
      .map((entry) => ({
        ...entry,
        total_revenue: Math.round(entry.total_revenue * 100) / 100,
        average_price:
          entry.units_sold > 0 ? Math.round((entry.total_revenue / entry.units_sold) * 100) / 100 : 0,
        share_percentage:
          totalItemRevenue > 0
            ? Math.round((entry.total_revenue / totalItemRevenue) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.units_sold - a.units_sold || b.total_revenue - a.total_revenue);

    // Top 5 Best Sellers
    const topSellingItems = items.slice(0, 5);

    // Category Sales breakdown
    const categoryMap = new Map<string, { units_sold: number; total_revenue: number }>();
    items.forEach((itm) => {
      const cat = itm.category_name || 'General';
      if (!categoryMap.has(cat)) categoryMap.set(cat, { units_sold: 0, total_revenue: 0 });
      const cur = categoryMap.get(cat)!;
      cur.units_sold += itm.units_sold;
      cur.total_revenue += itm.total_revenue;
    });

    const categorySales = Array.from(categoryMap.entries())
      .map(([category_name, data]) => ({
        category_name,
        units_sold: data.units_sold,
        total_revenue: Math.round(data.total_revenue * 100) / 100,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue);

    return {
      items,
      topSellingItems,
      categorySales,
      totalUnitsSold,
      totalItemRevenue: Math.round(totalItemRevenue * 100) / 100,
    };
  },
};
