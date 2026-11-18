"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { Banknote, Boxes, Landmark, PiggyBank, Settings2, TrendingUp } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { MoneyInput } from "@/components/ui/money-input";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteSalaryWithdrawalAction,
  saveSalaryPlanningConfigAction,
  saveSalaryWithdrawalAction
} from "@/features/salaries/actions";
import { SalaryDecisionPanel } from "@/features/salaries/components/salary-decision-panel";
import { PurchaseCommitmentsNotice } from "./purchase-commitments-notice";
import type { SalaryPlanningData, SalaryWithdrawal } from "@/features/salaries/types";
import type { ActionResult } from "@/lib/form-state";
import { formatCashMethod, getCashMethodOptions } from "@/lib/cash";
import { cn, formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

export function SalariesView({
  canManage,
  data,
  message
}: {
  canManage: boolean;
  data: SalaryPlanningData;
  message: ActionResult | null;
}) {
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
  const membersJson = data.members.map((member) => ({
    id: member.id,
    targetAmount: Number(memberTargets[member.id] || 0)
  }));
  const reservesJson = data.reserves.map((reserve) => ({
    id: reserve.id,
    amount: Number(reserveAmounts[reserve.id] || 0)
  }));

  const kpis = [
    {
      label: "Saldo disponible actual",
      value: formatCurrency(data.totalAvailable),
      icon: Landmark,
      tone: "text-foreground"
    },
    {
      label: "Reservas fijas",
      value: formatCurrency(reserveTotal),
      icon: PiggyBank,
      tone: "text-warning"
    },
    {
      label: "Reposición del mes",
      value: formatCurrency(data.merchandise.currentReplacementCost),
      icon: Boxes,
      tone: "text-foreground"
    },
    {
      label: "Disponible sugerido",
      value: formatCurrency(data.suggestedSalaryAmount),
      icon: TrendingUp,
      tone: "text-success"
    }
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <form className="flex items-end gap-2">
            <div>
              <label
                className="mb-1.5 block text-xs font-medium text-muted-foreground"
                htmlFor="salary-month"
              >
                Mes analizado
              </label>
              <Input defaultValue={data.monthKey} id="salary-month" name="month" type="month" />
            </div>
            <Button size="sm" type="submit" variant="secondary">
              Ver mes
            </Button>
          </form>
        }
        description={`${data.monthLabel}: caja, compromisos y retiros confirmados.`}
        title="Liquidación de sueldos"
      />
      <Card className="p-4 sm:p-5">
        {!data.migrationReady ? (
          <p className="status-banner status-banner--error mt-5">
            Falta activar la migracion de planificacion salarial.
          </p>
        ) : null}
        {message ? (
          <p
            className={
              message.success
                ? "status-banner status-banner--success mt-5"
                : "status-banner status-banner--error mt-5"
            }
          >
            {message.message}
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon, tone }) => (
            <div className="min-w-0 border-t border-border py-3" key={label}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className={`mt-3 text-xl font-semibold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-4 sm:p-5">
          <h2 className="text-xl font-semibold text-foreground">Saldo disponible por cuenta</h2>
          <div className="mt-4 grid gap-3">
            {data.accounts.map((account) => (
              <div className="border-b border-border py-3" key={account.method}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{account.label}</p>
                    <p className="mt-1 text-xs text-subtle-foreground">
                      Disponible actual; no depende del mes seleccionado
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-foreground">
                    {formatCurrency(account.balance)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Costo real de reposicion</h2>
            </div>
            <Link
              className={cn(buttonVariants({ variant: "secondary" }), "w-full sm:w-auto")}
              href={`/pedidos?month=${data.monthKey}` as Route}
            >
              Abrir Pedidos
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="border-t border-border py-3">
              <p className="text-xs text-muted-foreground">Facturación de productos</p>
              <p className="mt-2 text-lg font-semibold">
                {formatCurrency(data.merchandise.revenue)}
              </p>
            </div>
            <div className="border-t border-border py-3">
              <p className="text-xs text-muted-foreground">Costo historico vendido</p>
              <p className="mt-2 text-lg font-semibold">
                {formatCurrency(data.merchandise.historicalCost)}
              </p>
            </div>
            <div className="border-t border-border py-3">
              <p className="text-xs text-warning">Reposición a costo actual</p>
              <p className="mt-2 text-lg font-semibold text-warning">
                {formatCurrency(data.merchandise.currentReplacementCost)}
              </p>
            </div>
            <div className="border-t border-border py-3">
              <p className="text-xs text-success">Margen bruto historico</p>
              <p className="mt-2 text-lg font-semibold text-success">
                {formatCurrency(data.merchandise.grossMargin)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Calculado con cantidad vendida por costo unitario guardado en cada venta y costo actual
            del producto. Las ventas eliminadas no se incluyen.
          </p>
        </Card>
      </div>

      <PurchaseCommitmentsNotice commitments={data.purchaseCommitments} />
      <SalaryDecisionPanel
        accounts={data.accounts}
        members={data.members}
        monthKey={data.monthKey}
        monthLabel={data.monthLabel}
        suggestedAmount={data.suggestedSalaryAmount}
      />

      <Card className="p-4 sm:p-5">
        <details>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Objetivos y reservas</h2>
            </div>
            <Settings2 className="h-5 w-5 text-muted-foreground" />
          </summary>
          <form action={saveSalaryPlanningConfigAction} className="mt-6 space-y-5">
            <input name="periodMonth" type="hidden" value={data.monthKey} />
            <input name="membersJson" type="hidden" value={JSON.stringify(membersJson)} />
            <input name="reservesJson" type="hidden" value={JSON.stringify(reservesJson)} />
            <div>
              <h3 className="font-semibold text-foreground">Sueldos objetivo</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.members.map((member) => (
                  <label className="min-w-0 border-t border-border py-3 text-sm" key={member.id}>
                    <span className="mb-2 block font-semibold text-foreground">{member.name}</span>
                    <MoneyInput
                      min={0.01}
                      onValueChange={(value) =>
                        setMemberTargets((current) => ({ ...current, [member.id]: String(value) }))
                      }
                      value={Number(memberTargets[member.id] || 0)}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Masa salarial configurada:{" "}
                {formatCurrency(membersJson.reduce((total, item) => total + item.targetAmount, 0))}.
                Actual: {formatCurrency(salaryMass)}.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Reservas previas al sueldo</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {data.reserves.map((reserve) => (
                  <label className="min-w-0 border-t border-border py-3 text-sm" key={reserve.id}>
                    <span className="mb-2 block font-semibold text-foreground">{reserve.name}</span>
                    <MoneyInput
                      min={0}
                      onValueChange={(value) =>
                        setReserveAmounts((current) => ({
                          ...current,
                          [reserve.id]: String(value)
                        }))
                      }
                      value={Number(reserveAmounts[reserve.id] || 0)}
                    />
                  </label>
                ))}
              </div>
            </div>
            <Button disabled={!data.migrationReady} type="submit">
              Guardar parametros
            </Button>
          </form>
        </details>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Banknote className="mt-1 h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Retiro extraordinario</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Usalo para un retiro que no forma parte de la liquidacion proporcional mensual.
            </p>
          </div>
        </div>
        {canManage ? (
          <form
            action={saveSalaryWithdrawalAction}
            className="mt-5 grid gap-3 xl:grid-cols-[160px_170px_180px_minmax(0,1fr)_auto]"
          >
            <input name="id" type="hidden" value={editing?.id ?? ""} />
            <label className="grid gap-2 text-sm font-medium text-body">
              Fecha
              <Input
                aria-label="Fecha de retiro"
                defaultValue={editing?.withdrawalDate ?? getLocalDateInputValue()}
                key={`${editing?.id}-date`}
                name="withdrawalDate"
                type="date"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-body">
              Monto
              <Input
                aria-label="Monto retirado"
                defaultValue={editing?.amount ?? ""}
                key={`${editing?.id}-amount`}
                min={0}
                name="amount"
                placeholder="Monto"
                step="0.01"
                type="number"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-body">
              Cuenta de salida
              <Select
                aria-label="Cuenta de salida"
                defaultValue={editing?.paymentMethod ?? "efectivo"}
                key={`${editing?.id}-payment`}
                name="paymentMethod"
                options={getCashMethodOptions("salary")}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-body">
              Observaciones
              <Textarea
                aria-label="Observaciones"
                defaultValue={editing?.notes ?? ""}
                key={`${editing?.id}-notes`}
                name="notes"
                placeholder="Motivo opcional"
              />
            </label>
            <div className="flex items-end gap-2">
              <Button disabled={!data.migrationReady} type="submit">
                {editing ? "Actualizar" : "Guardar"}
              </Button>
              {editing ? (
                <Button onClick={() => setEditing(null)} type="button" variant="secondary">
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </Card>

      <Card className="p-4 sm:p-5">
        <div>
          <p className="text-sm text-muted-foreground">Liquidaciones de {data.monthLabel}</p>
          <h2 className="text-xl font-semibold text-foreground">Retiros de sueldos confirmados</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cada registro separa lo pagado a las personas del origen financiero del retiro.
          </p>
        </div>
        <div className="mt-5 space-y-3">
          {data.liquidations.map((liquidation) => (
            <details className="min-w-0 border-t border-border py-3" key={liquidation.id}>
              <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">
                      Liquidación salarial
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(liquidation.withdrawalDate)}
                    </span>
                  </div>
                  <p className="mt-3 font-semibold text-foreground">
                    Cobertura mensual {liquidation.coveragePercentage.toFixed(1)}%
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs text-muted-foreground">Total retirado</p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {formatCurrency(liquidation.totalAmount)}
                  </p>
                </div>
              </summary>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="py-3">
                  <p className="text-xs text-muted-foreground">Sueldos</p>
                  <p className="mt-1 font-semibold">{formatCurrency(liquidation.salaryAmount)}</p>
                </div>
                <div className="py-3">
                  <p className="text-xs text-warning">Excedente</p>
                  <p className="mt-1 font-semibold text-warning">
                    {formatCurrency(liquidation.profitShareAmount)}
                  </p>
                </div>
                <div className="py-3">
                  <p className="text-xs text-success">Total</p>
                  <p className="mt-1 font-semibold text-success">
                    {formatCurrency(liquidation.totalAmount)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {liquidation.members.map((member) => (
                  <div className="border-t border-border py-3" key={member.memberId}>
                    <p className="font-semibold text-foreground">{member.memberName}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Sueldo {formatCurrency(member.salaryAmount)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Excedente {formatCurrency(member.profitShareAmount)}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatCurrency(member.totalAmount)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted-foreground">Origen del dinero</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {liquidation.funding.map((funding) => (
                    <span
                      className="rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
                      key={funding.paymentMethod}
                    >
                      {formatCashMethod(funding.paymentMethod)} · {formatCurrency(funding.amount)}
                    </span>
                  ))}
                </div>
              </div>
              {liquidation.notes ? (
                <p className="mt-4 text-sm text-muted-foreground">{liquidation.notes}</p>
              ) : null}
            </details>
          ))}
          {!data.liquidations.length ? (
            <div className="empty-panel">
              Todavía no hay retiros de sueldos confirmados en este mes.
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <p className="text-sm text-muted-foreground">Historial de {data.monthLabel}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground">Retiros extraordinarios</h2>
            <p className="text-sm text-muted-foreground">
              Sueldos pagados: {formatCurrency(paidTotal)} de {formatCurrency(salaryMass)}
            </p>
          </div>
        </div>
        <div className="grid divide-y divide-border px-4 lg:hidden">
          {data.withdrawals.map((withdrawal) => (
            <article className="min-w-0 border-t border-border py-3" key={withdrawal.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${withdrawal.withdrawalType === "salary" ? "bg-success-soft text-success" : "bg-accent text-body"}`}
                  >
                    {withdrawal.withdrawalType === "salary" ? "Liquidación" : "Extraordinario"}
                  </span>
                  <p className="mt-3 font-semibold text-foreground">
                    {withdrawal.memberName ?? formatCashMethod(withdrawal.paymentMethod)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(withdrawal.withdrawalDate)} ·{" "}
                    {formatCashMethod(withdrawal.paymentMethod)}
                  </p>
                </div>
                <p className="font-semibold text-foreground">{formatCurrency(withdrawal.amount)}</p>
              </div>
              {withdrawal.notes ? (
                <p className="mt-3 text-sm text-muted-foreground">{withdrawal.notes}</p>
              ) : null}
              {withdrawal.withdrawalType === "extraordinary" && canManage ? (
                <ActionMenu label="Más acciones">
                  <Button
                    onClick={() => setEditing(withdrawal)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Editar
                  </Button>
                  <form action={deleteSalaryWithdrawalAction}>
                    <input name="id" type="hidden" value={withdrawal.id} />
                    <Button className="w-full" size="sm" type="submit" variant="danger">
                      Eliminar
                    </Button>
                  </form>
                </ActionMenu>
              ) : null}
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="bg-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Integrante / cuenta</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Observaciones</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.withdrawals.map((withdrawal) => (
                <tr className="border-t border-border" key={withdrawal.id}>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${withdrawal.withdrawalType === "salary" ? "bg-success-soft text-success" : "bg-accent text-body"}`}
                    >
                      {withdrawal.withdrawalType === "salary" ? "Liquidación" : "Extraordinario"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(withdrawal.withdrawalDate)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">
                      {withdrawal.memberName ?? "Retiro manual"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCashMethod(withdrawal.paymentMethod)}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-semibold">{formatCurrency(withdrawal.amount)}</td>
                  <td className="max-w-xs px-4 py-3 text-muted-foreground">
                    {withdrawal.notes || "-"}
                  </td>
                  <td className="px-4 py-3">
                    {withdrawal.withdrawalType === "extraordinary" && canManage ? (
                      <ActionMenu label="Más acciones">
                        <Button
                          onClick={() => setEditing(withdrawal)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Editar
                        </Button>
                        <form action={deleteSalaryWithdrawalAction}>
                          <input name="id" type="hidden" value={withdrawal.id} />
                          <Button size="sm" type="submit" variant="danger">
                            Eliminar
                          </Button>
                        </form>
                      </ActionMenu>
                    ) : (
                      <p className="text-right text-xs text-subtle-foreground">Protegido</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.withdrawals.length ? (
          <div className="empty-panel m-4">Todavía no hay movimientos registrados en este mes.</div>
        ) : null}
      </Card>
    </div>
  );
}
