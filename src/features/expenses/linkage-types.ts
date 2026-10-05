export type ExpenseLinkOption = {
  id: string;
  orderId: string;
  repairNumber: string;
  description: string;
  supplier?: string | null;
  expectedCost?: number | null;
  paidAmount?: number;
  outstanding?: number | null;
};

export type ExpenseLinkOptions = {
  items: ExpenseLinkOption[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
