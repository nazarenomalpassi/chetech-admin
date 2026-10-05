"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CalendarRange, ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteVisitAction, saveVisitAction, updateVisitStatusAction } from "@/features/visits/actions";
import { getVisitTimeLabel, visitStatusLabels, type VisitRecord } from "@/features/visits/model";
import { visitStatusValues } from "@/features/visits/schemas";
import type { ActionResult } from "@/lib/form-state";
import { cn, formatDate, getLocalDateInputValue } from "@/lib/utils";

const visitReasonSuggestions = [
  "Buscar TV",
  "Buscar equipo",
  "Revisar TV",
  "Reparacion a domicilio",
  "Visita tecnica",
  "Otro"
];

const visitStatusOptions = [
  { label: "Todos los estados", value: "all" },
  ...visitStatusValues.map((status) => ({
    label: visitStatusLabels[status],
    value: status
  }))
];

function getVisitStatusVariant(status: VisitRecord["status"]) {
  if (status === "realizada") return "success" as const;
  if (status === "cancelada") return "danger" as const;
  if (status === "pendiente") return "warning" as const;
  return "default" as const;
}

function buildReturnTo(filters: { search: string; status: string; date: string }) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "all") params.set("visitStatus", filters.status);
  if (filters.date) params.set("date", filters.date);
  const query = params.toString();
  return query ? `/visitas?${query}` : "/visitas";
}

export function VisitsView({
  canDelete,
  canManage,
  data,
  message
}: {
  canDelete: boolean;
  canManage: boolean;
  data: {
    migrationReady: boolean;
    today: string;
    filters: {
      search: string;
      status: string;
      date: string;
    };
    visits: VisitRecord[];
    summary: {
      todayCount: number;
      pendingTodayCount: number;
      openCount: number;
      upcomingCount: number;
      nextVisit: VisitRecord | null;
    };
  };
  message: ActionResult | null;
}) {
  const [editing, setEditing] = useState<VisitRecord | null>(null);
  const returnTo = useMemo(() => buildReturnTo(data.filters), [data.filters]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-5 min-[1600px]:flex-row min-[1600px]:items-start min-[1600px]:justify-between">
          <div className="max-w-2xl">
            <p className="panel-kicker">Agenda operativa</p>
            <h1 className="panel-heading mt-3">Visitas</h1>
            <p className="panel-subheading mt-3">
              Agenda salidas a domicilio del local para retiros, revisiones y reparaciones sin perder de vista lo que toca hoy.
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-3 min-[1600px]:min-w-[34rem]">
            <MetricCard icon={CalendarDays} label="Visitas de hoy" tone="service" value={data.summary.todayCount} description={`Pendientes hoy: ${data.summary.pendingTodayCount}`} />
            <MetricCard icon={ClipboardList} label="Abiertas" tone="warning" value={data.summary.openCount} description="Pendientes y confirmadas" />
            <MetricCard icon={CalendarRange} label="Proximas" tone="income" value={data.summary.upcomingCount} description="Programadas despues de hoy" />
          </div>
        </div>

        {!data.migrationReady ? (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Falta ejecutar la migracion de Visitas en Supabase para activar este modulo.
          </p>
        ) : null}

        {message ? (
          <p
            aria-live="polite"
            className={cn(
              "mt-4 rounded-2xl px-4 py-3 text-sm",
              message.success ? "bg-brand-100 text-graphite" : "bg-rose-50 text-rose-700"
            )}
            role={message.success ? "status" : "alert"}
          >
            {message.message}
          </p>
        ) : null}

        {data.summary.nextVisit ? (
          <div className="mt-5 rounded-[24px] border border-graphite/8 bg-white/84 px-4 py-4 shadow-[0_8px_18px_rgba(20,20,19,0.04)]">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Proxima salida</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">
              {data.summary.nextVisit.customerName} | {formatDate(data.summary.nextVisit.visitDate)} |{" "}
              {getVisitTimeLabel(data.summary.nextVisit.timeFrom, data.summary.nextVisit.timeTo)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {data.summary.nextVisit.reason} | {data.summary.nextVisit.address}
            </p>
          </div>
        ) : null}

        {canManage ? (
        <form action={saveVisitAction} className="mt-6 grid gap-4 xl:grid-cols-6">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <input name="returnTo" type="hidden" value={returnTo} />

          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="customerName">Nombre del cliente</label>
            <Input
              defaultValue={editing?.customerName ?? ""}
              key={`${editing?.id}-customer`}
              name="customerName"
              placeholder="Ej: Juan Perez"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="customerPhone">Celular</label>
            <Input
              defaultValue={editing?.customerPhone ?? ""}
              key={`${editing?.id}-phone`}
              name="customerPhone"
              placeholder="341..."
            />
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="address">Domicilio</label>
            <Input
              defaultValue={editing?.address ?? ""}
              key={`${editing?.id}-address`}
              name="address"
              placeholder="Calle, numero y referencia"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="status">Estado</label>
            <Select
              defaultValue={editing?.status ?? "pendiente"}
              key={`${editing?.id}-status`}
              name="status"
              options={visitStatusValues.map((status) => ({
                label: visitStatusLabels[status],
                value: status
              }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="visitDate">Fecha</label>
            <Input
              defaultValue={editing?.visitDate ?? data.today ?? getLocalDateInputValue()}
              key={`${editing?.id}-date`}
              name="visitDate"
              type="date"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="timeFrom">Hora desde</label>
            <Input
              defaultValue={editing?.timeFrom ?? "09:00"}
              key={`${editing?.id}-from`}
              name="timeFrom"
              type="time"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="timeTo">Hora hasta</label>
            <Input
              defaultValue={editing?.timeTo ?? "12:00"}
              key={`${editing?.id}-to`}
              name="timeTo"
              type="time"
            />
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="reason">Motivo de la visita</label>
            <Input
              defaultValue={editing?.reason ?? ""}
              key={`${editing?.id}-reason`}
              list="visit-reason-options"
              name="reason"
              placeholder="Ej: Buscar TV"
            />
            <datalist id="visit-reason-options">
              {visitReasonSuggestions.map((reason) => (
                <option key={reason} value={reason} />
              ))}
            </datalist>
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="notes">Observaciones</label>
            <Textarea
              defaultValue={editing?.notes ?? ""}
              key={`${editing?.id}-notes`}
              name="notes"
              placeholder="Opcional"
            />
          </div>
          <div className="flex items-end gap-2 xl:col-span-6 xl:justify-end">
            {editing ? (
              <Button onClick={() => setEditing(null)} type="button" variant="secondary">
                Cancelar edicion
              </Button>
            ) : null}
            <Button disabled={!data.migrationReady} type="submit">
              {editing ? "Actualizar visita" : "Nueva visita"}
            </Button>
          </div>
        </form>
        ) : editing ? (
          <form action={updateVisitStatusAction} className="mt-6 grid gap-4 rounded-[24px] border border-graphite/10 bg-white/80 p-4 sm:grid-cols-2">
            <input name="id" type="hidden" value={editing.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="technicianVisitStatus">
                Estado de la visita
              </label>
              <Select
                defaultValue={editing.status}
                id="technicianVisitStatus"
                name="status"
                options={visitStatusValues.map((status) => ({
                  label: visitStatusLabels[status],
                  value: status
                }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="technicianVisitNotes">
                Observaciones del tecnico
              </label>
              <Textarea defaultValue={editing.notes} id="technicianVisitNotes" name="notes" placeholder="Trabajo realizado, resultado o novedad" />
            </div>
            <div className="flex gap-2 sm:col-span-2 sm:justify-end">
              <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancelar</Button>
              <Button type="submit">Guardar seguimiento</Button>
            </div>
          </form>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-col gap-4 min-[1600px]:flex-row min-[1600px]:items-end min-[1600px]:justify-between">
          <div>
            <p className="panel-kicker">Filtro rapido</p>
            <h2 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.04em] text-slate-950">Agenda cargada</h2>
            <p className="mt-2 text-sm text-slate-500">
              Busca por cliente, celular o domicilio y enfoca rapido las visitas del dia.
            </p>
          </div>
          <form className="grid min-w-0 gap-3 sm:grid-cols-2 min-[1600px]:grid-cols-[minmax(0,240px)_180px_180px_auto_auto]">
            <Input aria-label="Buscar visitas por cliente, celular o domicilio" defaultValue={data.filters.search} name="search" placeholder="Cliente, celular o domicilio" />
            <Select aria-label="Filtrar visitas por estado" defaultValue={data.filters.status} name="visitStatus" options={visitStatusOptions} />
            <Input aria-label="Filtrar visitas por fecha" defaultValue={data.filters.date} name="date" type="date" />
            <button className={cn(buttonVariants({ variant: "default" }), "w-full")} type="submit">
              Filtrar
            </button>
            <div className="flex gap-2">
              <Link className={cn(buttonVariants({ variant: "secondary" }), "w-full")} href={`/visitas?date=${data.today}`}>
                Hoy
              </Link>
              <Link className={cn(buttonVariants({ variant: "secondary" }), "w-full")} href="/visitas">
                Limpiar
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-5 grid gap-3 lg:hidden">
          {data.visits.length ? (
            data.visits.map((visit) => (
              <article className="rounded-[22px] border border-slate-100 bg-white px-4 py-4" key={visit.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{visit.customerName}</p>
                    <p className="mt-1 text-sm text-slate-500">{visit.customerPhone}</p>
                    <p className="mt-2 text-sm text-slate-600">{visit.address}</p>
                    <a
                      className="mt-2 inline-flex text-sm font-semibold text-slate-950 underline underline-offset-4"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Abrir ubicacion
                    </a>
                  </div>
                  <Badge variant={getVisitStatusVariant(visit.status)}>{visitStatusLabels[visit.status]}</Badge>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-600">
                  <p><span className="font-medium text-slate-900">Fecha:</span> {formatDate(visit.visitDate)}</p>
                  <p><span className="font-medium text-slate-900">Horario:</span> {getVisitTimeLabel(visit.timeFrom, visit.timeTo)}</p>
                  <p><span className="font-medium text-slate-900">Motivo:</span> {visit.reason}</p>
                  <p><span className="font-medium text-slate-900">Obs.:</span> {visit.notes || "-"}</p>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => setEditing(visit)} type="button" variant="secondary">
                    {canManage ? "Editar" : "Actualizar visita"}
                  </Button>
                  {visit.status !== "realizada" ? (
                    <form action={updateVisitStatusAction}>
                      <input name="id" type="hidden" value={visit.id} />
                      <input name="status" type="hidden" value="realizada" />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <Button className="w-full" disabled={!data.migrationReady} type="submit" variant="secondary">
                        Marcar realizada
                      </Button>
                    </form>
                  ) : null}
                  {visit.status !== "cancelada" ? (
                    <form action={updateVisitStatusAction}>
                      <input name="id" type="hidden" value={visit.id} />
                      <input name="status" type="hidden" value="cancelada" />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <Button className="w-full" disabled={!data.migrationReady} type="submit" variant="secondary">
                        Cancelar
                      </Button>
                    </form>
                  ) : null}
                  {canDelete ? (
                    <form action={deleteVisitAction}>
                      <input name="id" type="hidden" value={visit.id} />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <Button className="w-full" disabled={!data.migrationReady} type="submit" variant="danger">
                        Eliminar
                      </Button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <div className="empty-panel">Todavia no cargaste visitas para este filtro.</div>
          )}
        </div>

        <div className="mt-5 hidden overflow-x-auto lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Celular</th>
                <th className="px-4 py-3 font-medium">Domicilio</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Horario</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.visits.map((visit) => (
                <tr className="border-t border-slate-100" key={visit.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{visit.customerName}</td>
                  <td className="px-4 py-3 text-slate-600">{visit.customerPhone}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="block">{visit.address}</span>
                    <a
                      className="mt-1 inline-flex font-semibold text-slate-950 underline underline-offset-4"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Maps
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(visit.visitDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{getVisitTimeLabel(visit.timeFrom, visit.timeTo)}</td>
                  <td className="px-4 py-3 text-slate-600">{visit.reason}</td>
                  <td className="px-4 py-3">
                    <Badge variant={getVisitStatusVariant(visit.status)}>{visitStatusLabels[visit.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setEditing(visit)} size="sm" type="button" variant="secondary">
                        {canManage ? "Editar" : "Actualizar"}
                      </Button>
                      {visit.status !== "realizada" ? (
                        <form action={updateVisitStatusAction}>
                          <input name="id" type="hidden" value={visit.id} />
                          <input name="status" type="hidden" value="realizada" />
                          <input name="returnTo" type="hidden" value={returnTo} />
                          <Button disabled={!data.migrationReady} size="sm" type="submit" variant="secondary">
                            Realizada
                          </Button>
                        </form>
                      ) : null}
                      {visit.status !== "cancelada" ? (
                        <form action={updateVisitStatusAction}>
                          <input name="id" type="hidden" value={visit.id} />
                          <input name="status" type="hidden" value="cancelada" />
                          <input name="returnTo" type="hidden" value={returnTo} />
                          <Button disabled={!data.migrationReady} size="sm" type="submit" variant="secondary">
                            Cancelar
                          </Button>
                        </form>
                      ) : null}
                      {canDelete ? (
                        <form action={deleteVisitAction}>
                          <input name="id" type="hidden" value={visit.id} />
                          <input name="returnTo" type="hidden" value={returnTo} />
                          <Button disabled={!data.migrationReady} size="sm" type="submit" variant="danger">
                            Eliminar
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!data.visits.length ? (
            <div className="border-t border-slate-100 bg-white px-4 py-8 text-sm text-slate-500">
              Todavia no cargaste visitas para este filtro.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
