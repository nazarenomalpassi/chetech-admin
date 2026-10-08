"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionMenu } from "@/components/ui/action-menu";
import { DialogShell } from "@/components/ui/dialog-shell";
import { formatCashMethod } from "@/lib/cash";
import { getPaymentTotal, type PaymentSplit } from "@/lib/payment-splits";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";
import { addRepairPaymentAction, reverseRepairPaymentAction } from "../actions";

export function RepairPaymentsPanel({ repair, canReverse }: {
  repair: { id: string; repairAccessOrderNumber?: string; orderNumber?: string | null; paidTotal: number; balance: number; payments: Array<{ id?: string; method: string; amount: number; paymentDate?: string; source?: string }> };
  canReverse: boolean;
}) {
  const [requestId, setRequestId] = useState("");
  const [paymentDate, setPaymentDate] = useState(getLocalDateInputValue);
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: "efectivo", amount: 0 }]);
  const [removingPaymentId, setRemovingPaymentId] = useState<string | null>(null);
  const [removalReason, setRemovalReason] = useState("");
  const removingPayment = repair.payments.find((payment) => payment.id === removingPaymentId && payment.source !== "repair_access");
  useEffect(() => { setRequestId(crypto.randomUUID()); }, [repair.id, repair.paidTotal, repair.balance, payments, paymentDate]);
  const amountInCents = Math.round(getPaymentTotal(payments) * 100);
  const balanceInCents = Math.round(repair.balance * 100);
  const orderNumber = repair.repairAccessOrderNumber || repair.orderNumber;
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
    {repair.balance > 0 ? <form action={addRepairPaymentAction} className="mt-4 space-y-3 border-t border-graphite/10 pt-4">
      <input name="repairId" type="hidden" value={repair.id} /><input name="requestId" type="hidden" value={requestId} />
      <input name="paymentsJson" type="hidden" value={JSON.stringify(payments)} />
      <PaymentSplitFields title="Nuevo cobro" payments={payments} onChange={setPayments} totalAmount={repair.balance} syncAmountWithTotal={false} />
      <p className="text-sm text-slate-500">Indica solo el importe recibido. Puede ser menor al saldo pendiente.</p>
      <label className="block text-sm">Fecha de cobro<Input className="mt-2 max-w-xs" name="paymentDate" type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
      <FormSubmitButton disabled={!requestId || !Number.isFinite(amountInCents) || amountInCents <= 0 || amountInCents > balanceInCents} idleLabel="Registrar cobro adicional" pendingLabel="Registrando..." />
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
