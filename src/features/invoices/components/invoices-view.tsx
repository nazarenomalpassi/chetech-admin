"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, ReceiptText, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { saveInvoiceAction, voidInvoiceAction } from "@/features/invoices/actions";
import { formatInvoiceSource } from "@/features/invoices/labels";
import type { ActionResult } from "@/lib/form-state";
import { formatCurrency, formatDate } from "@/lib/utils";

type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  sourceType: string;
  total: number;
  status: string;
  createdAt: string;
};

type InvoiceDetail = Invoice & {
  repairId: string | null;
  saleId: string | null;
  subtotal: number;
  discount: number;
  notes: string;
  items: { description: string; quantity: number; unitPrice: number; total: number }[];
};

type Options = {
  repairs: Array<{
    id: string;
    label: string;
    customerName: string;
    customerPhone: string;
    device: string;
    issueDescription: string;
    amount: number;
    observations: string;
    description: string;
  }>;
  sales: Array<{
    id: string;
    label: string;
    saleNumber: string;
    amount: number;
    notes: string;
    customerName: string;
    customerPhone: string;
    items: Array<{ description: string; quantity: number; unitPrice: number; total: number; productId?: string | null }>;
  }>;
  products: Array<{ id: string; label: string; name: string; price: number }>;
};

type DraftItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  productId?: string | null;
  repairId?: string | null;
};

const emptyItem: DraftItem = { description: "", quantity: 1, unitPrice: 0 };

export function InvoicesView({
  canVoid,
  invoices,
  options,
  editingInvoice,
  message
}: {
  canVoid: boolean;
  invoices: Invoice[];
  options: Options;
  editingInvoice: InvoiceDetail | null;
  message: ActionResult | null;
}) {
  const [sourceType, setSourceType] = useState(editingInvoice?.sourceType ?? "manual");
  const [repairId, setRepairId] = useState(editingInvoice?.repairId ?? "");
  const [saleId, setSaleId] = useState(editingInvoice?.saleId ?? "");
  const [customerName, setCustomerName] = useState(editingInvoice?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editingInvoice?.customerPhone ?? "");
  const [discount, setDiscount] = useState(editingInvoice?.discount ?? 0);
  const [items, setItems] = useState<DraftItem[]>(
    editingInvoice?.items.length
      ? editingInvoice.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        }))
      : [{ ...emptyItem }]
  );

  const subtotal = items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const total = Math.max(subtotal - discount, 0);

  const statusVariant = (status: string) => {
    if (status === "pagado") return "success";
    if (status === "anulado") return "danger";
    if (status === "parcial") return "warning";
    return "default";
  };

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function applyRepair(id: string) {
    setRepairId(id);
    const repair = options.repairs.find((item) => item.id === id);
    if (!repair) return;
    setCustomerName(repair.customerName);
    setCustomerPhone(repair.customerPhone);
    setItems([
      {
        description: repair.description,
        quantity: 1,
        unitPrice: repair.amount,
        repairId: repair.id
      }
    ]);
  }

  function applySale(id: string) {
    setSaleId(id);
    const sale = options.sales.find((item) => item.id === id);
    if (!sale) return;
    setCustomerName(sale.customerName || customerName);
    setCustomerPhone(sale.customerPhone || customerPhone);
    setItems(
      sale.items.length
        ? sale.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            productId: item.productId ?? null
          }))
        : [{ description: `Venta de productos ${sale.saleNumber}`, quantity: 1, unitPrice: sale.amount }]
    );
  }

  const productOptions = useMemo(
    () => [
      { label: "Producto opcional", value: "" },
      ...options.products.map((product) => ({ label: product.label, value: product.id }))
    ],
    [options.products]
  );

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <p className="panel-kicker">Comprobantes internos</p>
              {editingInvoice ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-graphite/8 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  Editando comprobante
                </span>
              ) : null}
            </div>
            <h1 className="panel-heading mt-3">Facturacion interna</h1>
            <p className="panel-subheading mt-3">
              Genera comprobantes claros para ventas o reparaciones sin perder velocidad de uso diario.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[23rem]">
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Comprobantes
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{invoices.length}</p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-finance-profitSoft text-finance-profit">
                  <ReceiptText className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Total actual
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{formatCurrency(total)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {editingInvoice ? (
          <div className="status-banner mt-5">
            Estas editando el comprobante {editingInvoice.invoiceNumber}.{" "}
            <Link className="font-semibold underline decoration-graphite/30 underline-offset-4" href="/facturacion">
              Salir de edicion
            </Link>
          </div>
        ) : null}

        {message ? (
          <div className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveInvoiceAction} className="mt-6 space-y-5">
          <input name="id" type="hidden" value={editingInvoice?.id ?? ""} />
          <input name="itemsJson" type="hidden" value={JSON.stringify(items)} />

          <div className="grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Origen
              </label>
              <Select
                name="sourceType"
                onChange={(event) => setSourceType(event.target.value)}
                options={[
                  { label: "Manual", value: "manual" },
                  { label: "Reparacion", value: "repair" },
                  { label: "Venta", value: "sale" }
                ]}
                value={sourceType}
              />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Reparacion
              </label>
              <Select
                disabled={sourceType !== "repair"}
                name="repairId"
                onChange={(event) => applyRepair(event.target.value)}
                options={[
                  { label: "Seleccionar reparacion", value: "" },
                  ...options.repairs.map((repair) => ({ label: repair.label, value: repair.id }))
                ]}
                value={repairId}
              />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Venta
              </label>
              <Select
                disabled={sourceType !== "sale"}
                name="saleId"
                onChange={(event) => applySale(event.target.value)}
                options={[
                  { label: "Seleccionar venta", value: "" },
                  ...options.sales.map((sale) => ({ label: sale.label, value: sale.id }))
                ]}
                value={saleId}
              />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Descuento
              </label>
              <Input min={0} name="discount" onChange={(event) => setDiscount(Number(event.target.value))} step="0.01" type="number" value={discount} />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Cliente
              </label>
              <Input name="customerName" onChange={(event) => setCustomerName(event.target.value)} value={customerName} />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Telefono
              </label>
              <Input name="customerPhone" onChange={(event) => setCustomerPhone(event.target.value)} value={customerPhone} />
            </div>
            <div className="xl:col-span-2">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Observaciones
              </label>
              <Input defaultValue={editingInvoice?.notes ?? ""} name="notes" placeholder="Opcional" />
            </div>
          </div>

          <div className="rounded-[30px] border border-graphite/8 bg-white/82 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="panel-kicker">Items</p>
                <h2 className="mt-2 text-[1.2rem] font-semibold tracking-[-0.03em] text-slate-950">
                  Detalle del comprobante
                </h2>
              </div>
              <Button onClick={() => setItems((current) => [...current, { ...emptyItem }])} size="sm" type="button" variant="secondary">
                Agregar item
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {items.map((item, index) => (
                <div
                  className="grid gap-3 rounded-[24px] border border-graphite/8 bg-white/90 p-4 xl:grid-cols-[1fr_2fr_110px_150px_130px_auto]"
                  key={index}
                >
                  <Select
                    onChange={(event) => {
                      const product = options.products.find((candidate) => candidate.id === event.target.value);
                      updateItem(index, {
                        productId: event.target.value || null,
                        description: product?.name ?? item.description,
                        unitPrice: product?.price ?? item.unitPrice
                      });
                    }}
                    options={productOptions}
                    value={item.productId ?? ""}
                  />
                  <Input onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="Descripcion" value={item.description} />
                  <Input min={0.01} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} step="0.01" type="number" value={item.quantity} />
                  <Input min={0} onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })} step="0.01" type="number" value={item.unitPrice} />
                  <div className="flex h-11 items-center rounded-[18px] border border-graphite/8 bg-brand-50 px-4 text-sm font-semibold text-slate-950">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </div>
                  <Button disabled={items.length <= 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button" variant="ghost">
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="metric-tile min-h-[unset] p-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Subtotal</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrency(subtotal)}</p>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Descuento</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrency(discount)}</p>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Total</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrency(total)}</p>
            </div>
          </div>

          <FormSubmitButton
            idleLabel={editingInvoice ? "Actualizar comprobante" : "Crear comprobante"}
            pendingLabel="Guardando comprobante..."
          />
        </form>
      </Card>

      <div className="table-shell">
        <div className="border-b border-graphite/8 bg-brand-50/80 px-4 py-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="panel-kicker">Historial documental</p>
              <h2 className="mt-2 text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">Comprobantes</h2>
            </div>
            <p className="text-sm text-slate-500">Listado listo para imprimir, revisar o anular desde admin.</p>
          </div>
        </div>
        <div className="grid gap-3 p-3 lg:hidden">
          {invoices.map((invoice) => (
            <article className="rounded-[24px] border border-graphite/8 bg-white/86 p-4 shadow-[0_10px_20px_rgba(20,20,19,0.04)]" key={invoice.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-950">{invoice.invoiceNumber}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(invoice.createdAt)}</p>
                </div>
                <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
              </div>
              <div className="mt-4 grid gap-2 text-sm">
                <div className="rounded-[18px] bg-brand-50 px-3 py-2.5">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Cliente</p>
                  <p className="mt-1 font-semibold text-slate-800">{invoice.customerName || "Sin cliente"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-[18px] bg-brand-50 px-3 py-2.5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Origen</p>
                    <p className="mt-1 font-semibold text-slate-800">{formatInvoiceSource(invoice.sourceType)}</p>
                  </div>
                  <div className="rounded-[18px] bg-brand-50 px-3 py-2.5">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Total</p>
                    <p className="mt-1 font-semibold text-slate-950">{formatCurrency(invoice.total)}</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-graphite/10 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-graphite/20 hover:bg-brand-50"
                  href={`/facturacion/${invoice.id}`}
                >
                  Ver / imprimir
                </Link>
                {invoice.status !== "anulado" ? (
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-graphite/10 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-graphite/20 hover:bg-brand-50"
                    href={`/facturacion?edit=${invoice.id}`}
                  >
                    Editar
                  </Link>
                ) : null}
                {canVoid && invoice.status !== "anulado" ? (
                  <form
                    action={voidInvoiceAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`Anular el comprobante ${invoice.invoiceNumber}?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input name="id" type="hidden" value={invoice.id} />
                    <FormSubmitButton className="w-full" idleLabel="Anular" pendingLabel="Anulando..." variant="danger" />
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
                <th className="px-4 py-4 font-medium">Numero</th>
                <th className="px-4 py-4 font-medium">Fecha</th>
                <th className="px-4 py-4 font-medium">Cliente</th>
                <th className="px-4 py-4 font-medium">Origen</th>
                <th className="px-4 py-4 font-medium">Total</th>
                <th className="px-4 py-4 font-medium">Estado</th>
                <th className="px-4 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr className="border-t border-graphite/8 bg-white/72 transition duration-200 hover:bg-white" key={invoice.id}>
                  <td className="px-4 py-4 font-medium text-slate-950">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(invoice.createdAt)}</td>
                  <td className="px-4 py-4 text-slate-600">{invoice.customerName}</td>
                  <td className="px-4 py-4 text-slate-600">{formatInvoiceSource(invoice.sourceType)}</td>
                  <td className="px-4 py-4 font-medium text-slate-950">{formatCurrency(invoice.total)}</td>
                  <td className="px-4 py-4">
                    <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        className="inline-flex items-center rounded-full border border-graphite/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-graphite/20 hover:bg-brand-50"
                        href={`/facturacion/${invoice.id}`}
                      >
                        Ver / imprimir
                      </Link>
                      {invoice.status !== "anulado" ? (
                        <Link
                          className="inline-flex items-center rounded-full border border-graphite/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-graphite/20 hover:bg-brand-50"
                          href={`/facturacion?edit=${invoice.id}`}
                        >
                          Editar
                        </Link>
                      ) : null}
                      {canVoid && invoice.status !== "anulado" ? (
                        <form
                          action={voidInvoiceAction}
                          onSubmit={(event) => {
                            if (!window.confirm(`Anular el comprobante ${invoice.invoiceNumber}?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input name="id" type="hidden" value={invoice.id} />
                          <FormSubmitButton idleLabel="Anular" pendingLabel="Anulando..." size="sm" variant="danger" />
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!invoices.length ? (
          <div className="empty-panel border-t border-graphite/8">
            Todavia no emitiste comprobantes internos en este modulo.
          </div>
        ) : null}
      </div>
    </div>
  );
}
