"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addInvoicePaymentAction, saveInvoiceAction, voidInvoiceAction } from "@/features/invoices/actions";
import type { ActionResult } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatCurrency, formatDate } from "@/lib/utils";

type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  sourceType: string;
  total: number;
  paidTotal: number;
  balance: number;
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
  payments: { method: string; amount: number; notes: string }[];
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
  }>;
  sales: Array<{ id: string; label: string; saleNumber: string; amount: number; notes: string }>;
  products: Array<{ id: string; label: string; name: string; price: number }>;
};

type DraftItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  productId?: string | null;
  repairId?: string | null;
};

type DraftPayment = {
  method: string;
  amount: number;
  notes?: string;
};

const emptyItem: DraftItem = { description: "", quantity: 1, unitPrice: 0 };
const emptyPayment: DraftPayment = { method: "efectivo", amount: 0, notes: "" };

export function InvoicesView({
  invoices,
  options,
  editingInvoice,
  message
}: {
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
  const [payments, setPayments] = useState<DraftPayment[]>(
    editingInvoice?.payments.length
      ? editingInvoice.payments.map((payment) => ({ ...payment }))
      : [{ ...emptyPayment }]
  );

  const subtotal = items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const paymentTotal = payments.reduce((acc, payment) => acc + Number(payment.amount || 0), 0);
  const total = Math.max(subtotal - discount, 0);
  const balance = Math.max(total - paymentTotal, 0);

  const statusVariant = (status: string) => {
    if (status === "pagado") return "success";
    if (status === "anulado") return "danger";
    if (status === "parcial") return "warning";
    return "default";
  };

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updatePayment(index: number, patch: Partial<DraftPayment>) {
    setPayments((current) => current.map((payment, paymentIndex) => (paymentIndex === index ? { ...payment, ...patch } : payment)));
  }

  function applyRepair(id: string) {
    setRepairId(id);
    const repair = options.repairs.find((item) => item.id === id);
    if (!repair) return;
    setCustomerName(repair.customerName);
    setCustomerPhone(repair.customerPhone);
    setItems([
      {
        description: `Reparacion de ${repair.device} - ${repair.issueDescription}`,
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
    setItems([{ description: `Venta ${sale.saleNumber}`, quantity: 1, unitPrice: sale.amount }]);
  }

  const productOptions = useMemo(
    () => [{ label: "Producto opcional", value: "" }, ...options.products.map((product) => ({ label: product.label, value: product.id }))],
    [options.products]
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Comprobantes internos</p>
            <h1 className="text-3xl font-semibold text-slate-950">Facturacion</h1>
          </div>
          {editingInvoice ? (
            <Link className="text-sm font-medium text-brand-700" href="/facturacion">
              Salir de edicion
            </Link>
          ) : null}
        </div>

        {message ? (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.message}
          </p>
        ) : null}

        <form action={saveInvoiceAction} className="mt-6 space-y-5">
          <input name="id" type="hidden" value={editingInvoice?.id ?? ""} />
          <input name="itemsJson" type="hidden" value={JSON.stringify(items)} />
          <input name="paymentsJson" type="hidden" value={JSON.stringify(payments.filter((payment) => Number(payment.amount) > 0))} />

          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Origen</label>
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
              <label className="mb-2 block text-sm font-medium text-slate-700">Reparacion</label>
              <Select
                disabled={sourceType !== "repair"}
                name="repairId"
                onChange={(event) => applyRepair(event.target.value)}
                options={[{ label: "Seleccionar reparacion", value: "" }, ...options.repairs.map((repair) => ({ label: repair.label, value: repair.id }))]}
                value={repairId}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Venta</label>
              <Select
                disabled={sourceType !== "sale"}
                name="saleId"
                onChange={(event) => applySale(event.target.value)}
                options={[{ label: "Seleccionar venta", value: "" }, ...options.sales.map((sale) => ({ label: sale.label, value: sale.id }))]}
                value={saleId}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Descuento</label>
              <Input min={0} name="discount" onChange={(event) => setDiscount(Number(event.target.value))} step="0.01" type="number" value={discount} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Cliente</label>
              <Input name="customerName" onChange={(event) => setCustomerName(event.target.value)} value={customerName} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Telefono</label>
              <Input name="customerPhone" onChange={(event) => setCustomerPhone(event.target.value)} value={customerPhone} />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Observaciones</label>
              <Input defaultValue={editingInvoice?.notes ?? ""} name="notes" placeholder="Opcional" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-950">Items</h2>
              <Button onClick={() => setItems((current) => [...current, { ...emptyItem }])} size="sm" type="button" variant="secondary">
                Agregar item
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {items.map((item, index) => (
                <div className="grid gap-3 lg:grid-cols-[1fr_2fr_110px_150px_120px_auto]" key={index}>
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
                  <div className="flex h-11 items-center rounded-2xl bg-slate-50 px-4 text-sm font-semibold">
                    {formatCurrency(item.quantity * item.unitPrice)}
                  </div>
                  <Button onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button" variant="ghost">
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-950">Pagos iniciales</h2>
              <Button onClick={() => setPayments((current) => [...current, { ...emptyPayment }])} size="sm" type="button" variant="secondary">
                Agregar pago
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {payments.map((payment, index) => (
                <div className="grid gap-3 lg:grid-cols-[180px_160px_1fr_auto]" key={index}>
                  <Select
                    onChange={(event) => updatePayment(index, { method: event.target.value })}
                    options={PAYMENT_METHODS.map((method) => ({ label: method.label, value: method.value }))}
                    value={payment.method}
                  />
                  <Input min={0} onChange={(event) => updatePayment(index, { amount: Number(event.target.value) })} step="0.01" type="number" value={payment.amount} />
                  <Input onChange={(event) => updatePayment(index, { notes: event.target.value })} placeholder="Nota de pago" value={payment.notes ?? ""} />
                  <Button onClick={() => setPayments((current) => current.filter((_, paymentIndex) => paymentIndex !== index))} type="button" variant="ghost">
                    Quitar
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Subtotal</p>
              <p className="font-semibold">{formatCurrency(subtotal)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Total</p>
              <p className="font-semibold">{formatCurrency(total)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Pagado</p>
              <p className="font-semibold">{formatCurrency(paymentTotal)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Saldo</p>
              <p className="font-semibold">{formatCurrency(balance)}</p>
            </div>
          </div>

          <Button type="submit">{editingInvoice ? "Actualizar comprobante" : "Crear comprobante"}</Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold text-slate-950">Comprobantes</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Numero</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Origen</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr className="border-t border-slate-100" key={invoice.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{invoice.invoiceNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(invoice.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{invoice.customerName}</td>
                  <td className="px-4 py-3 text-slate-600">{invoice.sourceType}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(invoice.total)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(invoice.balance)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={invoice.status === "pagado" ? "success" : invoice.status === "parcial" ? "warning" : invoice.status === "anulado" ? "danger" : "default"}>
                      {invoice.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link className="rounded-2xl bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200" href={`/facturacion/${invoice.id}`}>
                        Ver / imprimir
                      </Link>
                      {invoice.status !== "anulado" ? (
                        <Link className="rounded-2xl bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200" href={`/facturacion?edit=${invoice.id}`}>
                          Editar
                        </Link>
                      ) : null}
                      {invoice.status !== "anulado" ? (
                        <details className="relative">
                          <summary className="cursor-pointer rounded-2xl bg-brand-600 px-3 py-2 text-xs font-medium text-white">Pago</summary>
                          <form action={addInvoicePaymentAction} className="absolute right-0 z-10 mt-2 grid w-80 gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-soft">
                            <input name="invoiceId" type="hidden" value={invoice.id} />
                            <Select name="method" options={PAYMENT_METHODS.map((method) => ({ label: method.label, value: method.value }))} />
                            <Input min={0.01} name="amount" placeholder="Monto" step="0.01" type="number" />
                            <Input name="notes" placeholder="Nota" />
                            <Button size="sm" type="submit">Registrar pago</Button>
                          </form>
                        </details>
                      ) : null}
                      {invoice.status !== "anulado" ? (
                        <form action={voidInvoiceAction}>
                          <input name="id" type="hidden" value={invoice.id} />
                          <Button size="sm" type="submit" variant="danger">Anular</Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
