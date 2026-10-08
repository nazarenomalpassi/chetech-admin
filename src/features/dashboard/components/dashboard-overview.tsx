import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarRange,
  CreditCard,
  Package,
  ShoppingBag,
  Target,
  Wallet,
  Wrench
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { getDashboardAccountLabel } from "@/features/dashboard/financial-summary";
import { LowStockDisclosure } from "@/features/dashboard/components/low-stock-disclosure";
import { getVisitTimeLabel } from "@/features/visits/model";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type DashboardOverviewProps = {
  workshopInbox?: ReactNode;
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
  topProducts: { name: string; quantity: number }[];
  invoiceIncomeToday: number;
  realProfitToday: number;
  installmentsDashboard: {
    dueTodayCount: number;
    overdueCount: number;
    dueTodayTotal: number;
    overdueTotal: number;
    dueToday: Array<{
      id: string;
      customerName: string;
      productName: string;
      installmentLabel: string;
      dueDate: string;
      amount: number;
      paymentMethod: string;
      status: string;
    }>;
    overdue: Array<{
      id: string;
      customerName: string;
      productName: string;
      installmentLabel: string;
      dueDate: string;
      amount: number;
      paymentMethod: string;
      status: string;
    }>;
  };
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
  topProducts,
  invoiceIncomeToday,
  realProfitToday,
  installmentsDashboard,
  visitsDashboard,
  range,
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
      description: "Servicio tecnico cobrado",
      value: repairsTodayTotal,
      tone: "service",
      icon: Wrench
    },
    {
      key: "invoicing",
      label: "Facturacion",
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
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-slate-950">Resumen del local</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {range.isToday
                ? `Movimientos del ${formatDate(range.today)}.`
                : `Movimientos del ${formatDate(range.from)} al ${formatDate(range.to)}.`}
            </p>
          </div>

          <form className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] xl:w-auto">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-500" htmlFor="from">
                Desde
              </label>
              <Input defaultValue={range.from} id="from" name="from" type="date" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-500" htmlFor="to">
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

      {workshopInbox}

      <section aria-label={`Metricas del ${formatDate(range.from)} al ${formatDate(range.to)}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => <MetricCard {...metric} className="p-4 xl:[&>div>span]:hidden" format="currency" key={metric.key} />)}
      </section>

      <div className="space-y-4">
        <LowStockDisclosure products={lowStockProducts} />

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tabular-nums text-slate-950">
                  Saldo disponible por cuenta
                </h2>
                <p className="mt-1 text-sm text-slate-600">Saldos actuales, no del periodo filtrado.</p>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-graphite/8 bg-brand-100 text-graphite">
                <Wallet className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {accountBalances.map((account) => (
                <div
                  key={account.method}
                  className="border-t border-slate-200 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">
                        {getDashboardAccountLabel(account.method)}
                      </p>
                    </div>
                    <p className="text-xl font-semibold tabular-nums text-slate-950">
                      {formatCurrency(account.balance)}
                    </p>
                  </div>
                </div>
              ))}
              <div className="border-t border-amber-200 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">
                      MP de placas pendiente
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Retenido; no disponible para operar</p>
                  </div>
                  <p className="text-xl font-semibold text-finance-caution">
                    {formatCurrency(pendingMercadoPagoReleaseAmount)}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tabular-nums text-slate-950">
                  Visitas de hoy
                </h2>
              </div>
              <Link className={cn(buttonVariants({ variant: "secondary" }), "px-4")} href={"/visitas" as Route}>
                Abrir visitas
              </Link>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border-t border-slate-200 py-3">
                <p className="text-sm font-semibold text-slate-500">Visitas hoy</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{visitsDashboard.todayCount}</p>
                <p className="mt-1 text-sm text-slate-500">Pendientes hoy: {visitsDashboard.pendingCount}</p>
              </div>
              <div className="border-t border-slate-200 py-3">
                <p className="text-sm font-semibold text-slate-500">Proxima visita</p>
                {visitsDashboard.nextVisit ? (
                  <>
                    <p className="mt-2 text-base font-semibold text-slate-950">{visitsDashboard.nextVisit.customerName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {getVisitTimeLabel(visitsDashboard.nextVisit.timeFrom, visitsDashboard.nextVisit.timeTo)} | {visitsDashboard.nextVisit.reason}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No hay salidas agendadas por ahora.</p>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tabular-nums text-slate-950">
                  Cuotas por cobrar
                </h2>
              </div>
              <Link className={cn(buttonVariants({ variant: "secondary" }), "px-4")} href={"/cuotas" as Route}>
                Ver cuotas
              </Link>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border-t border-slate-200 py-3">
                <p className="text-sm font-semibold text-slate-500">Cuotas por cobrar hoy</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{installmentsDashboard.dueTodayCount}</p>
                <p className="mt-1 text-sm text-slate-500">{formatCurrency(installmentsDashboard.dueTodayTotal)}</p>
              </div>
              <div className="border-t border-amber-200 py-3">
                <p className="text-sm font-semibold text-slate-500">Cuotas vencidas</p>
                <p className="mt-2 text-2xl font-semibold text-finance-caution">{installmentsDashboard.overdueCount}</p>
                <p className="mt-1 text-sm text-slate-500">{formatCurrency(installmentsDashboard.overdueTotal)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-950">Cobros de hoy</p>
                {installmentsDashboard.dueToday.length ? (
                  installmentsDashboard.dueToday.map((installment) => (
                    <div key={installment.id} className="border-t border-slate-200 py-3">
                      <p className="font-medium text-slate-950">
                        {installment.customerName} | {installment.productName}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Cuota {installment.installmentLabel} | {formatCurrency(installment.amount)} | {getDashboardAccountLabel(installment.paymentMethod)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="empty-panel">No hay cuotas para cobrar hoy.</div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-950">Cuotas vencidas</p>
                {installmentsDashboard.overdue.length ? (
                  installmentsDashboard.overdue.map((installment) => (
                    <div key={installment.id} className="border-t border-amber-200 py-3">
                      <p className="font-medium text-slate-950">
                        {installment.customerName} | {installment.productName}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Cuota {installment.installmentLabel} | Vencia {formatDate(installment.dueDate)} | {formatCurrency(installment.amount)} | {getDashboardAccountLabel(installment.paymentMethod)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="empty-panel">No hay cuotas vencidas.</div>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tabular-nums text-slate-950">
                  Productos mas vendidos
                </h2>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-graphite/8 bg-brand-100 text-graphite">
                <Package className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {topProducts.length ? (
                topProducts.map((product, index) => (
                  <div
                    key={product.name}
                    className="flex items-center gap-4 border-t border-slate-200 py-3"
                  >
                    <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-sm font-medium text-slate-500">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium text-slate-950">{product.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{product.quantity} unidades registradas</p>
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
          </Card>
        </div>
      </div>
    </div>
  );
}
