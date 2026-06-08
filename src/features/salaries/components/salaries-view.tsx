"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteSalaryWithdrawalAction, saveSalaryWithdrawalAction } from "@/features/salaries/actions";
import type { ActionResult } from "@/lib/form-state";
import { formatCashMethod, getCashMethodOptions } from "@/lib/cash";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

type SalaryWithdrawal = {
  id: string;
  withdrawalDate: string;
  amount: number;
  paymentMethod: string;
  notes: string;
  createdAt: string;
};

type SalaryMonth = {
  month: string;
  label: string;
  total: number;
  count: number;
  byMethod: { efectivo: number; nx: number; mp: number };
};

export function SalariesView({
  canManage,
  data,
  message
}: {
  canManage: boolean;
  data: {
    migrationReady: boolean;
    currentMonthLabel: string;
    currentMonthTotal: number;
    currentMonthByMethod: { efectivo: number; nx: number; mp: number };
    monthlyTotals: SalaryMonth[];
    withdrawals: SalaryWithdrawal[];
  };
  message: ActionResult | null;
}) {
  const [editing, setEditing] = useState<SalaryWithdrawal | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Retiros personales</p>
            <h1 className="text-3xl font-semibold text-slate-950">Sueldo</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Registra cada retiro de sueldo y mira cuanto salio por mes y por cuenta.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-brand-100 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-fog">Total {data.currentMonthLabel}</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(data.currentMonthTotal)}</p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-fog">Retiros cargados</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{data.withdrawals.length}</p>
            </div>
          </div>
        </div>

        {!data.migrationReady ? (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Falta ejecutar la migracion de sueldos en Supabase para activar este modulo.
          </p>
        ) : null}

        {message ? (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-brand-100 text-graphite" : "bg-rose-50 text-rose-700"}`}>
            {message.message}
          </p>
        ) : null}

        {canManage ? (
          <form action={saveSalaryWithdrawalAction} className="mt-6 grid gap-4 lg:grid-cols-5">
            <input name="id" type="hidden" value={editing?.id ?? ""} />
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Fecha de retiro</label>
              <Input
                defaultValue={editing?.withdrawalDate ?? getLocalDateInputValue()}
                key={`${editing?.id}-date`}
                name="withdrawalDate"
                type="date"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Monto retirado</label>
              <Input
                defaultValue={editing?.amount ?? ""}
                key={`${editing?.id}-amount`}
                min={0}
                name="amount"
                step="0.01"
                type="number"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Cuenta de salida</label>
              <Select
                defaultValue={editing?.paymentMethod ?? "efectivo"}
                key={`${editing?.id}-payment`}
                name="paymentMethod"
                options={getCashMethodOptions("salary")}
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Observaciones</label>
              <Textarea
                defaultValue={editing?.notes ?? ""}
                key={`${editing?.id}-notes`}
                name="notes"
                placeholder="Opcional"
              />
            </div>
            <div className="flex items-end gap-2 lg:col-start-5">
              <Button className="w-full" disabled={!data.migrationReady} type="submit">
                {editing ? "Actualizar retiro" : "Guardar retiro"}
              </Button>
              {editing ? (
                <Button onClick={() => setEditing(null)} type="button" variant="secondary">
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="mt-5 rounded-3xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Solo administradores pueden registrar o corregir retiros de sueldo.
          </div>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <p className="text-sm text-slate-500">Resumen del mes actual</p>
          <h2 className="text-xl font-semibold text-slate-950">{data.currentMonthLabel}</h2>
          <div className="mt-4 grid gap-3">
            {(["efectivo", "nx", "mp"] as const).map((method) => (
              <div key={method} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    {formatCashMethod(method, { context: "salary" })}
                  </span>
                  <span className="text-lg font-semibold text-slate-950">
                    {formatCurrency(data.currentMonthByMethod[method])}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-sm text-slate-500">Totales por mes</p>
            <div className="mt-3 space-y-2">
              {data.monthlyTotals.length ? (
                data.monthlyTotals.map((month) => (
                  <div key={month.month} className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{month.label}</p>
                        <p className="text-xs text-slate-500">{month.count} retiros</p>
                      </div>
                      <p className="text-lg font-semibold text-slate-950">{formatCurrency(month.total)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Todavia no hay retiros cargados.</p>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">Historial de retiros</p>
          <h2 className="text-xl font-semibold text-slate-950">Ultimos movimientos</h2>
          <div className="mt-4 grid gap-3 lg:hidden">
            {data.withdrawals.map((withdrawal) => (
              <article className="rounded-[22px] border border-slate-100 bg-white px-4 py-3" key={withdrawal.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{formatCashMethod(withdrawal.paymentMethod, { context: "salary" })}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(withdrawal.withdrawalDate)}</p>
                  </div>
                  <p className="text-lg font-semibold text-slate-950">{formatCurrency(withdrawal.amount)}</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{withdrawal.notes || "-"}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {canManage ? (
                    <>
                      <Button className="w-full" onClick={() => setEditing(withdrawal)} type="button" variant="secondary">
                        Editar
                      </Button>
                      <form action={deleteSalaryWithdrawalAction}>
                        <input name="id" type="hidden" value={withdrawal.id} />
                        <Button className="w-full" disabled={!data.migrationReady} type="submit" variant="danger">
                          Eliminar
                        </Button>
                      </form>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Solo admin</p>
                  )}
                </div>
              </article>
            ))}
            {!data.withdrawals.length ? (
              <div className="border-t border-slate-100 bg-white px-4 py-8 text-sm text-slate-500">
                Todavia no cargaste retiros de sueldo.
              </div>
            ) : null}
          </div>

          <div className="mt-4 hidden overflow-x-auto lg:block">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cuenta</th>
                  <th className="px-4 py-3 font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Observaciones</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.withdrawals.map((withdrawal) => (
                  <tr className="border-t border-slate-100" key={withdrawal.id}>
                    <td className="px-4 py-3 text-slate-600">{formatDate(withdrawal.withdrawalDate)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatCashMethod(withdrawal.paymentMethod, { context: "salary" })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatCurrency(withdrawal.amount)}</td>
                    <td className="px-4 py-3 text-slate-600">{withdrawal.notes || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canManage ? (
                          <>
                            <Button onClick={() => setEditing(withdrawal)} size="sm" type="button" variant="secondary">
                              Editar
                            </Button>
                            <form action={deleteSalaryWithdrawalAction}>
                              <input name="id" type="hidden" value={withdrawal.id} />
                              <Button disabled={!data.migrationReady} size="sm" type="submit" variant="danger">
                                Eliminar
                              </Button>
                            </form>
                          </>
                        ) : (
                          <p className="text-xs text-slate-500">Solo admin</p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.withdrawals.length ? (
              <div className="border-t border-slate-100 bg-white px-4 py-8 text-sm text-slate-500">
                Todavia no cargaste retiros de sueldo.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
