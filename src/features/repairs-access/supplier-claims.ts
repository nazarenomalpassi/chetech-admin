export const SUPPLIER_CLAIM_LABELS = {
  open: "Reclamo abierto",
  sent: "Enviado al proveedor",
  resolved: "Resuelto",
  cancelled: "Cancelado",
} as const;
export type SupplierClaim = {
  id: string;
  partId: string;
  orderId: string;
  repairNumber: string;
  description: string;
  warrantyReturnId: string | null;
  quantity: number;
  reason: string;
  supplier: string | null;
  status: keyof typeof SUPPLIER_CLAIM_LABELS;
  resolution: string | null;
  extraCost: number | null;
  version: number;
  createdAt: string;
  closedAt: string | null;
};
export type WorkshopPartsPage = {
  items: import("./coordination-queries").PartInboxItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: {
    requested: number;
    ordered: number;
    available: number;
    overdue: number;
    claims: number;
  };
};
