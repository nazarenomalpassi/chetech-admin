import { Boxes, PackageCheck, ReceiptText, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveReplenishmentItemAction } from "@/features/replenishment/actions";
import type { ReplenishmentData, ReplenishmentItem, ReplenishmentStatus } from "@/features/replenishment/types";
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
  if (status === "received") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "ordered") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "added") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function ItemForm({ item, monthKey, search, compact = false }: { item: ReplenishmentItem; monthKey: string; search: string; compact?: boolean }) {
  return (
    <form action={saveReplenishmentItemAction} className={compact ? "grid gap-3" : "grid min-w-[390px] grid-cols-[90px_170px_1fr_auto] items-end gap-2"}>
      <input name="periodMonth" type="hidden" value={monthKey} />
      <input name="productId" type="hidden" value={item.productId} />
      <input name="search" type="hidden" value={search} />
      <label className="grid gap-2 text-sm text-slate-600">Cantidad<Input aria-label={`Cantidad a pedir de ${item.productName}`} defaultValue={item.quantityToOrder} min={0} name="quantityToOrder" type="number" /></label>
      <label className="grid gap-2 text-sm text-slate-600">Estado<Select aria-label={`Estado de ${item.productName}`} defaultValue={item.status} name="status" options={statusOptions} /></label>
      <label className="grid gap-2 text-sm text-slate-600">Notas<Input aria-label={`Notas de ${item.productName}`} defaultValue={item.notes} name="notes" placeholder="Opcional" /></label>
      <Button size="sm" type="submit">Guardar</Button>
    </form>
  );
}

export function ReplenishmentView({ data, message, search }: { data: ReplenishmentData; message: ActionResult | null; search: string }) {
  const kpis = [
    { label: "Productos vendidos", value: String(data.summary.productCount), icon: Boxes },
    { label: "Unidades vendidas", value: String(data.summary.quantitySold), icon: ShoppingBag },
    { label: "Reposicion sugerida", value: formatCurrency(data.summary.suggestedReplacementCost), icon: ReceiptText },
    { label: "Pedido ajustado", value: formatCurrency(data.summary.orderTotal), icon: PackageCheck }
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Pedidos del mes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {data.monthLabel}. Planifica la reposicion sin cambiar el stock.
            </p>
          </div>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,170px)_minmax(0,1fr)_auto]">
            <label className="grid gap-2 text-sm font-medium text-slate-700">Mes del pedido<Input defaultValue={data.monthKey} name="month" type="month" /></label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">Producto o SKU<Input defaultValue={search} name="search" placeholder="Buscar en el pedido" /></label>
            <Button className="self-end" type="submit">Aplicar</Button>
          </form>
        </div>

        {!data.migrationReady ? <p className="status-banner status-banner--error mt-5">Falta activar la migracion de planificacion.</p> : null}
        {message ? <p className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>{message.message}</p> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ label, value, icon: Icon }) => (
            <div className="min-w-0 border-t border-slate-200 py-3" key={label}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                <Icon aria-hidden="true" className="h-4 w-4 text-slate-500" />
              </div>
              <p className="mt-3 text-xl font-semibold text-slate-950">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        <div className="border-b border-graphite/8 px-4 py-4 sm:px-5">
          <p className="text-sm text-slate-500">{data.monthLabel}</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Productos a reponer</h2>
          <p className="mt-2 text-sm text-slate-500">Marcar “Recibido” no suma stock. La entrada se confirma luego desde Productos.</p>
        </div>

        <div className="grid divide-y divide-slate-200 px-4 lg:hidden">
          {data.items.map((item) => (
            <article className="min-w-0 border-t border-slate-200 py-3" key={item.productId}>
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-semibold text-slate-950">{item.productName}</h3><p className="mt-1 text-xs text-slate-500">{item.sku || "Sin SKU"}</p></div>
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
              </div>
              <dl className="my-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-slate-500">Vendido</dt><dd className="mt-1 font-semibold">{item.quantitySold} u.</dd></div>
                <div><dt className="text-xs text-slate-500">Stock actual</dt><dd className="mt-1 font-semibold">{item.stock} u.</dd></div>
                <div><dt className="text-xs text-slate-500">Costo actual</dt><dd className="mt-1 font-semibold">{formatCurrency(item.currentUnitCost)}</dd></div>
                <div><dt className="text-xs text-slate-500">Proveedor</dt><dd className="mt-1 font-semibold">{item.supplier ?? "Sin configurar"}</dd></div>
              </dl>
              <ItemForm compact item={item} monthKey={data.monthKey} search={search} />
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-brand-50/70 text-left text-xs text-slate-500"><tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Ventas</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3">Costos</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Plan del pedido</th></tr></thead>
            <tbody>{data.items.map((item) => (
              <tr className="border-t border-graphite/8 align-top" key={item.productId}>
                <td className="px-4 py-3"><p className="font-semibold text-slate-950">{item.productName}</p><p className="mt-1 text-xs text-slate-500">{item.sku || "Sin SKU"}</p></td>
                <td className="px-4 py-3"><p className="font-semibold">{item.quantitySold} u.</p><p className="mt-1 text-xs text-slate-500">{formatCurrency(item.revenue)}</p></td>
                <td className="px-4 py-3 font-semibold">{item.stock}</td>
                <td className="px-4 py-3"><p>{formatCurrency(item.currentUnitCost)} c/u</p><p className="mt-1 text-xs text-slate-500">Historico {formatCurrency(item.historicalCost)}</p></td>
                <td className="px-4 py-3 text-slate-600">{item.supplier ?? "Sin proveedor configurado"}</td>
                <td className="px-4 py-3"><ItemForm item={item} monthKey={data.monthKey} search={search} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!data.items.length ? <div className="empty-panel m-4">No hay productos vendidos que coincidan con este mes y busqueda.</div> : null}
      </Card>
    </div>
  );
}
