"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PackagePlus, UserRound, Truck, ClipboardCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { confirmRepairCustomerDecision, requestRepairPart, assignRepairResponsibility, deliverRepairOrder, manageRepairPart, claimRepairOrder } from "../coordination-actions";
import { getPartOutstandingQuantity, getWorkshopNextAction, PART_STATUS_LABELS, type WorkshopPart } from "../workflow";
import type { RepairAccessOrderRecord } from "../queries";
import type { ActionResult } from "@/lib/form-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { RepairOrderActivity } from "./repair-order-activity";

type Modal = "accepted" | "rejected" | "revoked" | "part" | "assignment" | "delivery" | "claim";
export type WorkshopTechnician = { id: string; name: string };

export function OrderCoordinationPanel({ order, canManage, technicians = [], compact = false }: { order: RepairAccessOrderRecord; canManage: boolean; technicians?: WorkshopTechnician[]; compact?: boolean }) {
  const [modal, setModal] = useState<Modal | null>(null);
  const [partToManage, setPartToManage] = useState<WorkshopPart | null>(null);
  const context = order.workflow;
  if (!context) return null;
  const pendingParts = context.parts.filter((p) => getPartOutstandingQuantity(p) > 0).length;
  const nextAction = getWorkshopNextAction({ status: order.status, deliveredAt: order.deliveredAt, approvalStatus: context.approvalStatus, pendingParts });
  const accepted = context.approvalStatus === "accepted";
  const zeroQuote = order.budgetAmount === 0 && order.finalAmount === 0 && (order.budgetDetail ?? "").trim().length >= 3;
  const delivered = Boolean(order.deliveredAt || order.status === "retirado");

  return <section className={`min-w-0 bg-white ${compact ? "border-t border-slate-200 p-3" : "rounded-xl border border-slate-200 p-4"}`} aria-label="Coordinacion de la orden">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">Proximo paso</p>
        <p className="mt-1 text-sm font-semibold text-slate-950">{nextAction}</p>
        <p className="mt-1 text-xs text-slate-500">{context.assignedTechnicianName || "Sin tecnico asignado"}{context.location ? ` · ${context.location}` : ""}{context.nextActionDate ? ` · Revisar ${formatDate(context.nextActionDate)}` : ""}</p>
      </div>
      <span className={`max-w-full rounded-lg px-2 py-1 text-sm font-medium ${accepted ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {accepted ? `Autorizada: ${formatCurrency(context.approvedAmount ?? order.budgetAmount)}` : context.approvalStatus === "rejected" ? "Cliente rechazo" : context.approvalStatus === "revoked" ? "Requiere nueva autorizacion" : order.status === "presupuestado_aceptado" && context.approvalStatus === "legacy" ? "Aceptacion historica" : "Sin confirmacion vigente"}
      </span>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {canManage && !delivered && !accepted && (order.budgetAmount > 0 || zeroQuote) ? <Button className="min-h-11" type="button" onClick={() => setModal("accepted")}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{zeroQuote ? "Autorizar trabajo sin cargo" : "Cliente confirmo"}</Button> : null}
      {canManage && !delivered && !accepted ? <Button type="button" variant="secondary" className="min-h-11" onClick={() => setModal("rejected")}>Cliente rechazo</Button> : null}
      {canManage && accepted && !delivered ? <Button type="button" variant="secondary" className="min-h-11" onClick={() => setModal("revoked")}>Corregir aceptacion</Button> : null}
      {!delivered ? <Button type="button" variant="secondary" className="min-h-11" onClick={() => setModal("part")}><PackagePlus className="h-4 w-4" aria-hidden="true" />Solicitar repuesto</Button> : null}
      {!canManage && !delivered && !context.assignedTechnicianId ? <Button type="button" variant="secondary" className="min-h-11" onClick={() => setModal("claim")}><UserRound className="h-4 w-4" aria-hidden="true" />Tomar esta orden</Button> : null}
      {canManage && !delivered ? <Button type="button" variant="secondary" className="min-h-11" onClick={() => setModal("assignment")}><UserRound className="h-4 w-4" aria-hidden="true" />Asignar y organizar</Button> : null}
      {canManage && !delivered && ["listo_para_retirar", "sin_solucion", "presupuestado_rechazado"].includes(order.status) ? <Button type="button" variant="secondary" className="min-h-11" onClick={() => setModal("delivery")}><Truck className="h-4 w-4" aria-hidden="true" />Registrar entrega</Button> : null}
    </div>
    {canManage ? <details className="mt-3 border-t border-slate-200 pt-2">
      <summary className="min-h-11 cursor-pointer rounded-lg py-3 text-sm font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40">Documentos y cobros</summary>
      <div className="flex flex-wrap gap-2 pt-2">
        <a className={buttonVariants({ variant: "secondary" })} href={`/api/repair-access/documents/${order.id}?kind=intake`} target="_blank" rel="noreferrer">Comprobante de ingreso</a>
        {order.budgetAmount > 0 ? <a className={buttonVariants({ variant: "secondary" })} href={`/api/repair-access/documents/${order.id}?kind=estimate`} target="_blank" rel="noreferrer">Presupuesto PDF</a> : null}
        {delivered ? <a className={buttonVariants({ variant: "secondary" })} href={`/api/repair-access/documents/${order.id}?kind=delivery`} target="_blank" rel="noreferrer">Constancia de entrega</a> : null}
        <a className={buttonVariants({ variant: "secondary" })} href={`/reparaciones?rep=${encodeURIComponent(order.repairNumber)}`}>Registrar cobro</a>
        <a className={buttonVariants({ variant: "secondary" })} href={`/facturacion?order=${order.id}`}>Facturar esta reparacion</a>
      </div>
    </details> : null}
    {context.parts.length > 0 ? <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
      {context.parts.map((part) => <div key={part.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <div><p className="font-semibold text-slate-800">{part.description}</p><p className="mt-1 text-slate-500">{part.receivedQuantity}/{part.quantity} recibidos · {PART_STATUS_LABELS[part.status]}{part.expectedDate ? ` · Llegada ${formatDate(part.expectedDate)}` : ""}</p></div>
        {!delivered && part.status !== "cancelled" && part.status !== "installed" && (canManage || part.receivedQuantity > part.installedQuantity) ? <Button size="sm" type="button" variant="secondary" onClick={() => setPartToManage(part)}>{canManage ? "Gestionar" : "Registrar uso"}</Button> : null}
      </div>)}
    </div> : null}
    <RepairOrderActivity orderId={order.id} />
    {modal ? <CoordinationDialog key={modal} title={modal === "claim" ? "Tomar responsabilidad de la orden" : modal === "part" ? "Solicitar repuesto" : modal === "assignment" ? "Responsable y proxima accion" : modal === "delivery" ? "Entrega del equipo" : modal === "accepted" ? "El cliente confirmo la reparacion" : modal === "rejected" ? "Registrar rechazo del cliente" : "Revocar aceptacion"} action={modal === "claim" ? claimRepairOrder : modal === "part" ? requestRepairPart : modal === "assignment" ? assignRepairResponsibility : modal === "delivery" ? deliverRepairOrder : confirmRepairCustomerDecision} onClose={() => setModal(null)}>
      <input name="id" value={order.id} type="hidden" /><input name="version" value={context.version} type="hidden" />
      <p className="rounded-xl bg-slate-50 p-3 text-sm">{order.repairNumber} · {order.customer.fullName}</p>
      {modal === "claim" ? <p className="text-sm leading-6 text-slate-600">La orden quedara a tu cargo. Mostrador puede reasignarla si ya tiene responsable.</p> : null}
      {["accepted", "rejected", "revoked"].includes(modal) ? <>
        <input name="decision" value={modal} type="hidden" />
        <div className="border-y border-slate-200 py-3"><p className="text-sm text-slate-500">Presupuesto {context.budgetRevision ? `version ${context.budgetRevision}` : "actual"}</p><p className="mt-1 text-xl font-semibold">{formatCurrency(order.budgetAmount)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{order.budgetDetail || "Sin detalle cargado"}</p></div>
        <DialogField label="Como confirmo el cliente"><Select name="channel" options={[{ value: "presencial", label: "En el local" }, { value: "telefono", label: "Por telefono" }, { value: "whatsapp", label: "WhatsApp del negocio" }, { value: "portal", label: "Portal del cliente" }]} /></DialogField>
        <DialogField label={modal === "revoked" ? "Motivo de la correccion" : modal === "accepted" && zeroQuote ? "Motivo del trabajo sin cargo" : "Nota de la respuesta (opcional)"}><Textarea name="notes" required={modal === "revoked" || (modal === "accepted" && zeroQuote)} minLength={modal === "revoked" || (modal === "accepted" && zeroQuote) ? 3 : undefined} maxLength={2000} /></DialogField>
        <p className="text-xs text-slate-500">Se registra el usuario, la fecha y el presupuesto exacto. Esta accion no registra un cobro.</p>
      </> : null}
      {modal === "part" ? <>
        <DialogField label="Repuesto / codigo / equipo compatible"><Input autoFocus name="description" required minLength={3} maxLength={500} placeholder="Ej: Fuente BN44-... para Samsung..." /></DialogField>
        <div className="grid grid-cols-2 gap-3"><DialogField label="Cantidad"><Input name="quantity" type="number" min={1} max={10000} step={1} defaultValue={1} required /></DialogField><DialogField label="Prioridad"><Select name="priority" options={[{ value: "normal", label: "Normal" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }]} /></DialogField></div>
        <DialogField label="Detalle o enlace (opcional)"><Textarea name="notes" maxLength={2000} /></DialogField>
        <DialogField label="SKU de producto existente (opcional)"><Input name="productSku" maxLength={100} placeholder="Solo si el repuesto esta en Productos" /></DialogField>
        <p className="text-xs text-slate-500">El pedido aparecera en mostrador con esta orden vinculada. Solicitar no descuenta stock ni dinero.</p>
      </> : null}
      {modal === "assignment" ? <>
        <DialogField label="Tecnico responsable"><Select name="technicianId" defaultValue={context.assignedTechnicianId || ""} options={[{ value: "", label: "Sin asignar" }, ...technicians.map((t) => ({ value: t.id, label: t.name }))]} /></DialogField>
        <DialogField label="Ubicacion del equipo"><Input name="location" maxLength={200} defaultValue={context.location || ""} placeholder="Ej: Taller, estante 2" /></DialogField>
        <DialogField label="Fecha de proxima revision"><Input name="nextActionDate" type="date" defaultValue={context.nextActionDate || ""} /></DialogField>
      </> : null}
      {modal === "delivery" ? <>
        <DialogField label="Persona que retira"><Input name="recipient" required minLength={2} defaultValue={order.customer.fullName} /></DialogField>
        <DialogField label="Accesorios devueltos y observaciones"><Textarea name="notes" maxLength={2000} /></DialogField>
        {!order.isPaid && order.status === "listo_para_retirar" ? <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><input className="mt-1" name="allowBalance" type="checkbox" />Autorizo entrega con saldo pendiente. El motivo debe constar en las observaciones.</label> : null}
      </> : null}
    </CoordinationDialog> : null}
    {partToManage ? <PartManagementDialog part={partToManage} canManage={canManage} onClose={() => setPartToManage(null)} /> : null}
  </section>;
}

export function DialogField({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">{label}</span>{children}</label>; }

function editableDialogSnapshot(form: HTMLFormElement | null) {
  if (!form) return "";
  return JSON.stringify(Array.from(form.elements).flatMap((control) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
      || !control.name || control.disabled || (control instanceof HTMLInputElement && control.type === "hidden")) return [];
    return [[control.name, control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : control.value]];
  }).sort(([a], [b]) => String(a).localeCompare(String(b))));
}

export function CoordinationDialog({ title, action, children, onClose }: { title: string; action: (previous: ActionResult | null, form: FormData) => Promise<ActionResult>; children: ReactNode; onClose: () => void }) {
  const router = useRouter();
  const [result, submit, pending] = useActionState(action, null);
  const [operationId, setOperationId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const initialSnapshot = useRef("");
  useEffect(() => { initialSnapshot.current = editableDialogSnapshot(formRef.current); }, []);
  useEffect(() => { setOperationId(crypto.randomUUID()); }, []);
  useEffect(() => {
    if (result?.success) { window.dispatchEvent(new Event("chetech:workshop-saved")); router.refresh(); }
  }, [result, router]);
  function close() {
    if (pending) return;
    if (!result?.success && initialSnapshot.current !== editableDialogSnapshot(formRef.current)
      && !window.confirm("Hay cambios sin guardar. Queres descartarlos y cerrar?")) return;
    onClose();
  }
  return <DialogShell labelledBy="coordination-title" onClose={close} panelClassName="max-w-xl">
    <div className="flex items-center justify-between gap-3"><h2 id="coordination-title" className="text-xl font-semibold">{title}</h2><Button aria-label="Cerrar" type="button" variant="ghost" disabled={pending} onClick={close}>Cerrar</Button></div>
    <form ref={formRef} action={submit} data-workshop-form className="mt-4 grid gap-4">
      <input name="operationId" type="hidden" value={operationId} />
      {children}
      {result ? <p role={result.success ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${result.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{result.message}</p> : null}
      {result?.success ? <Button type="button" onClick={onClose}>Listo</Button> : <Button type="submit" className="min-h-12" disabled={pending || !operationId}>{pending ? "Guardando..." : "Confirmar y guardar"}</Button>}
    </form>
  </DialogShell>;
}

export function PartManagementDialog({ part, canManage, onClose }: { part: WorkshopPart; canManage: boolean; onClose: () => void }) {
  const [action, setAction] = useState(canManage ? part.status === "requested" ? "order" : part.receivedQuantity < part.quantity ? "receive" : "install" : "install");
  return <CoordinationDialog title="Gestionar repuesto" action={manageRepairPart} onClose={onClose}>
    <input name="id" type="hidden" value={part.id} /><input name="version" type="hidden" value={part.version} />
    <p className="rounded-xl bg-slate-50 p-3 text-sm font-medium">{part.description} · {part.receivedQuantity}/{part.quantity} recibidos</p>
    <DialogField label="Accion"><Select name="action" value={action} onChange={(e) => setAction(e.target.value)} options={[
      ...(canManage && part.status === "requested" ? [{ value: "order", label: "Registrar compra" }, ...(part.productId ? [{ value: "reserve", label: "Reservar stock existente" }] : [])] : []),
      ...(canManage && part.status === "ordered" && part.receivedQuantity < part.quantity ? [{ value: "receive", label: "Recibir repuestos" }] : []),
      ...(part.receivedQuantity > part.installedQuantity ? [{ value: "install", label: "Registrar uso en reparacion" }] : []),
      ...(canManage && part.installedQuantity === 0 ? [{ value: "cancel", label: "Cancelar solicitud" }] : [])
    ]} /></DialogField>
    {action === "order" ? <><DialogField label="Proveedor"><Input name="supplier" required defaultValue={part.supplier || ""} /></DialogField><div className="grid gap-3 sm:grid-cols-2"><DialogField label="Costo por unidad"><Input type="number" name="unitCost" min={0} step="0.01" defaultValue={part.unitCost ?? ""} /></DialogField><DialogField label="Fecha esperada de llegada"><Input name="expectedDate" type="date" defaultValue={part.expectedDate || ""} /></DialogField></div></> : <><input name="supplier" type="hidden" value={part.supplier || ""} /><input name="expectedDate" type="hidden" value={part.expectedDate || ""} /></>}
    {["receive", "reserve", "install"].includes(action) ? <DialogField label="Cantidad en esta operacion"><Input name="quantity" type="number" min={1} step={1} defaultValue={1} required /></DialogField> : <input name="quantity" type="hidden" value={0} />}
    <DialogField label={action === "cancel" ? "Motivo de cancelacion" : "Observaciones / motivo de compra excepcional"}><Textarea name="notes" maxLength={2000} required={action === "cancel"} /></DialogField>
    {action === "order" ? <p className="text-xs text-slate-500">La compra no registra un pago automatico. Registra el egreso real en Gastos cuando corresponda.</p> : null}
    <p className="flex items-center gap-2 text-xs text-slate-500"><ClipboardCheck className="h-4 w-4" aria-hidden="true" />Cada recepcion y uso quedan vinculados a la orden.</p>
  </CoordinationDialog>;
}
