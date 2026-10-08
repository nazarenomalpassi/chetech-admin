"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteExpenseAction, linkExpensePurchaseAction } from "@/features/expenses/actions";
import { ExpenseLinkSelector } from "./expense-link-selector";
import { ExpenseSaveForm } from "./expense-save-form";
import { formatCashMethod } from "@/lib/cash";
import type { ActionResult } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";
import type { PaginationMeta } from "@/lib/pagination";

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
  repairOrderId: string | null;
  partRequestId: string | null;
  linkLabel: string;
};

export function ExpensesList({
  canDelete,
  ownerId,
  expenses,
  pagination,
  message,
  savedOperation,
  savedScope
}: {
  canDelete: boolean;
  ownerId: string;
  expenses: Expense[];
  pagination: PaginationMeta;
  message: ActionResult | null;
  savedOperation?: string;
  savedScope?: string;
}) {
  const today = getLocalDateInputValue();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [linking, setLinking] = useState<Expense | null>(null);
  const [expenseDate, setExpenseDate] = useState(today);
  const totalExpenses = expenses.filter((item) => !item.isVoided).reduce((acc, item) => acc + item.amount, 0);
  const cashImpact = expenses.filter((item) => item.impactsCash && !item.isVoided).reduce((acc, item) => acc + item.amount, 0);

  function resetForm() {
    setEditing(null);
    setExpenseDate(today);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div>
          <h1 className="panel-heading">{editing ? "Editar gasto" : "Nuevo gasto"}</h1>
          <p className="mt-1 text-sm text-slate-600">Registra el importe, la fecha y el medio de egreso.</p>
        </div>

        {message ? (
          <div aria-live="polite" className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"} role={message.success ? "status" : "alert"}>
            {message.message}
          </div>
        ) : null}

        <ExpenseSaveForm ownerId={ownerId} scope={editing?.id ?? "new"} savedOperation={savedOperation} savedScope={savedScope} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-500" htmlFor="expenseDate">
              Fecha
            </label>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-10" name="expenseDate" onChange={(event) => setExpenseDate(event.target.value)} type="date" value={expenseDate} />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-500" htmlFor="type">
              Categoría
            </label>
            <Input defaultValue={editing?.type ?? ""} key={`${editing?.id}-type`} name="type" placeholder="Mercaderia, alquiler..." />
          </div>
          <div className="sm:col-span-2 xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-500" htmlFor="description">
              Descripción
            </label>
            <Input
              defaultValue={editing?.description ?? ""}
              key={`${editing?.id}-description`}
              name="description"
              placeholder="Detalle del gasto"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-500" htmlFor="amount">
              Monto
            </label>
            <Input defaultValue={editing?.amount ?? ""} key={`${editing?.id}-amount`} min={0} name="amount" step="0.01" type="number" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-500" htmlFor="paymentMethod">
              Medio de egreso
            </label>
            <Select
              defaultValue={editing?.paymentMethod ?? "efectivo"}
              key={`${editing?.id}-payment`}
              name="paymentMethod"
              options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
            />
          </div>
          <div className="sm:col-span-2 xl:col-span-6">
            <label className="mb-2 block text-sm font-medium text-slate-500" htmlFor="observations">
              Observaciones (opcional)
            </label>
            <Textarea rows={2} defaultValue={editing?.observations ?? ""} key={`${editing?.id}-observations`} name="observations" placeholder="Comprobante o nota interna" />
          </div>
          <div className="sm:col-span-2 xl:col-span-6">
            {editing ? <p className="text-sm text-slate-600">Para cambiar solo el destino, usa Vincular pago en el historial.</p> : <ExpenseLinkSelector key="new-expense-link" prefix="new-expense" />}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4 sm:col-span-2 xl:col-span-6">
            <FormSubmitButton
              className="w-full sm:w-auto"
              idleLabel={editing ? "Actualizar gasto" : "Guardar gasto"}
              pendingLabel={editing ? "Actualizando..." : "Guardando..."}
            />
            {editing ? (
              <Button onClick={resetForm} type="button" variant="secondary">
                Cancelar
              </Button>
            ) : null}
          </div>
        </ExpenseSaveForm>
      </Card>

      {linking ? <section className="rounded-2xl border border-graphite/10 bg-white p-4" aria-label="Enlace de gasto existente">
        <h2 className="text-xl font-semibold text-slate-950">Vincular gasto existente</h2>
        <p className="mt-2 break-words text-sm text-slate-700">{linking.description} · {formatCurrency(linking.amount)} · {formatDate(linking.expenseDate)}</p>
        <p className="mt-2 text-sm text-slate-600">Cambia el destino sin volver a registrar dinero ni modificar el gasto.</p>
        <form action={linkExpensePurchaseAction} className="mt-4 space-y-4">
          <input name="id" type="hidden" value={linking.id} />
          <input name="expectedOrderId" type="hidden" value={linking.repairOrderId ?? ""} />
          <input name="expectedPartId" type="hidden" value={linking.partRequestId ?? ""} />
          <ExpenseLinkSelector key={linking.id} prefix="existing-expense" initial={{ orderId: linking.repairOrderId, partRequestId: linking.partRequestId, label: linking.linkLabel }} />
          <div className="flex flex-wrap gap-2"><FormSubmitButton idleLabel="Guardar vinculo" pendingLabel="Vinculando..." /><Button type="button" variant="secondary" onClick={() => setLinking(null)}>Cancelar</Button></div>
        </form>
      </section> : null}

      <div className="table-shell">
        <div className="space-y-2 border-b border-graphite/8 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">Historial de gastos</h2>
          <p className="text-sm text-slate-600">En esta pagina: gastos {formatCurrency(totalExpenses)}, egresos de caja {formatCurrency(cashImpact)}.</p>
          <p className="text-sm text-slate-500">Vincula un pago existente para no registrarlo dos veces.</p>
        </div>
        <div className="divide-y divide-slate-200 xl:hidden">
          {expenses.map((expense) => (
            <article className="bg-white p-4" key={expense.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{expense.type}</p>
                  <p className="mt-1 text-sm text-slate-500">{formatDate(expense.expenseDate)}</p>
                </div>
                <p className="shrink-0 text-lg font-semibold text-slate-950">{formatCurrency(expense.amount)}</p>
              </div>
              <p className="mt-3 break-words text-sm leading-6 text-slate-600">{expense.description}</p>
              {expense.linkLabel ? <p className="mt-2 break-words text-sm font-semibold text-slate-800">{expense.linkLabel}</p> : null}
              <div className="mt-3 text-sm">
                <span className="text-sm font-medium text-slate-400">Cuenta</span>
                <p className="mt-1 font-semibold text-slate-800">{formatCashMethod(expense.paymentMethod)}</p>
              </div>
              {expense.observations ? <p className="mt-3 text-sm leading-5 text-slate-500">{expense.observations}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={expense.isVoided} onClick={() => setLinking(expense)} type="button" variant="secondary">{expense.repairOrderId ? "Revisar vinculo" : "Vincular pago"}</Button>
                <Button
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
                  <ActionMenu label="Mas acciones">
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
                  </ActionMenu>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Descripcion</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Cuenta</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr className="border-t border-graphite/8 bg-white hover:bg-slate-50" key={expense.id}>
                  <td className="px-4 py-3 text-slate-600">{formatDate(expense.expenseDate)}</td>
                  <td className="px-4 py-3 font-medium text-slate-950">{expense.type}</td>
                  <td className="px-4 py-3 text-slate-600">{expense.description}{expense.linkLabel ? <p className="mt-1 font-semibold text-slate-800">{expense.linkLabel}</p> : null}</td>
                  <td className="px-4 py-3 font-medium text-slate-950">{formatCurrency(expense.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCashMethod(expense.paymentMethod)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button disabled={expense.isVoided} onClick={() => setLinking(expense)} size="sm" type="button" variant="secondary">{expense.repairOrderId ? "Revisar vinculo" : "Vincular pago"}</Button>
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
                        <ActionMenu label="Mas acciones">
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
                        </ActionMenu>
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
        <PaginationNav meta={pagination} pathname="/gastos" />
      </div>
    </div>
  );
}
