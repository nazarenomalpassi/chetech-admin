export type ReplenishmentStatus = "pending" | "added" | "ordered" | "received";

export type ReplenishmentItem = {
  productId: string;
  productName: string;
  sku: string;
  quantitySold: number;
  stock: number;
  currentUnitCost: number;
  currentSalePrice: number;
  revenue: number;
  historicalCost: number;
  currentReplacementCost: number;
  quantityToOrder: number;
  status: ReplenishmentStatus;
  notes: string;
  supplier: string | null;
};

export type ReplenishmentData = {
  migrationReady: boolean;
  monthKey: string;
  monthLabel: string;
  items: ReplenishmentItem[];
  summary: {
    productCount: number;
    quantitySold: number;
    historicalCost: number;
    suggestedReplacementCost: number;
    orderTotal: number;
  };
};
