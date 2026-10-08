"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { OperationsPagination } from "./operations-pagination";
import { VisitDraftForm } from "./visit-draft-form";
import type { PaginationMeta } from "@/lib/pagination";
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

function buildReturnTo(filters: { search: string; status: string; date: string; view: string; technicianId: string }, page = 1) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status !== "all") params.set("visitStatus", filters.status);
  if (filters.date) params.set("date", filters.date);
  if (filters.view !== "all") params.set("view", filters.view);
  if (filters.technicianId) params.set("technicianId", filters.technicianId);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/visitas?${query}` : "/visitas";
}

export function VisitsView({
  canDelete,
  canManage,
  draftOwnerId,
  savedDraftToken,
  savedDraftVisitId,
  data,
  message
}: {
  canDelete: boolean;
  canManage: boolean;
  draftOwnerId?: string;
  savedDraftToken?: string;
  savedDraftVisitId?: string;
  data: {
    migrationReady: boolean;
    today: string;
    technicians: Array<{ id: string; full_name: string }>;
    pagination?: PaginationMeta;
    filters: {
      search: string;
      status: string;
      date: string;
      view: string;
      technicianId: string;
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
  const returnTo = useMemo(() => buildReturnTo(data.filters, data.pagination?.page), [data.filters, data.pagination?.page]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-slate-950">Visitas</h1>
            <p className="mt-2 text-sm text-slate-600">
              Retiros, revisiones y reparaciones a domicilio.
            </p>
            <p className="mt-1 text-sm text-slate-500">Indicadores de esta pagina.</p>
          </div>

          <dl className="grid min-w-0 gap-4 sm:grid-cols-3">
            <div><dt className="text-sm text-slate-600">Visitas de hoy</dt><dd className="text-xl font-semibold">{data.summary.todayCount}</dd><dd className="text-sm text-slate-500">{data.summary.pendingTodayCount} pendientes</dd></div>
            <div><dt className="text-sm text-slate-600">Abiertas</dt><dd className="text-xl font-semibold">{data.summary.openCount}</dd><dd className="text-sm text-slate-500">Pendientes y confirmadas</dd></div>
            <div><dt className="text-sm text-slate-600">Proximas</dt><dd className="text-xl font-semibold">{data.summary.upcomingCount}</dd><dd className="text-sm text-slate-500">Despues de hoy</dd></div>
          </dl>
        </div>

        {!data.migrationReady ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Falta ejecutar la migracion de Visitas en Supabase para activar este modulo.
          </p>
        ) : null}

        {message ? (
          <p
            aria-live="polite"
            className={cn(
              "mt-4 rounded-xl px-4 py-3 text-sm",
              message.success ? "bg-brand-100 text-graphite" : "bg-rose-50 text-rose-700"
            )}
            role={message.success ? "status" : "alert"}
          >
            {message.message}
          </p>
        ) : null}

        {data.summary.nextVisit ? (
          <div className="mt-4 border-t border-graphite/10 pt-4">
            <p className="text-sm font-medium text-slate-600">Proxima salida</p>
            <p className="mt-1 font-semibold text-slate-950">
              {data.summary.nextVisit.customerName} | {formatDate(data.summary.nextVisit.visitDate)} |{" "}
              {getVisitTimeLabel(data.summary.nextVisit.timeFrom, data.summary.nextVisit.timeTo)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {data.summary.nextVisit.reason} | {data.summary.nextVisit.address}
            </p>
          </div>
        ) : null}

        {canManage ? (
        <VisitDraftForm key={editing ? `${editing.id}:${editing.updatedAt}` : "new"} ownerId={draftOwnerId} visitId={editing?.id ?? "new"} sourceVersion={editing?.updatedAt ?? ""} savedDraftToken={savedDraftToken} savedDraftVisitId={savedDraftVisitId} action={saveVisitAction} className="mt-5 grid gap-4 border-t border-graphite/10 pt-4 sm:grid-cols-2 xl:grid-cols-6">
          <h2 className="col-span-full text-lg font-semibold">{editing ? `Editar visita de ${editing.customerName}` : "Nueva visita"}</h2>
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <input name="expectedUpdatedAt" type="hidden" value={editing?.updatedAt ?? ""} />
          <input name="returnTo" type="hidden" value={returnTo} />

          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="visitTechnician">Tecnico asignado</label>
            <Select id="visitTechnician" name="technicianId" key={`${editing?.id}-technician`} defaultValue={editing?.technicianId ?? ""}
              options={[{ value: "", label: "Sin asignar" }, ...data.technicians.map((person) => ({ value: person.id, label: person.full_name }))]} />
            <p className="mt-1 text-sm text-slate-500">No puede tener visitas activas superpuestas.</p>
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="visitRep">REP vinculada (opcional)</label>
            <Input id="visitRep" name="repairNumber" key={`${editing?.id}-rep`} defaultValue={editing?.repairNumber ?? ""} placeholder="REP-000266 o 266" />
          </div>

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
          <div className="col-span-full flex flex-wrap items-end gap-2 sm:justify-end">
            {editing ? (
              <Button onClick={() => setEditing(null)} type="button" variant="secondary">
                Cancelar edicion
              </Button>
            ) : null}
            <FormSubmitButton disabled={!data.migrationReady} idleLabel={editing ? "Actualizar visita" : "Nueva visita"} pendingLabel="Guardando..." />
          </div>
        </VisitDraftForm>
        ) : editing ? (
          <VisitDraftForm key={`${editing.id}:${editing.updatedAt}`} ownerId={draftOwnerId} visitId={editing.id} sourceVersion={editing.updatedAt ?? ""} savedDraftToken={savedDraftToken} savedDraftVisitId={savedDraftVisitId} action={updateVisitStatusAction} className="mt-5 grid gap-4 border-t border-graphite/10 pt-4 sm:grid-cols-2">
            <h2 className="col-span-full text-lg font-semibold">Seguimiento de {editing.customerName}</h2>
            <input name="id" type="hidden" value={editing.id} />
            <input name="expectedUpdatedAt" type="hidden" value={editing.updatedAt ?? ""} />
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
          </VisitDraftForm>
        ) : null}
      </Card>

      <Card>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Agenda</h2>
          </div>
          <form className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-2 text-sm">Buscar visita<Input aria-label="Buscar visitas por cliente, celular o domicilio" defaultValue={data.filters.search} name="search" placeholder="Cliente, celular o domicilio" /></label>
            <label className="grid gap-2 text-sm">Estado<Select aria-label="Filtrar visitas por estado" defaultValue={data.filters.status} name="visitStatus" options={visitStatusOptions} /></label>
            <label className="grid gap-2 text-sm">Fecha de agenda<Input aria-label="Filtrar visitas por fecha" defaultValue={data.filters.date} name="date" type="date" /></label>
            <label className="grid gap-2 text-sm">Periodo<Select aria-label="Vista de agenda" name="view" defaultValue={data.filters.view} options={[{ value: "all", label: "Todas / fecha exacta" }, { value: "day", label: "Dia seleccionado" }, { value: "week", label: "Semana (lunes a domingo)" }]} /></label>
            <label className="grid gap-2 text-sm">Tecnico<Select aria-label="Filtrar por tecnico" name="technicianId" defaultValue={data.filters.technicianId} options={[{ value: "", label: "Todos los tecnicos" }, { value: "unassigned", label: "Sin asignar" }, ...data.technicians.map((person) => ({ value: person.id, label: person.full_name }))]} /></label>
            <button className={cn(buttonVariants({ variant: "default" }), "w-full self-end")} type="submit">
              Filtrar
            </button>
            <div className="flex gap-2">
              <Link className={cn(buttonVariants({ variant: "secondary" }), "w-full")} href={`/visitas?date=${data.today}`}>
                Hoy
              </Link>
              <Link className={cn(buttonVariants({ variant: "secondary" }), "w-full")} href={`/visitas?date=${data.today}&view=week`}>
                Semana
              </Link>
              <Link className={cn(buttonVariants({ variant: "secondary" }), "w-full")} href="/visitas">
                Limpiar
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-4 divide-y divide-graphite/10 lg:hidden">
          {data.visits.length ? (
            data.visits.map((visit) => (
              <article className="py-4" key={visit.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{visit.customerName}</p>
                    <p className="mt-1 text-sm text-slate-500">{visit.customerPhone}</p>
                    <p className="mt-2 text-sm text-slate-600">{visit.address}</p>
                    <a
                      className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-slate-950 underline underline-offset-4"
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
                  <p><span className="font-medium text-slate-900">Tecnico:</span> {visit.technicianName || "Sin asignar"}</p>
                  {visit.repairNumber ? <p>REP: {visit.repairNumber}</p> : null}
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
                      <input name="expectedUpdatedAt" type="hidden" value={visit.updatedAt ?? ""} />
                      <input name="returnTo" type="hidden" value={returnTo} />
                      <Button className="w-full" disabled={!data.migrationReady} type="submit" variant="secondary">
                        Marcar realizada
                      </Button>
                    </form>
                  ) : null}
                  {visit.status !== "cancelada" || canDelete ? <ActionMenu label="Más acciones">
                  {visit.status !== "cancelada" ? (
                    <form action={updateVisitStatusAction}>
                      <input name="id" type="hidden" value={visit.id} />
                      <input name="status" type="hidden" value="cancelada" />
                      <input name="expectedUpdatedAt" type="hidden" value={visit.updatedAt ?? ""} />
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
                        Cancelar y conservar
                      </Button>
                    </form>
                  ) : null}
                  </ActionMenu> : null}
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
                      className="mt-1 inline-flex min-h-11 items-center font-medium text-slate-950 underline underline-offset-4"
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Maps
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(visit.visitDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{getVisitTimeLabel(visit.timeFrom, visit.timeTo)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{visit.reason}</p>
                    <p className="mt-1 text-sm">Tecnico: {visit.technicianName || "Sin asignar"}</p>
                    {visit.repairNumber ? <p className="mt-1 whitespace-nowrap text-sm">{visit.repairNumber}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getVisitStatusVariant(visit.status)}>{visitStatusLabels[visit.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button onClick={() => setEditing(visit)} size="sm" type="button" variant="secondary">
                        {canManage ? "Editar" : "Actualizar"}
                      </Button>
                      {visit.status !== "realizada" ? (
                        <form action={updateVisitStatusAction}>
                          <input name="id" type="hidden" value={visit.id} />
                          <input name="status" type="hidden" value="realizada" />
                          <input name="expectedUpdatedAt" type="hidden" value={visit.updatedAt ?? ""} />
                          <input name="returnTo" type="hidden" value={returnTo} />
                          <Button disabled={!data.migrationReady} size="sm" type="submit" variant="secondary">
                            Realizada
                          </Button>
                        </form>
                      ) : null}
                      {visit.status !== "cancelada" || canDelete ? <ActionMenu label="Más acciones">
                      {visit.status !== "cancelada" ? (
                        <form action={updateVisitStatusAction}>
                          <input name="id" type="hidden" value={visit.id} />
                          <input name="status" type="hidden" value="cancelada" />
                          <input name="expectedUpdatedAt" type="hidden" value={visit.updatedAt ?? ""} />
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
                            Cancelar y conservar
                          </Button>
                        </form>
                      ) : null}
                      </ActionMenu> : null}
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
        {data.pagination ? <OperationsPagination pagination={data.pagination} baseHref={returnTo} /> : null}
      </Card>
    </div>
  );
}
