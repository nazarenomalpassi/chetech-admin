"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, CircleDollarSign, ShieldCheck, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
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
    <section className="rounded-[30px] border border-graphite/10 bg-[linear-gradient(145deg,#181817,#292927)] p-4 text-white shadow-[0_24px_70px_rgba(20,20,19,0.18)] sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/55">Decision de liquidacion</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Monto del nuevo retiro</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Primero completa el sueldo pendiente del mes. Todo importe posterior se reparte en partes iguales entre los cuatro integrantes.</p>
        </div>
        <div className="rounded-[22px] border border-white/10 bg-white/7 px-4 py-3 lg:min-w-56"><p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">Sugerido disponible</p><p className="mt-2 text-xl font-semibold">{formatCurrency(suggestedAmount)}</p></div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/60" htmlFor="salary-intended-amount">Dinero a retirar en esta operacion</label><Input className="border-white/15 bg-white/95 text-lg font-semibold text-slate-950" id="salary-intended-amount" min={0} onChange={(event) => setAmount(event.target.value)} placeholder="Ej: 500000" step="0.01" type="number" value={amount} /></div>
        <div className="flex items-end"><Button className="w-full border border-white/15 bg-white text-graphite hover:bg-brand-100 lg:w-auto" onClick={() => setAmount(String(Math.round(suggestedAmount * 100) / 100))} type="button">Usar sugerido</Button></div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[22px] border border-white/10 bg-white/6 p-4"><p className="text-[0.64rem] uppercase tracking-[0.2em] text-white/50">Sueldo a pagar ahora</p><p className="mt-2 text-xl font-semibold">{formatCurrency(plan.salaryAmount)}</p><p className="mt-1 text-xs text-white/45">Cobertura mensual {plan.coveragePercentage.toFixed(1)}%</p></div>
        <div className="rounded-[22px] border border-amber-300/20 bg-amber-200/8 p-4"><p className="text-[0.64rem] uppercase tracking-[0.2em] text-amber-100/70">Excedente distribuible</p><p className="mt-2 text-xl font-semibold text-amber-200">{formatCurrency(plan.excessAmount)}</p><p className="mt-1 text-xs text-amber-100/50">25% por integrante</p></div>
        <div className="rounded-[22px] border border-emerald-300/20 bg-emerald-300/8 p-4"><p className="text-[0.64rem] uppercase tracking-[0.2em] text-emerald-100/70">Total del retiro</p><p className="mt-2 text-xl font-semibold text-emerald-200">{formatCurrency(plan.batchTotal)}</p><p className="mt-1 text-xs text-emerald-100/50">Salarios + excedente</p></div>
      </div>

      {plan.excessAmount > 0 ? (
        <div className="mt-5 rounded-[24px] border border-amber-300/20 bg-amber-200/8 p-4">
          <div className="flex items-center gap-2 text-amber-100"><CircleDollarSign className="h-5 w-5" /><h3 className="font-semibold">Excedente distribuible</h3></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{plan.members.map((member) => <div className="rounded-[18px] border border-white/10 bg-black/10 px-3 py-3" key={member.id}><p className="text-sm font-semibold">{member.name}</p><p className="mt-1 text-xs text-white/50">25% · {formatCurrency(member.profitShareAmount)}</p></div>)}</div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {plan.members.map((member) => (
          <article className="rounded-[22px] border border-white/10 bg-white/6 p-4" key={member.id}>
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{member.name}</h3><p className="mt-1 text-xs text-white/50">Objetivo {formatCurrency(member.targetAmount)}</p></div><div className="text-right"><p className="text-[0.62rem] uppercase tracking-[0.16em] text-emerald-100/60">Total a cobrar</p><p className="mt-1 text-xl font-semibold text-emerald-200">{formatCurrency(member.totalAmount)}</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><div className="rounded-[16px] bg-black/10 p-3"><p className="text-white/45">Sueldo liquidado</p><p className="mt-1 font-semibold text-white">{formatCurrency(member.salaryAmount)}</p></div><div className="rounded-[16px] bg-black/10 p-3"><p className="text-white/45">Participacion excedente</p><p className="mt-1 font-semibold text-amber-200">{formatCurrency(member.profitShareAmount)}</p></div></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400 transition-[width] duration-300" style={{ width: `${Math.min(100, member.targetAmount ? (member.paidAfterPayment / member.targetAmount) * 100 : 0)}%` }} /></div>
            <div className="mt-3 flex justify-between gap-3 text-xs text-white/45"><span>Pagado antes {formatCurrency(member.paidAmount)}</span><span>Pendiente {formatCurrency(member.remainingAfterPayment)}</span></div>
          </article>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="flex items-center gap-2 text-xs text-white/55"><ShieldCheck className="h-4 w-4" /> Simular importes no modifica la caja.</p><Button disabled={plan.batchTotal <= 0} onClick={() => setDialogOpen(true)} type="button">Guardar retiro de sueldos</Button></div>

      {dialogOpen ? (
        <DialogShell labelledBy="salary-liquidation-title" onClose={() => setDialogOpen(false)} panelClassName="max-w-4xl">
          <div className="flex items-start justify-between gap-4"><div><p className="panel-kicker">Liquidacion del mes</p><h2 className="mt-2 text-2xl font-semibold text-slate-950" id="salary-liquidation-title">Retiro de {monthLabel}</h2><p className="mt-2 text-sm text-slate-600">Indica de que cuentas sale el total. Los movimientos se guardan juntos o no se guarda ninguno.</p></div><Button aria-label="Cerrar" onClick={() => setDialogOpen(false)} size="sm" type="button" variant="ghost"><X className="h-5 w-5" /></Button></div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-[22px] bg-brand-50 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Sueldos</p><p className="mt-2 text-lg font-semibold">{formatCurrency(plan.salaryAmount)}</p></div><div className="rounded-[22px] bg-amber-50 p-4"><p className="text-xs uppercase tracking-[0.16em] text-amber-700">Excedente</p><p className="mt-2 text-lg font-semibold text-amber-900">{formatCurrency(plan.excessAmount)}</p></div><div className="rounded-[22px] bg-emerald-50 p-4"><p className="text-xs uppercase tracking-[0.16em] text-emerald-700">Total a retirar</p><p className="mt-2 text-lg font-semibold text-emerald-800">{formatCurrency(plan.batchTotal)}</p></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{plan.members.map((member) => <div className="rounded-[18px] border border-graphite/8 bg-white px-3 py-3" key={member.id}><p className="text-sm font-semibold text-slate-950">{member.name}</p><p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(member.totalAmount)}</p><p className="mt-1 text-xs text-slate-500">Sueldo {formatCurrency(member.salaryAmount)} + excedente {formatCurrency(member.profitShareAmount)}</p></div>)}</div>

          <form action={confirmSalaryLiquidationAction} className="mt-6 space-y-4">
            <input name="periodMonth" type="hidden" value={monthKey} /><input name="intendedTotal" type="hidden" value={intendedAmount} /><input name="allocationsJson" type="hidden" value={JSON.stringify(allocations)} /><input name="fundingSourcesJson" type="hidden" value={JSON.stringify(fundingSources)} /><input name="idempotencyKey" type="hidden" value={idempotencyKey} />
            <div><p className="panel-kicker">Origen de los fondos</p><h3 className="mt-2 text-xl font-semibold text-slate-950">¿Desde que cuentas se retira?</h3><div className="mt-4 grid gap-3 sm:grid-cols-3">{accounts.map((account) => {
              const row = fundingPlan.rows.find((funding) => funding.method === account.method);
              return <label className={`rounded-[22px] border bg-white p-4 ${row?.isOverdrawn ? "border-rose-300" : "border-graphite/8"}`} key={account.method}><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{formatCashMethod(account.method)}</span><span className="mt-2 block text-sm text-slate-600">Saldo disponible: {formatCurrency(account.balance)}</span><span className="mb-2 mt-4 block text-xs font-semibold text-slate-700">Retirar</span><Input max={Math.max(account.balance, 0)} min={0} onChange={(event) => setFundingAmounts((current) => ({ ...current, [account.method]: event.target.value }))} placeholder="0" step="0.01" type="number" value={fundingAmounts[account.method] ?? ""} />{row?.isOverdrawn ? <span className="mt-2 block text-xs font-semibold text-rose-600">Supera el saldo disponible.</span> : null}</label>;
            })}</div></div>

            <div className={`rounded-[22px] border p-4 ${fundingPlan.isBalanced ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total retiro</p><p className="mt-1 font-semibold text-slate-950">{formatCurrency(fundingPlan.totalAmount)}</p></div><div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Asignado</p><p className="mt-1 font-semibold text-slate-950">{formatCurrency(fundingPlan.assignedAmount)}</p></div><div><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Diferencia</p><p className={`mt-1 font-semibold ${fundingPlan.isBalanced ? "text-emerald-700" : "text-amber-800"}`}>{fundingPlan.missingAmount > 0 ? `Faltan ${formatCurrency(fundingPlan.missingAmount)}` : fundingPlan.excessAssignedAmount > 0 ? `Exceso ${formatCurrency(fundingPlan.excessAssignedAmount)}` : "Total completamente cubierto"}</p></div></div>
              <p className={`mt-3 flex items-center gap-2 text-sm font-semibold ${fundingPlan.isBalanced ? "text-emerald-700" : "text-amber-800"}`}>{fundingPlan.isBalanced ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}{fundingPlan.hasOverdrawnAccount ? "Una cuenta no tiene saldo suficiente." : fundingPlan.isBalanced ? "Retiro completamente cubierto." : "La suma debe coincidir exactamente antes de confirmar."}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" htmlFor="salary-withdrawal-date">Fecha del retiro</label><Input defaultValue={getLocalDateInputValue()} id="salary-withdrawal-date" name="withdrawalDate" type="date" /></div><div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" htmlFor="salary-notes">Observaciones</label><Textarea id="salary-notes" name="notes" placeholder="Opcional" /></div></div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button onClick={() => setDialogOpen(false)} type="button" variant="secondary">Cancelar</Button><ConfirmWithdrawalButton disabled={!fundingPlan.isBalanced} /></div>
          </form>
        </DialogShell>
      ) : null}
    </section>
  );
}
