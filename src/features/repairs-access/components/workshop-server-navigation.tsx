"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { WorkshopPageInfo } from "../page-queries";

export function WorkshopServerNavigation({ pageInfo, search, status, warranty }: { pageInfo: WorkshopPageInfo; search: string; status: string; warranty: string }) {
  const router = useRouter();
  useEffect(() => {
    if (search === pageInfo.search && status === pageInfo.status && warranty === pageInfo.warranty) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "ordenes");
      params.delete("cursor");
      params.delete("order");
      if (search) params.set("q", search); else params.delete("q");
      if (status !== "todos") params.set("state", status); else params.delete("state");
      if (warranty !== "todos") params.set("warranty", warranty); else params.delete("warranty");
      router.replace(`/reparaciones-access?${params}` as Route, { scroll: false });
    }, 350);
    return () => clearTimeout(timer);
  }, [search, status, warranty, pageInfo, router]);
  function setScope(scope: string) {
    const p = new URLSearchParams(window.location.search); p.set("view", "ordenes"); p.delete("cursor"); p.delete("order"); if (scope !== "all") p.set("scope", scope); else p.delete("scope"); router.push(`/reparaciones-access?${p}` as Route, { scroll: false });
  }
  function next() { const p = new URLSearchParams(window.location.search); p.set("view", "ordenes"); if (pageInfo.nextCursor) p.set("cursor", pageInfo.nextCursor); p.delete("order"); router.push(`/reparaciones-access?${p}` as Route, { scroll: false }); }
  function first() { const p = new URLSearchParams(window.location.search); p.set("view", "ordenes"); p.delete("cursor"); p.delete("order"); router.push(`/reparaciones-access?${p}` as Route, { scroll: false }); }
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
    <div className="min-w-48"><Select aria-label="Vista de trabajo" value={pageInfo.scope} onChange={(e) => setScope(e.target.value)} options={[
      { value: "all", label: "Todas las ordenes" }, { value: "mine", label: "Mis ordenes" },
      { value: "unassigned", label: "Sin responsable" }, { value: "approved", label: "Autorizadas" },
      { value: "parts", label: "Faltan repuestos" }, { value: "waiting_customer", label: "Esperando cliente" },
      { value: "ready", label: "Listas para retirar" }, { value: "return", label: "Pendientes de devolver" },
      { value: "overdue", label: "Revision vencida" }
    ]} /></div>
    <p className="text-xs text-slate-500">{pageInfo.total} ordenes coincidentes · hasta {pageInfo.pageSize} por pagina</p>
    <div className="flex gap-2">
      {pageInfo.cursor ? <Button size="sm" variant="secondary" type="button" onClick={first}>Primera pagina</Button> : null}
      <Button size="sm" variant="secondary" type="button" disabled={!pageInfo.nextCursor} onClick={next}>Siguiente</Button>
    </div>
  </div>;
}
