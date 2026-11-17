"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";

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
  }, [form, product, open]);

  const selectedCategoryId = form.watch("categoryId");
  const hasChanges = form.formState.isDirty;

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

  function requestClose() {
    if (hasChanges && !window.confirm("Descartar los cambios del producto?")) return;
    onClose();
  }

  return (
    <DialogShell
      labelledBy="product-dialog-title"
      onClose={requestClose}
      panelClassName="max-w-4xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground" id="product-dialog-title">
            {product?.id ? "Editar producto" : "Nuevo producto"}
          </h2>
        </div>
        <button
          aria-label="Cerrar formulario de producto"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          onClick={requestClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <form
        className="mt-4 space-y-4"
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-muted-foreground">SKU</label>
            <div className="mt-2 flex min-h-11 items-center rounded-xl bg-muted px-3 py-2 text-sm font-medium wrap-break-word text-foreground">
              {product?.id ? product.sku : (skuPreview ?? "Seleccioná una categoría")}
            </div>
            <p
              className={`mt-2 text-sm ${skuPreviewError ? "text-danger" : "text-muted-foreground"}`}
            >
              {product?.id
                ? "El SKU no cambia al editar."
                : (skuPreviewError ?? "SKU definitivo al guardar.")}
            </p>
          </div>

          <div>
            <label
              className="block text-sm font-medium text-muted-foreground"
              htmlFor="product-status"
            >
              Estado
            </label>
            <Select
              className="mt-2"
              id="product-status"
              options={[
                { label: "Activo", value: "true" },
                { label: "Inactivo", value: "false" }
              ]}
              value={String(form.watch("isActive"))}
              onChange={(event) =>
                form.setValue("isActive", event.target.value === "true", { shouldDirty: true })
              }
            />
            <p className="mt-2 text-sm text-muted-foreground">Inactivo conserva el historial.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground" htmlFor="categoryId">
              Categoría
            </label>
            <Select
              className="mt-2"
              id="categoryId"
              aria-invalid={Boolean(form.formState.errors.categoryId)}
              {...form.register("categoryId")}
              options={[
                { label: "Sin categoría", value: "" },
                ...categories.map((category) => ({ label: category.name, value: category.id }))
              ]}
            />
            <p className="mt-1 text-sm text-danger">{form.formState.errors.categoryId?.message}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-body" htmlFor="name">
              Nombre
            </label>
            <Input
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register("name")}
              placeholder="Ej: Teclado Genius KB 117"
            />
            <p className="mt-1 text-sm text-danger">{form.formState.errors.name?.message}</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-body" htmlFor="cost">
              Costo
            </label>
            <Input step="0.01" type="number" {...form.register("cost", { valueAsNumber: true })} />
            <p className="mt-1 text-sm text-danger">{form.formState.errors.cost?.message}</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-body" htmlFor="salePrice">
              Precio de venta
            </label>
            <Input
              step="0.01"
              type="number"
              {...form.register("salePrice", { valueAsNumber: true })}
            />
            <p className="mt-1 text-sm text-danger">{form.formState.errors.salePrice?.message}</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-body" htmlFor="stock">
              {product?.id ? "Stock fisico" : "Stock inicial"}
            </label>
            <Input type="number" {...form.register("stock", { valueAsNumber: true })} />
            <p className="mt-1 text-sm text-danger">{form.formState.errors.stock?.message}</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-body" htmlFor="minStock">
              Stock mínimo
            </label>
            <Input type="number" {...form.register("minStock", { valueAsNumber: true })} />
            <p className="mt-1 text-sm text-danger">{form.formState.errors.minStock?.message}</p>
          </div>
          <div className="md:col-span-2 xl:col-span-2">
            <label className="mb-2 block text-sm font-medium text-body" htmlFor="notes">
              Notas internas
            </label>
            <Textarea
              {...form.register("notes")}
              placeholder="Observaciones utiles para venta, compra o reposicion"
            />
          </div>
        </div>

        {message ? (
          <div className="status-banner status-banner--error" role="alert">
            {message}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button onClick={requestClose} type="button" variant="secondary">
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
