"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteExpenseAction, saveExpenseAction } from "@/features/expenses/actions";
import type { ActionResult } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatCurrency, formatDate } from "@/lib/utils";

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
  expenses,
  message
}: {
  expenses: Expense[];
  message: ActionResult | null;
}) {
  const [editing, setEditing] = useState<Expense | null>(null);
  const totalExpenses = expenses.filter((item) => !item.isVoided).reduce((acc, item) => acc + item.amount, 0);
  const cashImpact = expenses.filter((item) => item.impactsCash && !item.isVoided).reduce((acc, item) => acc + item.amount, 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Gastos reales</p>
            <h1 className="text-3xl font-semibold text-slate-950">Nuevo gasto rápido</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-rose-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-rose-700">Total gastos</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(totalExpenses)}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Impacta caja</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(cashImpact)}</p>
            </div>
          </div>
        </div>

        {message ? (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.message}
          </p>
        ) : null}

        <form action={saveExpenseAction} className="mt-6 grid gap-4 lg:grid-cols-5">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Categoría</label>
            <Input defaultValue={editing?.type ?? ""} key={`${editing?.id}-type`} name="type" placeholder="Mercadería, alquiler..." />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Descripción</label>
            <Input defaultValue={editing?.description ?? ""} key={`${editing?.id}-description`} name="description" placeholder="Detalle del gasto" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Monto</label>
            <Input defaultValue={editing?.amount ?? ""} key={`${editing?.id}-amount`} min={0} name="amount" step="0.01" type="number" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Medio de egreso</label>
            <Select
              defaultValue={editing?.paymentMethod ?? "efectivo"}
              key={`${editing?.id}-payment`}
              name="paymentMethod"
              options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
            />
          </div>
          <div className="lg:col-span-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">Observaciones</label>
            <Textarea defaultValue={editing?.observations ?? ""} key={`${editing?.id}-observations`} name="observations" placeholder="Opcional" />
          </div>
          <div className="flex items-end gap-2">
            <Button className="w-full" type="submit">{editing ? "Actualizar" : "Guardar gasto"}</Button>
            {editing ? <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancelar</Button> : null}
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 font-medium">Monto</th>
                <th className="px-4 py-3 font-medium">Método</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr className="border-t border-slate-100" key={expense.id}>
                  <td className="px-4 py-3 text-slate-600">{formatDate(expense.expenseDate)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{expense.type}</td>
                  <td className="px-4 py-3 text-slate-600">{expense.description}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(expense.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{expense.paymentMethod}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setEditing(expense)} size="sm" type="button" variant="secondary">Editar</Button>
                      <form action={deleteExpenseAction}>
                        <input name="id" type="hidden" value={expense.id} />
                        <Button size="sm" type="submit" variant="danger">Eliminar</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
