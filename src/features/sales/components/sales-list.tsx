"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteSaleAction, saveSaleAction } from "@/features/sales/actions";
import type { ActionResult } from "@/lib/form-state";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { formatCurrency, formatDate } from "@/lib/utils";

type ProductOption = {
  id: string;
  label: string;
  stock: number;
  salePrice: number;
};

type Sale = {
  id: string;
  saleNumber: string;
  subtotal: number;
  costTotal: number;
  profitTotal: number;
  soldAt: string;
  notes: string;
  payments: { method: string; amount: number }[];
  item: { productId: string; productName?: string; quantity: number; unitPrice: number; total: number } | null;
};

export function SalesList({
  sales,
  products,
  message
}: {
  sales: Sale[];
  products: ProductOption[];
  message: ActionResult | null;
}) {
  const [editing, setEditing] = useState<Sale | null>(null);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(products[0]?.salePrice ?? 0);

  const selectedProduct = products.find((product) => product.id === productId);
  const total = quantity * unitPrice;
  const totalRevenue = sales.reduce((acc, sale) => acc + sale.subtotal, 0);
  const totalProfit = sales.reduce((acc, sale) => acc + sale.profitTotal, 0);

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: `${product.label} | Stock: ${product.stock}` })),
    [products]
  );

  function startEdit(sale: Sale) {
    setEditing(sale);
    setProductId(sale.item?.productId ?? products[0]?.id ?? "");
    setQuantity(sale.item?.quantity ?? 1);
    setUnitPrice(sale.item?.unitPrice ?? products[0]?.salePrice ?? 0);
  }

  function resetForm() {
    setEditing(null);
    setProductId(products[0]?.id ?? "");
    setQuantity(1);
    setUnitPrice(products[0]?.salePrice ?? 0);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-slate-500">Ventas reales</p>
            <h1 className="text-3xl font-semibold text-slate-950">Nueva venta rápida</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-brand-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-brand-700">Facturación listada</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Ganancia listada</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(totalProfit)}</p>
            </div>
          </div>
        </div>

        {message ? (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.message}
          </p>
        ) : null}

        <form action={saveSaleAction} className="mt-6 grid gap-4 lg:grid-cols-6">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Producto</label>
            <Select
              name="productId"
              onChange={(event) => {
                const product = products.find((item) => item.id === event.target.value);
                setProductId(event.target.value);
                setUnitPrice(product?.salePrice ?? 0);
              }}
              options={productOptions}
              value={productId}
            />
            <p className="mt-1 text-xs text-slate-500">Stock disponible: {selectedProduct?.stock ?? 0}</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Cantidad</label>
            <Input min={1} name="quantity" onChange={(event) => setQuantity(Number(event.target.value))} type="number" value={quantity} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Precio</label>
            <Input min={0} name="unitPrice" onChange={(event) => setUnitPrice(Number(event.target.value))} step="0.01" type="number" value={unitPrice} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Medio de pago</label>
            <Select
              name="paymentMethod"
              options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
              defaultValue={editing?.payments[0]?.method ?? "efectivo"}
              key={editing?.id ?? "new-payment"}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Total</label>
            <div className="flex h-11 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold">
              {formatCurrency(total)}
            </div>
          </div>
          <div className="lg:col-span-5">
            <label className="mb-2 block text-sm font-medium text-slate-700">Observaciones</label>
            <Textarea defaultValue={editing?.notes ?? ""} key={editing?.id ?? "new-notes"} name="notes" placeholder="Detalle opcional de la venta" />
          </div>
          <div className="flex items-end gap-2">
            <Button className="w-full" type="submit">{editing ? "Actualizar" : "Guardar venta"}</Button>
            {editing ? <Button onClick={resetForm} type="button" variant="secondary">Cancelar</Button> : null}
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Venta</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Pago</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr className="border-t border-slate-100" key={sale.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{sale.saleNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{sale.item?.productName ?? "Sin producto vinculado"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(sale.soldAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCurrency(sale.subtotal)}</td>
                  <td className="px-4 py-3 text-slate-600">{sale.payments[0]?.method ?? "sin pago"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => startEdit(sale)} size="sm" type="button" variant="secondary">Editar</Button>
                      <form action={deleteSaleAction}>
                        <input name="id" type="hidden" value={sale.id} />
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
