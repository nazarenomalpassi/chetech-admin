"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Banknote, Boxes, Landmark, PiggyBank, Settings2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

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
    { label: "Saldo actual", value: formatCurrency(data.totalAvailable), icon: Landmark, tone: "text-slate-950" },
    { label: "Reservas fijas", value: formatCurrency(reserveTotal), icon: PiggyBank, tone: "text-amber-700" },
    { label: "Reposicion del mes", value: formatCurrency(data.merchandise.currentReplacementCost), icon: Boxes, tone: "text-slate-950" },
    { label: "Disponible sugerido", value: formatCurrency(data.suggestedSalaryAmount), icon: TrendingUp, tone: "text-emerald-700" }
  ];

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="panel-kicker">Planificacion financiera</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Liquidacion de sueldos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Analiza caja, reposicion y compromisos antes de confirmar retiros del equipo.</p></div>
          <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500" htmlFor="salary-month">Mes analizado</label><Input defaultValue={data.monthKey} id="salary-month" name="month" type="month" /></div>
            <Button type="submit">Ver mes</Button>
          </form>
        </div>
        {!data.migrationReady ? <p className="status-banner status-banner--error mt-5">Falta activar la migracion de planificacion salarial.</p> : null}
        {message ? <p className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>{message.message}</p> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon, tone }) => <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4" key={label}><div className="flex items-center justify-between"><p className="text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p><Icon className="h-4 w-4 text-slate-500" /></div><p className={`mt-3 text-xl font-semibold tracking-[-0.03em] ${tone}`}>{value}</p></div>)}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="rounded-[34px] p-5 lg:p-6">
          <p className="panel-kicker">Caja y cuentas</p><h2 className="mt-2 text-xl font-semibold text-slate-950">Saldos reales consolidados</h2>
          <div className="mt-4 grid gap-3">
            {data.accounts.map((account) => <div className="rounded-[22px] border border-graphite/8 bg-white/88 px-4 py-4" key={account.method}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{account.label}</p><p className="mt-1 text-xs text-slate-400">Ingresos menos egresos y transferencias</p></div><p className="text-lg font-semibold text-slate-950">{formatCurrency(account.balance)}</p></div></div>)}
          </div>
        </Card>

        <Card className="rounded-[34px] p-5 lg:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="panel-kicker">Mercaderia vendida</p><h2 className="mt-2 text-xl font-semibold text-slate-950">Costo real de reposicion</h2></div><Link className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-graphite/10 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-brand-50" href={`/pedidos?month=${data.monthKey}` as Route}>Abrir Pedidos</Link></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] bg-brand-50 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Facturacion de productos</p><p className="mt-2 text-lg font-semibold">{formatCurrency(data.merchandise.revenue)}</p></div>
            <div className="rounded-[22px] bg-brand-50 p-4"><p className="text-xs uppercase tracking-[0.16em] text-slate-500">Costo historico vendido</p><p className="mt-2 text-lg font-semibold">{formatCurrency(data.merchandise.historicalCost)}</p></div>
            <div className="rounded-[22px] border border-amber-100 bg-amber-50 p-4"><p className="text-xs uppercase tracking-[0.16em] text-amber-700">Reposicion a costo actual</p><p className="mt-2 text-lg font-semibold text-amber-900">{formatCurrency(data.merchandise.currentReplacementCost)}</p></div>
            <div className="rounded-[22px] border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs uppercase tracking-[0.16em] text-emerald-700">Margen bruto historico</p><p className="mt-2 text-lg font-semibold text-emerald-800">{formatCurrency(data.merchandise.grossMargin)}</p></div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Calculado con cantidad vendida por costo unitario guardado en cada venta y costo actual del producto. Las ventas eliminadas no se incluyen.</p>
        </Card>
      </div>

      <PurchaseCommitmentsNotice commitments={data.purchaseCommitments} />
      <SalaryDecisionPanel accounts={data.accounts} members={data.members} monthKey={data.monthKey} monthLabel={data.monthLabel} suggestedAmount={data.suggestedSalaryAmount} />

      <Card className="rounded-[34px] p-5 lg:p-6">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4"><div><p className="panel-kicker">Parametros editables</p><h2 className="mt-2 text-xl font-semibold text-slate-950">Objetivos y reservas</h2></div><Settings2 className="h-5 w-5 text-slate-500" /></summary>
          <form action={saveSalaryPlanningConfigAction} className="mt-6 space-y-5">
            <input name="periodMonth" type="hidden" value={data.monthKey} /><input name="membersJson" type="hidden" value={JSON.stringify(membersJson)} /><input name="reservesJson" type="hidden" value={JSON.stringify(reservesJson)} />
            <div><h3 className="font-semibold text-slate-950">Sueldos objetivo</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.members.map((member) => <label className="rounded-[22px] border border-graphite/8 bg-white p-4 text-sm" key={member.id}><span className="mb-2 block font-semibold text-slate-800">{member.name}</span><Input min={0.01} onChange={(event) => setMemberTargets((current) => ({ ...current, [member.id]: event.target.value }))} step="0.01" type="number" value={memberTargets[member.id] ?? ""} /></label>)}</div><p className="mt-3 text-sm text-slate-500">Masa salarial configurada: {formatCurrency(membersJson.reduce((total, item) => total + item.targetAmount, 0))}. Actual: {formatCurrency(salaryMass)}.</p></div>
            <div><h3 className="font-semibold text-slate-950">Reservas previas al sueldo</h3><div className="mt-3 grid gap-3 sm:grid-cols-3">{data.reserves.map((reserve) => <label className="rounded-[22px] border border-graphite/8 bg-white p-4 text-sm" key={reserve.id}><span className="mb-2 block font-semibold text-slate-800">{reserve.name}</span><Input min={0} onChange={(event) => setReserveAmounts((current) => ({ ...current, [reserve.id]: event.target.value }))} step="0.01" type="number" value={reserveAmounts[reserve.id] ?? ""} /></label>)}</div></div>
            <Button disabled={!data.migrationReady} type="submit">Guardar parametros</Button>
          </form>
        </details>
      </Card>

      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex items-start gap-3"><Banknote className="mt-1 h-5 w-5 text-slate-500" /><div><p className="panel-kicker">Movimiento excepcional</p><h2 className="mt-2 text-xl font-semibold text-slate-950">Retiro extraordinario</h2><p className="mt-2 text-sm text-slate-500">Usalo para un retiro que no forma parte de la liquidacion proporcional mensual.</p></div></div>
        {canManage ? <form action={saveSalaryWithdrawalAction} className="mt-5 grid gap-3 xl:grid-cols-[160px_170px_180px_minmax(0,1fr)_auto]"><input name="id" type="hidden" value={editing?.id ?? ""} /><Input aria-label="Fecha de retiro" defaultValue={editing?.withdrawalDate ?? getLocalDateInputValue()} key={`${editing?.id}-date`} name="withdrawalDate" type="date" /><Input aria-label="Monto retirado" defaultValue={editing?.amount ?? ""} key={`${editing?.id}-amount`} min={0} name="amount" placeholder="Monto" step="0.01" type="number" /><Select aria-label="Cuenta de salida" defaultValue={editing?.paymentMethod ?? "efectivo"} key={`${editing?.id}-payment`} name="paymentMethod" options={getCashMethodOptions("salary")} /><Textarea aria-label="Observaciones" defaultValue={editing?.notes ?? ""} key={`${editing?.id}-notes`} name="notes" placeholder="Motivo opcional" /><div className="flex gap-2"><Button disabled={!data.migrationReady} type="submit">{editing ? "Actualizar" : "Guardar"}</Button>{editing ? <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancelar</Button> : null}</div></form> : null}
      </Card>

      <Card className="rounded-[34px] p-5 lg:p-6">
        <div><p className="panel-kicker">Liquidaciones de {data.monthLabel}</p><h2 className="mt-2 text-xl font-semibold text-slate-950">Retiros de sueldos confirmados</h2><p className="mt-2 text-sm text-slate-500">Cada registro separa lo pagado a las personas del origen financiero del retiro.</p></div>
        <div className="mt-5 space-y-3">
          {data.liquidations.map((liquidation) => (
            <details className="rounded-[24px] border border-graphite/8 bg-white/88 p-4" key={liquidation.id}>
              <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-emerald-50 px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-emerald-700">Liquidacion salarial</span><span className="text-xs text-slate-500">{formatDate(liquidation.withdrawalDate)}</span></div><p className="mt-3 font-semibold text-slate-950">Cobertura mensual {liquidation.coveragePercentage.toFixed(1)}%</p></div>
                <div className="text-left sm:text-right"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total retirado</p><p className="mt-1 text-xl font-semibold text-slate-950">{formatCurrency(liquidation.totalAmount)}</p></div>
              </summary>
              <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-[18px] bg-brand-50 p-3"><p className="text-xs text-slate-500">Sueldos</p><p className="mt-1 font-semibold">{formatCurrency(liquidation.salaryAmount)}</p></div><div className="rounded-[18px] bg-amber-50 p-3"><p className="text-xs text-amber-700">Excedente</p><p className="mt-1 font-semibold text-amber-900">{formatCurrency(liquidation.profitShareAmount)}</p></div><div className="rounded-[18px] bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Total</p><p className="mt-1 font-semibold text-emerald-800">{formatCurrency(liquidation.totalAmount)}</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{liquidation.members.map((member) => <div className="rounded-[18px] border border-graphite/8 p-3" key={member.memberId}><p className="font-semibold text-slate-950">{member.memberName}</p><p className="mt-2 text-xs text-slate-500">Sueldo {formatCurrency(member.salaryAmount)}</p><p className="mt-1 text-xs text-slate-500">Excedente {formatCurrency(member.profitShareAmount)}</p><p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(member.totalAmount)}</p></div>)}</div>
              <div className="mt-4 rounded-[20px] border border-graphite/8 bg-brand-50/70 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Origen del dinero</p><div className="mt-3 flex flex-wrap gap-2">{liquidation.funding.map((funding) => <span className="rounded-full border border-graphite/8 bg-white px-3 py-2 text-sm font-semibold text-slate-800" key={funding.paymentMethod}>{formatCashMethod(funding.paymentMethod)} · {formatCurrency(funding.amount)}</span>)}</div></div>
              {liquidation.notes ? <p className="mt-4 text-sm text-slate-600">{liquidation.notes}</p> : null}
            </details>
          ))}
          {!data.liquidations.length ? <div className="empty-panel">Todavia no hay retiros de sueldos confirmados en este mes.</div> : null}
        </div>
      </Card>

      <Card className="rounded-[34px] p-0">
        <div className="border-b border-graphite/8 px-5 py-5 lg:px-6"><p className="panel-kicker">Historial de {data.monthLabel}</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><h2 className="text-xl font-semibold text-slate-950">Retiros extraordinarios</h2><p className="text-sm text-slate-500">Sueldos pagados: {formatCurrency(paidTotal)} de {formatCurrency(salaryMass)}</p></div></div>
        <div className="grid gap-3 p-4 lg:hidden">{data.withdrawals.map((withdrawal) => <article className="rounded-[24px] border border-graphite/8 bg-white p-4" key={withdrawal.id}><div className="flex items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] ${withdrawal.withdrawalType === "salary" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{withdrawal.withdrawalType === "salary" ? "Liquidacion" : "Extraordinario"}</span><p className="mt-3 font-semibold text-slate-950">{withdrawal.memberName ?? formatCashMethod(withdrawal.paymentMethod)}</p><p className="mt-1 text-xs text-slate-500">{formatDate(withdrawal.withdrawalDate)} · {formatCashMethod(withdrawal.paymentMethod)}</p></div><p className="font-semibold text-slate-950">{formatCurrency(withdrawal.amount)}</p></div>{withdrawal.notes ? <p className="mt-3 text-sm text-slate-600">{withdrawal.notes}</p> : null}{withdrawal.withdrawalType === "extraordinary" && canManage ? <div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={() => setEditing(withdrawal)} size="sm" type="button" variant="secondary">Editar</Button><form action={deleteSalaryWithdrawalAction}><input name="id" type="hidden" value={withdrawal.id} /><Button className="w-full" size="sm" type="submit" variant="danger">Eliminar</Button></form></div> : null}</article>)}</div>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[850px] text-sm"><thead className="bg-brand-50/70 text-left text-xs uppercase tracking-[0.14em] text-slate-500"><tr><th className="px-5 py-4">Tipo</th><th className="px-4 py-4">Fecha</th><th className="px-4 py-4">Integrante / cuenta</th><th className="px-4 py-4">Monto</th><th className="px-4 py-4">Observaciones</th><th className="px-5 py-4 text-right">Acciones</th></tr></thead><tbody>{data.withdrawals.map((withdrawal) => <tr className="border-t border-graphite/8" key={withdrawal.id}><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.14em] ${withdrawal.withdrawalType === "salary" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{withdrawal.withdrawalType === "salary" ? "Liquidacion" : "Extraordinario"}</span></td><td className="px-4 py-4 text-slate-600">{formatDate(withdrawal.withdrawalDate)}</td><td className="px-4 py-4"><p className="font-semibold text-slate-950">{withdrawal.memberName ?? "Retiro manual"}</p><p className="mt-1 text-xs text-slate-500">{formatCashMethod(withdrawal.paymentMethod)}</p></td><td className="px-4 py-4 font-semibold">{formatCurrency(withdrawal.amount)}</td><td className="max-w-xs px-4 py-4 text-slate-600">{withdrawal.notes || "-"}</td><td className="px-5 py-4">{withdrawal.withdrawalType === "extraordinary" && canManage ? <div className="flex justify-end gap-2"><Button onClick={() => setEditing(withdrawal)} size="sm" type="button" variant="secondary">Editar</Button><form action={deleteSalaryWithdrawalAction}><input name="id" type="hidden" value={withdrawal.id} /><Button size="sm" type="submit" variant="danger">Eliminar</Button></form></div> : <p className="text-right text-xs text-slate-400">Protegido</p>}</td></tr>)}</tbody></table></div>
        {!data.withdrawals.length ? <div className="empty-panel m-4">Todavia no hay movimientos registrados en este mes.</div> : null}
      </Card>
    </div>
  );
}
