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
  const periodLabel = range.isToday ? "del dia" : "del periodo";
  const metrics = [
    {
      key: "sales",
      label: `Ventas ${periodLabel}`,
      description: "Ingresos por operaciones de mostrador",
      value: salesTodayTotal,
      tone: "income",
      icon: ShoppingBag
    },
    {
      key: "expenses",
      label: `Gastos ${periodLabel}`,
      description: "Egresos que consumen caja operativa",
      value: expensesTodayTotal,
      tone: "expense",
      icon: CreditCard
    },
    {
      key: "repairs",
      label: `Ingresos por reparaciones ${periodLabel}`,
      description: "Servicio tecnico cobrado y registrado",
      value: repairsTodayTotal,
      tone: "service",
      icon: Wrench
    },
    {
      key: "invoicing",
      label: `Facturacion ${periodLabel}`,
      description: "Comprobantes internos emitidos",
      value: invoiceIncomeToday,
      tone: "neutral",
      icon: ArrowUpRight
    },
    {
      key: "profit",
      label: `Flujo neto de caja ${periodLabel}`,
      description: "Ingresos menos gastos. No descuenta costo de productos ni retiros de sueldo.",
      value: realProfitToday,
      tone: "success",
      icon: Target
    }
  ] as const;

  return (
    <div className="space-y-6">
      <Card className="rounded-[24px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 min-[1440px]:flex-row min-[1440px]:items-end min-[1440px]:justify-between">
          <div className="max-w-2xl">
            <span className="panel-kicker">Operación diaria</span>
            <h1 className="panel-heading mt-3">Dashboard ejecutivo del local</h1>
            <p className="panel-subheading mt-3">
              {range.isToday
                ? "Lectura en tiempo real del trabajo del dia, con foco en caja, ventas, reparaciones y reposicion critica."
                : `Leyendo movimientos desde ${formatDate(range.from)} hasta ${formatDate(range.to)} para comparar el rendimiento real del negocio.`}
            </p>
          </div>

          <form className="grid w-full gap-3 rounded-[18px] border border-graphite/10 bg-brand-50/70 p-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto_auto] min-[1440px]:w-auto min-[1440px]:min-w-[34rem]">
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="from">
                Desde
              </label>
              <Input defaultValue={range.from} name="from" type="date" />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="to">
                Hasta
              </label>
              <Input defaultValue={range.to} name="to" type="date" />
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

      <section aria-label="Metricas del periodo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-5">
        {metrics.map((metric) => <MetricCard {...metric} format="currency" key={metric.key} />)}
      </section>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.95fr)]">
        <LowStockDisclosure products={lowStockProducts} />

        <div className="space-y-4">
          <Card className="rounded-[34px] p-5 lg:p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="panel-kicker">Caja y cuentas</p>
                <h3 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-slate-950">
                  Saldo actual por medio
                </h3>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-graphite/8 bg-brand-100 text-graphite">
                <Wallet className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {accountBalances.map((account) => (
                <div
                  key={account.method}
                  className="rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
                        {getDashboardAccountLabel(account.method)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">Saldo operativo consolidado</p>
                    </div>
                    <p className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                      {formatCurrency(account.balance)}
                    </p>
                  </div>
                </div>
              ))}
              <div className="rounded-[22px] border border-amber-200 bg-finance-cautionSoft/70 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      MP PENDIENTE DE LIBERACION
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Ventas de placas cargadas y todavia retenidas</p>
                  </div>
                  <p className="text-xl font-semibold tracking-[-0.03em] text-finance-caution">
                    {formatCurrency(pendingMercadoPagoReleaseAmount)}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-[34px] p-5 lg:p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="panel-kicker">Agenda del dia</p>
                <h3 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-slate-950">
                  Visitas de hoy
                </h3>
              </div>
              <Link className={cn(buttonVariants({ variant: "secondary" }), "px-4")} href={"/visitas" as Route}>
                Abrir visitas
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Visitas hoy</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{visitsDashboard.todayCount}</p>
                <p className="mt-1 text-sm text-slate-500">Pendientes hoy: {visitsDashboard.pendingCount}</p>
              </div>
              <div className="rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Proxima visita</p>
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

          <Card className="rounded-[34px] p-5 lg:p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="panel-kicker">Cobranza del dia</p>
                <h3 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-slate-950">
                  Cuotas por cobrar
                </h3>
              </div>
              <Link className={cn(buttonVariants({ variant: "secondary" }), "px-4")} href={"/cuotas" as Route}>
                Ver cuotas
              </Link>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Cuotas por cobrar hoy</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{installmentsDashboard.dueTodayCount}</p>
                <p className="mt-1 text-sm text-slate-500">{formatCurrency(installmentsDashboard.dueTodayTotal)}</p>
              </div>
              <div className="rounded-[22px] border border-amber-200 bg-finance-cautionSoft/70 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Cuotas vencidas</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-finance-caution">{installmentsDashboard.overdueCount}</p>
                <p className="mt-1 text-sm text-slate-500">{formatCurrency(installmentsDashboard.overdueTotal)}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-950">Cobros de hoy</p>
                {installmentsDashboard.dueToday.length ? (
                  installmentsDashboard.dueToday.map((installment) => (
                    <div key={installment.id} className="rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]">
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
                    <div key={installment.id} className="rounded-[22px] border border-amber-200 bg-finance-cautionSoft/70 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]">
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

          <Card className="rounded-[34px] p-5 lg:p-6">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="panel-kicker">Rotacion comercial</p>
                <h3 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-slate-950">
                  Top productos vendidos
                </h3>
              </div>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-graphite/8 bg-brand-100 text-graphite">
                <Package className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {topProducts.length ? (
                topProducts.map((product, index) => (
                  <div
                    key={product.name}
                    className="flex items-center gap-4 rounded-[22px] border border-graphite/8 bg-white/84 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]"
                  >
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] bg-graphite text-sm font-semibold text-white">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-950">{product.name}</p>
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
