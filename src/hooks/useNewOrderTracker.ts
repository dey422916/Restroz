import { useState, useEffect, useCallback, useMemo } from 'react';
import { Order } from '../types';
import { newOrderNotificationService, NewOrderCounts } from '../services/newOrderNotificationService';

export function useNewOrderTracker(restaurantId: string | undefined, orders: Order[]) {
  const [seenOrderIds, setSeenOrderIds] = useState<Set<string>>(new Set());

  // Initial load of seen order IDs from storage
  useEffect(() => {
    let isMounted = true;
    if (!restaurantId) return;

    newOrderNotificationService.getSeenOrderIds(restaurantId).then((ids) => {
      if (isMounted) {
        setSeenOrderIds(new Set(ids));
      }
    });

    const unsubscribe = newOrderNotificationService.subscribe((updatedRestId) => {
      if (updatedRestId === restaurantId && isMounted) {
        const syncIds = newOrderNotificationService.getSeenOrderIdsSync(restaurantId);
        setSeenOrderIds(new Set(syncIds));
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [restaurantId]);

  // Compute live unread counts
  const newCounts: NewOrderCounts = useMemo(() => {
    return newOrderNotificationService.computeNewCounts(orders, seenOrderIds);
  }, [orders, seenOrderIds]);

  // Check if a specific order is new
  const isOrderNew = useCallback(
    (order: Order): boolean => {
      return newOrderNotificationService.isOrderNew(order, seenOrderIds);
    },
    [seenOrderIds]
  );

  // Mark an order as seen / read
  const markAsSeen = useCallback(
    async (orderId: string) => {
      if (!restaurantId || !orderId) return;
      await newOrderNotificationService.markOrderAsSeen(restaurantId, orderId);
      setSeenOrderIds((prev) => {
        const next = new Set(prev);
        next.add(orderId);
        return next;
      });
    },
    [restaurantId]
  );

  // Mark multiple orders as seen / read
  const markMultipleAsSeen = useCallback(
    async (orderIds: string[]) => {
      if (!restaurantId || !orderIds || orderIds.length === 0) return;
      await newOrderNotificationService.markOrdersAsSeen(restaurantId, orderIds);
      setSeenOrderIds((prev) => {
        const next = new Set(prev);
        orderIds.forEach((id) => next.add(id));
        return next;
      });
    },
    [restaurantId]
  );

  return {
    seenOrderIds,
    newCounts,
    isOrderNew,
    markAsSeen,
    markMultipleAsSeen,
  };
}
