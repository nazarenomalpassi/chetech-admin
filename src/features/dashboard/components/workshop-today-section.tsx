import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, CalendarClock, PackageSearch, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { WorkshopToday } from "@/features/dashboard/workshop-today";
import { getVisitTimeLabel } from "@/features/visits/model";
import type { getVisitsTodayDashboardSummary } from "@/features/visits/queries";
import { cn } from "@/lib/utils";

type VisitsSummary = Awaited<ReturnType<typeof getVisitsTodayDashboardSummary>>;

const workshop = "/reparaciones-access";

const stages = [
  {
    key: "review",
    label: "Para revisar",
    href: `${workshop}?view=ordenes&state=pendiente_revision`
  },
  {
    key: "waitingCustomer",
    label: "Esperando respuesta",
    href: `${workshop}?view=ordenes&scope=waiting_customer`
  },
  { key: "inProgress", label: "En trabajo", href: `${workshop}?view=ordenes&scope=approved` },
  { key: "ready", label: "Listos para retirar", href: `${workshop}?view=ordenes&scope=ready` },
  { key: "toReturn", label: "Para devolver", href: `${workshop}?view=ordenes&scope=return` }
] as const;

function formatLongDate(date: string) {
  const label = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function WorkshopTodaySection({
  today,
  visits,
  canCreateOrder
}: {
  today: WorkshopToday | null;
  visits: VisitsSummary;
  canCreateOrder: boolean;
}) {
  return (
    <section aria-labelledby="hoy-en-el-taller" className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" id="hoy-en-el-taller">
            Hoy en el taller
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {today ? (
              <>
                {formatLongDate(today.asOf)}.{" "}
                {plural(today.attention.open, "equipo en el local", "equipos en el local")}.
              </>
            ) : (
              "Estado actual del taller."
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {canCreateOrder ? (
            <Link className={buttonVariants()} href={`${workshop}?view=nueva` as Route}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              Nueva orden
            </Link>
          ) : null}
          <Link
            className={buttonVariants({ variant: "secondary" })}
            href={`${workshop}?view=ordenes` as Route}
          >
            Abrir la mesa de trabajo
          </Link>
        </div>
      </div>

      {today ? <StageRail today={today} /> : <TodayUnavailable />}

      <ul className="flex flex-col gap-x-6 gap-y-1.5 text-sm sm:flex-row sm:flex-wrap sm:items-center">
        {today && today.attention.over30Days > 0 ? (
          <li className="flex items-center gap-2 text-warning">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {plural(
              today.attention.over30Days,
              "equipo lleva más de 30 días en el local.",
              "equipos llevan más de 30 días en el local."
            )}
          </li>
        ) : null}
        {today && today.attention.blockedParts > 0 ? (
          <li>
            <Link
              className="flex items-center gap-2 text-foreground underline-offset-4 hover:underline"
              href={`${workshop}?view=repuestos` as Route}
            >
              <PackageSearch aria-hidden="true" className="h-4 w-4 shrink-0" />
              {plural(
                today.attention.blockedParts,
                "orden espera repuestos.",
                "órdenes esperan repuestos."
              )}
            </Link>
          </li>
        ) : null}
        <VisitsToday today={today?.asOf ?? null} visits={visits} />
      </ul>
    </section>
  );
}

function StageRail({ today }: { today: WorkshopToday }) {
  return (
    <div className="space-y-2">
      <ol
        aria-label="Equipos por etapa"
        className="grid divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-5 sm:divide-x sm:divide-y-0"
      >
        {stages.map((stage) => {
          const value = today.stages[stage.key];
          const highlighted = stage.key === "ready";
          return (
            <li key={stage.key}>
              <Link
                className={cn(
                  "flex h-full min-h-14 items-center justify-between gap-3 px-4 py-3 outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:min-h-24 sm:flex-col sm:items-start",
                  highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                    : "text-foreground hover:bg-muted"
                )}
                href={stage.href as Route}
              >
                <span
                  className={cn(
                    "text-sm font-medium",
                    highlighted ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {stage.label}
                </span>
                <span className="text-2xl leading-none font-semibold tabular-nums sm:text-3xl">
                  {value}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function VisitsToday({ visits, today }: { visits: VisitsSummary; today: string | null }) {
  const next = visits.nextVisit;
  const nextIsToday = Boolean(next && today && next.visitDate === today);

  return (
    <li className="flex min-w-0 items-center gap-2 text-muted-foreground">
      <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">
        {visits.todayCount
          ? `${plural(visits.todayCount, "visita hoy", "visitas hoy")}${
              next && nextIsToday
                ? `; la próxima, ${next.customerName} a las ${getVisitTimeLabel(next.timeFrom, next.timeTo)}`
                : ""
            }.`
          : "Sin visitas agendadas para hoy."}
      </span>
      <Link
        className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
        href={"/visitas" as Route}
      >
        Abrir visitas
      </Link>
    </li>
  );
}

function TodayUnavailable() {
  return (
    <Card
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      role="status"
    >
      <p className="text-sm text-muted-foreground">
        El resumen por etapa no está disponible en este momento. Los pendientes siguen en la mesa de
        trabajo.
      </p>
      <Link
        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}
        href={`${workshop}?view=ordenes` as Route}
      >
        Ver pendientes
      </Link>
    </Card>
  );
}
