"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LazyDisclosure } from "@/components/ui/lazy-disclosure";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import type { RepairAccessOrderRecord } from "../queries";
import { getOperationalDate, toWarrantyDateOnly } from "../warranty";
import { saveWarrantyReturn, startWarrantyReturn } from "../warranty-actions";
import { warrantyReturnStatuses, type WarrantyReturnRecord } from "../warranty-return";
import type { WorkshopSaveResult } from "../workflow";
import { repairAccessStatusOptions } from "./repair-access-helpers";
import { RepairAccessStatusBadge } from "./repair-access-status-badge";
import { WorkshopForm } from "./workshop-form";

const disclosureClass = "min-h-11 cursor-pointer rounded-lg px-3 py-3 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40";

function actionData(data: FormData) {
  const form = new FormData();
  for (const [key, value] of data) if (!key.startsWith("_") && !key.startsWith("$")) form.append(key, value);
  form.set("version", String(data.get("expectedVersion") ?? ""));
  form.delete("expectedVersion");
  return form;
}

async function registerReturn(previous: WorkshopSaveResult | null, data: FormData): Promise<WorkshopSaveResult> {
  const result = await startWarrantyReturn(previous, actionData(data));
  // Intake leaves the original workflow version untouched; wait for the active case instead.
  return { ...result, orderClosed: result.success };
}

async function updateReturn(previous: WorkshopSaveResult | null, data: FormData): Promise<WorkshopSaveResult> {
  const form = actionData(data);
  const result = await saveWarrantyReturn(previous, form);
  return { ...result, orderClosed: result.success && form.get("status") === "retirado" };
}

export function WarrantyReturnPanel({ order, canManage }: { order: RepairAccessOrderRecord; canManage: boolean }) {
  const fieldId = useId();
  const returns = order.warrantyReturns ?? [];
  const active = returns.find((record) => !record.closedAt);
  const history = returns.filter((record) => record.closedAt);
  const canStart = canManage && (order.status === "retirado" || Boolean(order.deliveredAt)) && !active;
  const coverageActive = ["active", "expires_today"].includes(order.warranty?.code);
  if (!active && !history.length && !canStart) return null;

  return <section aria-label="Garantia de la orden" className="min-w-0 space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-4">
    {active ? <WarrantyReturnCase key={active.id} record={active} canManage={canManage} /> : null}
    {canStart ? <LazyDisclosure key={`intake-${history[0]?.id ?? "first"}`} summary="Registrar reingreso por garantia" summaryClassName={disclosureClass}>
      <WorkshopForm orderId={`warranty-intake:${order.id}`} orderVersion={order.workflow?.version ?? 1} action={registerReturn}>
        {(_fields, submitting) => <>
          <input name="id" type="hidden" value={order.id} />
          <input name="expectedVersion" type="hidden" value={order.workflow?.version ?? 1} />
          <p className="text-sm leading-6 text-slate-600">Se registra otra visita con el mismo REP. El presupuesto, los cobros, el estado y el retiro original no cambian.</p>
          {!coverageActive ? <div role="note" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p>La cobertura original no esta vigente o requiere revision. Este reingreso no extiende ni renueva la garantia.</p>
          </div> : null}
          <WarrantyField htmlFor={`${fieldId}-received`} label="Fecha de reingreso"><Input id={`${fieldId}-received`} name="receivedOn" type="date" min={toWarrantyDateOnly(order.deliveredAt ?? order.pickedUpAt) ?? undefined} max={getOperationalDate()} defaultValue={getOperationalDate()} required /></WarrantyField>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"><input id={`${fieldId}-coverage`} name="acknowledgeCoverage" type="checkbox" required={!coverageActive} /><label htmlFor={`${fieldId}-coverage`} className="flex min-h-11 flex-1 items-center">Autorizar recepcion si la cobertura no figura vigente para esa fecha (no la renueva)</label></div>
          <p className="text-sm text-slate-500">Si elegis otra fecha, se verifica la cobertura de ese dia. Si hace falta autorizarla, tus datos se conservan para reintentar.</p>
          <WarrantyField htmlFor={`${fieldId}-issue`} label="Falla de este reingreso"><Textarea id={`${fieldId}-issue`} name="issueReported" minLength={3} maxLength={2000} required /></WarrantyField>
          <WarrantyField htmlFor={`${fieldId}-accessories`} label="Accesorios recibidos (opcional)"><Textarea id={`${fieldId}-accessories`} name="accessories" maxLength={2000} /></WarrantyField>
          <WarrantyField htmlFor={`${fieldId}-condition`} label="Estado al recibir (opcional)"><Textarea id={`${fieldId}-condition`} name="conditionNotes" maxLength={2000} /></WarrantyField>
          <Button className="min-h-11 w-full" type="submit" disabled={submitting}>Registrar reingreso</Button>
        </>}
      </WorkshopForm>
    </LazyDisclosure> : null}
    {history.length ? <LazyDisclosure summary={`Historial de reingresos (${history.length})`} summaryClassName={disclosureClass}>
      <div className="space-y-4 border-t border-slate-200 pt-3">{history.map((record) => <WarrantyReturnCase key={record.id} record={record} canManage={canManage} />)}</div>
    </LazyDisclosure> : null}
  </section>;
}

export function WarrantyReturnCase({ record, canManage }: { record: WarrantyReturnRecord; canManage: boolean }) {
  const fieldId = useId();
  const closed = Boolean(record.closedAt);
  const options = warrantyReturnStatuses.filter((status) => canManage || status !== "retirado").map((value) => ({
    value, label: repairAccessStatusOptions.find((option) => option.value === value)?.label ?? value.replaceAll("_", " ")
  }));

  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-semibold text-slate-950">{closed ? "Reingreso por garantia retirado" : "Reingreso por garantia activo"}</h3>
      <RepairAccessStatusBadge status={record.status} />
    </div>
    <p className="text-sm text-slate-600">Ingreso de garantia: <time dateTime={record.receivedOn}>{formatDate(record.receivedOn)}</time></p>
    <p className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-slate-950">{record.issueReported}</p>
    {record.accessories ? <p className="whitespace-pre-wrap break-words text-sm text-slate-600">Accesorios: {record.accessories}</p> : null}
    {record.conditionNotes ? <p className="whitespace-pre-wrap break-words text-sm text-slate-600">Estado al recibir: {record.conditionNotes}</p> : null}
    {record.progress ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">Avance: {record.progress}</p> : null}
    {record.resolution ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">Resolucion: {record.resolution}</p> : null}
    {closed ? <p className="break-words text-sm text-slate-600">Retirado el {formatDate(record.closedAt!)}{record.recipient ? ` por ${record.recipient}` : ""}. La orden original conserva su historial.</p> : <LazyDisclosure summary="Actualizar reingreso" summaryClassName={disclosureClass}>
      <WorkshopForm orderId={`warranty-case:${record.id}`} orderVersion={record.version} action={updateReturn}>
        {(fields, submitting) => {
          const status = fields.status ?? record.status;
          const retiring = status === "retirado";
          const needsResolution = retiring && !["listo_para_retirar", "no_presenta_fallas", "sin_solucion"].includes(record.status)
            && record.resolution.trim().length < 3;
          return <>
            <input name="id" type="hidden" value={record.id} />
            <input name="expectedVersion" type="hidden" value={record.version} />
            <WarrantyField htmlFor={`${fieldId}-status`} label="Estado del reingreso"><Select id={`${fieldId}-status`} name="status" defaultValue={status} options={options} /></WarrantyField>
            <WarrantyField htmlFor={`${fieldId}-progress`} label="Avance del reingreso"><Textarea id={`${fieldId}-progress`} name="progress" defaultValue={fields.progress ?? record.progress} maxLength={2000} /></WarrantyField>
            <WarrantyField htmlFor={`${fieldId}-resolution`} label="Resolucion del reingreso"><Textarea id={`${fieldId}-resolution`} name="resolution" defaultValue={fields.resolution ?? record.resolution} maxLength={2000} required={needsResolution} minLength={needsResolution ? 3 : undefined} placeholder={needsResolution ? "Indica el resultado: reparado, sin fallas o sin solucion" : undefined} /></WarrantyField>
            {canManage && status === "retirado" ? <>
              <WarrantyField htmlFor={`${fieldId}-recipient`} label="Quien retira"><Input id={`${fieldId}-recipient`} name="recipient" defaultValue={fields.recipient ?? ""} minLength={2} maxLength={2000} required /></WarrantyField>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"><input id={`${fieldId}-delivery`} name="confirmDelivery" type="checkbox" defaultChecked={fields.confirmDelivery === "on"} required /><label htmlFor={`${fieldId}-delivery`} className="flex min-h-11 flex-1 items-center">Confirmo la devolucion del equipo de este reingreso.</label></div>
              <p className="text-sm text-slate-500">Esta entrega cierra solo el reingreso. No modifica cobros ni fechas de la orden original.</p>
              <p className="text-sm text-slate-600">Podes guardar la resolucion y el retiro en un solo paso, sin cambiar antes a Listo para retirar.</p>
            </> : null}
            {!canManage ? <p className="text-sm text-slate-500">Mostrador registra el retiro del equipo.</p> : null}
            <Button className="min-h-11 w-full" type="submit" disabled={submitting}>{retiring ? "Registrar retiro de garantia" : "Guardar reingreso"}</Button>
          </>;
        }}
      </WorkshopForm>
    </LazyDisclosure>}
  </div>;
}

function WarrantyField({ htmlFor, label, children }: { htmlFor: string; label: string; children: ReactNode }) {
  return <div><label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-700">{label}</label>{children}</div>;
}
