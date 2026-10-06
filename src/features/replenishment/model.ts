export type SoldItemInput = {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  historicalUnitCost: number;
  currentUnitCost: number;
  saleStatus?: string | null;
};

export type AggregatedSoldItem = {
  productId: string;
  productName: string;
  sku: string;
  quantitySold: number;
  revenue: number;
  historicalCost: number;
  currentReplacementCost: number;
  grossMargin: number;
  currentUnitCost: number;
};

const CANCELLED_STATUSES = new Set(["anulada", "anulado", "cancelada", "cancelado", "cancelled", "voided"]);

export function aggregateSoldItems(items: SoldItemInput[]) {
  const byProduct = new Map<string, AggregatedSoldItem>();

  for (const item of items) {
    if (CANCELLED_STATUSES.has((item.saleStatus ?? "").trim().toLowerCase())) continue;

    const quantity = Math.max(0, Math.trunc(Number(item.quantity) || 0));
    if (!quantity) continue;
    const revenue = quantity * Number(item.unitPrice || 0);
    const historicalCost = quantity * Number(item.historicalUnitCost || 0);
    const currentReplacementCost = quantity * Number(item.currentUnitCost || 0);
    const current = byProduct.get(item.productId) ?? {
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantitySold: 0,
      revenue: 0,
      historicalCost: 0,
      currentReplacementCost: 0,
      grossMargin: 0,
      currentUnitCost: Number(item.currentUnitCost || 0)
    };

    current.quantitySold += quantity;
    current.revenue += revenue;
    current.historicalCost += historicalCost;
    current.currentReplacementCost += currentReplacementCost;
    current.grossMargin += revenue - historicalCost;
    current.currentUnitCost = Number(item.currentUnitCost || 0);
    byProduct.set(item.productId, current);
  }

  return Array.from(byProduct.values()).sort((left, right) => right.quantitySold - left.quantitySold);
}

export function calculateOrderTotal(items: Array<{ quantityToOrder: number; currentUnitCost: number }>) {
  return items.reduce(
    (total, item) => total + Math.max(0, Math.trunc(Number(item.quantityToOrder) || 0)) * Number(item.currentUnitCost || 0),
    0
  );
}
