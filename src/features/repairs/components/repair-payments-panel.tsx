"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionMenu } from "@/components/ui/action-menu";
import { DialogShell } from "@/components/ui/dialog-shell";
import { DraftRecoveryBanner } from "@/components/forms/draft-recovery-banner";
import { formatCashMethod } from "@/lib/cash";
import { getPaymentTotal, type PaymentSplit } from "@/lib/payment-splits";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";
import { addRepairPaymentFormAction, reverseRepairPaymentAction, type RepairPaymentSaveResult } from "../actions";
import { usePaymentDraft } from "../use-payment-draft";

const paymentDraftSchema = z.object({
  requestId: z.string().uuid(), paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repairId: z.string().uuid(), balanceAtStart: z.number().finite().min(0),
  payments: z.array(z.object({ method: z.enum(["efectivo", "nx", "mp"]), amount: z.number().finite().min(0) })).min(1).max(20)
});

export function RepairPaymentsPanel({ repair, canReverse, draftOwnerId }: {
  repair: { id: string; repairAccessOrderNumber?: string; orderNumber?: string | null; paidTotal: number; balance: number; payments: Array<{ id?: string; method: string; amount: number; paymentDate?: string; source?: string }> };
  canReverse: boolean;
  draftOwnerId?: string;
}) {
  const router = useRouter();
  const [requestId, setRequestId] = useState("");
  const [paymentDate, setPaymentDate] = useState(getLocalDateInputValue);
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: "efectivo", amount: 0 }]);
  const [removingPaymentId, setRemovingPaymentId] = useState<string | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [balanceAtStart, setBalanceAtStart] = useState(repair.balance);
  const [feedback, setFeedback] = useState<RepairPaymentSaveResult | null>(null);
  const savingRef = useRef(false);
  const draft = usePaymentDraft({ ownerId: draftOwnerId, scope: `additional:${repair.id}`, isDirty: dirty,
    value: { requestId, repairId: repair.id, balanceAtStart, paymentDate, payments }, onRestore: (value) => {
      const parsed = paymentDraftSchema.safeParse(value);
      if (!parsed.success || parsed.data.repairId !== repair.id || getPaymentTotal(parsed.data.payments) > parsed.data.balanceAtStart) { setFeedback({ success: false, message: "El borrador no es valido. Descartalo y vuelve a cargar el cobro." }); return; }
      setRequestId(parsed.data.requestId); setBalanceAtStart(parsed.data.balanceAtStart); setPaymentDate(parsed.data.paymentDate); setPayments(parsed.data.payments); setDirty(true); setRecovered(true);
    }
  });
  const removingPayment = repair.payments.find((payment) => payment.id === removingPaymentId && payment.source !== "repair_access");
  useEffect(() => { setRequestId(crypto.randomUUID()); }, [repair.id]);
  const amountInCents = Math.round(getPaymentTotal(payments) * 100);
  const balanceInCents = Math.round((recovered ? balanceAtStart : repair.balance) * 100);
  const orderNumber = repair.repairAccessOrderNumber || repair.orderNumber;
  function changePaymentIntent() {
    setDirty(true); setRecovered(false); setBalanceAtStart(repair.balance); setRequestId(crypto.randomUUID()); setFeedback(null);
  }
  function changePayments(next: PaymentSplit[]) {
    const canonical = (items: PaymentSplit[]) => JSON.stringify(items.filter(payment => payment.amount !== 0));
    if (canonical(next) !== canonical(payments)) changePaymentIntent();
    setPayments(next);
  }
  function closeRemoval() {
    if (removalReason && !window.confirm("Descartar el motivo de esta correccion?")) return;
    setRemovingPaymentId(null);
    setRemovalReason("");
  }
  return <Card><section aria-label="Cobros acumulativos de la reparacion">
    <h2 className="text-lg font-semibold">Cobros de la reparacion{orderNumber ? <span className="mt-1 block break-words text-base">{orderNumber}</span> : null}</h2>
    <dl className="mt-3 grid gap-4 sm:grid-cols-2">
      <div><dt className="text-sm text-slate-600">Saldo pendiente</dt><dd className="text-2xl font-semibold tabular-nums">{formatCurrency(repair.balance)}</dd></div>
      <div><dt className="text-sm text-slate-600">Pagado real</dt><dd className="text-xl font-semibold tabular-nums">{formatCurrency(repair.paidTotal)}</dd></div>
    </dl>
    <p className="mt-3 text-sm text-slate-500">Cobrar o corregir un pago no cambia la entrega ni la garantia.</p>
    {feedback ? <p role={feedback.success ? "status" : "alert"} className={`mt-3 rounded-xl p-3 text-sm ${feedback.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{feedback.message}</p> : null}
    {repair.balance > 0 || draft.pendingDraft || recovered ? <form className="mt-4 space-y-3 border-t border-graphite/10 pt-4" onSubmit={async event => {
      event.preventDefault();
      if (savingRef.current || saved) return;
      if (draft.pendingDraft) { setFeedback({ success: false, message: "Recupera o descarta el borrador pendiente antes de cobrar." }); return; }
      if (!Number.isFinite(amountInCents) || amountInCents <= 0 || amountInCents > balanceInCents) { setFeedback({ success: false, message: "El cobro supera el saldo disponible. Revisa los importes." }); return; }
      const data = new FormData(event.currentTarget);
      savingRef.current = true; setSaving(true); draft.persistNow();
      try {
        const result = await addRepairPaymentFormAction(data); setFeedback(result);
        if (result.success) {
          draft.clearDraft(); setDirty(false); setSaved(true);
          const params = new URLSearchParams(window.location.search);
          params.set("status", "repair_payment_added"); params.set("edit", repair.id); params.set("receipt", requestId); params.delete("error");
          router.replace(`/reparaciones?${params.toString()}` as import("next").Route); router.refresh();
        }
      } catch { setFeedback({ success: false, message: "No se pudo confirmar el cobro. Conservamos los datos; reintenta sin cambiarlos." }); }
      finally { savingRef.current = false; setSaving(false); }
    }}>
      {draft.pendingDraft ? <DraftRecoveryBanner onRestore={() => {
        const parsed = paymentDraftSchema.safeParse(draft.pendingDraft?.data);
        if (!parsed.success || parsed.data.repairId !== repair.id || getPaymentTotal(parsed.data.payments) > parsed.data.balanceAtStart) { setFeedback({ success: false, message: "El borrador no es valido para este registro. Descartalo y vuelve a cargar el cobro." }); return; }
        draft.restoreDraft();
      }} onDiscard={draft.discardDraft} updatedAt={draft.pendingDraft.updatedAt} /> : null}
      {recovered ? <p className="text-sm text-amber-800">Se recupero el intento original. Confirmar con los mismos datos verifica ese cobro sin volver a registrarlo si ya se habia guardado.</p> : null}
      <fieldset disabled={saving || saved || (repair.balance === 0 && !recovered)} className="grid min-w-0 gap-3">
      <input name="repairId" type="hidden" value={repair.id} /><input name="requestId" type="hidden" value={requestId} />
      <input name="paymentsJson" type="hidden" value={JSON.stringify(payments)} />
      <PaymentSplitFields title="Nuevo cobro" payments={payments} onChange={changePayments} totalAmount={recovered ? getPaymentTotal(payments) : repair.balance} syncAmountWithTotal={false} />
      <p className="text-sm text-slate-500">Indica solo el importe recibido. Puede ser menor al saldo pendiente.</p>
      <label className="block text-sm">Fecha de cobro<Input className="mt-2 max-w-xs" name="paymentDate" type="date" required value={paymentDate} onChange={(event) => { if (event.target.value !== paymentDate) changePaymentIntent(); setPaymentDate(event.target.value); }} /></label>
      <FormSubmitButton disabled={!requestId || saving || saved || !Number.isFinite(amountInCents) || amountInCents <= 0 || amountInCents > balanceInCents} idleLabel={saving ? "Registrando..." : "Registrar cobro adicional"} pendingLabel="Registrando..." />
      </fieldset>
      {dirty && draft.lastSavedAt ? <p className="text-xs text-slate-500">Borrador local. Solo se registra dinero al confirmar el cobro.</p> : null}
    </form> : <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Esta reparacion ya esta cobrada. Los pagos incorrectos se corrigen desde el historial.</p>}
    <h3 className="mt-5 border-t border-graphite/10 pt-4 font-semibold">Pagos registrados</h3>
    {!repair.payments.length ? <p className="mt-2 text-sm text-slate-500">Todavia no hay pagos registrados. Elegi la cuenta y el importe recibido para cargar el primer cobro.</p> : null}
    <div className="mt-2 divide-y divide-graphite/10">
      {repair.payments.map((payment, index) => <div className="flex flex-wrap items-start justify-between gap-3 py-3" key={payment.id ?? index}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{payment.paymentDate ? formatDate(payment.paymentDate) : "Fecha historica"} / {formatCashMethod(payment.method)}</p>
          <p className="mt-1 font-semibold tabular-nums">{formatCurrency(payment.amount)}</p>
          {payment.source === "repair_access" ? <p className="mt-1 text-sm text-slate-500">Cobro de la REP. Se corrige desde esa orden.</p> : null}
        </div>
        {canReverse && payment.id && payment.source !== "repair_access" ? <ActionMenu label="Más acciones"><Button onClick={() => { setRemovalReason(""); setRemovingPaymentId(payment.id ?? null); }} type="button" variant="danger" size="sm">Eliminar pago</Button></ActionMenu> : null}
      </div>)}
    </div>
    {canReverse && removingPayment ? <DialogShell labelledBy="remove-repair-payment-title" onClose={closeRemoval} panelClassName="max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <h2 id="remove-repair-payment-title" className="text-xl font-semibold">Eliminar pago incorrecto</h2>
        <Button type="button" variant="ghost" aria-label="Cerrar correccion de pago" onClick={closeRemoval}><X aria-hidden="true" className="h-4 w-4" /></Button>
      </div>
      <p className="mt-3 text-sm">{orderNumber ? `${orderNumber} / ` : ""}{formatCashMethod(removingPayment.method)} / <strong>{formatCurrency(removingPayment.amount)}</strong></p>
      <p className="mt-3 text-sm text-slate-600">Se corregira este importe en caja y quedara registrado el motivo. La orden y los demas pagos no se eliminan.</p>
      <p className="mt-2 text-sm text-slate-600">La correccion usa la fecha actual y conserva el historial. No es una devolucion al cliente. Los pagos historicos sin respaldo requieren conciliacion.</p>
      <form action={reverseRepairPaymentAction} className="mt-5 space-y-4">
        <input name="repairId" type="hidden" value={repair.id} /><input name="paymentId" type="hidden" value={removingPayment.id} />
        <label className="block text-sm">Motivo para eliminar el pago<Input className="mt-2" name="reason" value={removalReason} onChange={(event) => setRemovalReason(event.target.value)} placeholder="Pago de prueba, error de carga..." required minLength={3} maxLength={1000} /></label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={closeRemoval}>Cancelar</Button>
          <FormSubmitButton idleLabel="Confirmar eliminacion" pendingLabel="Eliminando..." variant="danger" />
        </div>
      </form>
    </DialogShell> : null}
  </section></Card>;
}
