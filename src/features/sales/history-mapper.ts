import { normalizeCashMethodValue } from "@/lib/cash";

function readRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function mapSalesHistoryRows(rows: any[]) {
  return rows.map((sale) => ({
    id: sale.id,
    saleNumber: sale.sale_number,
    subtotal: Number(sale.subtotal),
    costTotal: Number(sale.cost_total),
    profitTotal: Number(sale.profit_total),
    soldAt: sale.sold_at,
    notes: sale.notes ?? "",
    payments: (sale.sale_payments ?? []).map((payment: any) => ({
      method: normalizeCashMethodValue(payment.method) ?? payment.method,
      amount: Number(payment.amount)
    })),
    items: (sale.sale_items ?? []).map((item: any) => ({
      productId: item.product_id,
      productName: readRelated(item.products)?.name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      total: Number(item.total)
    }))
  }));
}
