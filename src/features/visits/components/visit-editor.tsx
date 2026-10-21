"use client";

import { DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveVisitAction, updateVisitStatusAction } from "../actions";
import { visitStatusLabels, type VisitRecord } from "../model";
import { parseVisitNotes, visitStatusValues } from "../schemas";
import { VisitDraftForm } from "./visit-draft-form";

export function VisitEditor({ visit, canManage, migrationReady, today, returnTo, ownerId, savedDraftToken, savedDraftVisitId, onClose, error }: {
  visit: VisitRecord | null; canManage: boolean; migrationReady: boolean; today: string; returnTo: string;
  ownerId?: string; savedDraftToken?: string; savedDraftVisitId?: string; onClose: () => void; error?: string;
}) {
  const checklist = parseVisitNotes(visit?.notes ?? "");
  return <DialogShell labelledBy="visit-editor-title" onClose={onClose} panelClassName="max-w-2xl">
    <VisitDraftForm ownerId={ownerId} visitId={visit?.id ?? "new"} sourceVersion={visit?.updatedAt ?? ""} savedDraftToken={savedDraftToken} savedDraftVisitId={savedDraftVisitId} action={canManage ? saveVisitAction : updateVisitStatusAction} className="grid gap-4 sm:grid-cols-2" footer={blocked => <div className="col-span-full flex flex-wrap justify-end gap-2 border-t border-graphite/10 pt-4">
      <Button onClick={onClose} type="button" variant="secondary">Cerrar</Button>
      <FormSubmitButton disabled={!migrationReady || blocked} idleLabel={visit ? "Guardar cambios" : "Guardar visita"} pendingLabel="Guardando..." />
    </div>}>
      <div className="col-span-full">
        <h2 className="text-xl font-semibold" id="visit-editor-title">{visit ? `Editar visita de ${visit.customerName}` : "Nueva visita"}</h2>
        {!visit ? <p className="mt-1 text-sm text-slate-600">Se guarda como pendiente. El estado se cambia despues desde la visita.</p> : null}
        {error ? <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      </div>
      <input name="id" type="hidden" value={visit?.id ?? ""} />
      <input name="expectedUpdatedAt" type="hidden" value={visit?.updatedAt ?? ""} />
      <input name="returnTo" type="hidden" value={returnTo} />
      {canManage ? <>
        <label className="grid gap-2 text-sm font-medium text-slate-700">Nombre del cliente<Input name="customerName" defaultValue={visit?.customerName ?? ""} autoComplete="name" required /></label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">Celular<Input name="customerPhone" defaultValue={visit?.customerPhone ?? ""} autoComplete="tel" type="tel" required /></label>
        <label className="col-span-full grid gap-2 text-sm font-medium text-slate-700">Domicilio<Input name="address" defaultValue={visit?.address ?? ""} autoComplete="street-address" required /></label>
        <label className="col-span-full grid gap-2 text-sm font-medium text-slate-700">Motivo de la visita<Input name="reason" defaultValue={visit?.reason ?? ""} placeholder="Ej: Buscar TV" list="visit-reason-options" required /></label>
        <datalist id="visit-reason-options">{["Buscar TV", "Buscar equipo", "Revisar TV", "Reparacion a domicilio", "Visita tecnica", "Otro"].map(reason => <option key={reason} value={reason} />)}</datalist>
        <label className="grid gap-2 text-sm font-medium text-slate-700">Fecha<Input name="visitDate" type="date" defaultValue={visit?.visitDate ?? today} required /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-2 text-sm font-medium text-slate-700">Hora desde<Input name="timeFrom" type="time" defaultValue={visit?.timeFrom.slice(0, 5) ?? "09:00"} required /></label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">Hora hasta<Input name="timeTo" type="time" defaultValue={visit?.timeTo.slice(0, 5) ?? "12:00"} required /></label>
        </div>
        <label className="grid gap-2 text-sm font-medium text-slate-700">Herramientas (opcional)<Select name="toolsRequired" defaultValue={checklist.toolsRequired} options={[{ value: "", label: "Sin indicar" }, { value: "no", label: "No hace falta" }, { value: "yes", label: "Si, llevar herramientas" }]} /></label>
        <label className="grid gap-2 text-sm font-medium text-slate-700">Cuales herramientas<Input name="toolsDetail" defaultValue={checklist.toolsDetail} maxLength={500} placeholder="Si elegiste Si: escalera, tester..." /></label>
        {visit?.repairAccessOrderId && !visit.repairNumber ? <>
          <input name="repairAccessOrderId" type="hidden" value={visit.repairAccessOrderId} />
          <p className="col-span-full text-sm text-slate-600">Se conserva la reparacion vinculada.</p>
        </> : <label className="col-span-full grid gap-2 text-sm font-medium text-slate-700">REP vinculada (opcional)<Input name="repairNumber" defaultValue={visit?.repairNumber ?? ""} placeholder="REP-000266 o 266" /></label>}
      </> : null}
      {visit ? <>
        <label className="grid gap-2 text-sm font-medium text-slate-700">Estado de la visita<Select name="status" defaultValue={visit.status} options={visitStatusValues.map(status => ({ value: status, label: visitStatusLabels[status] }))} /></label>
        {!canManage && checklist.toolsRequired ? <p className="col-span-full whitespace-pre-wrap text-sm text-slate-600">Herramientas: {checklist.toolsRequired === "yes" ? checklist.toolsDetail : "No hace falta"}</p> : null}
        <label className="col-span-full grid gap-2 text-sm font-medium text-slate-700">Observaciones<Textarea name="notes" defaultValue={checklist.notes} maxLength={2000} /></label>
      </> : <input name="notes" type="hidden" defaultValue="" />}
    </VisitDraftForm>
  </DialogShell>;
}
