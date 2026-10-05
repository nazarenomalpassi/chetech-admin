import Link from "next/link";
import { CalendarDays, ClipboardList, PackageCheck, UserRoundCheck, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { getRepairAccessStatusLabel, getRepairAccessStatusTone } from "@/features/repairs-access/components/repair-access-helpers";
import { getVisitTimeLabel } from "@/features/visits/model";
import { cn, formatDate } from "@/lib/utils";

type TechnicianDashboardProps = {
  technicianName: string;
  data: Awaited<ReturnType<typeof import("@/features/dashboard/technician-queries").getTechnicianDashboardData>>;
};

export function TechnicianDashboard({ technicianName, data }: TechnicianDashboardProps) {
  const metrics = [
    { label: "Ordenes activas", value: data.summary.active, icon: Wrench, tone: "service" },
    { label: "Asignadas a mi", value: data.summary.assigned, icon: UserRoundCheck, tone: "income" },
    { label: "Pendientes de revision", value: data.summary.pendingReview, icon: ClipboardList, tone: "warning" },
    { label: "Listas para retirar", value: data.summary.readyToPickup, icon: PackageCheck, tone: "success" }
  ] as const;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="panel-kicker">Mesa tecnica</p>
            <h1 className="panel-heading mt-3">Buen trabajo, {technicianName}</h1>
            <p className="panel-subheading mt-3 max-w-2xl">
              Tu vista operativa de reparaciones y visitas, sin informacion contable ni acciones administrativas.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className={cn(buttonVariants(), "w-full sm:w-auto")} href="/reparaciones-access?view=ordenes">
              Abrir ordenes
            </Link>
            <Link className={cn(buttonVariants({ variant: "secondary" }), "w-full sm:w-auto")} href="/visitas">
              Ver visitas
            </Link>
          </div>
        </div>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4" aria-label="Resumen tecnico">
        {metrics.map((metric) => <MetricCard {...metric} key={metric.label} />)}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="panel-kicker">Trabajo pendiente</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Ordenes activas recientes</h2>
            </div>
            <Link className={cn(buttonVariants({ variant: "secondary", size: "sm" }))} href="/reparaciones-access?view=ordenes">
              Ver todas
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {data.recentOrders.length ? data.recentOrders.map((order) => (
              <Link
                className="rounded-[22px] border border-graphite/8 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:border-graphite/16 hover:shadow-soft"
                href={`/reparaciones-access?view=ordenes&order=${order.id}`}
                key={order.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-slate-950">{order.repairNumber}</p>
                    <p className="mt-1 text-sm text-slate-600">{order.customerName} | {order.device}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-500">{order.issueReported}</p>
                  </div>
                  <Badge variant={getRepairAccessStatusTone(order.status)}>{getRepairAccessStatusLabel(order.status)}</Badge>
                </div>
              </Link>
            )) : <div className="empty-panel">No hay ordenes activas para mostrar.</div>}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100"><CalendarDays className="h-5 w-5" /></span>
            <div>
              <p className="panel-kicker">Agenda</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Visitas de hoy: {data.visits.todayCount}</h2>
            </div>
          </div>
          {data.visits.nextVisit ? (
            <div className="mt-5 rounded-[22px] border border-graphite/8 bg-white/80 p-4">
              <p className="font-semibold text-slate-950">{data.visits.nextVisit.customerName}</p>
              <p className="mt-2 text-sm text-slate-600">{getVisitTimeLabel(data.visits.nextVisit.timeFrom, data.visits.nextVisit.timeTo)}</p>
              <p className="mt-1 text-sm text-slate-500">{data.visits.nextVisit.address}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">{formatDate(data.visits.nextVisit.visitDate)}</p>
            </div>
          ) : <div className="empty-panel mt-5">No hay visitas pendientes en agenda.</div>}
        </Card>
      </div>
    </div>
  );
}
