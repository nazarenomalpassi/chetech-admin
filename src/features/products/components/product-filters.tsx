"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Battery,
  BatteryCharging,
  Box,
  Cable,
  Headphones,
  Keyboard,
  Layers3,
  Lightbulb,
  Package,
  PackagePlus,
  Plug,
  Search,
  Speaker,
  Tv,
  Usb,
  Wrench
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CategoryFormDialog } from "@/features/products/components/category-form-dialog";
import { buildProductCategoryChips, type ProductCategoryIconKey } from "@/features/products/category-bar";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<ProductCategoryIconKey, typeof Package> = {
  all: Layers3,
  adaptadores: Plug,
  auriculares: Headphones,
  cables: Cable,
  cargadores: BatteryCharging,
  iluminacion: Lightbulb,
  parlantes: Speaker,
  pendrives: Usb,
  pilas_baterias: Battery,
  reparacion: Wrench,
  teclados_mouse: Keyboard,
  televisores: Tv,
  vapers: Package,
  varios: Box,
  generic: Box
};

export function ProductFilters({
  categories,
  canManage
}: {
  categories: { id: string; name: string; productCount?: number | null }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  const categoryChips = useMemo(() => buildProductCategoryChips(categories), [categories]);
  const selectedCategory = searchParams.get("category") ?? "all";

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const previousQuery = params.toString();

      if (!value || value === "all") {
        params.delete(key);
      } else {
        params.set(key, value);
      }

      const query = params.toString();
      if (query === previousQuery) return;

      router.replace(query ? `/productos?${query}` : "/productos");
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      updateParam("search", search.trim());
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [search, updateParam]);

  return (
    <>
      <div className="space-y-4">
        <div className="table-toolbar">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, SKU o palabra clave"
              value={search}
            />
          </div>

          <div className="relative hidden">
            <Layers3 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Select
              aria-label="Categoria"
              className="pl-10"
              defaultValue={selectedCategory}
              onChange={(event) => updateParam("category", event.target.value)}
              options={[
                { label: "Todas las categorias", value: "all" },
                ...categories.map((category) => ({ label: category.name, value: category.id }))
              ]}
            />
          </div>

          <Select
            defaultValue={searchParams.get("status") ?? "all"}
            onChange={(event) => updateParam("status", event.target.value)}
            options={[
              { label: "Todos los estados", value: "all" },
              { label: "Solo activos", value: "active" },
              { label: "Solo inactivos", value: "inactive" }
            ]}
          />
        </div>

        <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-2.5">
            {categoryChips.map((chip) => {
              const Icon = CATEGORY_ICONS[chip.icon];
              const isActive = selectedCategory === chip.id || (chip.id === "all" && selectedCategory === "all");

              return (
                <button
                  className={cn(
                    "group inline-flex min-h-[48px] items-center gap-3 rounded-full border px-4 py-3 text-left text-sm transition duration-200",
                    isActive
                      ? "border-graphite bg-graphite text-white shadow-[0_14px_28px_rgba(20,20,19,0.14)]"
                      : "border-graphite/10 bg-white/88 text-slate-700 hover:border-graphite/18 hover:bg-brand-50 hover:text-graphite"
                  )}
                  key={chip.id}
                  onClick={() => updateParam("category", chip.id)}
                  type="button"
                >
                  <span
                    className={cn(
                      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
                      isActive
                        ? "border-white/10 bg-white/12 text-white"
                        : "border-graphite/10 bg-brand-50 text-slate-500 group-hover:text-graphite"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="whitespace-nowrap font-medium">{chip.label}</span>
                  {typeof chip.count === "number" ? (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]",
                        isActive ? "bg-white/12 text-white" : "bg-brand-50 text-slate-500"
                      )}
                    >
                      {chip.count}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {canManage ? (
              <button
                className="inline-flex min-h-[48px] items-center gap-3 rounded-full border border-dashed border-graphite/18 bg-white/72 px-4 py-3 text-sm font-medium text-slate-600 transition duration-200 hover:border-graphite/30 hover:bg-white hover:text-graphite"
                onClick={() => setCategoryDialogOpen(true)}
                type="button"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-graphite/10 bg-brand-50 text-slate-600">
                  <PackagePlus className="h-4 w-4" />
                </span>
                <span className="whitespace-nowrap">Nueva categoria</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className="sr-only">
          <label htmlFor="category-fallback">Categoria</label>
          <Select
            id="category-fallback"
            defaultValue={selectedCategory}
            onChange={(event) => updateParam("category", event.target.value)}
            options={[
              { label: "Todas las categorias", value: "all" },
              ...categories.map((category) => ({ label: category.name, value: category.id }))
            ]}
          />
        </div>
      </div>
      {canManage ? (
        <CategoryFormDialog onClose={() => setCategoryDialogOpen(false)} open={categoryDialogOpen} />
      ) : null}
    </>
  );
}
