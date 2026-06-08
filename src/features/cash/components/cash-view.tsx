"use client";

import { ArrowDownLeft, ArrowUpRight, Landmark, LockKeyhole, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { closeCashAction } from "@/features/cash/actions";
import type { ActionResult } from "@/lib/form-state";
import { formatCashMethod } from "@/lib/cash";
import { formatCurrency, formatDate } from "@/lib/utils";

type CashData = {
  today: string;
  totalBalance: number;
  todayIncome: number;
  todayOutcome: number;
  balances: Array<{
    method: string;
    openingBalance: number;
    todayIncome: number;
    todayOutcome: number;
    balance: number;
  }>;
  recentMovements: Array<{
    id: string;
    type: string;
    amount: number;
    method: string;
    description: string;
    date: string;
  }>;
  closures: Array<{
    id: string;
    date: string;
    finalBalance: number;
    observations: string;
  }>;
};

function formatMovementType(type: string) {
  if (type === "venta") return "Venta";
  if (type === "reparacion") return "Reparacion";
  if (type === "gasto") return "Gasto";
  if (type === "facturacion") return "Facturacion";
  if (type === "sueldo") return "Sueldo";
  return type;
}

function isIncome(type: string) {
  return type === "venta" || type === "reparacion" || type === "facturacion";
}

export function CashView({ canClose, data, message }: { canClose: boolean; data: CashData; message: ActionResult | null }) {
  const openingTotal = data.balances.reduce((acc, item) => acc + item.openingBalance, 0);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Control operativo</p>
            <h1 className="text-3xl font-semibold text-slate-950">Caja</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Saldos actuales por medio de pago, movimientos del dia y cierre diario del local.
            </p>
          </div>
          <div className="rounded-[28px] bg-graphite px-5 py-4 text-white">
            <p className="text-xs uppercase tracking-[0.24em] text-white/55">Saldo total actual</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(data.totalBalance)}</p>
          </div>
        </div>

        {message ? (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-brand-100 text-graphite" : "bg-rose-50 text-rose-700"}`}>
            {message.message}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {data.balances.map((account) => (
            <div key={account.method} className="rounded-[28px] border border-graphite/10 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-fog">{formatCashMethod(account.method)}</p>
                  <p className="mt-2 text-2xl font-semibold text-graphite">{formatCurrency(account.balance)}</p>
                </div>
                <div className="rounded-2xl bg-brand-100 p-3 text-graphite">
                  <Wallet className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-brand-50 p-3">
                  <p className="text-xs text-fog">Ingresos hoy</p>
                  <p className="mt-1 font-semibold text-graphite">{formatCurrency(account.todayIncome)}</p>
                </div>
                <div className="rounded-2xl bg-brand-50 p-3">
                  <p className="text-xs text-fog">Egresos hoy</p>
                  <p className="mt-1 font-semibold text-graphite">{formatCurrency(account.todayOutcome)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Cierre diario</p>
              <h2 className="text-xl font-semibold text-slate-950">Registrar cierre de hoy</h2>
            </div>
            <LockKeyhole className="h-5 w-5 text-fog" />
          </div>

          {canClose ? (
            <form action={closeCashAction} className="mt-5 grid gap-4">
              <input name="date" type="hidden" value={data.today} />
              <input name="openingBalance" type="hidden" value={openingTotal} />
              <input name="income" type="hidden" value={data.todayIncome} />
              <input name="outcome" type="hidden" value={data.todayOutcome} />
              <input name="finalBalance" type="hidden" value={data.totalBalance} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-brand-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-fog">Ingresos del dia</p>
                  <p className="mt-2 text-lg font-semibold text-graphite">{formatCurrency(data.todayIncome)}</p>
                </div>
                <div className="rounded-2xl bg-brand-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-fog">Egresos del dia</p>
                  <p className="mt-2 text-lg font-semibold text-graphite">{formatCurrency(data.todayOutcome)}</p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Observaciones</label>
                <Input name="observations" placeholder="Ej: caja verificada, diferencia, retiro..." />
              </div>

              <Button type="submit">Guardar cierre de caja</Button>
            </form>
          ) : (
            <div className="mt-5 rounded-3xl bg-brand-50 p-5 text-sm leading-6 text-slate-600">
              Podes consultar caja y movimientos, pero el cierre diario queda reservado para administradores.
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-950">Ultimos cierres</p>
            <div className="mt-3 space-y-2">
              {data.closures.length ? (
                data.closures.map((closure) => (
                  <div key={closure.id} className="rounded-2xl border border-graphite/10 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-graphite">{formatDate(closure.date)}</span>
                      <span className="font-semibold text-graphite">{formatCurrency(closure.finalBalance)}</span>
                    </div>
                    {closure.observations ? <p className="mt-1 text-xs text-slate-500">{closure.observations}</p> : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Todavia no hay cierres registrados.</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Movimientos</p>
              <h2 className="text-xl font-semibold text-slate-950">Historial reciente</h2>
            </div>
            <Landmark className="h-5 w-5 text-fog" />
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl border border-graphite/10">
            <div className="grid max-h-[560px] gap-3 overflow-auto bg-white p-3 md:hidden">
              {data.recentMovements.map((movement) => {
                const income = isIncome(movement.type);
                const Icon = income ? ArrowUpRight : ArrowDownLeft;
                return (
                  <article className="rounded-[22px] border border-graphite/8 bg-white px-4 py-3 shadow-[0_8px_18px_rgba(20,20,19,0.04)]" key={movement.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-brand-100 p-1 text-graphite">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <p className="font-semibold text-graphite">{formatMovementType(movement.type)}</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(movement.date)} - {formatCashMethod(movement.method)}</p>
                      </div>
                      <p className="shrink-0 font-semibold text-graphite">
                        {income ? "+" : "-"} {formatCurrency(movement.amount)}
                      </p>
                    </div>
                    {movement.description ? <p className="mt-2 break-words text-xs leading-5 text-slate-500">{movement.description}</p> : null}
                  </article>
                );
              })}
              {!data.recentMovements.length ? (
                <div className="bg-white px-4 py-8 text-sm text-slate-500">Todavia no hay movimientos de caja.</div>
              ) : null}
            </div>

            <div className="hidden max-h-[560px] overflow-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-brand-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Medio</th>
                    <th className="px-4 py-3 font-medium text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {data.recentMovements.map((movement) => {
                    const income = isIncome(movement.type);
                    const Icon = income ? ArrowUpRight : ArrowDownLeft;
                    return (
                      <tr className="border-t border-graphite/10" key={movement.id}>
                        <td className="px-4 py-3 text-slate-600">{formatDate(movement.date)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-brand-100 p-1 text-graphite">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="font-medium text-graphite">{formatMovementType(movement.type)}</span>
                          </div>
                          {movement.description ? <p className="mt-1 text-xs text-slate-500">{movement.description}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatCashMethod(movement.method)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-graphite">
                          {income ? "+" : "-"} {formatCurrency(movement.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!data.recentMovements.length ? (
                <div className="bg-white px-4 py-8 text-sm text-slate-500">Todavia no hay movimientos de caja.</div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
