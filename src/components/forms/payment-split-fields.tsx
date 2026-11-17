"use client";

import { useEffect, useRef } from "react";
import { WalletCards, X } from "lucide-react";

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
  compact?: boolean;
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
  compact = false,
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
    const remaining = syncAmountWithTotal
      ? Math.max(roundPaymentAmount(totalAmount - assignedTotal), 0)
      : 0;
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
    <div className={`min-w-0 rounded-xl border border-border bg-card ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-start gap-2">
          <WalletCards
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {!compact ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Indicá cuánto recibe cada cuenta.
              </p>
            ) : null}
          </div>
        </div>
        <Button onClick={addPaymentRow} size="sm" type="button" variant="secondary">
          Agregar medio
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {payments.map((payment, index) => (
          <div
            className={
              compact
                ? "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
                : "grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,180px)_auto] sm:items-end"
            }
            key={index}
          >
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-body"
                htmlFor={`payment-method-${index}`}
              >
                Medio {index + 1}
              </label>
              <Select
                id={`payment-method-${index}`}
                onChange={(event) => updatePayment(index, "method", event.target.value)}
                options={PAYMENT_METHODS.map((method) => ({
                  value: method.value,
                  label: method.label
                }))}
                value={payment.method}
              />
            </div>
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-body"
                htmlFor={`payment-amount-${index}`}
              >
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
            <Button
              aria-label={compact ? `Quitar medio ${index + 1}` : undefined}
              className={compact ? "min-h-11 w-11 px-0" : "md:mb-px"}
              onClick={() => removePaymentRow(index)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {compact ? <X aria-hidden="true" className="h-4 w-4" /> : "Quitar"}
            </Button>
          </div>
        ))}
      </div>

      {compact ? (
        <dl
          aria-live="polite"
          className="mt-3 grid min-w-0 grid-cols-2 gap-3 border-t border-border pt-3 text-sm"
        >
          <div className="min-w-0">
            <dt className="text-muted-foreground">Dinero recibido</dt>
            <dd className="mt-1 font-semibold wrap-break-word tabular-nums">
              {formatCurrency(assignedTotal)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">
              {difference < 0 ? "Excede el saldo" : "Saldo luego del cobro"}
            </dt>
            <dd
              className={`mt-1 font-semibold wrap-break-word tabular-nums ${difference < 0 ? "text-danger" : "text-foreground"}`}
            >
              {formatCurrency(Math.abs(difference))}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Total a cobrar</p>
            <p className="mt-1 font-semibold text-foreground tabular-nums">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Importe distribuido</p>
            <p className="mt-1 font-semibold text-foreground tabular-nums">
              {formatCurrency(assignedTotal)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {difference < 0 ? "Excedente asignado" : "Falta distribuir"}
            </p>
            <p
              aria-live="polite"
              className={`mt-1 font-semibold tabular-nums ${
                Math.abs(difference) < 0.01 ? "text-success" : "text-danger"
              }`}
            >
              {formatCurrency(difference)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalAmount <= 0
                ? "Cargá el total antes de confirmar el cobro."
                : Math.abs(difference) < 0.01
                  ? "Importes completos."
                  : difference > 0
                    ? "Todavia falta asignar parte del cobro."
                    : "Hay mas dinero asignado que el declarado."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
