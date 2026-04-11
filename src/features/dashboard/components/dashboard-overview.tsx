import { AlertTriangle, CreditCard, Package, TrendingUp, Wallet, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

type DashboardOverviewProps = {
  salesToday: { subtotal: number; profit_total: number }[];
  expensesToday: { amount: number }[];
  repairsToday: { amount: number }[];
  lowStockProducts: { id: string; name: string; stock: number; min_stock: number }[];
  paymentBreakdown: { method: string; amount: number }[];
  topProducts: { name: string; quantity: number }[];
  recentSales: { date: string; total: number }[];
  cashSummary: {
    method: string;
    salesIncome: number;
    repairsIncome: number;
    invoicesIncome: number;
    expensesOutcome: number;
    balance: number;
  }[];
  invoiceIncomeToday: number;
  invoicePendingBalance: number;
  invoicePendingCount: number;
};

export function DashboardOverview({
  salesToday,
  expensesToday,
  repairsToday,
  lowStockProducts,
  paymentBreakdown,
  topProducts,
  recentSales,
  cashSummary,
  invoiceIncomeToday,
  invoicePendingBalance,
  invoicePendingCount
}: DashboardOverviewProps) {
  const totalSales = salesToday.reduce((acc, item) => acc + Number(item.subtotal), 0);
  const totalExpenses = expensesToday.reduce((acc, item) => acc + Number(item.amount), 0);
  const repairsIncome = repairsToday.reduce((acc, item) => acc + Number(item.amount), 0);

  const metrics = [
    { label: "Ventas del dia", value: formatCurrency(totalSales), icon: Wallet },
    { label: "Gastos del dia", value: formatCurrency(totalExpenses), icon: CreditCard },
    { label: "Ingresos reparaciones", value: formatCurrency(repairsIncome), icon: Wrench },
    { label: "Facturacion del dia", value: formatCurrency(invoiceIncomeToday), icon: TrendingUp }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
                </div>
                <div className="rounded-2xl bg-brand-50 p-3 text-brand-700">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Productos con stock bajo</p>
              <h3 className="text-xl font-semibold text-slate-950">Reposicion sugerida</h3>
            </div>
            <Badge variant="warning">{lowStockProducts.length} items</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {lowStockProducts.length ? (
              lowStockProducts.map((product) => (
                <div
                  className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
                  key={product.id}
                >
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-sm text-slate-500">Minimo recomendado: {product.min_stock}</p>
                  </div>
                  <Badge variant={product.stock <= product.min_stock ? "danger" : "warning"}>
                    {product.stock} en stock
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No hay alertas de stock por ahora.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-6">
          <div>
            <p className="text-sm text-slate-500">Ventas por metodo de pago</p>
            <div className="mt-4 space-y-3">
              {paymentBreakdown.length ? (
                paymentBreakdown.map((payment) => (
                  <div key={`${payment.method}-${payment.amount}`} className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">{payment.method}</span>
                    <span className="text-sm text-slate-500">{formatCurrency(Number(payment.amount))}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin datos para el rango seleccionado.</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm text-slate-500">Top productos vendidos</p>
            <div className="mt-4 space-y-3">
              {topProducts.length ? (
                topProducts.map((product) => (
                  <div key={product.name} className="flex items-center gap-3">
                    <div className="rounded-2xl bg-brand-50 p-2 text-brand-700">
                      <Package className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.quantity} unidades</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <AlertTriangle className="h-4 w-4" />
                  Sin ventas registradas en el periodo.
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <p className="text-sm text-slate-500">Ventas ultimos 7 dias</p>
        <h3 className="text-xl font-semibold text-slate-950">Tendencia diaria</h3>
        <div className="mt-6 grid grid-cols-7 gap-3">
          {recentSales.length ? (
            recentSales.map((item) => {
              const max = Math.max(...recentSales.map((entry) => entry.total), 1);
              const height = `${Math.max((item.total / max) * 180, 16)}px`;

              return (
                <div className="flex flex-col items-center gap-3" key={item.date}>
                  <div className="flex h-48 items-end">
                    <div className="w-10 rounded-t-2xl bg-brand-500/85" style={{ height }} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-slate-900">{item.date.slice(5)}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(item.total)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="col-span-7 text-sm text-slate-500">Sin ventas recientes para graficar.</p>
          )}
        </div>
      </Card>

      <Card>
        <p className="text-sm text-slate-500">Caja por medio de pago</p>
        <h3 className="text-xl font-semibold text-slate-950">Ingresos, egresos y saldo</h3>
        <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Pendiente facturacion: {invoicePendingCount} comprobantes por {formatCurrency(invoicePendingBalance)}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Medio</th>
                <th className="px-4 py-3 font-medium">Ventas</th>
                <th className="px-4 py-3 font-medium">Reparaciones</th>
                <th className="px-4 py-3 font-medium">Facturacion</th>
                <th className="px-4 py-3 font-medium">Gastos</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {cashSummary.map((row) => (
                <tr className="border-t border-slate-100" key={row.method}>
                  <td className="px-4 py-3 font-medium uppercase text-slate-900">{row.method}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(row.salesIncome)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(row.repairsIncome)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(row.invoicesIncome)}</td>
                  <td className="px-4 py-3 text-rose-700">{formatCurrency(row.expensesOutcome)}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">{formatCurrency(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
