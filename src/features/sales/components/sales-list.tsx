"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarRange, Trash2 } from "lucide-react";

import { PaymentSplitFields } from "@/components/forms/payment-split-fields";
import { DraftRecoveryBanner } from "@/components/forms/draft-recovery-banner";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { PaginationNav } from "@/components/ui/pagination-nav";
import { Textarea } from "@/components/ui/textarea";
import { deleteSaleAction, saveSaleAction } from "@/features/sales/actions";
import type { ActionResult } from "@/lib/form-state";
import { formatCashMethod } from "@/lib/cash";
import type { PaymentSplit } from "@/lib/payment-splits";
import type { PaginationMeta } from "@/lib/pagination";
import { usePersistentFormDraft } from "@/hooks/use-persistent-form-draft";
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
  productId: string | null;
  productName?: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type Sale = {
  id: string;
  tvBoardId?: string | null;
  saleNumber: string;
  subtotal: number;
  costTotal: number | null;
  profitTotal: number | null;
  soldAt: string;
  notes: string;
  payments: { method: string; amount: number }[];
  items: SaleItem[];
};

type SaleDraft = {
  editing: Sale | null;
  saleDate: string;
  productId: string;
  productSearch: string;
  quantity: number;
  unitPrice: number;
  cart: CartItem[];
  payments: PaymentSplit[];
  notes: string;
};

function isImmutableSale(sale: Sale) {
  return Boolean(sale.tvBoardId) || sale.items.some((item) => !item.productId);
}

export function SalesList({
  canManageHistory,
  sales,
  products,
  pagination,
  message,
  actionStatus
}: {
  canManageHistory: boolean;
  sales: Sale[];
  products: ProductOption[];
  pagination: PaginationMeta;
  message: ActionResult | null;
  actionStatus?: string;
}) {
  const today = getLocalDateInputValue();
  const [editing, setEditing] = useState<Sale | null>(null);
  const [saleDate, setSaleDate] = useState(today);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [productSearch, setProductSearch] = useState(products[0]?.label ?? "");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [activeProductIndex, setActiveProductIndex] = useState(-1);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(products[0]?.salePrice ?? 0);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: "efectivo", amount: 0 }]);
  const [notes, setNotes] = useState("");

  const selectedProduct = products.find((product) => product.id === productId);
  const cartTotal = cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const totalRevenue = sales.reduce((acc, sale) => acc + sale.subtotal, 0);
  const incompleteCostCount = sales.filter(
    (sale) => sale.costTotal == null || sale.profitTotal == null
  ).length;
  const totalProfit = sales.reduce(
    (acc, sale) => acc + (sale.costTotal == null ? 0 : (sale.profitTotal ?? 0)),
    0
  );

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
  const hasUnsavedChanges = Boolean(editing || cart.length || notes.trim());
  const restoreSaleDraft = useCallback((saved: SaleDraft) => {
    if (saved.editing && isImmutableSale(saved.editing)) return;
    setEditing(saved.editing);
    setSaleDate(saved.saleDate);
    setProductId(saved.productId);
    setProductSearch(saved.productSearch);
    setQuantity(saved.quantity);
    setUnitPrice(saved.unitPrice);
    setCart(saved.cart);
    setPayments(saved.payments.length ? saved.payments : [{ method: "efectivo", amount: 0 }]);
    setNotes(saved.notes);
  }, []);
  const draft = usePersistentFormDraft<SaleDraft>({
    clearOnMount: actionStatus === "sale_created" || actionStatus === "sale_updated",
    draftKey: "sales:active",
    isDirty: hasUnsavedChanges,
    onRestore: restoreSaleDraft,
    value: {
      editing,
      saleDate,
      productId,
      productSearch,
      quantity,
      unitPrice,
      cart,
      payments,
      notes
    }
  });

  function selectProduct(product: ProductOption) {
    setProductId(product.id);
    setProductSearch(product.label);
    setUnitPrice(product.salePrice);
    setIsProductPickerOpen(false);
    setActiveProductIndex(-1);
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
          item.productId === selectedProduct.id
            ? { ...item, quantity: item.quantity + quantity, unitPrice }
            : item
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
    if (isImmutableSale(sale)) return;
    const nextCart: CartItem[] = [];
    for (const item of sale.items) {
      if (!item.productId) return;
      const product = products.find((option) => option.id === item.productId);
      nextCart.push({
        productId: item.productId,
        label: product?.label ?? item.productName ?? "Producto sin nombre",
        stock: product?.stock ?? 0,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      });
    }
    setEditing(sale);
    setCart(nextCart);
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
    setNotes(sale.notes);
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
    setNotes("");
  }

  function renderPaymentSummary(sale: Sale) {
    if (!sale.payments.length) return "Sin pago";

    return sale.payments
      .map((payment) => `${formatCashMethod(payment.method)} ${formatCurrency(payment.amount)}`)
      .join(" + ");
  }

  return (
    <div className="space-y-4">
      <Card>
        <div>
          <h1 className="panel-heading">
            {editing ? `Editar venta ${editing.saleNumber}` : "Nueva venta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agrega productos y completa el cobro antes de guardar.
          </p>
        </div>

        {message ? (
          <div
            aria-live="polite"
            className={
              message.success
                ? "status-banner status-banner--success mt-5"
                : "status-banner status-banner--error mt-5"
            }
            role={message.success ? "status" : "alert"}
          >
            {message.message}
          </div>
        ) : null}

        {draft.pendingDraft ? (
          <div className="mt-5">
            <DraftRecoveryBanner
              onDiscard={draft.discardDraft}
              onRestore={draft.restoreDraft}
              updatedAt={draft.pendingDraft.updatedAt}
            />
          </div>
        ) : null}

        <form action={saveSaleAction} className="mt-4 space-y-4">
          <input name="id" type="hidden" value={editing?.id ?? ""} />
          <input name="itemsJson" type="hidden" value={itemsJson} />
          <input name="paymentsJson" type="hidden" value={paymentsJson} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_100px_140px_160px_auto]">
            <div className="min-w-0 sm:col-span-2 xl:col-span-1">
              <label
                className="mb-2 block text-sm font-medium text-muted-foreground"
                htmlFor="sale-product-search"
              >
                Producto
              </label>
              <div className="relative">
                <Input
                  aria-autocomplete="list"
                  aria-controls={isProductPickerOpen ? "sale-product-options" : undefined}
                  aria-activedescendant={
                    isProductPickerOpen &&
                    activeProductIndex >= 0 &&
                    filteredProducts[activeProductIndex]
                      ? `sale-product-option-${filteredProducts[activeProductIndex].id}`
                      : undefined
                  }
                  aria-expanded={isProductPickerOpen}
                  aria-haspopup="listbox"
                  autoComplete="off"
                  id="sale-product-search"
                  role="combobox"
                  onBlur={() => window.setTimeout(() => setIsProductPickerOpen(false), 120)}
                  onChange={(event) => {
                    setProductSearch(event.target.value);
                    setProductId("");
                    setUnitPrice(0);
                    setIsProductPickerOpen(true);
                    setActiveProductIndex(-1);
                  }}
                  onFocus={() => {
                    setIsProductPickerOpen(true);
                    setActiveProductIndex(-1);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setIsProductPickerOpen(false);
                      setActiveProductIndex(-1);
                    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                      event.preventDefault();
                      setIsProductPickerOpen(true);
                      setActiveProductIndex((current) =>
                        event.key === "ArrowDown"
                          ? Math.min(current + 1, filteredProducts.length - 1)
                          : Math.max(current - 1, 0)
                      );
                    } else if (event.key === "Enter" && isProductPickerOpen) {
                      event.preventDefault();
                      const option = filteredProducts[activeProductIndex];
                      if (option) selectProduct(option);
                    }
                  }}
                  placeholder="Nombre o SKU"
                  value={productSearch}
                />
                {isProductPickerOpen ? (
                  <div
                    id="sale-product-options"
                    role="listbox"
                    aria-label="Productos disponibles"
                    className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xs"
                  >
                    {filteredProducts.length ? (
                      filteredProducts.map((product, index) => (
                        <button
                          className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent ${activeProductIndex === index ? "bg-accent" : ""}`}
                          id={`sale-product-option-${product.id}`}
                          role="option"
                          aria-selected={activeProductIndex === index}
                          tabIndex={-1}
                          key={product.id}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => selectProduct(product)}
                          type="button"
                        >
                          <div className="min-w-0">
                            <p className="font-medium wrap-break-word text-foreground">
                              {product.label}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Precio sugerido {formatCurrency(product.salePrice)}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm text-muted-foreground">
                            Disponible {product.stock}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-3 text-sm text-muted-foreground">
                        Sin resultados. Proba otro nombre o SKU.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Stock disponible: {selectedProduct?.stock ?? 0}
              </p>
            </div>

            <div>
              <label
                className="mb-2 block text-sm font-medium text-muted-foreground"
                htmlFor="sale-quantity"
              >
                Cantidad
              </label>
              <Input
                id="sale-quantity"
                min={1}
                onChange={(event) => setQuantity(Number(event.target.value))}
                type="number"
                value={quantity}
              />
            </div>

            <div>
              <label
                className="mb-2 block text-sm font-medium text-muted-foreground"
                htmlFor="sale-unit-price"
              >
                Precio unitario
              </label>
              <MoneyInput id="sale-unit-price" onValueChange={setUnitPrice} value={unitPrice} />
            </div>

            <div>
              <label
                className="mb-2 block text-sm font-medium text-muted-foreground"
                htmlFor="saleDate"
              >
                Fecha
              </label>
              <div className="relative">
                <CalendarRange className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
                <Input
                  className="pl-10"
                  id="saleDate"
                  name="saleDate"
                  onChange={(event) => setSaleDate(event.target.value)}
                  type="date"
                  value={saleDate}
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!selectedProduct || quantity <= 0}
                onClick={addToCart}
                type="button"
              >
                Agregar al carrito
              </Button>
            </div>
          </div>

          <div className="table-shell">
            <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
              <h2 className="text-base font-semibold text-foreground">Carrito</h2>
              <p className="text-lg font-semibold text-foreground tabular-nums">
                <span className="mr-2 text-sm font-normal text-muted-foreground">Total</span>
                {formatCurrency(cartTotal)}
              </p>
            </div>
            {cart.length ? (
              <div className="divide-y divide-border xl:hidden">
                {cart.map((item) => (
                  <article className="bg-card p-4" key={item.productId}>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{item.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Stock visible {item.stock}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-foreground">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-sm text-muted-foreground">Cantidad</span>
                        <p className="font-semibold text-foreground">{item.quantity}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Precio</span>
                        <p className="font-semibold text-foreground">
                          {formatCurrency(item.unitPrice)}
                        </p>
                      </div>
                    </div>
                    <Button
                      className="mt-3"
                      onClick={() => removeFromCart(item.productId)}
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                      Quitar
                    </Button>
                  </article>
                ))}
              </div>
            ) : null}
            {cart.length ? (
              <div className="hidden overflow-x-auto xl:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-card text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Producto</th>
                      <th className="px-4 py-3 font-medium">Cantidad</th>
                      <th className="px-4 py-3 font-medium">Precio</th>
                      <th className="px-4 py-3 font-medium">Total</th>
                      <th className="px-4 py-3 text-right font-medium">Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr className="border-t border-border bg-card" key={item.productId}>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-foreground">{item.label}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Stock visible {item.stock}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.quantity}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            onClick={() => removeFromCart(item.productId)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
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
            <PaymentSplitFields
              onChange={setPayments}
              payments={payments}
              totalAmount={cartTotal}
              title="Cobro de la venta"
            />
            <div className="min-w-0">
              <label
                className="mb-2 block text-sm font-medium text-muted-foreground"
                htmlFor="notes"
              >
                Observaciones (opcional)
              </label>
              <Textarea
                id="notes"
                name="notes"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Detalle opcional para referencia interna"
                value={notes}
              />
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
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
              {draft.lastSavedAt && hasUnsavedChanges ? (
                <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
                  Borrador de venta guardado en este dispositivo.
                </p>
              ) : null}
            </div>
          </div>
        </form>
      </Card>

      <div className="table-shell">
        <div className="space-y-2 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">Historial de ventas</h2>
          <p className="text-sm text-muted-foreground">
            En esta pagina: ventas {formatCurrency(totalRevenue)}, margen con costos conocidos{" "}
            {formatCurrency(totalProfit)}. No es utilidad neta del local.
          </p>
          {incompleteCostCount ? (
            <p className="text-sm text-muted-foreground">
              {incompleteCostCount} venta(s) con costo desconocido, excluidas del margen.
            </p>
          ) : null}
        </div>
        <div className="divide-y divide-border xl:hidden">
          {sales.map((sale) => (
            <article className="bg-card p-4" key={sale.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{sale.saleNumber}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(sale.soldAt)}</p>
                </div>
                <p className="shrink-0 text-lg font-semibold text-foreground">
                  {formatCurrency(sale.subtotal)}
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 wrap-break-word text-muted-foreground">
                {sale.items.length
                  ? sale.items
                      .map((item) => `${item.productName ?? "Producto"} x${item.quantity}`)
                      .join(", ")
                  : "Sin producto vinculado"}
              </p>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                {renderPaymentSummary(sale)}
              </p>
              {sale.costTotal == null || sale.profitTotal == null ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Costo desconocido; margen no calculado
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {sale.tvBoardId ? (
                  <Link
                    className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                    href="/placas-tv"
                  >
                    Ver placa
                  </Link>
                ) : canManageHistory && !isImmutableSale(sale) ? (
                  <>
                    <Button onClick={() => startEdit(sale)} type="button" variant="secondary">
                      Editar
                    </Button>
                    <ActionMenu label="Mas acciones">
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
                        <Button className="w-full" type="submit" variant="danger">
                          Eliminar
                        </Button>
                      </form>
                    </ActionMenu>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Historial protegido</p>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto xl:block">
          <table className="min-w-full text-sm">
            <thead className="bg-card text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Venta</th>
                <th className="px-4 py-3 font-medium">Productos</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Cobro</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr className="border-t border-border bg-card hover:bg-muted" key={sale.id}>
                  <td className="px-4 py-3 font-medium text-foreground">{sale.saleNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sale.items.length
                      ? sale.items
                          .map((item) => `${item.productName ?? "Producto"} x${item.quantity}`)
                          .join(", ")
                      : "Sin producto vinculado"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(sale.soldAt)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {formatCurrency(sale.subtotal)}
                    {sale.costTotal == null || sale.profitTotal == null ? (
                      <p className="mt-1 text-sm font-normal text-muted-foreground">
                        Costo desconocido; margen no calculado
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{renderPaymentSummary(sale)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {sale.tvBoardId ? (
                        <Link
                          className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-foreground underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
                          href="/placas-tv"
                        >
                          Ver placa
                        </Link>
                      ) : canManageHistory && !isImmutableSale(sale) ? (
                        <>
                          <Button
                            onClick={() => startEdit(sale)}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            Editar
                          </Button>
                          <ActionMenu label="Mas acciones">
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
                          </ActionMenu>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Historial protegido</p>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!sales.length ? (
          <div className="empty-panel border-t border-border">
            Cuando registres una venta, la vas a ver aca con sus productos y medios de cobro.
          </div>
        ) : null}
        <PaginationNav meta={pagination} pathname="/ventas" />
      </div>
    </div>
  );
}
