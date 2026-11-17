"use client";

import { ArrowDownLeft, ArrowUpRight, Landmark, LockKeyhole, Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ReconciliationPanel } from "@/features/cash/components/reconciliation-panel";
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
  if (type === "reparacion") return "Reparación";
  if (type === "gasto") return "Gasto";
  if (type === "facturacion") return "Facturación";
  if (type === "sueldo") return "Sueldo";
  return type;
}

function isIncome(type: string) {
  return type === "venta" || type === "reparacion" || type === "facturacion";
}

export function CashView({
  canClose,
  data,
  message
}: {
  canClose: boolean;
  data: CashData;
  message: ActionResult | null;
}) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Caja</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Saldos disponibles y movimientos del {formatDate(data.today)}.
            </p>
          </div>
          <div className="border-l border-border pl-4">
            <p className="text-sm text-muted-foreground">Saldo total disponible</p>
            <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">
              {formatCurrency(data.totalBalance)}
            </p>
          </div>
        </div>

        {message ? (
          <p
            className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-accent text-foreground" : "bg-danger-soft text-danger"}`}
          >
            {message.message}
          </p>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {data.balances.map((account) => (
            <div key={account.method} className="min-w-0 border-t border-border py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {formatCashMethod(account.method)}
                  </p>
                  <p className="mt-2 text-2xl font-semibold wrap-break-word text-foreground tabular-nums">
                    {formatCurrency(account.balance)}
                  </p>
                </div>
                <div className="text-muted-foreground">
                  <Wallet className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="py-1">
                  <p className="text-sm text-muted-foreground">Ingresos hoy</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatCurrency(account.todayIncome)}
                  </p>
                </div>
                <div className="py-1">
                  <p className="text-sm text-muted-foreground">Egresos hoy</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {formatCurrency(account.todayOutcome)}
                  </p>
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
              <h2 className="text-xl font-semibold text-foreground">
                Cierre del {formatDate(data.today)}
              </h2>
            </div>
            <LockKeyhole className="h-5 w-5 text-muted-foreground" />
          </div>

          {canClose ? (
            <ReconciliationPanel today={data.today} balances={data.balances} />
          ) : (
            <div className="mt-5 rounded-xl bg-muted p-5 text-sm leading-6 text-muted-foreground">
              Podés consultar caja y movimientos, pero el cierre diario queda reservado para
              administradores.
            </div>
          )}

          <div className="mt-6">
            <p className="text-sm font-semibold text-foreground">
              Cierres anteriores (sin arqueo por cuenta)
            </p>
            <div className="mt-3 space-y-2">
              {data.closures.length ? (
                data.closures.map((closure) => (
                  <div key={closure.id} className="border-b border-border py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">
                        {formatDate(closure.date)}
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(closure.finalBalance)}
                      </span>
                    </div>
                    {closure.observations ? (
                      <p className="mt-1 text-xs text-muted-foreground">{closure.observations}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Todavía no hay cierres registrados.</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Movimientos recientes</h2>
            </div>
            <Landmark className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="mt-4 overflow-hidden border-t border-border">
            <div className="grid max-h-[560px] overflow-auto bg-card px-4 md:hidden">
              {data.recentMovements.map((movement) => {
                const income = isIncome(movement.type);
                const Icon = income ? ArrowUpRight : ArrowDownLeft;
                return (
                  <article className="border-b border-border py-3" key={movement.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-accent p-1 text-foreground">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <p className="font-semibold text-foreground">
                            {formatMovementType(movement.type)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(movement.date)} - {formatCashMethod(movement.method)}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-foreground">
                        {income ? "+" : "-"} {formatCurrency(movement.amount)}
                      </p>
                    </div>
                    {movement.description ? (
                      <p className="mt-2 text-xs leading-5 wrap-break-word text-muted-foreground">
                        {movement.description}
                      </p>
                    ) : null}
                  </article>
                );
              })}
              {!data.recentMovements.length ? (
                <div className="bg-card px-4 py-8 text-sm text-muted-foreground">
                  Todavía no hay movimientos de caja.
                </div>
              ) : null}
            </div>

            <div className="hidden max-h-[560px] overflow-auto md:block">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Medio</th>
                    <th className="px-4 py-3 text-right font-medium">Monto</th>
                  </tr>
                </thead>
                <tbody className="bg-card">
                  {data.recentMovements.map((movement) => {
                    const income = isIncome(movement.type);
                    const Icon = income ? ArrowUpRight : ArrowDownLeft;
                    return (
                      <tr className="border-t border-border" key={movement.id}>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(movement.date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-accent p-1 text-foreground">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="font-medium text-foreground">
                              {formatMovementType(movement.type)}
                            </span>
                          </div>
                          {movement.description ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {movement.description}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatCashMethod(movement.method)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {income ? "+" : "-"} {formatCurrency(movement.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!data.recentMovements.length ? (
                <div className="bg-card px-4 py-8 text-sm text-muted-foreground">
                  Todavía no hay movimientos de caja.
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
