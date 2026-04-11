"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[28px] border border-white/60 bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Gestión de productos</p>
            <h3 className="text-2xl font-semibold text-slate-950">
              {product?.id ? "Editar producto" : "Nuevo producto"}
            </h3>
          </div>
          <button className="rounded-full p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="mt-6 grid gap-4 md:grid-cols-2"
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
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">SKU</label>
            <div className="flex h-11 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
              {product?.id ? product.sku : skuPreview ?? "Seleccioná una categoría"}
            </div>
            <p className={`mt-1 text-xs ${skuPreviewError ? "text-rose-600" : "text-slate-500"}`}>
              {product?.id
                ? "El SKU existente no cambia automáticamente al editar."
                : skuPreviewError ?? "Se generará definitivamente al guardar."}
            </p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Nombre</label>
            <Input {...form.register("name")} />
            <p className="mt-1 text-xs text-rose-600">{form.formState.errors.name?.message}</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Categoría</label>
            <Select
              {...form.register("categoryId")}
              options={[
                { label: "Sin categoría", value: "" },
                ...categories.map((category) => ({ label: category.name, value: category.id }))
              ]}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Activo</label>
            <Select
              options={[
                { label: "Activo", value: "true" },
                { label: "Inactivo", value: "false" }
              ]}
              value={String(form.watch("isActive"))}
              onChange={(event) => form.setValue("isActive", event.target.value === "true")}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Costo</label>
            <Input step="0.01" type="number" {...form.register("cost", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Precio de venta</label>
            <Input step="0.01" type="number" {...form.register("salePrice", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Stock inicial</label>
            <Input type="number" {...form.register("stock", { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Stock mínimo</label>
            <Input type="number" {...form.register("minStock", { valueAsNumber: true })} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-slate-700">Notas</label>
            <Textarea {...form.register("notes")} />
          </div>
          {message ? <p className="md:col-span-2 text-sm text-slate-500">{message}</p> : null}
          <div className="flex justify-end gap-3 md:col-span-2">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "Guardando..." : product?.id ? "Actualizar producto" : "Crear producto"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
