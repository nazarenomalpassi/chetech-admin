"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlus, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCategoryAction } from "@/features/products/actions";
import { categorySchema, type CategoryFormValues } from "@/features/products/schemas";

const defaultValues: CategoryFormValues = {
  name: "",
  skuPrefix: ""
};

export function CategoryFormDialog({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues
  });

  useEffect(() => {
    if (!open) return;
    form.reset(defaultValues);
    setMessage(null);
  }, [form, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(15,15,15,0.42)] px-3 py-[calc(0.75rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md sm:items-center sm:p-4">
      <div className="w-full max-w-2xl rounded-[26px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,247,243,0.96))] p-4 shadow-[0_30px_90px_rgba(20,20,19,0.18)] sm:rounded-[32px] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] border border-graphite/8 bg-brand-100 text-graphite">
              <FolderPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="panel-kicker">Categorias visibles</p>
                <span className="inline-flex items-center gap-1 rounded-full border border-graphite/8 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  <Sparkles className="h-3.5 w-3.5" />
                  Alta rapida
                </span>
              </div>
              <h3 className="mt-3 text-[1.75rem] font-semibold tracking-[-0.05em] text-slate-950">
                Nueva categoria
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Cargala con nombre y prefijo SKU para que quede lista para filtrar y crear productos nuevos.
              </p>
            </div>
          </div>
          <button
            className="rounded-full p-2 text-slate-500 transition hover:bg-white"
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
              const result = await createCategoryAction(values);
              setMessage(result.message);

              if (result.success) {
                router.refresh();
                onClose();
              }
            })
          )}
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Nombre</label>
              <Input {...form.register("name")} placeholder="Ej: Consolas" />
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.name?.message}</p>
            </div>
            <div className="rounded-[24px] border border-graphite/8 bg-white/88 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Prefijo SKU</label>
              <Input
                {...form.register("skuPrefix")}
                onChange={(event) =>
                  form.setValue("skuPrefix", event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))
                }
                placeholder="CON"
                value={form.watch("skuPrefix")}
              />
              <p className="mt-2 text-xs text-slate-500">Usa entre 2 y 5 letras mayusculas.</p>
              <p className="mt-1 text-xs text-finance-expense">{form.formState.errors.skuPrefix?.message}</p>
            </div>
          </div>

          {message ? (
            <div
              className={
                message.toLowerCase().includes("no") || message.toLowerCase().includes("error")
                  ? "status-banner status-banner--error"
                  : "status-banner status-banner--success"
              }
            >
              {message}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-graphite/8 pt-5 sm:flex-row sm:justify-end">
            <Button onClick={onClose} type="button" variant="secondary">
              Cancelar
            </Button>
            <Button disabled={isPending} type="submit">
              {isPending ? "Creando..." : "Crear categoria"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
