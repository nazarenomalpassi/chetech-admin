"use client";

import { useEffect, useRef } from "react";
import { WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { getPaymentTotal, roundPaymentAmount, type PaymentSplit } from "@/lib/payment-splits";
import { formatCurrency } from "@/lib/utils";

type PaymentSplitFieldsProps = {
  payments: PaymentSplit[];
  title?: string;
  totalAmount: number;
  syncAmountWithTotal?: boolean;
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
  syncAmountWithTotal = true,
  onChange
}: PaymentSplitFieldsProps) {
  const previousTotalRef = useRef(totalAmount);

  useEffect(() => {
    const previousTotal = previousTotalRef.current;
    previousTotalRef.current = totalAmount;

    if (!syncAmountWithTotal || payments.length !== 1) return;
    if (Math.abs(previousTotal - totalAmount) < 0.01) return;

    const currentAmount = Number(payments[0]?.amount ?? 0);
    const shouldSyncAmount = Math.abs(currentAmount - previousTotal) < 0.01 || currentAmount <= 0;

    if (!shouldSyncAmount) return;

    onChange([{ ...payments[0], amount: Math.max(totalAmount, 0) }]);
  }, [onChange, payments, totalAmount, syncAmountWithTotal]);

  const assignedTotal = getPaymentTotal(payments);
  const difference = totalAmount > 0 ? roundPaymentAmount(totalAmount - assignedTotal) : 0;

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
    const remaining = Math.max(roundPaymentAmount(totalAmount - assignedTotal), 0);
    onChange([...payments, { ...EMPTY_PAYMENT, amount: remaining }]);
  }

  function removePaymentRow(index: number) {
    if (payments.length === 1) {
      onChange([{ ...payments[0], amount: syncAmountWithTotal ? totalAmount : 0 }]);
      return;
    }

    onChange(payments.filter((_, paymentIndex) => paymentIndex !== index));
  }

  return (
    <div className="min-w-0 rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-start gap-2">
          <WalletCards aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-1 text-sm text-slate-600">
              Indicá cuánto recibe cada cuenta.
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
            className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,180px)_auto] sm:items-end"
            key={index}
          >
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor={`payment-method-${index}`}>
                Medio {index + 1}
              </label>
              <Select
                id={`payment-method-${index}`}
                onChange={(event) => updatePayment(index, "method", event.target.value)}
                options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
                value={payment.method}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor={`payment-amount-${index}`}>
                Monto
              </label>
              <MoneyInput
                id={`payment-amount-${index}`}
                min={0}
                onValueChange={(value) => updatePayment(index, "amount", value)}
                onFocus={(event) => event.currentTarget.select()}
                placeholder="0,00"
                value={Number.isFinite(payment.amount) ? payment.amount : 0}
              />
            </div>
            <Button className="md:mb-[1px]" onClick={() => removePaymentRow(index)} size="sm" type="button" variant="ghost">
              Quitar
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-600">Total a cobrar</p>
          <p className="mt-1 font-semibold tabular-nums text-slate-950">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-slate-600">Importe distribuido</p>
          <p className="mt-1 font-semibold tabular-nums text-slate-950">{formatCurrency(assignedTotal)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-sm text-slate-600">{difference < 0 ? "Excedente asignado" : "Falta distribuir"}</p>
          <p
            aria-live="polite"
            className={`mt-1 font-semibold tabular-nums ${
              Math.abs(difference) < 0.01 ? "text-finance-profit" : "text-finance-expense"
            }`}
          >
            {formatCurrency(difference)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totalAmount <= 0 ? "Cargá el total antes de confirmar el cobro." : Math.abs(difference) < 0.01
              ? "Importes completos."
              : difference > 0
                ? "Todavia falta asignar parte del cobro."
                : "Hay mas dinero asignado que el declarado."}
          </p>
        </div>
      </div>
    </div>
  );
}
