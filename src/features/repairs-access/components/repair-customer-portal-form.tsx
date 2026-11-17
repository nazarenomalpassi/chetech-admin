"use client";

import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateRepairCustomerPortalAction } from "@/features/repairs-access/actions";
import type { RepairAccessOrderRecord } from "@/features/repairs-access/queries";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RepairCustomerPortalForm({
  order,
  embedded = false,
  returnToOrders = false
}: {
  order: RepairAccessOrderRecord;
  embedded?: boolean;
  returnToOrders?: boolean;
}) {
  const publishedBudgetAmount = order.budgetAmount;
  const budgetVisible = publishedBudgetAmount > 0;
  const content = (
    <>
      <div className="min-w-0">
        {!embedded ? (
          <h2 className="text-lg font-semibold text-foreground">Seguimiento para el cliente</h2>
        ) : null}
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Esta actualización será visible para el cliente.
        </p>
      </div>

      {!order.customerPortalLinked ? (
        <p className="mt-4 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm leading-6 text-warning">
          Sin cuenta vinculada. El cliente podra ver esta informacion cuando vincules su cuenta.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Vinculada con {order.storefrontCustomer?.fullName ?? "una cuenta de cliente"}.
        </p>
      )}

      <form action={updateRepairCustomerPortalAction} className="mt-5 grid gap-4 md:grid-cols-2">
        <input name="id" type="hidden" value={order.id} />
        <input name="returnToOrders" type="hidden" value={String(returnToOrders)} />
        <input name="publicProgress" type="hidden" value={order.repairProgress ?? ""} />
        <input name="publicBudgetDescription" type="hidden" value={order.budgetDetail ?? ""} />
        <input name="budgetVisibleToCustomer" type="hidden" value={budgetVisible ? "on" : "off"} />

        <section
          aria-labelledby={`portal-auto-fields-${order.id}`}
          className="border-y border-border py-3 md:col-span-2"
        >
          <p className="text-sm font-medium text-body" id={`portal-auto-fields-${order.id}`}>
            Publicación automática
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Se actualizan al guardar en “Actualizar trabajo”.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-sm text-muted-foreground">Avance de reparación</dt>
              <dd className="mt-1 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-foreground">
                {order.repairProgress || "Sin avance cargado"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">Presupuesto</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {budgetVisible ? formatCurrency(publishedBudgetAmount) : "Sin importe cargado"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-muted-foreground">Detalle del presupuesto</dt>
              <dd className="mt-1 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-foreground">
                {order.budgetDetail || "Sin detalle cargado"}
              </dd>
            </div>
          </dl>
        </section>

        <label className="md:col-span-2">
          <span className="mb-2 block text-sm font-medium text-body">Próximo paso</span>
          <Textarea
            className="min-h-20"
            defaultValue={order.publicNextStep ?? ""}
            maxLength={1000}
            name="publicNextStep"
            id={`portal-${order.id}-next-step`}
            placeholder="Ej: Te avisaremos apenas el equipo esté listo para retirar."
          />
        </label>

        <label className="flex min-h-11 items-start gap-3 py-2 text-sm text-body md:col-span-2">
          <input
            className="mt-1 h-5 w-5 shrink-0 accent-graphite"
            defaultChecked={order.customerActionRequired}
            name="customerActionRequired"
            type="checkbox"
          />
          <span>
            <span className="block font-semibold text-foreground">
              Requiere una acción del cliente
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Activalo cuando el cliente deba aprobar, responder, acercarse o enviar información.
            </span>
          </span>
        </label>

        <label>
          <span className="mb-2 block text-sm font-medium text-body">Válido hasta</span>
          <Input
            defaultValue={order.budgetValidUntil?.slice(0, 10) ?? ""}
            name="budgetValidUntil"
            id={`portal-${order.id}-budget-valid-until`}
            type="date"
          />
        </label>

        <label className="flex min-h-11 items-start gap-3 py-2 text-sm text-body md:col-span-2">
          <input
            className="mt-1 h-5 w-5 shrink-0 accent-graphite"
            defaultChecked
            name="publishUpdate"
            type="checkbox"
          />
          <span>
            <span className="block font-semibold text-foreground">
              Publicar también en el historial
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Registra esta actualización como un nuevo evento visible para el cliente.
            </span>
          </span>
        </label>

        {order.lastCustomerVisibleUpdateAt ? (
          <p className="text-xs text-muted-foreground md:col-span-2">
            Última publicación visible: {formatDate(order.lastCustomerVisibleUpdateAt)}
          </p>
        ) : null}

        <div className="md:col-span-2">
          <FormSubmitButton
            className="w-full sm:w-auto"
            idleLabel="Guardar información pública"
            pendingLabel="Publicando..."
          />
        </div>
      </form>
    </>
  );

  if (embedded) {
    return <div className="border-t border-border p-4">{content}</div>;
  }

  return <Card>{content}</Card>;
}
