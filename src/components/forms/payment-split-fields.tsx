"use client";

import { useEffect, useRef } from "react";
import { ArrowRightLeft, Landmark, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import type { PaymentSplit } from "@/lib/payment-splits";
import { formatCurrency } from "@/lib/utils";

type PaymentSplitFieldsProps = {
  payments: PaymentSplit[];
  title?: string;
  totalAmount: number;
  onChange: (payments: PaymentSplit[]) => void;
};

const EMPTY_PAYMENT: PaymentSplit = {
  method: "efectivo",
  amount: 0
};

export function PaymentSplitFields({
  payments,
  title = "Medios de pago",
  totalAmount,
  onChange
}: PaymentSplitFieldsProps) {
  const previousTotalRef = useRef(totalAmount);

  useEffect(() => {
    const previousTotal = previousTotalRef.current;
    previousTotalRef.current = totalAmount;

    if (payments.length !== 1) return;
    if (Math.abs(previousTotal - totalAmount) < 0.01) return;

    const currentAmount = Number(payments[0]?.amount ?? 0);
    const shouldSyncAmount = Math.abs(currentAmount - previousTotal) < 0.01 || currentAmount <= 0;

    if (!shouldSyncAmount) return;

    onChange([{ ...payments[0], amount: Math.max(totalAmount, 0) }]);
  }, [onChange, payments, totalAmount]);

  const assignedTotal = payments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
  const difference = totalAmount > 0 ? totalAmount - assignedTotal : 0;

  function updatePayment(index: number, field: keyof PaymentSplit, value: string | number) {
    onChange(
      payments.map((payment, paymentIndex) =>
        paymentIndex === index
          ? {
              ...payment,
              [field]: field === "amount" ? Number(value) : value
            }
          : payment
      )
    );
  }

  function addPaymentRow() {
    const remaining = Math.max(totalAmount - assignedTotal, 0);
    onChange([...payments, { ...EMPTY_PAYMENT, amount: remaining }]);
  }

  function removePaymentRow(index: number) {
    if (payments.length === 1) {
      onChange([{ ...payments[0], amount: totalAmount }]);
      return;
    }

    onChange(payments.filter((_, paymentIndex) => paymentIndex !== index));
  }

  return (
    <div className="rounded-[28px] border border-graphite/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,248,244,0.94))] p-4 shadow-[0_14px_30px_rgba(20,20,19,0.05)]">
      <div className="flex flex-col gap-4 border-b border-graphite/8 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-graphite/8 bg-brand-100 text-graphite">
            <WalletCards className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-1 text-sm text-slate-500">
              Reparti el cobro entre las cuentas que use el cliente sin perder claridad operativa.
            </p>
          </div>
        </div>
        <Button onClick={addPaymentRow} size="sm" type="button" variant="secondary">
          Agregar medio
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {payments.map((payment, index) => (
          <div
            className="grid gap-3 rounded-[24px] border border-graphite/8 bg-white/88 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_22px_rgba(20,20,19,0.04)] md:grid-cols-[minmax(0,1fr)_180px_100px] md:items-end"
            key={`${payment.method}-${index}`}
          >
            <div className="space-y-2">
              <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Medio {index + 1}
              </label>
              <Select
                onChange={(event) => updatePayment(index, "method", event.target.value)}
                options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
                value={payment.method}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Monto
              </label>
              <Input
                min={0}
                onChange={(event) => updatePayment(index, "amount", event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                step="0.01"
                type="number"
                value={Number.isFinite(payment.amount) && payment.amount > 0 ? payment.amount : ""}
              />
            </div>
            <Button className="md:mb-[1px]" onClick={() => removePaymentRow(index)} size="sm" type="button" variant="ghost">
              Quitar
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 rounded-[24px] bg-brand-50/85 p-4 md:grid-cols-3">
        <div className="rounded-[20px] border border-graphite/8 bg-white/85 p-4">
          <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
            <Landmark className="h-3.5 w-3.5" />
            Total declarado
          </div>
          <p className="mt-3 text-xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="rounded-[20px] border border-graphite/8 bg-white/85 p-4">
          <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Total operacion
          </div>
          <p className="mt-3 text-xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrency(assignedTotal)}</p>
        </div>
        <div className="rounded-[20px] border border-graphite/8 bg-white/85 p-4">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Diferencia</p>
          <p
            className={`mt-3 text-xl font-semibold tracking-[-0.04em] ${
              Math.abs(difference) < 0.01 ? "text-finance-profit" : "text-finance-expense"
            }`}
          >
            {formatCurrency(difference)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {Math.abs(difference) < 0.01
              ? "Cobro completo y balanceado."
              : difference > 0
                ? "Todavia falta asignar parte del cobro."
                : "Hay mas dinero asignado que el declarado."}
          </p>
        </div>
      </div>
    </div>
  );
}
