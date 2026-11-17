import { Boxes, PackageCheck, ReceiptText, ShoppingBag } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { Button, buttonVariants } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveReplenishmentItemAction } from "@/features/replenishment/actions";
import type {
  ReplenishmentData,
  ReplenishmentItem,
  ReplenishmentStatus
} from "@/features/replenishment/types";
import type { ActionResult } from "@/lib/form-state";
import { formatCurrency } from "@/lib/utils";

const statusOptions = [
  { value: "pending", label: "Pendiente" },
  { value: "added", label: "Agregado al pedido" },
  { value: "ordered", label: "Pedido" },
  { value: "received", label: "Recibido" }
];

function statusLabel(status: ReplenishmentStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? status;
}

function statusTone(status: ReplenishmentStatus) {
  if (status === "received") return "bg-success-soft text-success border-success-border";
  if (status === "ordered") return "bg-info-soft text-info border-info-border";
  if (status === "added") return "bg-warning-soft text-warning border-warning-border";
  return "bg-accent text-body border-border";
}

function ItemForm({
  item,
  monthKey,
  search,
  compact = false,
  disabled
}: {
  item: ReplenishmentItem;
  monthKey: string;
  search: string;
  compact?: boolean;
  disabled: boolean;
}) {
  const controlId = `replenishment-${compact ? "mobile" : "desktop"}-${item.productId}`;
  return (
    <form
      action={saveReplenishmentItemAction}
      className={
        compact
          ? "grid gap-3"
          : "grid min-w-[390px] grid-cols-[90px_170px_1fr_auto] items-end gap-2"
      }
    >
      <input name="periodMonth" type="hidden" value={monthKey} />
      <input name="productId" type="hidden" value={item.productId} />
      <input name="search" type="hidden" value={search} />
      <label className="grid gap-2 text-sm text-muted-foreground">
        Cantidad
        <Input
          id={`${controlId}-quantity`}
          aria-label={`Cantidad a pedir de ${item.productName}`}
          defaultValue={item.quantityToOrder}
          min={0}
          name="quantityToOrder"
          type="number"
        />
      </label>
      <label className="grid gap-2 text-sm text-muted-foreground">
        Estado
        <Select
          id={`${controlId}-status`}
          aria-label={`Estado de ${item.productName}`}
          defaultValue={item.status}
          name="status"
          options={statusOptions}
        />
      </label>
      <label className="grid gap-2 text-sm text-muted-foreground">
        Notas
        <Input
          id={`${controlId}-notes`}
          aria-label={`Notas de ${item.productName}`}
          defaultValue={item.notes}
          name="notes"
          placeholder="Opcional"
        />
      </label>
      <FormSubmitButton disabled={disabled} idleLabel="Guardar" pendingLabel="Guardando..." />
    </form>
  );
}

function ItemNextStep({ item }: { item: ReplenishmentItem }) {
  const href =
    `/productos?${new URLSearchParams({ search: item.sku || item.productName })}` as Route;
  return (
    <div className="mt-3 text-sm text-muted-foreground">
      <p>
        {item.status === "received"
          ? "Verifica la mercaderia y registra la entrada por separado."
          : item.status === "ordered"
            ? "Espera la entrega y revisa las cantidades antes de marcar Recibido."
            : "Ajusta la cantidad, contacta al proveedor y marca Pedido cuando lo hayas solicitado."}
      </p>
      <Link
        className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
        href={href}
      >
        {item.status === "received" ? "Revisar entrada en Productos" : "Consultar producto"}
      </Link>
    </div>
  );
}

export function ReplenishmentView({
  data,
  message,
  search
}: {
  data: ReplenishmentData;
  message: ActionResult | null;
  search: string;
}) {
  const kpis = [
    { label: "Productos vendidos", value: String(data.summary.productCount), icon: Boxes },
    { label: "Unidades vendidas", value: String(data.summary.quantitySold), icon: ShoppingBag },
    {
      label: "Reposición sugerida",
      value: formatCurrency(data.summary.suggestedReplacementCost),
      icon: ReceiptText
    },
    { label: "Pedido ajustado", value: formatCurrency(data.summary.orderTotal), icon: PackageCheck }
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Pedidos del mes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {data.monthLabel}. Reposición de productos vendidos en el mes.
            </p>
          </div>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_auto]">
            <label className="grid gap-2 text-sm font-medium text-body">
              Mes del pedido
              <Input defaultValue={data.monthKey} name="month" type="month" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-body">
              Producto o SKU
              <Input defaultValue={search} name="search" placeholder="Buscar en el pedido" />
            </label>
            <Button className="self-end" type="submit">
              Aplicar
            </Button>
          </form>
        </div>

        {!data.migrationReady ? (
          <p className="status-banner status-banner--error mt-5">
            Falta activar la migracion de planificacion.
          </p>
        ) : null}
        {message ? (
          <p
            role={message.success ? "status" : "alert"}
            className={
              message.success
                ? "status-banner status-banner--success mt-5"
                : "status-banner status-banner--error mt-5"
            }
          >
            {message.message}
          </p>
        ) : null}

        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="max-w-3xl text-sm text-muted-foreground">
            Ajusta las cantidades de la lista, pedi al proveedor por tu canal habitual y actualiza
            el estado. No envia compras ni registra gastos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              className={buttonVariants({ variant: "secondary" })}
              href="/productos?sort=stock&status=active"
            >
              Revisar menor stock
            </Link>
            <Link
              className={buttonVariants({ variant: "ghost" })}
              href="/reparaciones-access?view=ordenes&scope=parts"
            >
              Ver repuestos de reparaciones
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Los repuestos de una reparacion se gestionan en su orden, no en este pedido mensual.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div className="min-w-0 border-t border-border py-3" key={label}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-xl font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <p className="text-sm text-muted-foreground">{data.monthLabel}</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">Productos a reponer</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Marcar “Recibido” no suma stock. La entrada se confirma luego desde Productos.
          </p>
        </div>

        <div className="grid divide-y divide-border px-4 lg:hidden">
          {data.items.map((item) => (
            <article className="min-w-0 border-t border-border py-3" key={item.productId}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">{item.productName}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.sku || "Sin SKU"}</p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusTone(item.status)}`}
                >
                  {statusLabel(item.status)}
                </span>
              </div>
              <dl className="my-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Vendido</dt>
                  <dd className="mt-1 font-semibold">{item.quantitySold} u.</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Stock actual</dt>
                  <dd className="mt-1 font-semibold">{item.stock} u.</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Costo actual</dt>
                  <dd className="mt-1 font-semibold">{formatCurrency(item.currentUnitCost)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Proveedor</dt>
                  <dd className="mt-1 font-semibold">{item.supplier ?? "Sin configurar"}</dd>
                </div>
              </dl>
              <ItemForm
                compact
                item={item}
                monthKey={data.monthKey}
                search={search}
                disabled={!data.migrationReady}
              />
              <ItemNextStep item={item} />
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1180px] text-sm">
            <thead className="bg-muted/70 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Ventas</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Costos</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Plan del pedido</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr className="border-t border-border align-top" key={item.productId}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{item.productName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.sku || "Sin SKU"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{item.quantitySold} u.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCurrency(item.revenue)}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-semibold">{item.stock}</td>
                  <td className="px-4 py-3">
                    <p>{formatCurrency(item.currentUnitCost)} c/u</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Histórico {formatCurrency(item.historicalCost)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.supplier ?? "Sin proveedor configurado"}
                  </td>
                  <td className="px-4 py-3">
                    <ItemForm
                      item={item}
                      monthKey={data.monthKey}
                      search={search}
                      disabled={!data.migrationReady}
                    />
                    <ItemNextStep item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.items.length ? (
          <div className="empty-panel m-4">
            <p>No hay productos vendidos que coincidan con este mes y busqueda.</p>
            <p className="mt-2">
              Elegí otro mes o limpia la busqueda. Para faltantes sin ventas, usa Revisar menor
              stock; para una reparacion, entra a su orden.
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
