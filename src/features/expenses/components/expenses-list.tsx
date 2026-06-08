"use client";

import { useState } from "react";
import { CalendarRange, CreditCard, Landmark } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteExpenseAction, saveExpenseAction } from "@/features/expenses/actions";
import { formatCashMethod } from "@/lib/cash";
import type { ActionResult } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

type Expense = {
  id: string;
  expenseDate: string;
  type: string;
  description: string;
  amount: number;
  paymentMethod: string;
  impactsCash: boolean;
  isVoided: boolean;
  observations: string;
};

export function ExpensesList({
  canDelete,
  expenses,
  message
}: {
  canDelete: boolean;
  expenses: Expense[];
  message: ActionResult | null;
}) {
  const today = getLocalDateInputValue();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [expenseDate, setExpenseDate] = useState(today);
  const totalExpenses = expenses.filter((item) => !item.isVoided).reduce((acc, item) => acc + item.amount, 0);
  const cashImpact = expenses.filter((item) => item.impactsCash && !item.isVoided).reduce((acc, item) => acc + item.amount, 0);

  function resetForm() {
    setEditing(null);
    setExpenseDate(today);
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="panel-kicker">Egresos reales</p>
            <h1 className="panel-heading mt-3">Nuevo gasto rapido</h1>
            <p className="panel-subheading mt-3">
              Registra gastos con una carga mas clara para caja: fecha, categoria, monto y cuenta de salida.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[23rem]">
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-finance-expenseSoft text-finance-expense">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Total gastos
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    {formatCurrency(totalExpenses)}
                  </p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
                  <Landmark className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Impacta caja
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    {formatCurrency(cashImpact)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {message ? (
          <div className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveExpenseAction} className="mt-6 grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 xl:grid-cols-6">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <div>
            <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Fecha
            </label>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-10" name="expenseDate" onChange={(event) => setExpenseDate(event.target.value)} type="date" value={expenseDate} />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Categoria
            </label>
            <Input defaultValue={editing?.type ?? ""} key={`${editing?.id}-type`} name="type" placeholder="Mercaderia, alquiler..." />
          </div>
          <div className="xl:col-span-2">
            <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Descripcion
            </label>
            <Input
              defaultValue={editing?.description ?? ""}
              key={`${editing?.id}-description`}
              name="description"
              placeholder="Detalle del gasto"
            />
          </div>
          <div>
            <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Monto
            </label>
            <Input defaultValue={editing?.amount ?? ""} key={`${editing?.id}-amount`} min={0} name="amount" step="0.01" type="number" />
          </div>
          <div>
            <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Medio de egreso
            </label>
            <Select
              defaultValue={editing?.paymentMethod ?? "efectivo"}
              key={`${editing?.id}-payment`}
              name="paymentMethod"
              options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
            />
          </div>
          <div className="xl:col-span-5">
            <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Observaciones
            </label>
            <Textarea defaultValue={editing?.observations ?? ""} key={`${editing?.id}-observations`} name="observations" placeholder="Contexto interno, comprobante o nota util" />
          </div>
          <div className="flex items-end gap-2">
            <FormSubmitButton
              className="w-full"
              idleLabel={editing ? "Actualizar gasto" : "Guardar gasto"}
              pendingLabel={editing ? "Actualizando..." : "Guardando..."}
            />
            {editing ? (
              <Button onClick={resetForm} type="button" variant="secondary">
                Cancelar
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <div className="table-shell">
        <div className="border-b border-graphite/8 bg-brand-50/80 px-4 py-4 text-sm text-slate-600">
          Historial operativo: se muestran los ultimos 100 gastos para mantener la pantalla veloz.
        </div>
        <div className="grid gap-3 p-3 lg:hidden">
          {expenses.map((expense) => (
            <article className="rounded-[24px] border border-graphite/8 bg-white/86 p-4 shadow-[0_10px_20px_rgba(20,20,19,0.04)]" key={expense.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{expense.type}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(expense.expenseDate)}</p>
                </div>
                <p className="shrink-0 text-lg font-semibold tracking-[-0.03em] text-slate-950">{formatCurrency(expense.amount)}</p>
              </div>
              <p className="mt-3 break-words text-sm leading-6 text-slate-600">{expense.description}</p>
              <div className="mt-3 rounded-[18px] bg-brand-50 px-3 py-2.5 text-sm">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Cuenta</span>
                <p className="mt-1 font-semibold text-slate-800">{formatCashMethod(expense.paymentMethod)}</p>
              </div>
              {expense.observations ? <p className="mt-3 text-xs leading-5 text-slate-500">{expense.observations}</p> : null}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    setEditing(expense);
                    setExpenseDate(expense.expenseDate);
                  }}
                  type="button"
                  variant="secondary"
                >
                  Editar
                </Button>
                {canDelete ? (
                  <form
                    action={deleteExpenseAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`Eliminar el gasto "${expense.description}"?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input name="id" type="hidden" value={expense.id} />
                    <Button className="w-full" type="submit" variant="danger">
                      Eliminar
                    </Button>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-white/80 text-left text-slate-500">
              <tr>
                <th className="px-4 py-4 font-medium">Fecha</th>
                <th className="px-4 py-4 font-medium">Categoria</th>
                <th className="px-4 py-4 font-medium">Descripcion</th>
                <th className="px-4 py-4 font-medium">Monto</th>
                <th className="px-4 py-4 font-medium">Cuenta</th>
                <th className="px-4 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr className="border-t border-graphite/8 bg-white/72 transition duration-200 hover:bg-white" key={expense.id}>
                  <td className="px-4 py-4 text-slate-600">{formatDate(expense.expenseDate)}</td>
                  <td className="px-4 py-4 font-medium text-slate-950">{expense.type}</td>
                  <td className="px-4 py-4 text-slate-600">{expense.description}</td>
                  <td className="px-4 py-4 font-medium text-slate-950">{formatCurrency(expense.amount)}</td>
                  <td className="px-4 py-4 text-slate-600">{formatCashMethod(expense.paymentMethod)}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={() => {
                          setEditing(expense);
                          setExpenseDate(expense.expenseDate);
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Editar
                      </Button>
                      {canDelete ? (
                        <form
                          action={deleteExpenseAction}
                          onSubmit={(event) => {
                            if (!window.confirm(`Eliminar el gasto "${expense.description}"?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input name="id" type="hidden" value={expense.id} />
                          <Button size="sm" type="submit" variant="danger">
                            Eliminar
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!expenses.length ? (
          <div className="empty-panel border-t border-graphite/8">
            Cuando registres gastos del local, van a aparecer aca con fecha, categoria y cuenta usada.
          </div>
        ) : null}
      </div>
    </div>
  );
}
