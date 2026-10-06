"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, ReceiptText, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { Select } from "@/components/ui/select";
import { saveInvoiceAction, voidInvoiceAction } from "@/features/invoices/actions";
import { formatInvoiceSource } from "@/features/invoices/labels";
import { calculateInvoiceAmounts } from "@/features/invoices/document-model";
import type { ActionResult } from "@/lib/form-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PaginationMeta } from "@/lib/pagination";

type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  sourceType: string;
  total: number;
  paidTotal: number;
  balance: number;
  documentVersion: number;
  fiscalReference: string | null;
  fiscalLockedAt: string | null;
  status: string;
  createdAt: string;
};

type InvoiceDetail = Invoice & {
  repairId: string | null;
  repairAccessOrderId: string | null;
  saleId: string | null;
  subtotal: number;
  discount: number;
  notes: string;
  fiscalProvider: string | null;
  fiscalIssuedAt: string | null;
  items: { description: string; quantity: number; unitPrice: number; total: number; productId?: string | null; repairId?: string | null }[];
};

type Options = {
  primaryOrders: Array<{ id: string; repairNumber: string; label: string; customerName: string; customerPhone: string; amount: number; description: string; notes: string }>;
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
  requestId,
  initialPrimaryOrderId,
  canVoid,
  invoices,
  options,
  editingInvoice,
  pagination,
  message
}: {
  requestId: string;
  initialPrimaryOrderId?: string;
  canVoid: boolean;
  invoices: Invoice[];
  options: Options;
  editingInvoice: InvoiceDetail | null;
  pagination: PaginationMeta;
  message: ActionResult | null;
}) {
  const initialPrimary = !editingInvoice ? options.primaryOrders.find((order) => order.id === initialPrimaryOrderId) : undefined;
  const [sourceType, setSourceType] = useState(editingInvoice?.sourceType ?? (initialPrimary ? "repair_access" : "manual"));
  const [repairId, setRepairId] = useState(editingInvoice?.repairId ?? "");
  const [repairAccessOrderId, setRepairAccessOrderId] = useState(editingInvoice?.repairAccessOrderId ?? initialPrimary?.id ?? "");
  const [saleId, setSaleId] = useState(editingInvoice?.saleId ?? "");
  const [customerName, setCustomerName] = useState(editingInvoice?.customerName ?? initialPrimary?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editingInvoice?.customerPhone ?? initialPrimary?.customerPhone ?? "");
  const [discount, setDiscount] = useState(editingInvoice?.discount ?? 0);
  const [items, setItems] = useState<DraftItem[]>(
    editingInvoice?.items.length
      ? editingInvoice.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          productId: item.productId ?? null,
          repairId: item.repairId ?? null
        }))
      : initialPrimary ? [{ description: initialPrimary.description, quantity: 1, unitPrice: initialPrimary.amount }] : [{ ...emptyItem }]
  );

  const amounts = (() => {
    try {
      const base = calculateInvoiceAmounts(items);
      try { return { ...calculateInvoiceAmounts(items, discount), error: null }; }
      catch (error) { return { ...base, total: 0, error: error instanceof Error ? error.message : "Revisa el descuento." }; }
    }
    catch (error) { return { subtotal: 0, total: 0, lineTotals: items.map(() => 0), error: error instanceof Error ? error.message : "Revisa los importes del comprobante." }; }
  })();
  const { subtotal, total } = amounts;
  const documentLocked = Boolean(editingInvoice?.fiscalReference || editingInvoice?.fiscalLockedAt || editingInvoice?.status === "anulado");

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

  function applyPrimaryOrder(id: string) {
    setRepairAccessOrderId(id);
    const order = options.primaryOrders.find((candidate) => candidate.id === id);
    if (!order) return;
    setCustomerName(order.customerName); setCustomerPhone(order.customerPhone);
    setItems([{ description: order.description, quantity: 1, unitPrice: order.amount }]);
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
          <div aria-live="polite" className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"} role={message.success ? "status" : "alert"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveInvoiceAction} className="mt-6 space-y-5">
          <input name="id" type="hidden" value={editingInvoice?.id ?? ""} />
          <input name="requestId" type="hidden" value={requestId} />
          <input name="expectedVersion" type="hidden" value={editingInvoice?.documentVersion ?? ""} />
          <input name="itemsJson" type="hidden" value={JSON.stringify(items)} />
          <p className="text-sm text-slate-600">Emitir o reimprimir no cobra ni mueve stock. Pagado y saldo se calculan desde los cobros efectivos vinculados.</p>
          {documentLocked ? <p className="status-banner" role="status">Documento bloqueado por anulacion o circuito fiscal. Su contenido no puede modificarse.</p> : null}

          <div className="grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="sourceType">
                Origen
              </label>
              <Select
                id="sourceType"
                name="sourceType"
                onChange={(event) => { setSourceType(event.target.value); setRepairId(""); setRepairAccessOrderId(""); setSaleId(""); setItems([{ ...emptyItem }]); }}
                options={[
                  { label: "Manual", value: "manual" },
                  { label: "REP (orden principal)", value: "repair_access" },
                  { label: "Reparacion (registro historico)", value: "repair" },
                  { label: "Venta", value: "sale" }
                ]}
                value={sourceType}
              />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="repairAccessOrderId">REP principal</label>
              <Select id="repairAccessOrderId" name="repairAccessOrderId" disabled={sourceType !== "repair_access"} value={repairAccessOrderId} onChange={(event) => applyPrimaryOrder(event.target.value)} options={[{ label: "Seleccionar REP", value: "" }, ...options.primaryOrders.map((order) => ({ label: order.label, value: order.id }))]} />
              <p className="mt-2 text-xs text-slate-500">Disponible antes del cobro. No requiere un registro financiero historico.</p>
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="repairId">
                Reparación
              </label>
              <Select
                id="repairId"
                disabled={sourceType !== "repair"}
                name="repairId"
                onChange={(event) => applyRepair(event.target.value)}
                options={[
                  { label: "Seleccionar reparación", value: "" },
                  ...options.repairs.map((repair) => ({ label: repair.label, value: repair.id }))
                ]}
                value={repairId}
              />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="saleId">
                Venta
              </label>
              <Select
                id="saleId"
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
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="discount">
                Descuento
              </label>
              <Input id="discount" min={0} name="discount" onChange={(event) => setDiscount(Number(event.target.value))} step="0.01" type="number" value={discount} />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="customerName">
                Cliente
              </label>
              <Input id="customerName" name="customerName" onChange={(event) => setCustomerName(event.target.value)} value={customerName} />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="customerPhone">
                Teléfono
              </label>
              <Input id="customerPhone" name="customerPhone" onChange={(event) => setCustomerPhone(event.target.value)} value={customerPhone} />
            </div>
            <div className="xl:col-span-2">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="notes">
                Observaciones
              </label>
              <Input id="notes" defaultValue={editingInvoice?.notes ?? initialPrimary?.notes ?? ""} name="notes" placeholder="Opcional" />
            </div>
          </div>

          <fieldset className="grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 md:grid-cols-3" disabled={documentLocked}>
            <legend className="px-2 text-sm font-semibold">Referencia fiscal externa opcional</legend>
            <div><label className="mb-2 block text-sm" htmlFor="fiscalProvider">Sistema emisor</label><Input id="fiscalProvider" name="fiscalProvider" maxLength={100} defaultValue={editingInvoice?.fiscalProvider ?? ""} placeholder="Proveedor o sistema externo" /></div>
            <div><label className="mb-2 block text-sm" htmlFor="fiscalReference">Referencia del comprobante</label><Input id="fiscalReference" name="fiscalReference" maxLength={300} defaultValue={editingInvoice?.fiscalReference ?? ""} /></div>
            <div><label className="mb-2 block text-sm" htmlFor="fiscalIssuedAt">Fecha externa</label><Input id="fiscalIssuedAt" name="fiscalIssuedAt" type="date" defaultValue={editingInvoice?.fiscalIssuedAt?.slice(0, 10) ?? ""} /></div>
            <p className="text-sm text-slate-500 md:col-span-3">Vincular una referencia no solicita ni acredita autorizacion ARCA. Al guardarla, se bloquea la edicion del documento interno.</p>
          </fieldset>

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
                    aria-label={`Producto opcional del ítem ${index + 1}`}
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
                  <Input aria-label={`Descripción del ítem ${index + 1}`} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="Descripción" value={item.description} />
                  <Input aria-label={`Cantidad del ítem ${index + 1}`} min={0.01} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} step="0.01" type="number" value={item.quantity} />
                  <Input aria-label={`Precio unitario del ítem ${index + 1}`} min={0} onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })} step="0.01" type="number" value={item.unitPrice} />
                  <div className="flex h-11 items-center rounded-[18px] border border-graphite/8 bg-brand-50 px-4 text-sm font-semibold text-slate-950">
                    {formatCurrency(amounts.lineTotals[index])}
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

          {amounts.error ? <p role="alert" className="text-sm text-red-700">{amounts.error}</p> : null}
          <FormSubmitButton
            disabled={documentLocked || Boolean(amounts.error)}
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
                    <p className="mt-1 text-xs text-slate-600">Pagado {formatCurrency(invoice.paidTotal)} / Saldo {formatCurrency(invoice.balance)}</p>
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
                {invoice.status !== "anulado" && !invoice.fiscalReference && !invoice.fiscalLockedAt ? (
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-[18px] border border-graphite/10 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-graphite/20 hover:bg-brand-50"
                    href={`/facturacion?edit=${invoice.id}`}
                  >
                    Editar
                  </Link>
                ) : null}
                {canVoid && invoice.status !== "anulado" && !invoice.fiscalReference && !invoice.fiscalLockedAt ? (
                  <form
                    action={voidInvoiceAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`Anular el comprobante ${invoice.invoiceNumber}?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input name="id" type="hidden" value={invoice.id} />
                    <input name="expectedVersion" type="hidden" value={invoice.documentVersion} />
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
                  <td className="px-4 py-4 font-medium text-slate-950">{formatCurrency(invoice.total)}<p className="mt-1 text-xs font-normal text-slate-600">Pagado {formatCurrency(invoice.paidTotal)}<br />Saldo {formatCurrency(invoice.balance)}</p></td>
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
                      {invoice.status !== "anulado" && !invoice.fiscalReference && !invoice.fiscalLockedAt ? (
                        <Link
                          className="inline-flex items-center rounded-full border border-graphite/10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-graphite/20 hover:bg-brand-50"
                          href={`/facturacion?edit=${invoice.id}`}
                        >
                          Editar
                        </Link>
                      ) : null}
                      {canVoid && invoice.status !== "anulado" && !invoice.fiscalReference && !invoice.fiscalLockedAt ? (
                        <form
                          action={voidInvoiceAction}
                          onSubmit={(event) => {
                            if (!window.confirm(`Anular el comprobante ${invoice.invoiceNumber}?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input name="id" type="hidden" value={invoice.id} />
                          <input name="expectedVersion" type="hidden" value={invoice.documentVersion} />
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
        <PaginationNav meta={pagination} pathname="/facturacion" />
      </div>
    </div>
  );
}
