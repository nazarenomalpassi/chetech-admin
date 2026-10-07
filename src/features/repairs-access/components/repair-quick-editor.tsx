"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveQuickWorkshopForm } from "../coordination-actions";
import type { RepairAccessOrderRecord } from "../queries";
import { getPartOutstandingQuantity, getQuickWorkshopState, TECHNICAL_WORKSHOP_STATUSES } from "../workflow";
import { repairAccessStatusOptions } from "./repair-access-helpers";
import { ReadyForPickupRequirements } from "./ready-for-pickup-requirements";
import { WorkshopForm } from "./workshop-form";

export function RepairQuickEditor({ order, canManage }: { order: RepairAccessOrderRecord; canManage: boolean }) {
  if (order.deliveredAt || order.status === "retirado") return <p className="p-4 text-sm text-slate-600">Esta orden ya fue entregada. Los ajustes se revisan en la ficha completa.</p>;
  const pendingParts = order.workflow?.parts.filter((part) => getPartOutstandingQuantity(part) > 0).length ?? 0;
  const hasExplicitZero = (order.workflow?.approvalStatus === "accepted" && order.workflow.approvedAmount === 0)
    || (order.workflow?.approvalStatus === "rejected" && order.hasBudgetAmount && order.workflow.budgetRevision > 0);
  const statusOptions = repairAccessStatusOptions.filter((option) => TECHNICAL_WORKSHOP_STATUSES.includes(option.value) || option.value === order.status
    || (canManage && ["presupuestado_aceptado", "presupuestado_rechazado", "retirado"].includes(option.value)));

  return <WorkshopForm orderId={order.id} orderVersion={order.workflow?.version} action={saveQuickWorkshopForm}>
    {(fields, submitting) => {
      const state = getQuickWorkshopState(order, fields);
      const retiring = state.status === "retirado";
      const canDeliver = ["listo_para_retirar", "sin_solucion", "presupuestado_rechazado"].includes(order.status);
      const hasWorkChanges = state.quoteChanged
        || (fields.repairProgress ?? order.repairProgress ?? "") !== (order.repairProgress ?? "")
        || (fields.qualityNotes ?? order.workflow?.qualityNotes ?? "") !== (order.workflow?.qualityNotes ?? "");
      const deliveryWithBalance = fields.allowBalance === "on";
      const quoteKey = JSON.stringify([fields.repairAmount ?? String(order.budgetAmount), fields.budgetDetail ?? order.budgetDetail ?? ""]);
      const needsQuality = ["en_pruebas", "listo_para_retirar"].includes(state.status) || state.hasCurrentQuality;
      const confirmSelected = fields.confirmCustomer === "on";
      const decisionSelected = canManage && ["presupuestado_aceptado", "presupuestado_rechazado"].includes(state.status);
      const rejecting = state.status === "presupuestado_rechazado";
      const responseNeedsRecording = decisionSelected && (state.quoteChanged || order.workflow?.approvalStatus !== (rejecting ? "rejected" : "accepted"));
      const needsRejectionReason = rejecting && order.workflow?.approvalStatus === "accepted" && !state.quoteChanged;
      const needsFreeReason = !rejecting && state.quoteAmount === 0 && state.needsConfirmation;
      return <>
        <input name="id" type="hidden" value={order.id} />
        <input name="expectedVersion" type="hidden" value={order.workflow?.version ?? 1} />
        <div className={`grid min-w-0 gap-3 ${retiring ? "" : "sm:grid-cols-2"}`}>
          <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-700">
            <span>Estado de la orden</span>
            <Select id={`quick-${order.id}-status`} name="status" defaultValue={order.status} options={statusOptions} />
          </label>
          <label className={retiring ? "hidden" : "grid min-w-0 gap-2 text-sm font-medium text-slate-700"}>
            <span>Presupuesto</span>
            <Input id={`quick-${order.id}-amount`} name="repairAmount" defaultValue={order.budgetAmount || hasExplicitZero ? String(order.budgetAmount) : ""} type="number" inputMode="decimal" min={0} step="0.01" disabled={order.isPaid} readOnly={retiring} placeholder="Sin presupuestar" />
          </label>
        </div>
        {order.isPaid && !retiring ? <p className="text-xs leading-5 text-slate-500">Importe protegido porque hay un cobro informado. Las correcciones de dinero se hacen en Cobros.</p> : null}
        <label className={retiring ? "hidden" : "grid gap-2 text-sm font-medium text-slate-700"}>
          <span>Detalle del presupuesto</span>
          <Textarea id={`quick-${order.id}-budget`} name="budgetDetail" defaultValue={order.budgetDetail ?? ""} maxLength={2000} readOnly={retiring} className="min-h-20" placeholder="Trabajo a realizar y repuestos incluidos" />
        </label>
        <label className={retiring ? "hidden" : "grid gap-2 text-sm font-medium text-slate-700"}>
          <span>Avance / trabajo realizado</span>
          <Textarea id={`quick-${order.id}-progress`} name="repairProgress" defaultValue={order.repairProgress ?? ""} maxLength={2000} readOnly={retiring} className="min-h-20" placeholder="Que hiciste y que falta" />
        </label>
        {!retiring ? <p className="text-xs leading-5 text-slate-500">El presupuesto y el avance son visibles para el cliente con cuenta vinculada.</p> : null}
        {retiring ? <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <p className="text-sm font-semibold text-slate-900">Registrar retiro del equipo</p>
          <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Persona que retira</span>
            <Input id={`quick-${order.id}-recipient`} name="recipient" defaultValue={fields.recipient ?? order.customer.fullName} required minLength={2} autoComplete="name" />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Accesorios devueltos y observaciones</span>
            <Textarea id={`quick-${order.id}-delivery-notes`} name="deliveryNotes" defaultValue={fields.deliveryNotes ?? ""} maxLength={2000} required={deliveryWithBalance} minLength={deliveryWithBalance ? 3 : undefined} className="min-h-20" placeholder="Control, cables y notas del retiro" />
          </label>
          {!order.isPaid && order.status === "listo_para_retirar" ? <label className="flex min-h-11 items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <input name="allowBalance" type="checkbox" defaultChecked={fields.allowBalance === "on"} className="mt-0.5 h-5 w-5 shrink-0 accent-graphite" />
            Autorizo entrega con saldo pendiente. Indica el motivo en las observaciones.
          </label> : null}
          <label className="flex min-h-11 items-start gap-3 text-sm font-semibold text-slate-900">
            <input name="confirmDelivery" type="checkbox" defaultChecked={fields.confirmDelivery === "on"} required className="mt-0.5 h-5 w-5 shrink-0 accent-graphite" />
            Confirmo que el cliente retiro el equipo
          </label>
          {!canDeliver ? <p role="status" className="text-sm text-amber-900">Primero guarda la orden como Listo para retirar, Sin solucion o Presupuestado y rechazado. Despues registra el retiro aqui.</p> : null}
          {hasWorkChanges ? <p role="status" className="text-sm text-amber-900">Guarda primero los cambios de presupuesto o trabajo. Vuelve al estado anterior: lo que escribiste se conserva.</p> : null}
        </div> : null}
        {canManage && !retiring && (decisionSelected || state.needsConfirmation) ? <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          {decisionSelected ? <>
            <p className="text-sm font-semibold text-slate-900">{responseNeedsRecording
              ? rejecting ? "Al guardar se registra que el cliente rechazo este presupuesto." : "Al guardar se registra que el cliente acepto este presupuesto."
              : rejecting ? "El rechazo de este presupuesto ya esta registrado." : "La aceptacion de este presupuesto ya esta registrada."}</p>
            {!responseNeedsRecording ? <input name="decisionChannel" type="hidden" value="presencial" /> : null}
          </> : <>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-900">
            <input key={`confirmation-${quoteKey}`} name="confirmCustomer" type="checkbox" defaultChecked={fields.confirmCustomer === "on"} className="h-5 w-5 shrink-0 accent-graphite" />
            El cliente confirmo este presupuesto
          </label>
          <p className="mt-1 text-xs leading-5 text-slate-600">Marcala solo si autorizo este importe y detalle. Se registra junto con el trabajo al guardar.</p>
          </>}
          {responseNeedsRecording || (!decisionSelected && confirmSelected) ? <div className="mt-3 grid gap-3">
            <label className="grid gap-2 text-sm font-medium text-slate-700"><span>{decisionSelected ? "Como respondio el cliente" : "Como confirmo"}</span><Select id={`quick-${order.id}-channel`} name="decisionChannel" defaultValue={fields.decisionChannel || "presencial"} options={[
              { value: "presencial", label: "En el local" }, { value: "telefono", label: "Por telefono" },
              { value: "whatsapp", label: "WhatsApp del negocio" }, { value: "portal", label: "Portal del cliente" }
            ]} /></label>
            <label className="grid gap-2 text-sm font-medium text-slate-700"><span>{needsRejectionReason ? "Motivo del rechazo" : needsFreeReason ? "Motivo del trabajo sin cargo" : rejecting ? "Nota del rechazo (opcional)" : "Nota de confirmacion (opcional)"}</span>
              <Textarea id={`quick-${order.id}-decision-notes`} name="decisionNotes" defaultValue={fields.decisionNotes || ""} maxLength={2000} required={needsRejectionReason || needsFreeReason} minLength={needsRejectionReason || needsFreeReason ? 3 : undefined} className="min-h-20" />
            </label>
          </div> : null}
        </div> : null}
        {!canManage ? <ReadyForPickupRequirements workflow={order.workflow} status={order.status} canManage={false} /> : null}
        {needsQuality ? <label className={retiring ? "hidden" : "flex min-h-11 items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-900"}>
          <input key={`quality-${quoteKey}`} name="qualityChecked" type="checkbox" defaultChecked={"qualityChecked" in fields ? fields.qualityChecked === "on" : state.hasCurrentQuality} className="mt-0.5 h-5 w-5 shrink-0 accent-graphite" />
          Equipo probado y funcionando
        </label> : null}
        {pendingParts > 0 && !retiring ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Hay {pendingParts} solicitudes de repuestos pendientes de recibir. Revisalas en las acciones de esta orden antes de marcar listo.</p> : null}
        <details className={retiring ? "hidden" : "rounded-xl border border-slate-200 p-3"}>
          <summary className="min-h-11 cursor-pointer text-sm font-medium text-slate-600">Resultado de las pruebas (opcional)</summary>
          <label className="mt-2 grid gap-2 text-sm"><span>Detalle de las pruebas</span><Textarea id={`quick-${order.id}-quality-notes`} name="qualityNotes" defaultValue={order.workflow?.qualityNotes ?? ""} maxLength={2000} readOnly={retiring} className="min-h-20" /></label>
        </details>
        <div className="grid gap-2">
          <Button type="submit" className="min-h-12 w-full" disabled={submitting || (retiring && (!canDeliver || hasWorkChanges))}>{submitting ? "Guardando..." : retiring ? "Registrar retiro" : state.status === "listo_para_retirar" ? "Guardar y marcar listo" : "Guardar cambios"}</Button>
          <p className="text-xs leading-5 text-slate-500">{retiring ? "Registra la fecha y la persona que retira. No genera cobros ni modifica importes." : "Guardar no cobra ni entrega el equipo. Esas acciones se registran por separado."}</p>
        </div>
      </>;
    }}
  </WorkshopForm>;
}
