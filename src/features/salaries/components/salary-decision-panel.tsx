"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, ChevronDown, ShieldCheck, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { confirmSalaryLiquidationAction } from "@/features/salaries/actions";
import { calculateFundingPlan, calculateSalaryPlan } from "@/features/salaries/calculator";
import type { SalaryAccount, SalaryMember } from "@/features/salaries/types";
import { formatCashMethod } from "@/lib/cash";
import { formatCurrency, getLocalDateInputValue } from "@/lib/utils";

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000001";
}

function ConfirmWithdrawalButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <Button disabled={disabled || pending} type="submit">{pending ? "Guardando retiro..." : "Confirmar retiro"}</Button>;
}

export function SalaryDecisionPanel({
  accounts,
  members,
  monthKey,
  monthLabel,
  suggestedAmount
}: {
  accounts: SalaryAccount[];
  members: SalaryMember[];
  monthKey: string;
  monthLabel: string;
  suggestedAmount: number;
}) {
  const [amount, setAmount] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [fundingAmounts, setFundingAmounts] = useState<Record<string, string>>(
    Object.fromEntries(accounts.map((account) => [account.method, ""]))
  );
  const withdrawalFormRef = useRef<HTMLFormElement>(null);
  const initialWithdrawalRef = useRef("");
  useEffect(() => {
    if (dialogOpen && withdrawalFormRef.current) {
      initialWithdrawalRef.current = JSON.stringify(Array.from(new FormData(withdrawalFormRef.current).entries()));
    }
  }, [dialogOpen]);

  function closeWithdrawal() {
    const form = withdrawalFormRef.current;
    const changed = form && JSON.stringify(Array.from(new FormData(form).entries())) !== initialWithdrawalRef.current;
    if (changed && !window.confirm("Cerrar sin confirmar el retiro? Hay cambios sin guardar.")) return;
    setDialogOpen(false);
  }
  const intendedAmount = Number(amount || 0);
  const plan = calculateSalaryPlan(members, intendedAmount);
  const fundingPlan = calculateFundingPlan(
    accounts.map((account) => ({
      method: account.method,
      balance: account.balance,
      amount: Number(fundingAmounts[account.method] || 0)
    })),
    plan.batchTotal
  );
  const allocations = plan.members.map((member) => ({
    memberId: member.id,
    salaryAmount: member.salaryAmount,
    profitShareAmount: member.profitShareAmount,
    totalAmount: member.totalAmount
  }));
  const fundingSources = fundingPlan.rows.map((row) => ({ paymentMethod: row.method, amount: row.amount }));

  return (
    <Card className="p-4 text-slate-950 sm:p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Simulacion de retiro</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{monthLabel}. Primero cubre el sueldo pendiente; el excedente se reparte entre los cuatro integrantes.</p>
        </div>
        <div className="border-l border-slate-200 pl-4 lg:min-w-56"><p className="text-sm text-slate-600">Disponible sugerido</p><p className="mt-2 text-xl font-semibold">{formatCurrency(suggestedAmount)}</p></div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div><label className="mb-2 block text-sm font-medium text-slate-600" htmlFor="salary-intended-amount">Dinero a retirar en esta operacion</label><MoneyInput className="font-semibold" id="salary-intended-amount" min={0} onValueChange={(value) => setAmount(String(value))} placeholder="Ej: 500000" value={intendedAmount} /></div>
        <div className="flex items-end"><Button className="w-full lg:w-auto" variant="secondary" onClick={() => setAmount(String(Math.round(suggestedAmount * 100) / 100))} type="button">Usar sugerido</Button></div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="border-t border-slate-200 py-3"><p className="text-sm text-slate-600">Sueldo simulado</p><p className="mt-2 text-xl font-semibold">{formatCurrency(plan.salaryAmount)}</p><p className="mt-1 text-xs text-slate-600">Cobertura mensual {plan.coveragePercentage.toFixed(1)}%</p></div>
        <div className="border-t border-slate-200 py-3"><p className="text-sm text-slate-600">Excedente distribuible</p><p className="mt-2 text-xl font-semibold text-amber-800">{formatCurrency(plan.excessAmount)}</p><p className="mt-1 text-xs text-slate-600">25% por integrante</p></div>
        <div className="border-t border-slate-200 py-3"><p className="text-sm text-slate-600">Total del retiro</p><p className="mt-2 text-xl font-semibold text-emerald-800">{formatCurrency(plan.batchTotal)}</p><p className="mt-1 text-xs text-slate-600">Salarios + excedente</p></div>
      </div>

      <details className="group mt-4 border-t border-slate-200">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 [&::-webkit-details-marker]:hidden">Reparto por integrante<ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
      <div className="grid gap-3 pb-3 xl:grid-cols-2">
        {plan.members.map((member) => (
          <article className="border-t border-slate-200 py-3" key={member.id}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{member.name}</h3><p className="mt-1 text-xs text-slate-600">Objetivo {formatCurrency(member.targetAmount)}</p></div><div className="text-right"><p className="text-sm text-slate-600">Total simulado</p><p className="mt-1 text-xl font-semibold text-emerald-800">{formatCurrency(member.totalAmount)}</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="py-2"><p className="text-slate-600">Sueldo simulado</p><p className="mt-1 font-semibold text-slate-950">{formatCurrency(member.salaryAmount)}</p></div><div className="py-2"><p className="text-slate-600">Participacion excedente</p><p className="mt-1 font-semibold text-amber-800">{formatCurrency(member.profitShareAmount)}</p></div></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, member.targetAmount ? (member.paidAfterPayment / member.targetAmount) * 100 : 0)}%` }} /></div>
            <div className="mt-3 flex justify-between gap-3 text-xs text-slate-600"><span>Pagado antes {formatCurrency(member.paidAmount)}</span><span>Pendiente simulado {formatCurrency(member.remainingAfterPayment)}</span></div>
          </article>
        ))}
      </div>
      </details>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheck className="h-4 w-4 shrink-0" /> No modifica caja hasta confirmar el retiro.</p><Button disabled={plan.batchTotal <= 0} onClick={() => setDialogOpen(true)} type="button">Revisar y confirmar retiro</Button></div>

      {dialogOpen ? (
        <DialogShell labelledBy="salary-liquidation-title" onClose={closeWithdrawal} panelClassName="max-w-4xl">
          <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-950" id="salary-liquidation-title">Retiro de {monthLabel}</h2><p className="mt-2 text-sm text-slate-600">Indica de que cuentas sale el total. Los movimientos se guardan juntos o no se guarda ninguno.</p></div><Button aria-label="Cerrar" onClick={closeWithdrawal} size="sm" type="button" variant="ghost"><X className="h-5 w-5" /></Button></div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="border-t border-slate-200 py-3"><p className="text-xs text-slate-500">Sueldos</p><p className="mt-2 text-lg font-semibold">{formatCurrency(plan.salaryAmount)}</p></div><div className="border-t border-slate-200 py-3"><p className="text-xs text-amber-700">Excedente</p><p className="mt-2 text-lg font-semibold text-amber-900">{formatCurrency(plan.excessAmount)}</p></div><div className="border-t border-slate-200 py-3"><p className="text-xs text-emerald-700">Total a retirar</p><p className="mt-2 text-lg font-semibold text-emerald-800">{formatCurrency(plan.batchTotal)}</p></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{plan.members.map((member) => <div className="border-t border-slate-200 py-3" key={member.id}><p className="text-sm font-semibold text-slate-950">{member.name}</p><p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(member.totalAmount)}</p><p className="mt-1 text-xs text-slate-500">Sueldo {formatCurrency(member.salaryAmount)} + excedente {formatCurrency(member.profitShareAmount)}</p></div>)}</div>

          <form action={confirmSalaryLiquidationAction} className="mt-4 space-y-4" ref={withdrawalFormRef}>
            <input name="periodMonth" type="hidden" value={monthKey} /><input name="intendedTotal" type="hidden" value={intendedAmount} /><input name="allocationsJson" type="hidden" value={JSON.stringify(allocations)} /><input name="fundingSourcesJson" type="hidden" value={JSON.stringify(fundingSources)} /><input name="idempotencyKey" type="hidden" value={idempotencyKey} />
            <div><h3 className="mt-2 text-xl font-semibold text-slate-950">¿Desde que cuentas se retira?</h3><div className="mt-4 grid gap-3 sm:grid-cols-3">{accounts.map((account) => {
              const row = fundingPlan.rows.find((funding) => funding.method === account.method);
              return <label className={`min-w-0 border-t py-3 ${row?.isOverdrawn ? "border-rose-300" : "border-slate-200"}`} key={account.method}><span className="block text-xs font-semibold text-slate-500">{formatCashMethod(account.method)}</span><span className="mt-2 block text-sm text-slate-600">Saldo disponible: {formatCurrency(account.balance)}</span><span className="mb-2 mt-4 block text-xs font-semibold text-slate-700">Retirar</span><MoneyInput max={Math.max(account.balance, 0)} min={0} onValueChange={(value) => setFundingAmounts((current) => ({ ...current, [account.method]: String(value) }))} placeholder="0" value={Number(fundingAmounts[account.method] || 0)} />{row?.isOverdrawn ? <span className="mt-2 block text-xs font-semibold text-rose-600">Supera el saldo disponible.</span> : null}</label>;
            })}</div></div>

            <div className={`rounded-xl border p-4 ${fundingPlan.isBalanced ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-slate-500">Total retiro</p><p className="mt-1 font-semibold text-slate-950">{formatCurrency(fundingPlan.totalAmount)}</p></div><div><p className="text-xs text-slate-500">Asignado</p><p className="mt-1 font-semibold text-slate-950">{formatCurrency(fundingPlan.assignedAmount)}</p></div><div><p className="text-xs text-slate-500">Diferencia</p><p className={`mt-1 font-semibold ${fundingPlan.isBalanced ? "text-emerald-700" : "text-amber-800"}`}>{fundingPlan.missingAmount > 0 ? `Faltan ${formatCurrency(fundingPlan.missingAmount)}` : fundingPlan.excessAssignedAmount > 0 ? `Exceso ${formatCurrency(fundingPlan.excessAssignedAmount)}` : "Total completamente cubierto"}</p></div></div>
              <p className={`mt-3 flex items-center gap-2 text-sm font-semibold ${fundingPlan.isBalanced ? "text-emerald-700" : "text-amber-800"}`}>{fundingPlan.isBalanced ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}{fundingPlan.hasOverdrawnAccount ? "Una cuenta no tiene saldo suficiente." : fundingPlan.isBalanced ? "Retiro completamente cubierto." : "La suma debe coincidir exactamente antes de confirmar."}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-xs font-semibold text-slate-500" htmlFor="salary-withdrawal-date">Fecha del retiro</label><Input defaultValue={getLocalDateInputValue()} id="salary-withdrawal-date" name="withdrawalDate" type="date" /></div><div><label className="mb-2 block text-xs font-semibold text-slate-500" htmlFor="salary-notes">Observaciones</label><Textarea id="salary-notes" name="notes" placeholder="Opcional" /></div></div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button onClick={closeWithdrawal} type="button" variant="secondary">Cancelar</Button><ConfirmWithdrawalButton disabled={!fundingPlan.isBalanced} /></div>
          </form>
        </DialogShell>
      ) : null}
    </Card>
  );
}
