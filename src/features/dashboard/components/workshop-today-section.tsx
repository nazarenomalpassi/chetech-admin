import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, CalendarClock, MessageCircle, PackageSearch, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { daysSince, type WorkshopToday } from "@/features/dashboard/workshop-today";
import { buildRepairAccessWhatsAppHref } from "@/features/repairs-access/whatsapp";
import { getVisitTimeLabel } from "@/features/visits/model";
import type { getVisitsTodayDashboardSummary } from "@/features/visits/queries";
import { cn, formatDate } from "@/lib/utils";

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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {today ? <ReadyQueue today={today} /> : null}
        <VisitsToday today={today?.asOf ?? null} visits={visits} />
      </div>
    </section>
  );
}

function StageRail({ today }: { today: WorkshopToday }) {
  const { attention } = today;

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

      {attention.over30Days > 0 || attention.blockedParts > 0 ? (
        <ul className="flex flex-col gap-x-6 gap-y-1 text-sm sm:flex-row sm:flex-wrap">
          {attention.over30Days > 0 ? (
            <li className="flex items-center gap-2 text-warning">
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
              {plural(
                attention.over30Days,
                "equipo lleva más de 30 días en el local.",
                "equipos llevan más de 30 días en el local."
              )}
            </li>
          ) : null}
          {attention.blockedParts > 0 ? (
            <li>
              <Link
                className="flex items-center gap-2 text-foreground underline-offset-4 hover:underline"
                href={`${workshop}?view=repuestos` as Route}
              >
                <PackageSearch aria-hidden="true" className="h-4 w-4 shrink-0" />
                {plural(
                  attention.blockedParts,
                  "orden espera repuestos.",
                  "órdenes esperan repuestos."
                )}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function ReadyQueue({ today }: { today: WorkshopToday }) {
  const orders = today.oldestReady;
  const total = today.stages.ready;

  return (
    <Card className="p-0 sm:p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="font-semibold text-foreground">Esperan retiro hace más tiempo</h2>
        {total > orders.length ? (
          <Link
            className="text-sm font-medium text-foreground underline underline-offset-4"
            href={`${workshop}?view=ordenes&scope=ready` as Route}
          >
            Ver los {total}
          </Link>
        ) : null}
      </div>
      {orders.length ? (
        <ul className="divide-y divide-border">
          {orders.map((order) => {
            const waitDays = daysSince(order.readyOn ?? order.intakeDate, today.asOf);
            const whatsapp = buildRepairAccessWhatsAppHref(
              {
                repairNumber: order.repairNumber ?? "",
                customerName: order.customerName,
                phone: order.phone,
                deviceLabel: order.device,
                budgetAmount: order.budgetAmount,
                finalAmount: order.finalAmount,
                status: "listo_para_retirar"
              },
              "ready"
            );
            return (
              <li
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:flex-nowrap sm:px-5"
                key={order.id}
              >
                <Link
                  className="w-28 shrink-0 font-mono text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  href={`${workshop}/orden/${order.id}` as Route}
                >
                  {order.repairNumber ?? "Sin número"}
                </Link>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium text-foreground">
                    {order.customerName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{order.device}</p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-sm tabular-nums",
                    waitDays !== null && waitDays > 30
                      ? "font-medium text-warning"
                      : "text-muted-foreground"
                  )}
                >
                  {waitDays === null
                    ? "Sin fecha"
                    : order.readyOn
                      ? `Listo hace ${plural(waitDays, "día", "días")}`
                      : `Ingresó hace ${plural(waitDays, "día", "días")}`}
                </p>
                {whatsapp ? (
                  <a
                    aria-label={`Avisar a ${order.customerName} por WhatsApp`}
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}
                    href={whatsapp}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <MessageCircle aria-hidden="true" className="h-4 w-4" />
                    Avisar
                  </a>
                ) : (
                  <span className="shrink-0 text-sm text-subtle-foreground">Sin teléfono</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
          No hay equipos esperando retiro.
        </p>
      )}
    </Card>
  );
}

function VisitsToday({ visits, today }: { visits: VisitsSummary; today: string | null }) {
  const next = visits.nextVisit;
  const nextIsLater = Boolean(next && today && next.visitDate !== today);

  return (
    <Card className="p-0 sm:p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="font-semibold text-foreground">Visitas de hoy</h2>
        <Link
          className="text-sm font-medium text-foreground underline underline-offset-4"
          href={"/visitas" as Route}
        >
          Abrir visitas
        </Link>
      </div>
      <div className="space-y-3 px-4 py-3 sm:px-5">
        <p className="text-sm text-muted-foreground">
          {visits.todayCount
            ? `${plural(visits.todayCount, "agendada", "agendadas")}; ${plural(visits.pendingCount, "pendiente", "pendientes")}.`
            : "Sin visitas agendadas para hoy."}
        </p>
        {next ? (
          <div className="flex gap-3 border-t border-border pt-3">
            <CalendarClock
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {nextIsLater ? "Próxima: " : ""}
                {next.customerName}
              </p>
              <p className="text-sm text-muted-foreground">
                {nextIsLater ? `${formatDate(next.visitDate)}, ` : ""}
                {getVisitTimeLabel(next.timeFrom, next.timeTo)}
                {next.address ? `. ${next.address}` : ""}
              </p>
              {next.reason ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{next.reason}</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
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
