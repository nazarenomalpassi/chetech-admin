"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RepairAccessOrderRecord } from "../queries";

export function RepairWarrantyFields({ order, fields, defaultWarrantyDays, disabled = false }: {
  order: RepairAccessOrderRecord; fields: Record<string, string>; defaultWarrantyDays?: number; disabled?: boolean;
}) {
  const enabled = "hasWarranty" in fields ? fields.hasWarranty === "on" : Boolean(order.hasWarranty);
  return <fieldset disabled={disabled} className="grid min-w-0 gap-3 rounded-xl border border-slate-200 p-3">
    <legend className="px-1 text-sm font-semibold text-slate-900">Garantia de la reparacion</legend>
    <input type="hidden" name="warrantyIncluded" value="1" />
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
      <input name="hasWarranty" type="checkbox" defaultChecked={enabled} className="h-5 w-5 shrink-0 accent-graphite" />
      Esta reparacion tiene garantia
    </label>
    <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Duracion de garantia en dias</span>
      <Input name="warrantyDays" type="number" min={1} max={3650} step={1} disabled={!enabled} required={enabled}
        defaultValue={fields.warrantyDays || order.warrantyDays || defaultWarrantyDays || ""} placeholder="Cantidad de dias" />
    </label>
    <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Condiciones especiales de garantia</span>
      <Textarea name="warrantyConditions" maxLength={2000} defaultValue={fields.warrantyConditions ?? order.warrantyConditions ?? ""} className="min-h-20" />
    </label>
    <p className="text-xs leading-5 text-slate-600">Se cuenta desde el retiro original, nunca desde el reingreso. Guardar no renueva la cobertura.</p>
  </fieldset>;
}
