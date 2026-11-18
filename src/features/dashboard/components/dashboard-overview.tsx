import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarRange,
  CreditCard,
  ShoppingBag,
  Target,
  Wrench
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { getDashboardAccountLabel } from "@/features/dashboard/financial-summary";
import { LowStockDisclosure } from "@/features/dashboard/components/low-stock-disclosure";
import { CashFlowChart } from "@/features/dashboard/components/cash-flow-chart";
import { DashboardDisclosure } from "@/features/dashboard/components/dashboard-disclosure";
import type { DailyCashRow } from "@/features/dashboard/daily-cash";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type DashboardOverviewProps = {
  workshopToday?: ReactNode;
  workshopInbox?: ReactNode;
  dailyCash?: DailyCashRow[] | null;
  salesTodayTotal: number;
  expensesTodayTotal: number;
  repairsTodayTotal: number;
  lowStockProducts: { id: string; name: string; stock: number; min_stock: number }[];
  accountBalances: {
    method: string;
    openingBalance: number;
    balance: number;
  }[];
  pendingMercadoPagoReleaseAmount: number;
  heldMercadoPagoClaimAmount?: number;
  topProducts: { name: string; quantity: number }[];
  invoiceIncomeToday: number;
  realProfitToday: number;
  visitsDashboard: {
    todayCount: number;
    pendingCount: number;
    nextVisit: {
      customerName: string;
      customerPhone: string;
      address: string;
      visitDate: string;
      timeFrom: string;
      timeTo: string;
      reason: string;
      notes: string;
      status: string;
      createdAt: string;
    } | null;
  };
  range: {
    from: string;
    to: string;
    today: string;
    isToday: boolean;
    isCustomRange: boolean;
  };
};

export function DashboardOverview({
  salesTodayTotal,
  expensesTodayTotal,
  repairsTodayTotal,
  lowStockProducts,
  accountBalances,
  pendingMercadoPagoReleaseAmount,
  heldMercadoPagoClaimAmount = 0,
  topProducts,
  invoiceIncomeToday,
  realProfitToday,
  range,
  workshopToday,
  dailyCash,
  workshopInbox
}: DashboardOverviewProps) {
  const metrics = [
    {
      key: "sales",
      label: "Ventas",
      description: "Ingresos de mostrador",
      value: salesTodayTotal,
      tone: "income",
      icon: ShoppingBag
    },
    {
      key: "expenses",
      label: "Gastos",
      description: "Egresos operativos",
      value: expensesTodayTotal,
      tone: "expense",
      icon: CreditCard
    },
    {
      key: "repairs",
      label: "Reparaciones",
      description: "Servicio técnico cobrado",
      value: repairsTodayTotal,
      tone: "service",
      icon: Wrench
    },
    {
      key: "invoicing",
      label: "Facturación",
      description: "Comprobantes internos",
      value: invoiceIncomeToday,
      tone: "neutral",
      icon: ArrowUpRight
    },
    {
      key: "profit",
      label: "Flujo neto de caja",
      description: "Ingresos menos gastos; sin costo de productos ni sueldos.",
      value: realProfitToday,
      tone: "success",
      icon: Target
    }
  ] as const;

  return (
    <div className="space-y-8">
      {workshopToday}

      <section aria-labelledby="finanzas-del-local" className="space-y-4">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-xl font-semibold text-foreground" id="finanzas-del-local">
                Finanzas del local
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {range.isToday
                  ? `Movimientos del ${formatDate(range.today)}.`
                  : `Movimientos del ${formatDate(range.from)} al ${formatDate(range.to)}.`}
              </p>
            </div>

            <form className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] xl:w-auto">
              <div>
                <label
                  className="mb-2 block text-sm font-semibold text-muted-foreground"
                  htmlFor="from"
                >
                  Desde
                </label>
                <Input defaultValue={range.from} id="from" name="from" type="date" />
              </div>
              <div>
                <label
                  className="mb-2 block text-sm font-semibold text-muted-foreground"
                  htmlFor="to"
                >
                  Hasta
                </label>
                <Input defaultValue={range.to} id="to" name="to" type="date" />
              </div>
              <div className="flex items-end">
                <button className={cn(buttonVariants(), "w-full sm:w-auto")} type="submit">
                  Aplicar
                </button>
              </div>
              <div className="flex items-end">
                <Link
                  className={cn(buttonVariants({ variant: "secondary" }), "w-full sm:w-auto")}
                  href={`/dashboard?from=${range.today}&to=${range.today}`}
                >
                  <CalendarRange className="mr-2 h-4 w-4" />
                  Hoy
                </Link>
              </div>
            </form>
          </div>
        </Card>

        <section
          aria-label={`Métricas del ${formatDate(range.from)} al ${formatDate(range.to)}`}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          {metrics.map((metric) => (
            <MetricCard
              {...metric}
              className="p-4 xl:[&>div>span]:hidden"
              format="currency"
              key={metric.key}
            />
          ))}
        </section>

        {dailyCash ? <CashFlowChart from={range.from} rows={dailyCash} to={range.to} /> : null}

        <div className="space-y-4">
          <LowStockDisclosure products={lowStockProducts} />

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <DashboardDisclosure
              title="Saldo disponible por cuenta"
              summary={
                <>
                  {formatCurrency(
                    accountBalances.reduce((total, account) => total + account.balance, 0)
                  )}{" "}
                  disponibles en {accountBalances.length} cuentas. MP pendiente:{" "}
                  {formatCurrency(pendingMercadoPagoReleaseAmount)}; retenido:{" "}
                  {formatCurrency(heldMercadoPagoClaimAmount)}. Saldos actuales.
                </>
              }
            >
              <p className="text-sm text-muted-foreground">
                Saldos actuales, no del período filtrado.
              </p>

              <div className="mt-4 space-y-3">
                {accountBalances.map((account) => (
                  <div key={account.method} className="border-t border-border py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground">
                          {getDashboardAccountLabel(account.method)}
                        </p>
                      </div>
                      <p className="text-xl font-semibold text-foreground tabular-nums">
                        {formatCurrency(account.balance)}
                      </p>
                    </div>
                  </div>
                ))}
                <div className="border-t border-warning-border py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground">
                        MP de placas pendiente
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sin confirmar liberación; excluye reclamos
                      </p>
                    </div>
                    <p className="text-xl font-semibold text-warning">
                      {formatCurrency(pendingMercadoPagoReleaseAmount)}
                    </p>
                  </div>
                </div>
                <div className="border-t border-warning-border py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Link
                        className="text-sm font-semibold text-warning underline-offset-4 hover:underline"
                        href={"/placas-tv?status=claim_open" as Route}
                      >
                        MP retenido por reclamos
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Separado del pendiente y de la caja disponible
                      </p>
                    </div>
                    <p className="text-xl font-semibold text-warning tabular-nums">
                      {formatCurrency(heldMercadoPagoClaimAmount)}
                    </p>
                  </div>
                </div>
              </div>
            </DashboardDisclosure>

            <DashboardDisclosure
              title="Productos más vendidos"
              summary={
                topProducts.length
                  ? `${topProducts.length} productos destacados; ${topProducts.reduce((total, product) => total + product.quantity, 0)} unidades en esta lista del periodo.`
                  : "Sin ventas registradas en el periodo."
              }
            >
              <div className="mt-4 space-y-3">
                {topProducts.length ? (
                  topProducts.map((product, index) => (
                    <div
                      key={product.name}
                      className="flex items-center gap-4 border-t border-border py-3"
                    >
                      <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-sm font-medium text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium wrap-break-word text-foreground">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {product.quantity} unidades registradas
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-panel flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Sin ventas registradas en el periodo actual.
                  </div>
                )}
              </div>
            </DashboardDisclosure>
          </div>
        </div>
      </section>

      {workshopInbox}
    </div>
  );
}
