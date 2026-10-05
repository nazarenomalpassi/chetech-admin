"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { parseProductListState, updateProductListParams } from "../list-state";

export function ProductFilters({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const state = parseProductListState(Object.fromEntries(searchParams.entries()));
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const search = draft?.base === state.search ? draft.value : state.search;

  useEffect(() => { setDraft(null); }, [state.search]);

  function navigate(updates: Record<string, string>) {
    const params = updateProductListParams(new URLSearchParams(query), { search: search.trim(), ...updates });
    if (params.toString() === query) return;
    startTransition(() => router.replace(params.size ? `/productos?${params}` : "/productos", { scroll: false }));
  }

  useEffect(() => {
    if (search.trim() === state.search) return;
    const timeout = window.setTimeout(() => {
      const params = updateProductListParams(new URLSearchParams(query), { search: search.trim() });
      startTransition(() => router.replace(params.size ? `/productos?${params}` : "/productos", { scroll: false }));
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [search, state.search, query, router]);

  return (
    <div aria-busy={pending} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Buscar productos</span>
          <Input aria-label="Buscar productos" maxLength={120} onChange={event => setDraft({ base: state.search, value: event.target.value })} placeholder="Nombre o SKU" value={search} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Categoria</span>
          <Select aria-label="Filtrar productos por categoria" value={state.category || "all"} onChange={event => navigate({ category: event.target.value })} options={[{ label: "Todas las categorias", value: "all" }, ...categories.map(category => ({ label: category.name, value: category.id }))]} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Estado</span>
          <Select aria-label="Filtrar productos por estado" value={state.status} onChange={event => navigate({ status: event.target.value })} options={[{ label: "Todos los estados", value: "all" }, { label: "Solo activos", value: "active" }, { label: "Solo inactivos", value: "inactive" }]} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Ordenar por</span>
          <Select value={state.sort} onChange={event => navigate({ sort: event.target.value })} options={[{ label: "Nombre", value: "name" }, { label: "SKU", value: "sku" }, { label: "Stock", value: "stock" }, { label: "Precio", value: "price" }]} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Productos por pagina</span>
          <Select value={String(state.pageSize)} onChange={event => navigate({ pageSize: event.target.value })} options={[25, 50, 100].map(value => ({ label: String(value), value: String(value) }))} />
        </label>
        <div className="flex items-end gap-3">
          <Button variant="secondary" type="button" onClick={() => { setDraft(null); startTransition(() => router.replace("/productos", { scroll: false })); }}>Limpiar filtros</Button>
          <span role="status" className="text-sm text-slate-500">{pending ? "Actualizando..." : ""}</span>
        </div>
      </div>
    </div>
  );
}
