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
      isCustomRange: boolean;
    };
    metrics: {
      salesTotal: number;
      salesProfit: number;
      repairsTotal: number;
      expensesTotal: number;
      invoicesTotal: number;
      salariesTotal: number;
      netCash: number;
    };
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
      products: {
        label: string;
        quantity: number;
        revenue: number;
        profit: number;
      }[];
      categories: {
        label: string;
        quantity: number;
        revenue: number;
        profit: number;
      }[];
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
  trend
}: {
  difference: number;
  percentage: number | null;
  trend: "up" | "down" | "flat";
}) {
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;
  const tone =
    trend === "up"
      ? "bg-emerald-50 text-emerald-700"
      : trend === "down"
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={cn("inline-flex max-w-full flex-wrap items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", tone)}>
      <Icon className="h-3.5 w-3.5" />
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
  const progressWidth = Math.min(progress.progress, 100);
  const reached = progress.actual >= progress.target;

  return (
    <div className="rounded-3xl border border-slate-100 bg-white/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(progress.actual)}</p>
        </div>
        <Badge variant={reached ? "success" : "warning"}>{reached ? "Meta cumplida" : `${progress.progress.toFixed(0)}%`}</Badge>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
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

export function ReportsView({ canExport, data }: ReportsViewProps) {
  const { metrics, range, monthlyComparison, monthlyGoals, rankings, sellerSummary, technicianSummary } = data;
  const metricCards = [
    { label: "Ventas del periodo", value: metrics.salesTotal, icon: TrendingUp },
    { label: "Ganancia de ventas", value: metrics.salesProfit, icon: TrendingUp },
    { label: "Reparaciones facturadas", value: metrics.repairsTotal, icon: Wrench },
    { label: "Gastos del periodo", value: metrics.expensesTotal, icon: TrendingDown },
    { label: "Facturacion emitida", value: metrics.invoicesTotal, icon: FileSpreadsheet },
    { label: "Retiros de sueldo", value: metrics.salariesTotal, icon: ShieldCheck }
  ];

  const exportQuery = `from=${range.from}&to=${range.to}`;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Bloque profesional</p>
            <h2 className="text-2xl font-semibold text-slate-950">Reportes operativos</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Revisa rendimiento del local, compara ventas por vendedor, reparaciones por tecnico y exporta
              cada modulo con el mismo rango que estas mirando.
            </p>
          </div>
          <form className="grid gap-3 sm:grid-cols-[180px_180px_auto_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Desde</label>
              <Input defaultValue={range.from} name="from" type="date" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Hasta</label>
              <Input defaultValue={range.to} name="to" type="date" />
            </div>
            <div className="flex items-end">
              <button className={cn(buttonVariants(), "w-full sm:w-auto")} type="submit">
                Aplicar
              </button>
            </div>
            <div className="flex items-end">
              <Link className={cn(buttonVariants({ variant: "secondary" }), "w-full sm:w-auto")} href="/reportes">
                Hoy
              </Link>
            </div>
          </form>
        </div>
        <div className="mt-4 rounded-2xl border border-graphite/10 bg-white/70 px-4 py-3 text-sm text-slate-600">
          {range.isCustomRange
            ? `Rango actual: ${formatDate(range.from)} al ${formatDate(range.to)}.`
            : "Rango actual: hoy."}
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-500">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(metric.value)}</p>
                </div>
                <div className="rounded-2xl bg-brand-100 p-3 text-graphite">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Lectura de negocio</p>
            <h3 className="text-xl font-semibold text-slate-950">Mes actual vs mes anterior</h3>
            <p className="mt-1 text-sm text-slate-500">
              {monthlyComparison.currentLabel} contra {monthlyComparison.previousLabel}.
            </p>
          </div>
          <Badge variant="warning">Comparativa mensual automatica</Badge>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {monthlyComparison.rows.map((row) => (
            <div key={row.key} className="rounded-3xl border border-slate-100 bg-white/70 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">{row.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(row.current)}</p>
                </div>
                <VariationBadge
                  difference={row.variation.difference}
                  percentage={row.variation.percentage}
                  trend={row.variation.trend}
                />
              </div>
              <div className="mt-4 rounded-2xl border border-slate-100 bg-[#fbfbf8] px-4 py-3 text-sm text-slate-600">
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
            <h3 className="text-xl font-semibold text-slate-950">Avance contra meta</h3>
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
          <GoalCard progress={monthlyGoals.goals.profit} title="Meta de ganancia" />
          <GoalCard progress={monthlyGoals.goals.repairs} title="Meta de reparaciones" />
          <GoalCard progress={monthlyGoals.goals.invoicing} title="Meta de facturacion" />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Ventas por vendedor</p>
              <h3 className="text-xl font-semibold text-slate-950">Ranking del periodo</h3>
            </div>
            <Badge>{sellerSummary.length} perfiles</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {sellerSummary.length ? (
              sellerSummary.map((row) => (
                <div key={row.label} className="rounded-2xl border border-slate-100 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-2xl bg-brand-100 p-2 text-graphite">
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Reparaciones por tecnico</p>
              <h3 className="text-xl font-semibold text-slate-950">Produccion del periodo</h3>
            </div>
            <Badge>{technicianSummary.length} perfiles</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {technicianSummary.length ? (
              technicianSummary.map((row) => (
                <div key={row.label} className="rounded-2xl border border-slate-100 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-2xl bg-brand-100 p-2 text-graphite">
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
            <p className="text-sm text-slate-500">Caja consolidada</p>
            <h3 className="text-xl font-semibold text-slate-950">Lectura rapida del periodo</h3>
          </div>
          <div className="space-y-3 rounded-3xl border border-slate-100 bg-white/70 p-4">
            <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Facturacion total</span>
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
                <span className="text-lg font-semibold text-slate-950">{formatCurrency(metrics.netCash)}</span>
              </div>
            </div>
          </div>
          {!canExport ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Tu usuario puede consultar el tablero, pero las exportaciones quedan reservadas para admin.
            </div>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Ranking comercial</p>
              <h3 className="text-xl font-semibold text-slate-950">Top productos del periodo</h3>
            </div>
            <Badge variant="warning">
              <Trophy className="mr-1 h-3.5 w-3.5" />
              Ventas reales
            </Badge>
          </div>
          <div className="mt-4 space-y-3">
            {rankings.products.length ? (
              rankings.products.map((row) => (
                <div key={row.label} className="rounded-2xl border border-slate-100 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-500">{row.quantity} unidades vendidas</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.revenue)}</p>
                      <p className="text-xs text-slate-500">Ganancia {formatCurrency(row.profit)}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Todavia no hay productos vendidos en este rango.</p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Ranking por categoria</p>
              <h3 className="text-xl font-semibold text-slate-950">Que familia mueve mas plata</h3>
            </div>
            <Badge>Por facturacion</Badge>
          </div>
          <div className="mt-4 space-y-3">
            {rankings.categories.length ? (
              rankings.categories.map((row) => (
                <div key={row.label} className="rounded-2xl border border-slate-100 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{row.label}</p>
                      <p className="text-xs text-slate-500">{row.quantity} unidades vendidas</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold text-slate-950">{formatCurrency(row.revenue)}</p>
                      <p className="text-xs text-slate-500">Ganancia {formatCurrency(row.profit)}</p>
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

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">Exportaciones por modulo</p>
            <h3 className="text-xl font-semibold text-slate-950">Descargas limpias para gestion</h3>
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
              className="flex h-full flex-col justify-between rounded-3xl border border-slate-100 bg-white/70 p-5"
            >
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{module.title}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{module.description}</p>
              </div>
              {canExport ? (
                <a
                  className={cn(buttonVariants({ variant: "secondary" }), "mt-5 w-full justify-center")}
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
