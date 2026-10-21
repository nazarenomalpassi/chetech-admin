"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { correctRepairWarranty } from "../warranty-actions";
import type { RepairAccessOrderRecord } from "../queries";
import { WorkshopForm } from "./workshop-form";
import { RepairWarrantyFields } from "./repair-warranty-fields";

export function RepairWarrantyCorrection({ order, defaultWarrantyDays }: { order: RepairAccessOrderRecord; defaultWarrantyDays?: number }) {
  const missingPickup = !order.pickedUpAt;
  return <WorkshopForm orderId={order.id} orderVersion={order.workflow?.version} action={correctRepairWarranty} draftScope="warranty-correction">
    {(fields, submitting) => <>
      <input name="id" type="hidden" value={order.id} />
      <input name="expectedVersion" type="hidden" value={order.workflow?.version ?? 1} />
      <p className="text-sm text-slate-600">Esta orden ya fue entregada. Solo se corrige la garantia; no se reabre ni se modifica el retiro o los cobros.</p>
      <RepairWarrantyFields order={order} fields={fields} defaultWarrantyDays={defaultWarrantyDays} disabled={missingPickup} />
      <label className="grid gap-2 text-sm font-medium text-slate-700"><span>Motivo de la correccion de garantia</span>
        <Textarea name="reason" required minLength={3} maxLength={2000} defaultValue={fields.reason ?? ""} />
      </label>
      <label className="flex min-h-11 items-start gap-3 text-sm font-medium text-slate-700">
        <input name="confirmCorrection" type="checkbox" required defaultChecked={false} className="h-5 w-5 shrink-0 accent-graphite" />
        Confirmo la correccion desde el retiro original
      </label>
      {missingPickup ? <p role="alert" className="text-sm text-amber-900">Falta la fecha efectiva del retiro original. No se puede iniciar la garantia con la fecha de hoy.</p> : null}
      <Button type="submit" disabled={submitting || missingPickup} className="min-h-12">Guardar correccion de garantia</Button>
    </>}
  </WorkshopForm>;
}
