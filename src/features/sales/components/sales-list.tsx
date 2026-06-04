"use client";

import { useMemo, useState } from "react";
import { CalendarRange, CircleDollarSign, ShoppingBag, Sparkles, Trash2 } from "lucide-react";

import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteSaleAction, saveSaleAction } from "@/features/sales/actions";
import type { ActionResult } from "@/lib/form-state";
import { formatCashMethod } from "@/lib/cash";
import type { PaymentSplit } from "@/lib/payment-splits";
import { formatCurrency, formatDate, getLocalDateInputValue } from "@/lib/utils";

type ProductOption = {
  id: string;
  label: string;
  stock: number;
  salePrice: number;
};

type CartItem = {
  productId: string;
  label: string;
  stock: number;
  quantity: number;
  unitPrice: number;
};

type SaleItem = {
  productId: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
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
  items: SaleItem[];
};

export function SalesList({
  canManageHistory,
  sales,
  products,
  message
}: {
  canManageHistory: boolean;
  sales: Sale[];
  products: ProductOption[];
  message: ActionResult | null;
}) {
  const today = getLocalDateInputValue();
  const [editing, setEditing] = useState<Sale | null>(null);
  const [saleDate, setSaleDate] = useState(today);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [productSearch, setProductSearch] = useState(products[0]?.label ?? "");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(products[0]?.salePrice ?? 0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: "efectivo", amount: 0 }]);

  const selectedProduct = products.find((product) => product.id === productId);
  const cartTotal = cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const totalRevenue = sales.reduce((acc, sale) => acc + sale.subtotal, 0);
  const totalProfit = sales.reduce((acc, sale) => acc + sale.profitTotal, 0);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    if (!query) {
      return products.slice(0, 8);
    }

    return products.filter((product) => product.label.toLowerCase().includes(query)).slice(0, 8);
  }, [productSearch, products]);

  const itemsJson = JSON.stringify(
    cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice
    }))
  );
  const paymentsJson = JSON.stringify(payments);

  function selectProduct(product: ProductOption) {
    setProductId(product.id);
    setProductSearch(product.label);
    setUnitPrice(product.salePrice);
    setIsProductPickerOpen(false);
  }

  function clearProductEntry() {
    setProductId("");
    setProductSearch("");
    setQuantity(1);
    setUnitPrice(0);
  }

  function addToCart() {
    if (!selectedProduct || quantity <= 0) return;

    setCart((current) => {
      const existing = current.find((item) => item.productId === selectedProduct.id);
      if (existing) {
        return current.map((item) =>
          item.productId === selectedProduct.id ? { ...item, quantity: item.quantity + quantity, unitPrice } : item
        );
      }

      return [
        ...current,
        {
          productId: selectedProduct.id,
          label: selectedProduct.label,
          stock: selectedProduct.stock,
          quantity,
          unitPrice
        }
      ];
    });

    clearProductEntry();
  }

  function removeFromCart(productIdToRemove: string) {
    setCart((current) => current.filter((item) => item.productId !== productIdToRemove));
  }

  function startEdit(sale: Sale) {
    setEditing(sale);
    setCart(
      sale.items.map((item) => {
        const product = products.find((option) => option.id === item.productId);
        return {
          productId: item.productId,
          label: product?.label ?? item.productName ?? "Producto sin nombre",
          stock: product?.stock ?? 0,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        };
      })
    );
    setProductId("");
    setProductSearch("");
    setQuantity(1);
    setUnitPrice(0);
    setPayments(
      sale.payments.length
        ? sale.payments.map((payment) => ({ method: payment.method, amount: payment.amount }))
        : [{ method: "efectivo", amount: sale.subtotal }]
    );
    setSaleDate(sale.soldAt.slice(0, 10));
  }

  function resetForm() {
    setEditing(null);
    setCart([]);
    setProductId(products[0]?.id ?? "");
    setProductSearch(products[0]?.label ?? "");
    setQuantity(1);
    setUnitPrice(products[0]?.salePrice ?? 0);
    setPayments([{ method: "efectivo", amount: 0 }]);
    setSaleDate(today);
  }

  function renderPaymentSummary(sale: Sale) {
    if (!sale.payments.length) return "Sin pago";

    return sale.payments
      .map((payment) => `${formatCashMethod(payment.method)} ${formatCurrency(payment.amount)}`)
      .join(" + ");
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <p className="panel-kicker">Ventas reales</p>
              {editing ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-graphite/8 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  Editando venta
                </span>
              ) : null}
            </div>
            <h1 className="panel-heading mt-3">Nueva venta rapida</h1>
            <p className="panel-subheading mt-3">
              Carga productos, arma el carrito y reparte cobros en una experiencia mas clara para mostrador.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[23rem]">
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
                  <ShoppingBag className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Facturacion listada
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    {formatCurrency(totalRevenue)}
                  </p>
                </div>
              </div>
            </div>
            <div className="metric-tile min-h-[unset] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-finance-profitSoft text-finance-profit">
                  <CircleDollarSign className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Ganancia listada
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    {formatCurrency(totalProfit)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {message ? (
          <div className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveSaleAction} className="mt-6 space-y-5">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <input name="itemsJson" type="hidden" value={itemsJson} />
          <input name="paymentsJson" type="hidden" value={paymentsJson} />

          <div className="grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 xl:grid-cols-[minmax(0,2.3fr)_120px_150px_170px_140px]">
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Producto
              </label>
              <div className="relative">
                <Input
                  autoComplete="off"
                  onBlur={() => window.setTimeout(() => setIsProductPickerOpen(false), 120)}
                  onChange={(event) => {
                    setProductSearch(event.target.value);
                    setProductId("");
                    setUnitPrice(0);
                    setIsProductPickerOpen(true);
                  }}
                  onFocus={() => setIsProductPickerOpen(true)}
                  placeholder="Escribi nombre o SKU para encontrar rapido"
                  value={productSearch}
                />
                {isProductPickerOpen ? (
                  <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-[22px] border border-graphite/8 bg-white p-2 shadow-[0_20px_40px_rgba(20,20,19,0.12)]">
                    {filteredProducts.length ? (
                      filteredProducts.map((product) => (
                        <button
                          className="flex w-full items-center justify-between gap-3 rounded-[18px] px-3 py-3 text-left text-sm transition hover:bg-brand-100"
                          key={product.id}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            selectProduct(product);
                          }}
                          type="button"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-950">{product.label}</p>
                            <p className="mt-1 text-xs text-slate-500">Precio sugerido {formatCurrency(product.salePrice)}</p>
                          </div>
                          <span className="shrink-0 rounded-full border border-graphite/8 bg-white px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Stock {product.stock}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-sm text-slate-500">No encontre productos con ese texto.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-slate-500">Stock disponible: {selectedProduct?.stock ?? 0}</p>
            </div>

            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Cantidad
              </label>
              <Input min={1} onChange={(event) => setQuantity(Number(event.target.value))} type="number" value={quantity} />
            </div>

            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Precio
              </label>
              <Input
                min={0}
                onChange={(event) => setUnitPrice(Number(event.target.value))}
                step="0.01"
                type="number"
                value={unitPrice}
              />
            </div>

            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Fecha
              </label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-10" name="saleDate" onChange={(event) => setSaleDate(event.target.value)} type="date" value={saleDate} />
              </div>
            </div>

            <div className="flex items-end">
              <Button className="w-full" disabled={!selectedProduct || quantity <= 0} onClick={addToCart} type="button">
                Agregar
              </Button>
            </div>
          </div>

          <div className="table-shell">
            <div className="flex items-center justify-between border-b border-graphite/8 bg-brand-50/80 px-4 py-4">
              <div>
                <p className="panel-kicker">Carrito</p>
                <p className="mt-2 text-sm text-slate-500">Agrega uno o varios productos antes de cerrar la venta.</p>
              </div>
              <p className="text-2xl font-semibold tracking-[-0.05em] text-slate-950">{formatCurrency(cartTotal)}</p>
            </div>
            {cart.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/80 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-4 font-medium">Producto</th>
                      <th className="px-4 py-4 font-medium">Cantidad</th>
                      <th className="px-4 py-4 font-medium">Precio</th>
                      <th className="px-4 py-4 font-medium">Total</th>
                      <th className="px-4 py-4 font-medium text-right">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr className="border-t border-graphite/8 bg-white/72" key={item.productId}>
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-slate-950">{item.label}</p>
                            <p className="mt-1 text-xs text-slate-500">Stock visible {item.stock}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">{item.quantity}</td>
                        <td className="px-4 py-4 text-slate-600">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-4 py-4 font-semibold text-slate-950">{formatCurrency(item.quantity * item.unitPrice)}</td>
                        <td className="px-4 py-4 text-right">
                          <Button onClick={() => removeFromCart(item.productId)} size="sm" type="button" variant="danger">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Quitar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-panel">Todavia no agregaste productos a esta venta.</div>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <PaymentSplitFields onChange={setPayments} payments={payments} totalAmount={cartTotal} title="Cobro de la venta" />
            <div className="rounded-[30px] border border-graphite/8 bg-white/82 p-4">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Observaciones
              </label>
              <Textarea
                defaultValue={editing?.notes ?? ""}
                key={editing?.id ?? "new-notes"}
                name="notes"
                placeholder="Detalle opcional para referencia interna"
              />
              <div className="mt-4 flex items-end gap-2">
                <FormSubmitButton
                  className="w-full"
                  disabled={!cart.length}
                  idleLabel={editing ? "Actualizar venta" : "Guardar venta"}
                  pendingLabel={editing ? "Actualizando..." : "Guardando..."}
                />
                {editing ? (
                  <Button onClick={resetForm} type="button" variant="secondary">
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </form>
      </Card>

      <div className="table-shell">
        <div className="border-b border-graphite/8 bg-brand-50/80 px-4 py-4 text-sm text-slate-600">
          Mostrando las ultimas 100 ventas para sostener velocidad aunque crezca el historial.
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/80 text-left text-slate-500">
              <tr>
                <th className="px-4 py-4 font-medium">Venta</th>
                <th className="px-4 py-4 font-medium">Productos</th>
                <th className="px-4 py-4 font-medium">Fecha</th>
                <th className="px-4 py-4 font-medium">Total</th>
                <th className="px-4 py-4 font-medium">Cobro</th>
                <th className="px-4 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr className="border-t border-graphite/8 bg-white/72 transition duration-200 hover:bg-white" key={sale.id}>
                  <td className="px-4 py-4 font-medium text-slate-950">{sale.saleNumber}</td>
                  <td className="px-4 py-4 text-slate-600">
                    {sale.items.length
                      ? sale.items.map((item) => `${item.productName ?? "Producto"} x${item.quantity}`).join(", ")
                      : "Sin producto vinculado"}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{formatDate(sale.soldAt)}</td>
                  <td className="px-4 py-4 font-medium text-slate-950">{formatCurrency(sale.subtotal)}</td>
                  <td className="px-4 py-4 text-slate-600">{renderPaymentSummary(sale)}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      {canManageHistory ? (
                        <>
                          <Button onClick={() => startEdit(sale)} size="sm" type="button" variant="secondary">
                            Editar
                          </Button>
                          <form
                            action={deleteSaleAction}
                            onSubmit={(event) => {
                              if (
                                !window.confirm(
                                  `Eliminar la venta ${sale.saleNumber}? Esto restaura stock y borra el historial de cobro.`
                                )
                              ) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <input name="id" type="hidden" value={sale.id} />
                            <Button size="sm" type="submit" variant="danger">
                              Eliminar
                            </Button>
                          </form>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">Historial protegido</p>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!sales.length ? (
          <div className="empty-panel border-t border-graphite/8">
            Cuando registres una venta, la vas a ver aca con sus productos y medios de cobro.
          </div>
        ) : null}
      </div>
    </div>
  );
}
