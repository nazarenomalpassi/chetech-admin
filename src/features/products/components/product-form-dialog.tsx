"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PackagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { upsertProductAction } from "@/features/products/actions";
import { productSchema, type ProductFormValues } from "@/features/products/schemas";

type ProductFormDialogProps = {
  categories: { id: string; name: string; skuPrefix?: string | null }[];
  product?: ProductFormValues | null;
  open: boolean;
  onClose: () => void;
};

const defaultValues: ProductFormValues = {
  sku: "",
  name: "",
  categoryId: null,
  cost: 0,
  salePrice: 0,
  stock: 0,
  minStock: 0,
  isActive: true,
  notes: ""
};

export function ProductFormDialog({ categories, product, open, onClose }: ProductFormDialogProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [skuPreview, setSkuPreview] = useState<string | null>(null);
  const [skuPreviewError, setSkuPreviewError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues
  });

  useEffect(() => {
    form.reset(product ?? defaultValues);
    setSkuPreview(product?.sku ?? null);
    setMessage(null);
  }, [form, product]);

  const selectedCategoryId = form.watch("categoryId");

  useEffect(() => {
    if (!open || product?.id) return;
    if (!selectedCategoryId) {
      setSkuPreview(null);
      setSkuPreviewError("Elegí una categoría para generar el SKU.");
      return;
    }

    let cancelled = false;
    setSkuPreviewError(null);

    fetch(`/api/products/next-sku?categoryId=${selectedCategoryId}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "No se pudo calcular el SKU");
        return payload.sku as string;
      })
      .then((sku) => {
        if (!cancelled) setSkuPreview(sku);
      })
      .catch((error) => {
        if (!cancelled) {
          setSkuPreview(null);
          setSkuPreviewError(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, product?.id, selectedCategoryId]);

  if (!open) {
    return null;
  }

  return (
    <DialogShell labelledBy="product-dialog-title" onClose={onClose} panelClassName="max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-graphite/8 bg-brand-100 text-graphite">
              <PackagePlus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="panel-kicker">Gestión de productos</p>
              <h2 className="mt-3 text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-950" id="product-dialog-title">
                {product?.id ? "Editar producto" : "Nuevo producto"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Mantené costo, precio, stock y SKU bajo una carga clara y lista para uso intensivo.
              </p>
            </div>
          </div>
          <button
            aria-label="Cerrar formulario de producto"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-slate-500 transition hover:bg-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="mt-6 space-y-5"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              const result = await upsertProductAction(values);
              setMessage(result.message);
              if (result.success) {
                onClose();
              }
            })
          )}
        >
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_0.8fr]">
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                SKU
              </label>
              <div className="mt-3 rounded-[18px] border border-graphite/8 bg-brand-50 px-4 py-3 text-sm font-semibold text-slate-800">
                {product?.id ? product.sku : skuPreview ?? "Seleccioná una categoría"}
              </div>
              <p className={`mt-2 text-xs ${skuPreviewError ? "text-finance-expense" : "text-slate-500"}`}>
                {product?.id
                  ? "El SKU ya creado se mantiene estable durante la edición."
                  : skuPreviewError ?? "La vista previa se confirma automáticamente al guardar."}
              </p>
            </div>

            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="product-status">
                Estado
              </label>
              <Select
                className="mt-3"
                id="product-status"
                options={[
                  { label: "Activo", value: "true" },
                  { label: "Inactivo", value: "false" }
                ]}
                value={String(form.watch("isActive"))}
                onChange={(event) => form.setValue("isActive", event.target.value === "true")}
              />
              <p className="mt-2 text-xs text-slate-500">Usalo para ocultar productos sin borrar historial.</p>
            </div>

            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500" htmlFor="categoryId">
                Categoría
              </label>
              <Select
                className="mt-3"
                {...form.register("categoryId")}
                options={[
                  { label: "Sin categoría", value: "" },
                  ...categories.map((category) => ({ label: category.name, value: category.id }))
                ]}
              />
              <p className="mt-2 text-xs text-slate-500">La categoría define el prefijo del SKU automático.</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="name">Nombre</label>
              <Input {...form.register("name")} placeholder="Ej: Teclado Genius KB 117" />
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.name?.message}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="cost">Costo</label>
              <Input step="0.01" type="number" {...form.register("cost", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="salePrice">Precio de venta</label>
              <Input step="0.01" type="number" {...form.register("salePrice", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="stock">Stock inicial</label>
              <Input type="number" {...form.register("stock", { valueAsNumber: true })} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="minStock">Stock mínimo</label>
              <Input type="number" {...form.register("minStock", { valueAsNumber: true })} />
            </div>
            <div className="md:col-span-2 xl:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="notes">Notas internas</label>
              <Textarea
                {...form.register("notes")}
                placeholder="Observaciones utiles para venta, compra o reposicion"
              />
            </div>
          </div>

          {message ? (
            <div aria-live="polite" className={message.toLowerCase().includes("error") ? "status-banner status-banner--error" : "status-banner status-banner--success"} role="status">
              {message}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-graphite/8 pt-5 sm:flex-row sm:justify-end">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "Guardando..." : product?.id ? "Actualizar producto" : "Crear producto"}
            </Button>
          </div>
        </form>
    </DialogShell>
  );
}
