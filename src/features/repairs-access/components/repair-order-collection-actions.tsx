"use client";

import { startTransition, useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addRepairPaymentFormAction, saveRepairFormAction, type RepairPaymentSaveResult } from "@/features/repairs/actions";
import { usePaymentDraft } from "@/features/repairs/use-payment-draft";
import { getRepairValidationError } from "@/features/repairs/validation";
import type { ActionResult } from "@/lib/form-state";
import { getPaymentTotal, type PaymentSplit } from "@/lib/payment-splits";
import { formatCurrency, getLocalDateInputValue } from "@/lib/utils";
import { deliverRepairOrder } from "../coordination-actions";
import type { RepairAccessOrderRecord } from "../queries";

const deliveryStatuses = ["listo_para_retirar", "no_presenta_fallas", "sin_solucion", "presupuestado_rechazado"];
const money = z.number().finite().nonnegative();
const lookupSchema = z.object({
  draftOwnerId: z.string().min(1),
  order: z.object({
    id: z.string().min(1), repairNumber: z.string(), status: z.string(), workflowVersion: z.number().int().positive().nullable(),
    deliveredAt: z.string().nullable().optional(), isPaid: z.boolean().optional(), intakeDate: z.string(), customerName: z.string(), customerPhone: z.string(),
    device: z.string(), issueDescription: z.string(), amount: money, paidTotal: money, balance: money
  }),
  financialRecord: z.object({ id: z.string().min(1), repairAccessOrderId: z.string(), finalPrice: money,
    paidTotal: money, balance: money, financialVersion: z.number().int().positive() }).nullable()
});
type Lookup = z.infer<typeof lookupSchema>;
type Mode = "collection" | "delivery";
const paymentSchema = z.object({ method: z.enum(["efectivo", "nx", "mp"]), amount: money });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const timingSchema = { paymentDate: date, paymentTimestamp: z.string().datetime({ offset: true }).optional(), paymentsJson: z.string() };
const draftSchema = z.object({
  version: z.literal(1), ownerId: z.string(), orderId: z.string(), requestId: z.string().uuid(), fingerprint: z.string(),
  availableBalance: money,
  operation: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("create"), payload: z.object({ ...timingSchema, repairAccessOrderId: z.string(), customerName: z.string().min(1),
      customerPhone: z.string(), device: z.string().min(1), orderNumber: z.string(), issueDescription: z.string(), entryDate: date, amount: z.string() }).strict() }).strict(),
    z.object({ mode: z.literal("add"), payload: z.object({ ...timingSchema, repairId: z.string() }).strict() }).strict()
  ])
}).strict();
type CollectionDraft = z.infer<typeof draftSchema>;

function balances(snapshot: Lookup) {
  return snapshot.financialRecord ? { total: snapshot.financialRecord.finalPrice, paid: snapshot.financialRecord.paidTotal, balance: snapshot.financialRecord.balance }
    : { total: snapshot.order.amount, paid: snapshot.order.paidTotal, balance: snapshot.order.balance };
}
function canDeliver(order: { status: string; deliveredAt?: string | null }) {
  return !order.deliveredAt && deliveryStatuses.includes(order.status);
}
function operationFingerprint(operation: CollectionDraft["operation"]) {
  // Financial actions omit unused rows before the RPC's idempotency check.
  const payments = (JSON.parse(operation.payload.paymentsJson) as PaymentSplit[]).filter((payment) => payment.amount !== 0);
  return JSON.stringify({ ...operation, payload: { ...operation.payload, paymentsJson: JSON.stringify(payments) } });
}
function paymentsFromDraft(value: CollectionDraft): PaymentSplit[] { return JSON.parse(value.operation.payload.paymentsJson); }
function initialDraft(snapshot: Lookup): CollectionDraft {
  const paymentDate = getLocalDateInputValue();
  const timing = { paymentDate, paymentTimestamp: new Date().toISOString(), paymentsJson: JSON.stringify([{ method: "efectivo", amount: 0 }]) };
  const operation: CollectionDraft["operation"] = snapshot.financialRecord
    ? { mode: "add", payload: { ...timing, repairId: snapshot.financialRecord.id } }
    : { mode: "create", payload: { ...timing, repairAccessOrderId: snapshot.order.id, customerName: snapshot.order.customerName,
      customerPhone: snapshot.order.customerPhone, device: snapshot.order.device, orderNumber: snapshot.order.repairNumber,
      issueDescription: snapshot.order.issueDescription, entryDate: snapshot.order.intakeDate.slice(0, 10), amount: String(snapshot.order.amount) } };
  return { version: 1, ownerId: snapshot.draftOwnerId, orderId: snapshot.order.id, requestId: crypto.randomUUID(),
    availableBalance: balances(snapshot).balance, operation, fingerprint: operationFingerprint(operation) };
}
function recoverDraft(raw: unknown, snapshot: Lookup): CollectionDraft | null {
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  if (value.ownerId !== snapshot.draftOwnerId || value.orderId !== snapshot.order.id) return null;
  const operation = value.operation;
  if (operation.mode === "create" && (operation.payload.repairAccessOrderId !== snapshot.order.id
    || operation.payload.orderNumber !== snapshot.order.repairNumber || !Number.isFinite(Number(operation.payload.amount))
    || Number(operation.payload.amount) < 0 || (!snapshot.financialRecord && Number(operation.payload.amount) !== snapshot.order.amount))) return null;
  if (operation.mode === "add" && operation.payload.repairId !== snapshot.financialRecord?.id) return null;
  try {
    if (value.fingerprint !== operationFingerprint(operation)) return null;
    const payments = z.array(paymentSchema).min(1).max(20).parse(JSON.parse(operation.payload.paymentsJson));
    if (getPaymentTotal(payments) > value.availableBalance || getRepairValidationError({ amount: value.availableBalance, payments: payments.filter((p) => p.amount !== 0) })) return null;
  } catch { return null; }
  return value;
}

export function RepairOrderCollectionActions({ order, canManage }: { order: RepairAccessOrderRecord; canManage: boolean }) {
  return canManage ? <CollectionActions key={order.id} order={order} /> : null;
}

function CollectionActions({ order }: { order: RepairAccessOrderRecord }) {
  const router = useRouter();
  const titleId = useId();
  const [mode, setMode] = useState<Mode | null>(null);
  const [snapshot, setSnapshot] = useState<Lookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<RepairPaymentSaveResult | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const closeForm = useRef<(() => boolean) | null>(null);
  const request = useRef<{ generation: number; controller?: AbortController }>({ generation: 0 });
  useEffect(() => () => { request.current.controller?.abort(); request.current.generation++; }, []);

  async function load() {
    request.current.controller?.abort();
    const controller = new AbortController();
    const generation = ++request.current.generation;
    request.current.controller = controller;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/repair-access/orders/${encodeURIComponent(order.repairNumber)}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (generation !== request.current.generation) return;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "No se pudo consultar el saldo. Reintenta.");
      const parsed = lookupSchema.safeParse(body);
      if (!parsed.success || parsed.data.order.id !== order.id
        || (parsed.data.financialRecord && parsed.data.financialRecord.repairAccessOrderId !== order.id)) {
        throw new Error("No se pudo verificar la orden y su saldo. Recarga antes de continuar.");
      }
      setSnapshot(parsed.data); setRefreshRequired(false);
    } catch (cause) {
      if (generation === request.current.generation && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo consultar el saldo. Reintenta.");
    } finally { if (generation === request.current.generation) setLoading(false); }
  }
  function open(next: Mode) {
    if (refreshRequired) return;
    closeForm.current = null;
    setMode(next); setSaved(null); setSnapshot(null); void load();
  }
  function close() {
    if (closeForm.current && !closeForm.current()) return;
    request.current.controller?.abort(); request.current.generation++;
    setLoading(false); setMode(null); closeForm.current = null;
  }
  function onSaved(result: RepairPaymentSaveResult) {
    closeForm.current = null;
    setSaved(result); setRefreshRequired(true);
    window.dispatchEvent(new Event("chetech:workshop-saved"));
    router.refresh();
    void load();
  }
  function continueDelivery() {
    if (closeForm.current && !closeForm.current()) return;
    closeForm.current = null; setMode("delivery"); setSaved(null);
  }
  const showDelivery = canDeliver(snapshot?.order ?? order);
  return <div className="min-w-0 space-y-2">
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button type="button" className="min-h-11 flex-1" disabled={refreshRequired || Boolean(mode)} onClick={() => open("collection")}>Cobrar</Button>
      {showDelivery ? <Button type="button" variant="secondary" className="min-h-11 flex-1" disabled={refreshRequired || Boolean(mode)} onClick={() => open("delivery")}>Registrar entrega</Button> : null}
      {!mode && refreshRequired ? <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>Actualizar saldo</Button> : null}
    </div>
    {!mode && error ? <p role="alert" className="text-sm text-rose-800">{error}</p> : null}
    {mode ? <DialogShell labelledBy={titleId} panelClassName="max-w-xl min-w-0" onClose={close}>
      <div className="flex items-start justify-between gap-3"><h2 id={titleId} className="text-xl font-semibold">{mode === "collection" ? "Cobrar reparacion" : "Entrega del equipo"}</h2><Button type="button" variant="ghost" onClick={close}>Cerrar</Button></div>
      <p className="mt-2 break-words text-sm text-slate-600">{order.repairNumber}</p>
      {loading ? <p role="status" className="mt-4 text-sm">Actualizando saldo de la orden...</p> : null}
      {error ? <div className="mt-4 space-y-3"><p role="alert" className="text-sm text-rose-800">{error}</p><Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>Actualizar saldo</Button></div> : null}
      {saved ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{saved.message}</p> : null}
      {snapshot && !loading && !error ? <>
        <p className="mt-3 text-sm font-medium">{snapshot.order.customerName}</p>
        <LedgerSummary snapshot={snapshot} />
        {saved ? <div className="mt-4 grid gap-3">
          <Button type="button" variant="secondary" onClick={close}>Listo</Button>
        </div> : mode === "collection" ? <CollectionForm snapshot={snapshot} closeForm={closeForm} onSaved={onSaved} />
          : showDelivery && snapshot.order.workflowVersion !== null ? <DeliveryForm snapshot={snapshot} order={order} closeForm={closeForm} onSaved={onSaved} />
            : <p role="alert" className="mt-4 text-sm text-rose-800">La orden ya no permite registrar esta entrega. Revisa su estado.</p>}
        {mode === "collection" && balances(snapshot).balance === 0 && showDelivery ? <Button type="button" className="mt-4 min-h-11 w-full" onClick={continueDelivery}>Continuar con la entrega</Button> : null}
      </> : null}
    </DialogShell> : null}
  </div>;
}

function LedgerSummary({ snapshot }: { snapshot: Lookup }) {
  const ledger = balances(snapshot);
  return <section aria-label="Saldo de la orden" aria-live="polite" className="mt-4 grid min-w-0 grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
    {[ ["Total", ledger.total], ["Pagado", ledger.paid], ["Saldo", ledger.balance] ].map(([label, amount]) => <div key={label} className="min-w-0"><p className="text-xs text-slate-600">{label}</p><p className="mt-1 break-words text-sm font-semibold tabular-nums">{formatCurrency(Number(amount))}</p></div>)}
  </section>;
}
type FormProps = { snapshot: Lookup; closeForm: { current: (() => boolean) | null }; onSaved: (result: RepairPaymentSaveResult) => void };

function CollectionForm({ snapshot, closeForm, onSaved }: FormProps) {
  const [value, setValue] = useState(() => initialDraft(snapshot));
  const initialFingerprint = useRef(value.fingerprint);
  const [error, setError] = useState("");
  const [recovered, setRecovered] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [allowWithoutDraft, setAllowWithoutDraft] = useState(false);
  const submitting = useRef(false);
  const isDirty = value.fingerprint !== initialFingerprint.current;
  const draft = usePaymentDraft<CollectionDraft>({ ownerId: snapshot.draftOwnerId, scope: `workshop-collection:${snapshot.order.id}`, value,
    isDirty, onRestore: (raw) => {
      const restored = recoverDraft(raw, snapshot);
      if (!restored) { setError("El borrador no corresponde a esta orden o contiene datos invalidos. Descarta el borrador para continuar."); return; }
      setValue(restored); setRecovered(true); setError("");
    } });
  const [result, submitAction, pending] = useActionState<RepairPaymentSaveResult | null, CollectionDraft>(async (_previous, intent) => {
    try {
      const form = new FormData();
      Object.entries(intent.operation.payload).forEach(([key, field]) => { if (field !== undefined) form.set(key, field); });
      form.set("requestId", intent.requestId);
      const saved = await (intent.operation.mode === "create" ? saveRepairFormAction(form) : addRepairPaymentFormAction(form));
      if (saved.success) { draft.clearDraft(); onSaved(saved); }
      return saved;
    } catch { return { success: false, message: "No se pudo confirmar el cobro. Reintenta sin cambiar los datos." }; }
    finally { submitting.current = false; }
  }, null);
  const locked = pending || submitting.current || Boolean(result?.success);
  useEffect(() => {
    closeForm.current = () => {
      if (submitting.current || pending) return false;
      if (isDirty && !window.confirm(storageUnavailable ? "Hay cambios sin guardar y no se pudo conservar el borrador. Queres cerrar? Verifica el saldo antes de volver a cobrar." : "Hay cambios sin guardar. Queres conservar el borrador y cerrar?")) return false;
      if (isDirty) draft.persistNow();
      return true;
    };
    return () => { closeForm.current = null; };
  }, [closeForm, draft, isDirty, pending, storageUnavailable]);

  function update(fields: Partial<CollectionDraft["operation"]["payload"]>) {
    if (locked) return;
    const operation = { ...value.operation, payload: { ...value.operation.payload, ...fields } } as CollectionDraft["operation"];
    const fingerprint = operationFingerprint(operation);
    if (fingerprint === value.fingerprint) { setValue({ ...value, operation }); return; }
    setValue({ ...value, operation, fingerprint, requestId: crypto.randomUUID(), availableBalance: balances(snapshot).balance });
    setRecovered(false); setError("");
  }
  const recovery = draft.pendingDraft ? <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
    <p>Hay un borrador local. No es un cobro registrado.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={locked} onClick={() => {
        if (!recoverDraft(draft.pendingDraft?.data, snapshot)) {
          setError("El borrador no corresponde a esta orden o contiene datos invalidos. Descarta el borrador para continuar."); return;
        }
        draft.restoreDraft();
      }}>Recuperar borrador</Button>
      <Button type="button" variant="ghost" disabled={locked} onClick={() => { draft.discardDraft(); setError(""); }}>Descartar borrador</Button>
    </div>
  </div> : null;
  if (balances(snapshot).balance === 0 && !recovered) return <div className="mt-4 grid gap-3">
    <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">Sin saldo pendiente</p>
    {recovery}
    {error ? <p role="alert" className="text-sm text-rose-800">{error}</p> : null}
  </div>;
  return <form className="mt-4 grid min-w-0 gap-4" onSubmit={(event) => {
    event.preventDefault();
    if (locked || submitting.current) return;
    const payments = paymentsFromDraft(value).filter((payment) => payment.amount !== 0);
    const validation = !payments.length ? "Ingresa el dinero recibido para confirmar el cobro." : getRepairValidationError({ amount: recovered ? value.availableBalance : balances(snapshot).balance, payments });
    if (validation) { setError(validation); return; }
    if (draft.pendingDraft) { setError("Recupera o descarta el borrador pendiente antes de cobrar."); return; }
    if (!draft.persistNow()) {
      setStorageUnavailable(true);
      if (!allowWithoutDraft) { setError("No se pudo guardar el borrador local. Podes continuar conservando el mismo intento solo en esta ventana."); return; }
    }
    submitting.current = true; setError(""); startTransition(() => submitAction(value));
  }}>
    {recovery}
    {recovered ? <p className="text-sm text-amber-800">Borrador recuperado. Se conserva el intento original; revisa los datos y confirma para reintentarlo.</p> : null}
    <fieldset disabled={locked} className="grid min-w-0 gap-4">
      <label className="grid gap-2 text-sm font-medium">Fecha del cobro<Input type="date" required value={value.operation.payload.paymentDate} onChange={(event) => update({ paymentDate: event.target.value, paymentTimestamp: event.target.value === getLocalDateInputValue() ? new Date().toISOString() : undefined })} /></label>
      <PaymentSplitFields compact payments={paymentsFromDraft(value)} totalAmount={recovered ? getPaymentTotal(paymentsFromDraft(value)) : balances(snapshot).balance} syncAmountWithTotal={false} onChange={(payments) => update({ paymentsJson: JSON.stringify(payments) })} />
      {storageUnavailable ? <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p>Sin almacenamiento local, cerrar o recargar pierde el intento. Verifica el saldo antes de volver a cobrar.</p><label className="flex min-h-11 items-start gap-3"><input className="mt-1" type="checkbox" checked={allowWithoutDraft} onChange={(event) => setAllowWithoutDraft(event.target.checked)} />Continuar sin borrador local (solo en esta ventana)</label></div> : null}
    </fieldset>
    <p className="text-xs leading-5 text-slate-500">Registra solo el dinero recibido. Cobrar no entrega el equipo ni cambia el presupuesto o la garantia.</p>
    {draft.lastSavedAt ? <p className="text-xs text-slate-500">Borrador guardado en este dispositivo.</p> : null}
    {error || result?.message ? <p role="alert" className="text-sm text-rose-800">{error || result?.message}</p> : null}
    <Button type="submit" disabled={locked} className="min-h-12 w-full">{pending ? "Guardando cobro..." : "Confirmar cobro"}</Button>
  </form>;
}

function DeliveryForm({ snapshot, order, closeForm, onSaved }: FormProps & { order: RepairAccessOrderRecord }) {
  const [recipient, setRecipient] = useState(snapshot.order.customerName);
  const [notes, setNotes] = useState("");
  const [allowBalance, setAllowBalance] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<{ fingerprint: string; id: string } | null>(null);
  const submitting = useRef(false);
  const [result, submit, pending] = useActionState<ActionResult | null, FormData>(async (previous, form) => {
    try {
      const saved = await deliverRepairOrder(previous, form);
      if (saved.success) onSaved(saved);
      return saved;
    } catch { return { success: false, message: "No se pudo confirmar la entrega. Revisa el estado antes de reintentar." }; }
    finally { submitting.current = false; }
  }, null);
  const hasBalance = balances(snapshot).balance > 0;
  const requiresAuthorization = hasBalance || (!hasBalance && !snapshot.order.isPaid && snapshot.order.status === "listo_para_retirar");
  const dirty = recipient !== snapshot.order.customerName || notes !== "" || allowBalance || confirmed;
  useEffect(() => {
    closeForm.current = () => !submitting.current && !pending && (!dirty || window.confirm("Hay cambios sin guardar. Queres descartarlos y cerrar?"));
    return () => { closeForm.current = null; };
  }, [closeForm, dirty, pending]);
  return <form className="mt-4 grid min-w-0 gap-4" onSubmit={(event) => {
    event.preventDefault();
    if (pending || submitting.current || result?.success) return;
    if (recipient.trim().length < 2 || !confirmed || (requiresAuthorization && (!allowBalance || notes.trim().length < 3))) {
      setError("Indica quien retira, confirma el retiro y completa cualquier autorizacion con su motivo."); return;
    }
    const form = new FormData(event.currentTarget);
    const fingerprint = JSON.stringify(Array.from(form.entries()));
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, id: crypto.randomUUID() };
    form.set("operationId", operation.current.id);
    submitting.current = true; setError(""); startTransition(() => submit(form));
  }}>
    <fieldset disabled={pending} className="grid min-w-0 gap-4">
      <input type="hidden" name="id" value={snapshot.order.id} /><input type="hidden" name="version" value={snapshot.order.workflowVersion ?? ""} />
      <p className="rounded-xl bg-slate-50 p-3 text-sm">Comprobar equipo y accesorios antes de entregar. Accesorios de ingreso: {order.device.accessoryDetails || "Sin accesorios declarados"}</p>
      <Field label="Persona que retira"><Input name="recipient" required minLength={2} value={recipient} onChange={(event) => setRecipient(event.target.value)} /></Field>
      <Field label="Accesorios devueltos y observaciones"><Textarea name="notes" maxLength={2000} required={requiresAuthorization && allowBalance} minLength={requiresAuthorization && allowBalance ? 3 : undefined} value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      {requiresAuthorization ? <label className="flex min-h-11 items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><input className="mt-1" name="allowBalance" type="checkbox" required checked={allowBalance} onChange={(event) => setAllowBalance(event.target.checked)} />{hasBalance ? "Autorizo entrega con saldo pendiente. El motivo debe constar en las observaciones." : "Autorizo entrega sin cobros pendientes. Indica el motivo en las observaciones."}</label> : null}
      <label className="flex min-h-11 items-start gap-3 text-sm font-semibold"><input className="mt-1" name="confirmDelivery" type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo que el cliente retiro el equipo</label>
    </fieldset>
    {error || result?.message ? <p role="alert" className="text-sm text-rose-800">{error || result?.message}</p> : null}
    <Button type="submit" disabled={pending || Boolean(result?.success)} className="min-h-12">{pending ? "Guardando entrega..." : "Confirmar entrega"}</Button>
  </form>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 text-sm"><span className="font-medium text-slate-700">{label}</span>{children}</label>; }
