import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Download,
  FileSpreadsheet,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserRound,
  Wrench
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { BusinessChart, type BusinessChartRow } from "@/features/reports/components/business-chart";
import type { RankingRow, ReportPeriodMetrics } from "@/features/reports/performance-snapshot";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type GoalProgress = {
  actual: number;
  target: number;
  difference: number;
  progress: number;
};

type ReportsViewProps = {
  canExport: boolean;
  data: {
    range: {
      from: string;
      to: string;
      today: string;
      isToday: boolean;
      isCustomRange: boolean;
    };
    metrics: ReportPeriodMetrics;
    monthlyComparison: {
      currentLabel: string;
      previousLabel: string;
      rows: {
        key: string;
        label: string;
        current: number;
        previous: number;
        variation: {
          difference: number;
          percentage: number | null;
          trend: "up" | "down" | "flat";
        };
      }[];
    };
    monthlyGoals: {
      label: string;
      goals: {
        sales: GoalProgress;
        profit: GoalProgress;
        repairs: GoalProgress;
        invoicing: GoalProgress;
      };
    };
    rankings: {
      products: RankingRow[];
      categories: RankingRow[];
    };
    sellerSummary: {
      userId: string | null;
      label: string;
      total: number;
      count: number;
    }[];
    technicianSummary: {
      userId: string | null;
      label: string;
      total: number;
      count: number;
    }[];
  };
};

const EXPORT_MODULES = [
  {
    slug: "ventas",
    title: "Ventas",
    description: "Descarga numero, fecha, total, costo y ganancia del periodo."
  },
  {
    slug: "reparaciones",
    title: "Reparaciones",
    description: "Exporta cliente, equipo, orden, fechas y monto final."
  },
  {
    slug: "gastos",
    title: "Gastos",
    description: "Baja un CSV limpio con categoria, descripcion, monto y cuenta."
  },
  {
    slug: "facturacion",
    title: "Facturacion",
    description: "Comprobantes internos, origen, cliente, total, saldo y estado."
  },
  {
    slug: "caja",
    title: "Caja",
    description: "Todos los movimientos operativos del periodo por tipo y cuenta."
  },
  {
    slug: "sueldos",
    title: "Sueldos",
    description: "Retiros por fecha, cuenta de salida y observaciones."
  }
] as const;

function VariationBadge({
  difference,
  percentage,
  trend,
  label,
  lowerIsBetter = false
}: {
  difference: number;
  percentage: number | null;
  trend: "up" | "down" | "flat";
  label: string;
  lowerIsBetter?: boolean;
}) {
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;
  const tone =
    (lowerIsBetter ? trend === "down" : trend === "up")
      ? "bg-emerald-50 text-emerald-700"
      : trend !== "flat"
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span aria-label={`Variacion de ${label}`} className={cn("inline-flex max-w-full flex-wrap items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", tone)}>
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {difference === 0
        ? "Sin cambio"
        : `${difference > 0 ? "+" : ""}${formatCurrency(difference)}${percentage !== null ? ` - ${difference > 0 ? "+" : ""}${percentage.toFixed(1)}%` : ""}`}
    </span>
  );
}

function GoalCard({
  title,
  progress
}: {
  title: string;
  progress: GoalProgress;
}) {
  const progressWidth = Math.max(0, Math.min(progress.progress, 100));
  const reached = progress.actual >= progress.target;

  return (
    <div className="min-w-0 border-t border-slate-200 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(progress.actual)}</p>
        </div>
        <Badge variant={reached ? "success" : "warning"}>{reached ? "Meta cumplida" : `${progress.progress.toFixed(0)}%`}</Badge>
      </div>
      <div aria-label={`Avance de ${title}`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.max(0, progressWidth)} aria-valuetext={`${progress.progress.toFixed(0)}% del objetivo`} className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar">
        <div
          className={cn("h-full rounded-full", reached ? "bg-emerald-500" : "bg-graphite")}
          style={{ width: `${progressWidth}%` }}
        />
      </div>
      <div className="mt-3 space-y-1 text-sm text-slate-600">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>Objetivo</span>
          <span className="font-semibold text-slate-950">{formatCurrency(progress.target)}</span>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>{reached ? "Superavit" : "Pendiente"}</span>
          <span className="font-semibold text-slate-950">{formatCurrency(Math.abs(progress.difference))}</span>
        </div>
      </div>
    </div>
  );
}

function RankingMargin({ row }: { row: RankingRow }) {
  if (row.unknownCostCount == null) return <p className="text-xs text-slate-600">Margen sin verificar; cobertura de costos no informada</p>;
  return <p className="text-xs text-slate-600">{row.profit === null ? "Margen por determinar" : `Margen conocido ${formatCurrency(row.profit)}`}{row.unknownCostCount > 0 ? `; ${row.unknownCostCount} lineas sin costo, subtotal parcial` : ""}</p>;
}

export function ReportsView({ canExport, data }: ReportsViewProps) {
  const { metrics, range, monthlyComparison, monthlyGoals, rankings, sellerSummary, technicianSummary } = data;
  const metricCards = [
    { label: "Ventas del periodo", value: metrics.salesTotal, icon: TrendingUp, tone: "income", description: "Importe registrado en ventas" },
    { label: "Margen registrado de ventas", value: metrics.salesProfit, icon: TrendingUp, tone: "success", description: "Subtotal con costo conocido; no es ganancia total ni utilidad neta." },
    { label: "Importe declarado en reparaciones", value: metrics.repairsTotal, icon: Wrench, tone: "service", description: "Importes declarados; no equivale a cobros" },
    { label: "Gastos del periodo", value: metrics.expensesTotal, icon: TrendingDown, tone: "expense", description: "Egresos operativos" },
    { label: "Facturacion emitida", value: metrics.invoicesTotal, icon: FileSpreadsheet, tone: "neutral", description: "Comprobantes internos del periodo" },
    { label: "Retiros de sueldo", value: metrics.salariesTotal, icon: ShieldCheck, tone: "warning", description: "Retiros registrados del periodo" }
  ] as const;

  const exportQuery = `from=${range.from}&to=${range.to}`;
  const monthlyChartRows: BusinessChartRow[] = monthlyComparison.rows.filter((row) => row.key !== "salesProfit").map((row) => ({
    label: row.key === "repairsTotal" ? "REP declaradas" : row.key === "invoicesTotal" ? "Comprobantes" : row.label,
    value: row.current,
    previous: row.previous,
    tone: row.key === "expensesTotal" ? "expense" : row.key === "repairsTotal" ? "service" : row.key === "netCash" ? "margin" : "income"
  }));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Reportes</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Compara resultados y exporta los movimientos del periodo.
            </p>
          </div>
          <form className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="from">Desde</label>
              <Input defaultValue={range.from} id="from" name="from" type="date" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="to">Hasta</label>
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
                href={`/reportes?from=${range.today}&to=${range.today}`}
              >
                Hoy
              </Link>
            </div>
          </form>
        </div>
        <div className="mt-3 text-sm text-slate-600">
          {range.isToday
            ? `Periodo: ${formatDate(range.today)}.`
            : `Periodo: ${formatDate(range.from)} al ${formatDate(range.to)}.`}
        </div>
      </Card>

      <section aria-label="Metricas del reporte" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((metric) => <MetricCard {...metric} format="currency" key={metric.label} />)}
      </section>

      <details className="rounded-xl border border-slate-200 bg-white">
        <summary className="min-h-14 cursor-pointer p-4 text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-slate-600">
          <span className="font-semibold">Cobertura de costos de ventas</span>
          <span className="mt-1 block text-sm">{metrics.salesUnknownCostCount == null ? "Cobertura sin verificar: no se informo el conteo de ventas sin costo." : metrics.salesUnknownCostCount > 0 ? `${metrics.salesUnknownCostCount} ventas sin margen calculable. El margen mostrado es parcial.` : "Todas las ventas del periodo tienen margen calculable."}</span>
        </summary>
        <div className="space-y-2 border-t border-slate-200 p-4 text-sm leading-6 text-slate-600">
          <p>Las ventas sin costo conocido, incluidas placas sin costo de adquisicion registrado, no se cuentan como ganancia. Un costo cero explicitamente registrado si es valido. El subtotal de margen excluye esas ventas; sus ingresos siguen incluidos en ventas y caja cuando corresponda.</p>
          <p>Las liberaciones futuras de placas registradas como venta ya forman parte de estos importes: no se vuelve a sumar su neto ni su margen por separado. No se reconstruyen liberaciones historicas.</p>
          <p>En rankings, los subtotales con costo conocido no equivalen a la ganancia total. Si el agregado no informa cobertura, no se presume que todos los costos esten completos.</p>
        </div>
      </details>

      <BusinessChart title="Actividad registrada del periodo" description={`Del ${formatDate(range.from)} al ${formatDate(range.to)}. Ventas registradas, reparaciones declaradas y comprobantes emitidos no equivalen a cobros. No se suman entre si: pueden representar la misma operacion. Gastos y retiros se muestran separados; no es un calculo de utilidad.`} rows={[
        { label: "Ventas registradas", value: metrics.salesTotal, tone: "income" },
        { label: "REP declaradas", value: metrics.repairsTotal, tone: "service" },
        { label: "Comprobantes", value: metrics.invoicesTotal, tone: "neutral" },
        { label: "Gastos operativos", value: metrics.expensesTotal, tone: "expense" },
        { label: "Retiros de sueldo", value: metrics.salariesTotal, tone: "pending" }
      ]} />

      <BusinessChart title="Comparacion mensual por actividad" description="Mes de cierre del rango contra el mes anterior completo. Comparacion mensual, independiente del rango seleccionado; no representa una tendencia diaria ni una comparacion entre periodos de igual duracion." valueLabel={monthlyComparison.currentLabel} previousLabel={monthlyComparison.previousLabel} rows={monthlyChartRows} />

      <Card>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Detalle de la comparacion mensual</h2>
            <p className="mt-1 text-sm text-slate-500">
              {monthlyComparison.currentLabel} contra {monthlyComparison.previousLabel}.
            </p>
          </div>
          <p className="text-sm text-slate-500">Comparacion mensual, independiente del rango.</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {monthlyComparison.rows.map((row) => (
            <div key={row.key} className="min-w-0 border-t border-slate-200 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">{row.key === "salesProfit" ? "Margen conocido de ventas (subtotal)" : row.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(row.current)}</p>
                </div>
                <VariationBadge
                  difference={row.variation.difference}
                  percentage={row.variation.percentage}
                  trend={row.variation.trend}
                  label={row.label}
                  lowerIsBetter={row.key === "expensesTotal"}
                />
              </div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>{monthlyComparison.currentLabel}</span>
                  <span className="font-semibold text-slate-950">{formatCurrency(row.current)}</span>
                </div>
                <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>{monthlyComparison.previousLabel}</span>
                  <span className="font-semibold text-slate-950">{formatCurrency(row.previous)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Objetivos mensuales</p>
            <h2 className="text-xl font-semibold text-slate-950">Avance contra meta</h2>
            <p className="mt-1 text-sm text-slate-500">
              Objetivos tomados desde Configuracion para {monthlyGoals.label}.
            </p>
          </div>
          <Badge variant="default">
            <Target className="mr-1 h-3.5 w-3.5" />
            Metas editables
          </Badge>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <GoalCard progress={monthlyGoals.goals.sales} title="Meta de ventas" />
          <GoalCard progress={monthlyGoals.goals.profit} title="Meta de margen conocido" />
          <GoalCard progress={monthlyGoals.goals.repairs} title="Meta de reparaciones" />
          <GoalCard progress={monthlyGoals.goals.invoicing} title="Meta de facturacion" />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Ventas por vendedor</h2>
            </div>
            <Badge>{sellerSummary.length} perfiles</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {sellerSummary.length ? (
              sellerSummary.map((row) => (
                <div key={row.label} className="border-b border-slate-200 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="text-slate-500">
                        <UserRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{row.label}</p>
                        <p className="text-xs text-slate-500">{row.count} ventas registradas</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-950 sm:text-right">{formatCurrency(row.total)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No hay ventas en este rango todavia.</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Reparaciones por quien las registro</h2>
              <p className="mt-2 text-xs text-slate-500">Muestra importes declarados, no dinero cobrado. El responsable tecnico, los pagos y la deuda de la REP se consultan en Negocio del taller.</p>
            </div>
            <Badge>{technicianSummary.length} perfiles</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {technicianSummary.length ? (
              technicianSummary.map((row) => (
                <div key={row.label} className="border-b border-slate-200 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="text-slate-500">
                        <Wrench className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{row.label}</p>
                        <p className="text-xs text-slate-500">{row.count} reparaciones registradas</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-950 sm:text-right">{formatCurrency(row.total)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No hay reparaciones en este rango todavia.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Resultado de caja del periodo</h2>
          </div>
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Comprobantes emitidos, no cobros</span>
              <span className="font-semibold text-slate-950">{formatCurrency(metrics.invoicesTotal)}</span>
            </div>
            <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Gastos operativos</span>
              <span className="font-semibold text-slate-950">{formatCurrency(metrics.expensesTotal)}</span>
            </div>
            <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Retiros de sueldo</span>
              <span className="font-semibold text-slate-950">{formatCurrency(metrics.salariesTotal)}</span>
            </div>
            <div className="border-t border-slate-200 pt-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-slate-700">Resultado de caja</span>
                <span className={cn("text-lg font-semibold", metrics.netCash < 0 ? "text-finance-expense" : "text-finance-profit")}>{formatCurrency(metrics.netCash)}</span>
              </div>
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-600">El resultado conserva el flujo de movimientos de caja registrado. Los comprobantes no se suman como cobros adicionales. No es utilidad neta ni saldo disponible de las cuentas.</p>
          {!canExport ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Tu usuario puede consultar el tablero, pero las exportaciones quedan reservadas para admin.
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Productos y conceptos vendidos</h2>
            </div>
            <Badge variant="warning">
              <Trophy className="mr-1 h-3.5 w-3.5" />
              Ventas reales
            </Badge>
          </div>
          <div className="mt-4 space-y-3">
            {rankings.products.length ? (
              rankings.products.map((row) => (
                <div key={row.label} className="border-b border-slate-200 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-500">{row.quantity} unidades vendidas</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.revenue)}</p>
                      <RankingMargin row={row} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Todavia no hay productos vendidos en este rango.</p>
            )}
          </div>
        </Card>

        <div className="space-y-3">
          <BusinessChart title="Categorias con mas ventas" description="Ranking disponible del rango seleccionado, hasta 8 categorias. Importes de ventas registradas, no cobros ni participacion sobre todo el negocio. Los conceptos sin inventario se identifican por separado." rows={rankings.categories.map((row) => ({ label: row.label, value: row.revenue, tone: "income" }))} />
          <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Ventas por categoria</h2>
            </div>
            <Badge>Por facturacion</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {rankings.categories.length ? (
              rankings.categories.map((row) => (
                <div key={row.label} className="border-b border-slate-200 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-500">{row.quantity} unidades vendidas</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.revenue)}</p>
                      <RankingMargin row={row} />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">No hay categorias con ventas en este rango.</p>
            )}
          </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Exportar movimientos del periodo</h2>
          </div>
          {canExport ? (
            <Badge variant="success">Admin habilitado</Badge>
          ) : (
            <Badge variant="warning">Solo lectura</Badge>
          )}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXPORT_MODULES.map((module) => (
            <div
              key={module.slug}
              className="flex h-full flex-col justify-between min-w-0 border-t border-slate-200 py-4"
            >
              <div>
                <p className="text-sm font-semibold text-slate-500">{module.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p>
              </div>
              {canExport ? (
                <a
                  className={cn(buttonVariants({ variant: "secondary" }), "mt-3 w-full justify-center")}
                  href={`/api/reportes/${module.slug}?${exportQuery}`}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar CSV
                </a>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
                  Disponible cuando entres con usuario admin.
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
