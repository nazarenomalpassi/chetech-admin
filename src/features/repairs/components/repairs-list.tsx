"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteRepairAction, saveRepairAction } from "@/features/repairs/actions";
import { repairStatusValues } from "@/features/repairs/schemas";
import type { ActionResult } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatCurrency, formatDate } from "@/lib/utils";

type Repair = {
  id: string;
  customerName: string;
  device: string;
  issueDescription: string;
  finalPrice: number;
  estimatedPrice: number;
  status: string;
  observations: string | null;
  createdAt: string;
};

export function RepairsList({
  repairs,
  message
}: {
  repairs: Repair[];
  message: ActionResult | null;
}) {
  const [editing, setEditing] = useState<Repair | null>(null);
  const delivered = repairs.filter((repair) => repair.status === "entregado").length;
  const revenue = repairs.reduce((acc, repair) => acc + repair.finalPrice, 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Reparaciones reales</p>
            <h1 className="text-3xl font-semibold text-slate-950">Nueva reparación rápida</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-brand-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-700">Entregadas listadas</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{delivered}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Ingresos listados</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(revenue)}</p>
            </div>
          </div>
        </div>

        {message ? (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.message}
          </p>
        ) : null}

        <form action={saveRepairAction} className="mt-6 grid gap-4 lg:grid-cols-6">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Cliente</label>
            <Input defaultValue={editing?.customerName ?? ""} key={`${editing?.id}-customer`} name="customerName" placeholder="Nombre" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Equipo</label>
            <Input defaultValue={editing?.device ?? ""} key={`${editing?.id}-device`} name="device" placeholder="Celular, notebook..." />
          </div>
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Falla</label>
            <Input defaultValue={editing?.issueDescription ?? ""} key={`${editing?.id}-issue`} name="issueDescription" placeholder="Qué le pasa al equipo" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Estado</label>
            <Select
              defaultValue={editing?.status ?? "ingresado"}
              key={`${editing?.id}-status`}
              name="status"
              options={repairStatusValues.map((status) => ({ value: status, label: status }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Monto</label>
            <Input defaultValue={editing?.finalPrice || editing?.estimatedPrice || ""} key={`${editing?.id}-amount`} min={0} name="amount" step="0.01" type="number" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Medio de ingreso</label>
            <Select
              defaultValue="efectivo"
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
            <Button className="w-full" type="submit">{editing ? "Actualizar" : "Guardar reparación"}</Button>
            {editing ? <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancelar</Button> : null}
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Equipo</th>
                <th className="px-4 py-3 font-medium">Ingreso</th>
                <th className="px-4 py-3 font-medium">Precio final</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {repairs.map((repair) => (
                <tr className="border-t border-slate-100" key={repair.id}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{repair.customerName}</p>
                      <p className="text-xs text-slate-500">{repair.issueDescription}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{repair.device}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(repair.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatCurrency(repair.finalPrice || repair.estimatedPrice)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={repair.status === "entregado" ? "success" : "default"}>
                      {repair.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => setEditing(repair)} size="sm" type="button" variant="secondary">Editar</Button>
                      <form action={deleteRepairAction}>
                        <input name="id" type="hidden" value={repair.id} />
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
