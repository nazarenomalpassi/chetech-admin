"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { deleteVisitAction, updateVisitStatusAction } from "../actions";
import { getVisitTimeLabel, visitStatusLabels, type VisitRecord } from "../model";
import { parseVisitNotes, visitStatusValues } from "../schemas";
import type { PaginationMeta } from "@/lib/pagination";
import type { ActionResult } from "@/lib/form-state";
import { cn, formatDate } from "@/lib/utils";
import { OperationsPagination } from "./operations-pagination";
import { VisitEditor } from "./visit-editor";

const statusOptions = visitStatusValues.map(status => ({ label: visitStatusLabels[status], value: status }));

function VisitNotes({ notes }: { notes: string }) {
  const checklist = parseVisitNotes(notes);
  return <div className="space-y-1 whitespace-pre-wrap break-words text-sm text-slate-600">
    {checklist.toolsRequired ? <p><span className="font-medium text-slate-900">Herramientas:</span> {checklist.toolsRequired === "yes" ? checklist.toolsDetail : "No hace falta"}</p> : null}
    {checklist.notes ? <p><span className="font-medium text-slate-900">Obs.:</span> {checklist.notes}</p> : null}
  </div>;
}

function VisitActions({ visit, ready, returnTo, canDelete, canManage, onEdit }: { visit: VisitRecord; ready: boolean; returnTo: string; canDelete: boolean; canManage: boolean; onEdit: () => void }) {
  const statusId = useId();
  return <div className="flex flex-wrap items-end gap-2">
    <Button onClick={onEdit} type="button" variant="secondary">{canManage ? "Editar" : "Actualizar visita"}</Button>
    {canDelete ? <ActionMenu label="Mas acciones">
      <form action={deleteVisitAction} onSubmit={event => {
        if (!window.confirm("Queres cancelar esta visita? Se conservaran todos los datos y el historial.")) event.preventDefault();
      }}>
        <input name="id" type="hidden" value={visit.id} />
        <input name="expectedUpdatedAt" type="hidden" value={visit.updatedAt ?? ""} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <FormSubmitButton disabled={!ready} variant="danger" idleLabel="Cancelar y conservar" pendingLabel="Cancelando..." />
      </form>
    </ActionMenu> : null}
    <form action={updateVisitStatusAction} className="flex min-w-0 basis-full items-end gap-2 sm:flex-1 sm:basis-auto">
      <input name="id" type="hidden" value={visit.id} />
      <input name="expectedUpdatedAt" type="hidden" value={visit.updatedAt ?? ""} />
      <input name="returnTo" type="hidden" value={returnTo} />
      <label className="grid min-w-0 flex-1 gap-1 text-sm text-slate-600">
        <span className="sr-only">Estado de {visit.customerName}</span>
        <Select id={statusId} name="status" defaultValue={visit.status} key={`${visit.id}:${visit.updatedAt}:${visit.status}`} options={statusOptions} />
      </label>
      <FormSubmitButton disabled={!ready} idleLabel="Cambiar estado" pendingLabel="Guardando..." />
    </form>
  </div>;
}

function VisitLocation({ address }: { address: string }) {
  return <a className="inline-flex min-h-11 items-center text-sm font-medium text-slate-950 underline underline-offset-4" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} rel="noreferrer" target="_blank">Abrir ubicacion</a>;
}

function VisitStatus({ status }: { status: VisitRecord["status"] }) {
  return <Badge variant={status === "realizada" ? "success" : status === "cancelada" ? "danger" : status === "pendiente" ? "warning" : "default"}>{visitStatusLabels[status]}</Badge>;
}

export function VisitsView({ canManage, canDelete, canUpdate = canManage, draftOwnerId, savedDraftToken, savedDraftVisitId, data, message }: {
  canDelete: boolean;
  canManage: boolean;
  canUpdate?: boolean;
  draftOwnerId?: string;
  savedDraftToken?: string;
  savedDraftVisitId?: string;
  data: {
    migrationReady: boolean;
    today: string;
    technicians: Array<{ id: string; full_name: string }>;
    pagination?: PaginationMeta;
    filters: { search: string; status: string; date: string; view: string; technicianId: string };
    visits: VisitRecord[];
    summary: { todayCount: number; pendingTodayCount: number; openCount: number; upcomingCount: number; nextVisit: VisitRecord | null };
  };
  message: ActionResult | null;
}) {
  const [editor, setEditor] = useState<{ visit: VisitRecord | null } | null>(null);
  useEffect(() => {
    if (savedDraftToken && savedDraftVisitId) setEditor(null);
  }, [savedDraftToken, savedDraftVisitId]);
  const params = new URLSearchParams();
  if (data.filters.search) params.set("search", data.filters.search);
  if (data.filters.status !== "all") params.set("visitStatus", data.filters.status);
  if (data.filters.date) params.set("date", data.filters.date);
  if (data.filters.view !== "all") params.set("view", data.filters.view);
  if (data.pagination && data.pagination.page > 1) params.set("page", String(data.pagination.page));
  const returnTo = params.size ? `/visitas?${params}` : "/visitas";

  return <div className="space-y-4">
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Visitas</h1>
          <p className="mt-1 text-sm text-slate-600">Retiros, revisiones y reparaciones a domicilio.</p>
        </div>
        {canManage ? <Button disabled={!data.migrationReady} onClick={() => setEditor({ visit: null })} type="button">Nueva visita</Button> : null}
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-graphite/10 pt-3 text-sm">
        <div><dt className="inline text-slate-600">Hoy: </dt><dd className="inline font-semibold">{data.summary.todayCount} ({data.summary.pendingTodayCount} pendientes)</dd></div>
        <div><dt className="inline text-slate-600">Abiertas: </dt><dd className="inline font-semibold">{data.summary.openCount}</dd></div>
        <div><dt className="inline text-slate-600">Proximas: </dt><dd className="inline font-semibold">{data.summary.upcomingCount}</dd></div>
      </dl>
      <p className="mt-1 text-xs text-slate-500">Indicadores de esta pagina, no del historial completo.</p>
      {!data.migrationReady ? <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Falta activar Visitas para guardar cambios.</p> : null}
      {message && !editor ? <p aria-live="polite" role={message.success ? "status" : "alert"} className={cn("mt-4 rounded-xl p-3 text-sm", message.success ? "bg-brand-100 text-graphite" : "bg-rose-50 text-rose-700")}>{message.message}</p> : null}
      {data.summary.nextVisit ? <div className="mt-3 border-t border-graphite/10 pt-3 text-sm">
        <p className="font-medium text-slate-600">Proxima salida de esta pagina</p>
        <p className="mt-1 font-semibold">{data.summary.nextVisit.customerName} | {formatDate(data.summary.nextVisit.visitDate)} | {getVisitTimeLabel(data.summary.nextVisit.timeFrom, data.summary.nextVisit.timeTo)}</p>
        <p className="mt-1 text-slate-600">{data.summary.nextVisit.reason} | {data.summary.nextVisit.address}</p>
      </div> : null}
    </Card>

    <Card>
      <h2 className="text-lg font-semibold">Visitas guardadas</h2>
      <form className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm">Buscar visita<Input defaultValue={data.filters.search} name="search" placeholder="Cliente, celular o domicilio" /></label>
        <label className="grid gap-2 text-sm">Estado<Select defaultValue={data.filters.status} name="visitStatus" options={[{ label: "Todos los estados", value: "all" }, ...statusOptions]} /></label>
        <label className="grid gap-2 text-sm">Fecha de agenda<Input defaultValue={data.filters.date} name="date" type="date" /></label>
        <label className="grid gap-2 text-sm">Periodo<Select name="view" defaultValue={data.filters.view} options={[{ value: "all", label: "Todas / fecha exacta" }, { value: "day", label: "Dia seleccionado" }, { value: "week", label: "Semana (lunes a domingo)" }]} /></label>
        <div className="col-span-full flex flex-wrap gap-2">
          <Button type="submit" variant="secondary">Filtrar</Button>
          <Link className={buttonVariants({ variant: "ghost" })} href={`/visitas?date=${data.today}`}>Hoy</Link>
          <Link className={buttonVariants({ variant: "ghost" })} href={`/visitas?date=${data.today}&view=week`}>Semana</Link>
          <Link className={buttonVariants({ variant: "ghost" })} href="/visitas">Limpiar</Link>
        </div>
      </form>

      <div className="mt-4 divide-y divide-graphite/10 lg:hidden">
        {data.visits.map(visit => <article className="space-y-3 py-4" key={visit.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h3 className="break-words font-semibold">{visit.customerName}</h3><p className="mt-1 text-sm text-slate-600">{visit.customerPhone}</p></div>
            <VisitStatus status={visit.status} />
          </div>
          <p className="text-sm font-medium">{formatDate(visit.visitDate)} | {getVisitTimeLabel(visit.timeFrom, visit.timeTo)}</p>
          <div className="text-sm text-slate-600"><p className="break-words">{visit.address}</p><VisitLocation address={visit.address} /><p className="break-words">{visit.reason}</p></div>
          {visit.repairNumber ? <p className="text-sm">{visit.repairNumber}</p> : null}
          <VisitNotes notes={visit.notes} />
          {canUpdate ? <VisitActions visit={visit} ready={data.migrationReady} returnTo={returnTo} canDelete={canDelete} canManage={canManage} onEdit={() => setEditor({ visit })} /> : null}
        </article>)}
      </div>
      <div className="mt-4 hidden overflow-x-auto lg:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600"><tr>
            <th scope="col" className="px-3 py-3 font-medium">Cliente y domicilio</th>
            <th scope="col" className="px-3 py-3 font-medium">Fecha y horario</th>
            <th scope="col" className="px-3 py-3 font-medium">Motivo y notas</th>
            <th scope="col" className="px-3 py-3 font-medium">Estado y acciones</th>
          </tr></thead>
          <tbody>{data.visits.map(visit => <tr className="border-t border-slate-100 align-top" key={visit.id}>
            <td className="px-3 py-3"><p className="font-semibold">{visit.customerName}</p><p className="mt-1 text-slate-600">{visit.customerPhone}</p><p className="mt-2 break-words text-slate-600">{visit.address}</p><VisitLocation address={visit.address} /></td>
            <td className="whitespace-nowrap px-3 py-3"><p>{formatDate(visit.visitDate)}</p><p className="mt-1 text-slate-600">{getVisitTimeLabel(visit.timeFrom, visit.timeTo)}</p></td>
            <td className="max-w-sm space-y-2 px-3 py-3"><p className="break-words">{visit.reason}</p>{visit.repairNumber ? <p>{visit.repairNumber}</p> : null}<VisitNotes notes={visit.notes} /></td>
            <td className="min-w-80 space-y-3 px-3 py-3"><VisitStatus status={visit.status} />{canUpdate ? <VisitActions visit={visit} ready={data.migrationReady} returnTo={returnTo} canDelete={canDelete} canManage={canManage} onEdit={() => setEditor({ visit })} /> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!data.visits.length ? <div className="empty-panel mt-4">No hay visitas para estos filtros. Proba otra fecha o usa Nueva visita para agendar una salida.</div> : null}
      {data.pagination ? <OperationsPagination pagination={data.pagination} baseHref={returnTo} /> : null}
    </Card>
    {editor && canUpdate ? <VisitEditor key={editor.visit ? `${editor.visit.id}:${editor.visit.updatedAt}` : "new"} visit={editor.visit} canManage={canManage} migrationReady={data.migrationReady} today={data.today} returnTo={returnTo} ownerId={draftOwnerId} savedDraftToken={savedDraftToken} savedDraftVisitId={savedDraftVisitId} error={message?.success === false ? message.message : undefined} onClose={() => setEditor(null)} /> : null}
  </div>;
}
