"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { formatCashMethod, getCashMethodOptions } from "@/lib/cash";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";
import { addRepairPaymentAction, reverseRepairPaymentAction } from "../actions";

export function RepairPaymentsPanel({ repair, canReverse }: {
  repair: { id: string; paidTotal: number; balance: number; payments: Array<{ id?: string; method: string; amount: number; paymentDate?: string; source?: string }> };
  canReverse: boolean;
}) {
  const [requestId, setRequestId] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [amount, setAmount] = useState("");
  useEffect(() => { setRequestId(crypto.randomUUID()); }, [repair.id, repair.paidTotal, repair.balance, method, amount]);
  return <section className="rounded-[28px] border border-graphite/8 bg-white/90 p-5" aria-label="Cobros acumulativos de la reparacion">
    <h2 className="text-lg font-semibold">Señas y saldo</h2>
    <p className="mt-2 text-sm">Pagado real: <strong>{formatCurrency(repair.paidTotal)}</strong> / Saldo: <strong>{formatCurrency(repair.balance)}</strong></p>
    <p className="mt-2 text-sm text-slate-500">Cobrar o revertir no cambia la entrega fisica ni reinicia la garantia. Los cobros anteriores conservan su fecha.</p>
    <p className="mt-2 text-sm text-slate-500">La reversa corrige un cobro cargado por error mediante una compensacion de caja con fecha actual y motivo. Conserva el ingreso original; no representa una devolucion real de dinero al cliente. Historicos sin respaldo suficiente requieren conciliacion.</p>
    <div className="mt-4 space-y-3">
      {repair.payments.map((payment, index) => <div className="rounded-2xl bg-brand-50 p-4" key={payment.id ?? index}>
        <p className="text-sm font-semibold">{payment.paymentDate ? formatDate(payment.paymentDate) : "Fecha historica"} / {formatCashMethod(payment.method)} / {formatCurrency(payment.amount)}</p>
        {payment.source === "repair_access" ? <p className="mt-2 text-sm text-slate-500">Cobro nativo de la orden. Su reversa se gestiona desde ese circuito.</p> : null}
        {canReverse && payment.id && payment.source !== "repair_access" ? <form action={reverseRepairPaymentAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input name="repairId" type="hidden" value={repair.id} /><input name="paymentId" type="hidden" value={payment.id} />
          <Input aria-label={`Motivo de reversa del pago ${index + 1}`} name="reason" placeholder="Motivo de reversa (obligatorio)" required minLength={3} maxLength={1000} />
          <FormSubmitButton idleLabel="Revertir este pago" pendingLabel="Revirtiendo..." variant="danger" />
        </form> : null}
      </div>)}
    </div>
    {repair.balance > 0 ? <form action={addRepairPaymentAction} className="mt-4 grid gap-3 sm:grid-cols-3">
      <input name="repairId" type="hidden" value={repair.id} /><input name="requestId" type="hidden" value={requestId} />
      <input name="paymentsJson" type="hidden" value={JSON.stringify([{ method, amount: Number(amount) }])} />
      <label className="text-sm">Fecha de cobro<Input className="mt-2" name="paymentDate" type="date" required defaultValue={getLocalDateInputValue()} /></label>
      <label className="text-sm">Medio de cobro<Select className="mt-2" options={getCashMethodOptions()} onChange={(event) => setMethod(event.target.value)} value={method} /></label>
      <label className="text-sm">Importe de seña o saldo<Input className="mt-2" type="number" min={0.01} max={repair.balance} step="0.01" required onChange={(event) => setAmount(event.target.value)} value={amount} /></label>
      <FormSubmitButton disabled={!requestId} className="sm:col-span-3" idleLabel="Registrar cobro adicional" pendingLabel="Registrando..." />
    </form> : null}
  </section>;
}
