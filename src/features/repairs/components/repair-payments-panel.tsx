"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Button } from "@/components/ui/button";
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
  const removingPayment = repair.payments.find((payment) => payment.id === removingPaymentId && payment.source !== "repair_access");
  useEffect(() => { setRequestId(crypto.randomUUID()); }, [repair.id, repair.paidTotal, repair.balance, payments, paymentDate]);
  const amountInCents = Math.round(getPaymentTotal(payments) * 100);
  const balanceInCents = Math.round(repair.balance * 100);
  const orderNumber = repair.repairAccessOrderNumber || repair.orderNumber;
  return <section className="rounded-[28px] border border-graphite/8 bg-white/90 p-5" aria-label="Cobros acumulativos de la reparacion">
    <h2 className="text-lg font-semibold">Cobros de la reparacion{orderNumber ? ` / ${orderNumber}` : ""}</h2>
    <p className="mt-2 text-sm">Pagado real: <strong>{formatCurrency(repair.paidTotal)}</strong> / Saldo: <strong>{formatCurrency(repair.balance)}</strong></p>
    <p className="mt-2 text-sm text-slate-500">Cobrar o revertir no cambia la entrega fisica ni reinicia la garantia. Los cobros anteriores conservan su fecha.</p>
    <p className="mt-2 text-sm text-slate-500">Para eliminar un pago de prueba o cargado por error, elegi ese pago e indica el motivo. Se descuenta de caja mediante una correccion con fecha actual y se conserva el historial; no es una devolucion de dinero al cliente. Los pagos historicos sin respaldo requieren conciliacion.</p>
    {repair.balance > 0 ? <form action={addRepairPaymentAction} className="mt-4 space-y-3">
      <input name="repairId" type="hidden" value={repair.id} /><input name="requestId" type="hidden" value={requestId} />
      <input name="paymentsJson" type="hidden" value={JSON.stringify(payments)} />
      <label className="block text-sm">Fecha de cobro<Input className="mt-2 max-w-xs" name="paymentDate" type="date" required value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
      <PaymentSplitFields title="Nuevo cobro: elegi la cuenta y el importe recibido" payments={payments} onChange={setPayments} totalAmount={repair.balance} syncAmountWithTotal={false} />
      <FormSubmitButton disabled={!requestId || !Number.isFinite(amountInCents) || amountInCents <= 0 || amountInCents > balanceInCents} idleLabel="Registrar cobro adicional" pendingLabel="Registrando..." />
    </form> : <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">Esta reparacion ya esta cobrada. Si un pago es incorrecto, podes eliminarlo del historial de abajo para recuperar el saldo.</p>}
    <h3 className="mt-6 font-semibold">Pagos registrados</h3>
    {!repair.payments.length ? <p className="mt-2 text-sm text-slate-500">Todavia no hay pagos registrados. Elegi la cuenta y el importe recibido para cargar el primer cobro.</p> : null}
    <div className="mt-4 space-y-3">
      {repair.payments.map((payment, index) => <div className="rounded-2xl bg-brand-50 p-4" key={payment.id ?? index}>
        <p className="text-sm font-semibold">{payment.paymentDate ? formatDate(payment.paymentDate) : "Fecha historica"} / {formatCashMethod(payment.method)} / {formatCurrency(payment.amount)}</p>
        {payment.source === "repair_access" ? <p className="mt-2 text-sm text-slate-500">Cobro nativo de la orden. Su reversa se gestiona desde ese circuito.</p> : null}
        {canReverse && payment.id && payment.source !== "repair_access" ? <Button className="mt-3" onClick={() => setRemovingPaymentId(payment.id ?? null)} type="button" variant="danger" size="sm">Eliminar pago</Button> : null}
      </div>)}
    </div>
    {canReverse && removingPayment ? <DialogShell labelledBy="remove-repair-payment-title" onClose={() => setRemovingPaymentId(null)} panelClassName="max-w-lg">
      <h2 id="remove-repair-payment-title" className="text-xl font-semibold">Eliminar pago incorrecto</h2>
      <p className="mt-3 text-sm">{orderNumber ? `${orderNumber} / ` : ""}{formatCashMethod(removingPayment.method)} / <strong>{formatCurrency(removingPayment.amount)}</strong></p>
      <p className="mt-3 text-sm text-slate-600">Se corregira este importe en caja y quedara registrado el motivo. La orden y los demas pagos no se eliminan.</p>
      <form action={reverseRepairPaymentAction} className="mt-5 space-y-4">
        <input name="repairId" type="hidden" value={repair.id} /><input name="paymentId" type="hidden" value={removingPayment.id} />
        <label className="block text-sm">Motivo para eliminar el pago<Input className="mt-2" name="reason" placeholder="Pago de prueba, error de carga..." required minLength={3} maxLength={1000} /></label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setRemovingPaymentId(null)}>Cancelar</Button>
          <FormSubmitButton idleLabel="Confirmar eliminacion" pendingLabel="Eliminando..." variant="danger" />
        </div>
      </form>
    </DialogShell> : null}
  </section>;
}
