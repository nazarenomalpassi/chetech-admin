import Link from "next/link";
import type { ReactNode } from "react";
import { ClipboardList, PackageCheck, UserRoundCheck, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { DashboardDisclosure } from "@/features/dashboard/components/dashboard-disclosure";
import { getRepairAccessStatusLabel, getRepairAccessStatusTone } from "@/features/repairs-access/components/repair-access-helpers";
import { getVisitTimeLabel } from "@/features/visits/model";
import { cn, formatDate } from "@/lib/utils";

type TechnicianDashboardProps = {
  technicianName: string;
  workshopInbox?: ReactNode;
  data: Awaited<ReturnType<typeof import("@/features/dashboard/technician-queries").getTechnicianDashboardData>>;
};

export function TechnicianDashboard({ technicianName, data, workshopInbox }: TechnicianDashboardProps) {
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
            <h1 className="text-2xl font-semibold text-slate-950">Taller de {technicianName}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 max-w-2xl">
              Ordenes y visitas asignadas.
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

      {workshopInbox}

      <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4" aria-label="Resumen tecnico">
        {metrics.map((metric) => <MetricCard {...metric} key={metric.label} />)}
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        <DashboardDisclosure title="Ordenes activas recientes" summary={`${data.summary.active} ordenes activas; ${data.recentOrders.length} recientes en esta lista.`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link className={cn(buttonVariants({ variant: "secondary", size: "sm" }))} href="/reparaciones-access?view=ordenes">
              Ver todas
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {data.recentOrders.length ? data.recentOrders.map((order) => (
              <Link
                className="border-b border-slate-200 py-4 transition-colors hover:bg-slate-50"
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
        </DashboardDisclosure>

        <DashboardDisclosure title="Visitas de hoy" summary={`${data.visits.todayCount} agendadas; ${data.visits.pendingCount} pendientes hoy.`}>
          {data.visits.nextVisit ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="font-semibold text-slate-950">{data.visits.nextVisit.customerName}</p>
              <p className="mt-2 text-sm text-slate-600">{getVisitTimeLabel(data.visits.nextVisit.timeFrom, data.visits.nextVisit.timeTo)}</p>
              <p className="mt-1 text-sm text-slate-500">{data.visits.nextVisit.address}</p>
              <p className="mt-3 text-xs text-slate-400">{formatDate(data.visits.nextVisit.visitDate)}</p>
            </div>
          ) : <div className="empty-panel mt-5">No hay visitas pendientes en agenda.</div>}
        </DashboardDisclosure>
      </div>
    </div>
  );
}
