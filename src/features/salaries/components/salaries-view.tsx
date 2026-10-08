"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Banknote, Boxes, Landmark, PiggyBank, Settings2, TrendingUp } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { MoneyInput } from "@/components/ui/money-input";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteSalaryWithdrawalAction, saveSalaryPlanningConfigAction, saveSalaryWithdrawalAction } from "@/features/salaries/actions";
import { SalaryDecisionPanel } from "@/features/salaries/components/salary-decision-panel";
import { PurchaseCommitmentsNotice } from "./purchase-commitments-notice";
import type { SalaryPlanningData, SalaryWithdrawal } from "@/features/salaries/types";
import type { ActionResult } from "@/lib/form-state";
import { formatCashMethod, getCashMethodOptions } from "@/lib/cash";
import { cn, formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

export function SalariesView({ canManage, data, message }: { canManage: boolean; data: SalaryPlanningData; message: ActionResult | null }) {
  const [editing, setEditing] = useState<SalaryWithdrawal | null>(null);
  const [memberTargets, setMemberTargets] = useState<Record<string, string>>(
    Object.fromEntries(data.members.map((member) => [member.id, String(member.targetAmount)]))
  );
  const [reserveAmounts, setReserveAmounts] = useState<Record<string, string>>(
    Object.fromEntries(data.reserves.map((reserve) => [reserve.id, String(reserve.amount)]))
  );
  const reserveTotal = data.reserves.reduce((total, reserve) => total + reserve.amount, 0);
  const salaryMass = data.members.reduce((total, member) => total + member.targetAmount, 0);
  const paidTotal = data.members.reduce((total, member) => total + member.paidAmount, 0);
  const membersJson = data.members.map((member) => ({ id: member.id, targetAmount: Number(memberTargets[member.id] || 0) }));
  const reservesJson = data.reserves.map((reserve) => ({ id: reserve.id, amount: Number(reserveAmounts[reserve.id] || 0) }));

  const kpis = [
    { label: "Saldo disponible actual", value: formatCurrency(data.totalAvailable), icon: Landmark, tone: "text-slate-950" },
    { label: "Reservas fijas", value: formatCurrency(reserveTotal), icon: PiggyBank, tone: "text-amber-700" },
    { label: "Reposicion del mes", value: formatCurrency(data.merchandise.currentReplacementCost), icon: Boxes, tone: "text-slate-950" },
    { label: "Disponible sugerido", value: formatCurrency(data.suggestedSalaryAmount), icon: TrendingUp, tone: "text-emerald-700" }
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><h1 className="text-2xl font-semibold text-slate-950">Liquidacion de sueldos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{data.monthLabel}: caja, compromisos y retiros confirmados.</p></div>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div><label className="mb-2 block text-xs font-semibold text-slate-500" htmlFor="salary-month">Mes analizado</label><Input defaultValue={data.monthKey} id="salary-month" name="month" type="month" /></div>
            <Button type="submit">Ver mes</Button>
          </form>
        </div>
        {!data.migrationReady ? <p className="status-banner status-banner--error mt-5">Falta activar la migracion de planificacion salarial.</p> : null}
        {message ? <p className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>{message.message}</p> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon, tone }) => <div className="min-w-0 border-t border-slate-200 py-3" key={label}><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-500" /></div><p className={`mt-3 text-xl font-semibold ${tone}`}>{value}</p></div>)}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-slate-950">Saldo disponible por cuenta</h2>
          <div className="mt-4 grid gap-3">
            {data.accounts.map((account) => <div className="border-b border-slate-200 py-3" key={account.method}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{account.label}</p><p className="mt-1 text-xs text-slate-400">Disponible actual; no depende del mes seleccionado</p></div><p className="text-lg font-semibold text-slate-950">{formatCurrency(account.balance)}</p></div></div>)}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-semibold text-slate-950">Costo real de reposicion</h2></div><Link className={cn(buttonVariants({ variant: "secondary" }), "w-full sm:w-auto")} href={`/pedidos?month=${data.monthKey}` as Route}>Abrir Pedidos</Link></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="border-t border-slate-200 py-3"><p className="text-xs text-slate-500">Facturacion de productos</p><p className="mt-2 text-lg font-semibold">{formatCurrency(data.merchandise.revenue)}</p></div>
            <div className="border-t border-slate-200 py-3"><p className="text-xs text-slate-500">Costo historico vendido</p><p className="mt-2 text-lg font-semibold">{formatCurrency(data.merchandise.historicalCost)}</p></div>
            <div className="border-t border-slate-200 py-3"><p className="text-xs text-amber-700">Reposicion a costo actual</p><p className="mt-2 text-lg font-semibold text-amber-900">{formatCurrency(data.merchandise.currentReplacementCost)}</p></div>
            <div className="border-t border-slate-200 py-3"><p className="text-xs text-emerald-700">Margen bruto historico</p><p className="mt-2 text-lg font-semibold text-emerald-800">{formatCurrency(data.merchandise.grossMargin)}</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Calculado con cantidad vendida por costo unitario guardado en cada venta y costo actual del producto. Las ventas eliminadas no se incluyen.</p>
        </Card>
      </div>

      <PurchaseCommitmentsNotice commitments={data.purchaseCommitments} />
      <SalaryDecisionPanel accounts={data.accounts} members={data.members} monthKey={data.monthKey} monthLabel={data.monthLabel} suggestedAmount={data.suggestedSalaryAmount} />

      <Card className="p-4 sm:p-5">
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"><div><h2 className="text-xl font-semibold text-slate-950">Objetivos y reservas</h2></div><Settings2 className="h-5 w-5 text-slate-500" /></summary>
          <form action={saveSalaryPlanningConfigAction} className="mt-6 space-y-5">
            <input name="periodMonth" type="hidden" value={data.monthKey} /><input name="membersJson" type="hidden" value={JSON.stringify(membersJson)} /><input name="reservesJson" type="hidden" value={JSON.stringify(reservesJson)} />
            <div><h3 className="font-semibold text-slate-950">Sueldos objetivo</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.members.map((member) => <label className="min-w-0 border-t border-slate-200 py-3 text-sm" key={member.id}><span className="mb-2 block font-semibold text-slate-800">{member.name}</span><MoneyInput min={0.01} onValueChange={(value) => setMemberTargets((current) => ({ ...current, [member.id]: String(value) }))} value={Number(memberTargets[member.id] || 0)} /></label>)}</div><p className="mt-3 text-sm text-slate-500">Masa salarial configurada: {formatCurrency(membersJson.reduce((total, item) => total + item.targetAmount, 0))}. Actual: {formatCurrency(salaryMass)}.</p></div>
            <div><h3 className="font-semibold text-slate-950">Reservas previas al sueldo</h3><div className="mt-3 grid gap-3 sm:grid-cols-3">{data.reserves.map((reserve) => <label className="min-w-0 border-t border-slate-200 py-3 text-sm" key={reserve.id}><span className="mb-2 block font-semibold text-slate-800">{reserve.name}</span><MoneyInput min={0} onValueChange={(value) => setReserveAmounts((current) => ({ ...current, [reserve.id]: String(value) }))} value={Number(reserveAmounts[reserve.id] || 0)} /></label>)}</div></div>
            <Button disabled={!data.migrationReady} type="submit">Guardar parametros</Button>
          </form>
        </details>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-3"><Banknote className="mt-1 h-5 w-5 text-slate-500" /><div><h2 className="text-xl font-semibold text-slate-950">Retiro extraordinario</h2><p className="mt-2 text-sm text-slate-600">Usalo para un retiro que no forma parte de la liquidacion proporcional mensual.</p></div></div>
        {canManage ? <form action={saveSalaryWithdrawalAction} className="mt-5 grid gap-3 xl:grid-cols-[160px_170px_180px_minmax(0,1fr)_auto]"><input name="id" type="hidden" value={editing?.id ?? ""} /><label className="grid gap-2 text-sm font-medium text-slate-700">Fecha<Input aria-label="Fecha de retiro" defaultValue={editing?.withdrawalDate ?? getLocalDateInputValue()} key={`${editing?.id}-date`} name="withdrawalDate" type="date" /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Monto<Input aria-label="Monto retirado" defaultValue={editing?.amount ?? ""} key={`${editing?.id}-amount`} min={0} name="amount" placeholder="Monto" step="0.01" type="number" /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Cuenta de salida<Select aria-label="Cuenta de salida" defaultValue={editing?.paymentMethod ?? "efectivo"} key={`${editing?.id}-payment`} name="paymentMethod" options={getCashMethodOptions("salary")} /></label><label className="grid gap-2 text-sm font-medium text-slate-700">Observaciones<Textarea aria-label="Observaciones" defaultValue={editing?.notes ?? ""} key={`${editing?.id}-notes`} name="notes" placeholder="Motivo opcional" /></label><div className="flex items-end gap-2"><Button disabled={!data.migrationReady} type="submit">{editing ? "Actualizar" : "Guardar"}</Button>{editing ? <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancelar</Button> : null}</div></form> : null}
      </Card>

      <Card className="p-4 sm:p-5">
        <div><p className="text-sm text-slate-500">Liquidaciones de {data.monthLabel}</p><h2 className="text-xl font-semibold text-slate-950">Retiros de sueldos confirmados</h2><p className="mt-2 text-sm text-slate-600">Cada registro separa lo pagado a las personas del origen financiero del retiro.</p></div>
        <div className="mt-5 space-y-3">
          {data.liquidations.map((liquidation) => (
            <details className="min-w-0 border-t border-slate-200 py-3" key={liquidation.id}>
              <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Liquidacion salarial</span><span className="text-xs text-slate-500">{formatDate(liquidation.withdrawalDate)}</span></div><p className="mt-3 font-semibold text-slate-950">Cobertura mensual {liquidation.coveragePercentage.toFixed(1)}%</p></div>
                <div className="text-left sm:text-right"><p className="text-xs text-slate-500">Total retirado</p><p className="mt-1 text-xl font-semibold text-slate-950">{formatCurrency(liquidation.totalAmount)}</p></div>
              </summary>
              <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="py-3"><p className="text-xs text-slate-500">Sueldos</p><p className="mt-1 font-semibold">{formatCurrency(liquidation.salaryAmount)}</p></div><div className="py-3"><p className="text-xs text-amber-700">Excedente</p><p className="mt-1 font-semibold text-amber-900">{formatCurrency(liquidation.profitShareAmount)}</p></div><div className="py-3"><p className="text-xs text-emerald-700">Total</p><p className="mt-1 font-semibold text-emerald-800">{formatCurrency(liquidation.totalAmount)}</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{liquidation.members.map((member) => <div className="border-t border-slate-200 py-3" key={member.memberId}><p className="font-semibold text-slate-950">{member.memberName}</p><p className="mt-2 text-xs text-slate-500">Sueldo {formatCurrency(member.salaryAmount)}</p><p className="mt-1 text-xs text-slate-500">Excedente {formatCurrency(member.profitShareAmount)}</p><p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(member.totalAmount)}</p></div>)}</div>
              <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-xs font-semibold text-slate-500">Origen del dinero</p><div className="mt-3 flex flex-wrap gap-2">{liquidation.funding.map((funding) => <span className="rounded-full border border-graphite/8 bg-white px-3 py-2 text-sm font-semibold text-slate-800" key={funding.paymentMethod}>{formatCashMethod(funding.paymentMethod)} · {formatCurrency(funding.amount)}</span>)}</div></div>
              {liquidation.notes ? <p className="mt-4 text-sm text-slate-600">{liquidation.notes}</p> : null}
            </details>
          ))}
          {!data.liquidations.length ? <div className="empty-panel">Todavia no hay retiros de sueldos confirmados en este mes.</div> : null}
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-graphite/8 px-4 py-4 sm:px-5"><p className="text-sm text-slate-500">Historial de {data.monthLabel}</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><h2 className="text-xl font-semibold text-slate-950">Retiros extraordinarios</h2><p className="text-sm text-slate-500">Sueldos pagados: {formatCurrency(paidTotal)} de {formatCurrency(salaryMass)}</p></div></div>
        <div className="grid divide-y divide-slate-200 px-4 lg:hidden">{data.withdrawals.map((withdrawal) => <article className="min-w-0 border-t border-slate-200 py-3" key={withdrawal.id}><div className="flex items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${withdrawal.withdrawalType === "salary" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{withdrawal.withdrawalType === "salary" ? "Liquidacion" : "Extraordinario"}</span><p className="mt-3 font-semibold text-slate-950">{withdrawal.memberName ?? formatCashMethod(withdrawal.paymentMethod)}</p><p className="mt-1 text-xs text-slate-500">{formatDate(withdrawal.withdrawalDate)} · {formatCashMethod(withdrawal.paymentMethod)}</p></div><p className="font-semibold text-slate-950">{formatCurrency(withdrawal.amount)}</p></div>{withdrawal.notes ? <p className="mt-3 text-sm text-slate-600">{withdrawal.notes}</p> : null}{withdrawal.withdrawalType === "extraordinary" && canManage ? <ActionMenu label="Más acciones"><Button onClick={() => setEditing(withdrawal)} size="sm" type="button" variant="secondary">Editar</Button><form action={deleteSalaryWithdrawalAction}><input name="id" type="hidden" value={withdrawal.id} /><Button className="w-full" size="sm" type="submit" variant="danger">Eliminar</Button></form></ActionMenu> : null}</article>)}</div>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[850px] text-sm"><thead className="bg-brand-50/70 text-left text-xs text-slate-500"><tr><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Integrante / cuenta</th><th className="px-4 py-3">Monto</th><th className="px-4 py-3">Observaciones</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody>{data.withdrawals.map((withdrawal) => <tr className="border-t border-graphite/8" key={withdrawal.id}><td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${withdrawal.withdrawalType === "salary" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{withdrawal.withdrawalType === "salary" ? "Liquidacion" : "Extraordinario"}</span></td><td className="px-4 py-3 text-slate-600">{formatDate(withdrawal.withdrawalDate)}</td><td className="px-4 py-3"><p className="font-semibold text-slate-950">{withdrawal.memberName ?? "Retiro manual"}</p><p className="mt-1 text-xs text-slate-500">{formatCashMethod(withdrawal.paymentMethod)}</p></td><td className="px-4 py-3 font-semibold">{formatCurrency(withdrawal.amount)}</td><td className="max-w-xs px-4 py-3 text-slate-600">{withdrawal.notes || "-"}</td><td className="px-4 py-3">{withdrawal.withdrawalType === "extraordinary" && canManage ? <ActionMenu label="Más acciones"><Button onClick={() => setEditing(withdrawal)} size="sm" type="button" variant="secondary">Editar</Button><form action={deleteSalaryWithdrawalAction}><input name="id" type="hidden" value={withdrawal.id} /><Button size="sm" type="submit" variant="danger">Eliminar</Button></form></ActionMenu> : <p className="text-right text-xs text-slate-400">Protegido</p>}</td></tr>)}</tbody></table></div>
        {!data.withdrawals.length ? <div className="empty-panel m-4">Todavia no hay movimientos registrados en este mes.</div> : null}
      </Card>
    </div>
  );
}
