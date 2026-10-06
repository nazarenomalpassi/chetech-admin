"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { markRepairOutsourcingRetrievedAction, recordRepairOutsourcingQualityAction, updateRepairOutsourcingFollowupAction } from "@/features/outsourcings/actions";
import type { RepairOutsourcingRecord } from "@/features/outsourcings/queries";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

export function OutsourcingOperations({ record, returnTo = "/terciarizaciones" }: { record: RepairOutsourcingRecord; returnTo?: string }) {
  const [mode, setMode] = useState<"followup" | "return" | "quality" | null>(null);
  return <div className="space-y-3">
    <div className="space-y-1 text-sm text-slate-600">
      <p>Responsable: {record.responsibleName || "Sin asignar"}</p>
      <p>Promesa: {record.promisedAt ? formatDate(record.promisedAt) : "Sin fecha"}</p>
      {record.overdue ? <p className="font-semibold text-rose-700">Vencida: consultar al taller externo</p> : null}
      <p>Costo previsto: {record.expectedCost == null ? "Sin informar" : formatCurrency(record.expectedCost)}</p>
      <p>Costo final: {record.actualCost == null ? "Sin informar" : formatCurrency(record.actualCost)}</p>
      {record.status === "retirado" ? <p>Control: {record.qualityStatus === "pendiente" ? "Pendiente de control" : record.qualityStatus === "aprobado" ? "Aprobado" : "Con observaciones"}</p> : null}
      {record.qualityNotes ? <p className="whitespace-pre-line">{record.qualityNotes}</p> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      {record.status === "en_taller" ? <>
        <Button type="button" variant="secondary" onClick={() => setMode("followup")}>Seguimiento</Button>
        <Button type="button" onClick={() => setMode("return")}>Registrar retorno</Button>
      </> : record.status === "retirado" ? <Button type="button" variant="secondary" onClick={() => setMode("quality")}>Registrar control</Button> : null}
    </div>
    {mode ? <DialogShell labelledBy={`outsourcing-${record.id}-${mode}`} onClose={() => setMode(null)} panelClassName="max-w-2xl">
      <h2 id={`outsourcing-${record.id}-${mode}`} className="text-xl font-semibold text-slate-950">{record.order.repairNumber}: {mode === "followup" ? "Seguimiento del tercero" : mode === "return" ? "Retorno al local" : "Control de calidad"}</h2>
      <p className="mt-2 text-sm text-slate-500">Volver del tercero no entrega el equipo al cliente ni registra un pago.</p>
      <form key={mode} action={mode === "followup" ? updateRepairOutsourcingFollowupAction : mode === "return" ? markRepairOutsourcingRetrievedAction : recordRepairOutsourcingQualityAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={record.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="expectedUpdatedAt" value={record.updatedAt} />
        {mode === "followup" ? <>
          <label className="grid gap-2 text-sm">Responsable<Input name="responsibleName" required maxLength={120} defaultValue={record.responsibleName} /></label>
          <label className="grid gap-2 text-sm">Fecha prometida<Input name="promisedAt" type="date" min={record.sentAt} defaultValue={record.promisedAt} /></label>
          <label className="grid gap-2 text-sm">Costo previsto (no es un pago)<Input name="expectedCost" type="number" step="0.01" min="0" defaultValue={record.expectedCost ?? ""} /></label>
          <label className="grid gap-2 text-sm sm:col-span-2">Novedad de la consulta<Textarea name="notes" maxLength={2000} placeholder="Respuesta del taller, compromiso o demora" /></label>
        </> : <>
          {mode === "return" ? <>
            <label className="grid gap-2 text-sm">Fecha de retorno<Input name="retrievedAt" type="date" required min={record.sentAt} defaultValue={getLocalDateInputValue()} /></label>
            <label className="grid gap-2 text-sm">Costo final (no registra egreso)<Input name="actualCost" type="number" min="0" step="0.01" defaultValue={record.actualCost ?? ""} /></label>
          </> : null}
          <label className="grid gap-2 text-sm">Resultado del control<Select name="qualityStatus" defaultValue={mode === "return" ? "pendiente" : "aprobado"} options={[...(mode === "return" ? [{ value: "pendiente", label: "Pendiente de pruebas" }] : []), { value: "aprobado", label: "Pruebas aprobadas" }, { value: "observado", label: "Con observaciones / retrabajo" }]} /></label>
          <label className="grid gap-2 text-sm sm:col-span-2">Pruebas y observaciones<Textarea name="qualityNotes" required={mode === "quality"} maxLength={2000} placeholder="Describe pruebas realizadas o defectos detectados" /></label>
          {mode === "return" ? <label className="grid gap-2 text-sm sm:col-span-2">Nota de retorno<Textarea name="notes" maxLength={2000} /></label> : null}
        </>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
          <FormSubmitButton idleLabel="Guardar registro" pendingLabel="Guardando..." />
        </div>
      </form>
    </DialogShell> : null}
  </div>;
}
