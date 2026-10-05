export const WORKSHOP_INITIAL_VISIBLE_ORDERS = 36;

export function getVisibleWorkshopOrders<T>(orders: T[], visibleLimit: number) {
  return orders.slice(0, Math.max(0, visibleLimit));
}

export function getNextWorkshopVisibleLimit(current: number, total: number) {
  return Math.min(current + WORKSHOP_INITIAL_VISIBLE_ORDERS, total);
}
