"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WarrantyReturnsPage } from "../warranty-queries";
import { WarrantyReturnCase } from "./warranty-return-panel";

export function WarrantyReturnsSection({ data, search, closed, canManage }: {
  data: WarrantyReturnsPage | null; search: string; closed: boolean; canManage: boolean;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [query, setQuery] = useState(search);
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setQuery(search); }, [search]);
  useEffect(() => {
    function restore() {
      typing.current = true;
      setQuery(new URLSearchParams(window.location.search).get("wq") ?? "");
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  function navigate(next: { closed?: boolean; page?: number; search?: string }) {
    const params = new URLSearchParams(window.location.search);
    params.set("view", "garantias");
    params.delete("order"); params.delete("status"); params.delete("error");
    const nextQuery = (next.search ?? search).trim();
    if (nextQuery) params.set("wq", nextQuery); else params.delete("wq");
    if (next.closed ?? closed) params.set("wh", "1"); else params.delete("wh");
    if (next.page && next.page > 1) params.set("wp", String(next.page)); else params.delete("wp");
    router.push(`/reparaciones-access?${params}` as Route, { scroll: false });
  }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const pageOutOfRange = Boolean(data && data.page > pages);

  return <section aria-labelledby={`${fieldId}-heading`} className="min-w-0 space-y-4">
    <div>
      <h2 id={`${fieldId}-heading`} className="text-xl font-semibold text-slate-950">Reingresos por garantia</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">Otra visita, el mismo REP. Seguimiento separado, sin modificar la orden ni sus cobros originales.</p>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Filtrar reingresos">
      <Button aria-pressed={!closed} variant={closed ? "secondary" : "default"} type="button" onClick={() => navigate({ closed: false })}>Activos ({data?.activeCount ?? 0})</Button>
      <Button aria-pressed={closed} variant={closed ? "default" : "secondary"} type="button" onClick={() => navigate({ closed: true })}>Historial de retirados</Button>
    </div>
    <form role="search" aria-label="Buscar reingresos por garantia" className="flex flex-col items-end gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); navigate({ search: query }); }}>
      <div className="w-full"><label htmlFor={`${fieldId}-search`} className="mb-2 block text-sm font-medium text-slate-700">Buscar reingresos</label><Input id={`${fieldId}-search`} name="wq" value={query} maxLength={200} placeholder="REP, cliente, equipo o falla" onChange={(event) => { typing.current = true; setQuery(event.target.value); }} /></div>
      <Button className="min-h-11 w-full sm:w-auto" type="submit">Buscar</Button>
    </form>
    {!data ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Cargando reingresos...</p> : <>
      <p className="text-sm text-slate-500" aria-live="polite">{data.total} {data.total === 1 ? "reingreso" : "reingresos"}{search ? ` para "${search}"` : ""}</p>
      {!data.items.length ? <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p>{pageOutOfRange ? "No hay reingresos en esta pagina." : search ? "No hay reingresos para esta busqueda." : closed ? "No hay reingresos retirados." : "No hay reingresos activos."}</p>
        {pageOutOfRange ? <Button type="button" variant="secondary" onClick={() => navigate({ page: 1 })}>Ir a la primera pagina</Button> : null}
      </div> : <div className="grid items-start gap-4 lg:grid-cols-2">
        {data.items.map((record) => <article key={record.id} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <header className="min-w-0 border-b border-slate-200 pb-3">
            <h3 className="break-words text-lg font-semibold text-slate-950">{record.repairNumber}</h3>
            <p className="mt-1 break-words text-sm text-slate-600">{record.customerName} - {record.deviceLabel}</p>
            <Link className="mt-1 inline-flex min-h-11 items-center rounded-lg text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40" href={`/reparaciones-access?view=${canManage ? "detalle" : "ordenes"}&order=${encodeURIComponent(record.orderId)}` as Route}>Ver orden original</Link>
          </header>
          <WarrantyReturnCase record={record} canManage={canManage} />
        </article>)}
      </div>}
      {pages > 1 && !pageOutOfRange ? <nav aria-label="Paginas de reingresos" className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" disabled={data.page <= 1} onClick={() => navigate({ page: data.page - 1 })}>Anterior</Button>
        <p className="text-sm text-slate-600">Pagina {data.page} de {pages}</p>
        <Button type="button" variant="secondary" disabled={data.page >= pages} onClick={() => navigate({ page: data.page + 1 })}>Siguiente</Button>
      </nav> : null}
    </>}
  </section>;
}
