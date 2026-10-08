"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { parseProductListState, updateProductListParams } from "../list-state";

function rememberQuery(requested: Set<string>, latest: { current: string }, nextQuery: string, visibleQuery: string) {
  latest.current = nextQuery;
  if (nextQuery === visibleQuery) requested.clear();
  else requested.add(nextQuery);
  if (requested.size > 32) requested.delete(requested.values().next().value!);
}

export function ProductFilters({ categories }: { categories: { id: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const state = parseProductListState(Object.fromEntries(searchParams.entries()));
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const requestedQueries = useRef(new Set<string>());
  const latestQuery = useRef(query);
  const observedQuery = useRef(query);
  const searchTimer = useRef<number | null>(null);
  const search = draft && (draft.base === state.search || requestedQueries.current.has(query)) ? draft.value : state.search;

  function cancelPendingSearch() {
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = null;
  }

  useEffect(() => {
    const changed = observedQuery.current !== query;
    observedQuery.current = query;
    const ownResponse = requestedQueries.current.has(query);
    requestedQueries.current.delete(query);
    if (ownResponse && query === latestQuery.current) requestedQueries.current.clear();
    if (changed && !ownResponse) {
      cancelPendingSearch();
      requestedQueries.current.clear();
      latestQuery.current = query;
    }
    setDraft((current) => {
      if (!current || current.value === state.search) return null;
      return ownResponse ? { ...current, base: state.search } : changed ? null : current;
    });
  }, [query, state.search]);

  useEffect(() => {
    const resetForHistory = () => {
      cancelPendingSearch();
      requestedQueries.current.clear();
      latestQuery.current = new URLSearchParams(window.location.search).toString();
      setDraft(null);
    };
    window.addEventListener("popstate", resetForHistory);
    return () => window.removeEventListener("popstate", resetForHistory);
  }, []);

  function navigate(updates: Record<string, string>) {
    cancelPendingSearch();
    const params = updateProductListParams(new URLSearchParams(latestQuery.current), { search: search.trim(), ...updates });
    if (params.toString() === latestQuery.current && (params.toString() === query || requestedQueries.current.has(params.toString()))) return;
    rememberQuery(requestedQueries.current, latestQuery, params.toString(), query);
    startTransition(() => router.replace(params.size ? `/productos?${params}` : "/productos", { scroll: false }));
  }

  useEffect(() => {
    const submittedSearch = new URLSearchParams(latestQuery.current).get("search") ?? "";
    if (search.trim() === state.search || search.trim() === submittedSearch) return;
    const timeout = window.setTimeout(() => {
      searchTimer.current = null;
      const params = updateProductListParams(new URLSearchParams(latestQuery.current), { search: search.trim() });
      rememberQuery(requestedQueries.current, latestQuery, params.toString(), query);
      startTransition(() => router.replace(params.size ? `/productos?${params}` : "/productos", { scroll: false }));
    }, 400);
    searchTimer.current = timeout;
    return () => window.clearTimeout(timeout);
  }, [search, state.search, query, router]);

  return (
    <div aria-busy={pending} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
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
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <details className="min-w-0 flex-1">
          <summary className="flex min-h-11 w-fit cursor-pointer flex-wrap items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><span>Mas opciones</span>{state.sort !== "name" || state.pageSize !== 25 ? <span className="text-xs text-slate-600">Orden: {{ name: "Nombre", sku: "SKU", stock: "Stock", price: "Precio" }[state.sort]} · {state.pageSize} por página</span> : null}</summary>
          <div className="mt-2 grid max-w-xl gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Ordenar por</span>
          <Select value={state.sort} onChange={event => navigate({ sort: event.target.value })} options={[{ label: "Nombre", value: "name" }, { label: "SKU", value: "sku" }, { label: "Stock", value: "stock" }, { label: "Precio", value: "price" }]} />
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>Productos por pagina</span>
          <Select value={String(state.pageSize)} onChange={event => navigate({ pageSize: event.target.value })} options={[25, 50, 100].map(value => ({ label: String(value), value: String(value) }))} />
        </label>
          </div>
        </details>
        <div className="flex items-center gap-3">
          <Button variant="ghost" type="button" onClick={() => { cancelPendingSearch(); requestedQueries.current.clear(); rememberQuery(requestedQueries.current, latestQuery, "", query); setDraft({ base: state.search, value: "" }); startTransition(() => router.replace("/productos", { scroll: false })); }}>Limpiar filtros</Button>
          <span role="status" className="text-sm text-slate-500">{pending ? "Actualizando..." : ""}</span>
        </div>
      </div>
    </div>
  );
}
