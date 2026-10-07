"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { WorkshopPageInfo } from "../page-queries";
import { getWorkshopLinkIntent } from "./workshop-navigation-intent";

export function WorkshopServerNavigation({ pageInfo, search, status, warranty, isComposing = false }: { pageInfo: WorkshopPageInfo; search: string; status: string; warranty: string; isComposing?: boolean }) {
  const router = useRouter();
  const pendingFilterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestedFiltersRef = useRef<string | null>(null);
  const filterKey = JSON.stringify([search, status, warranty]);
  useEffect(() => {
    function cancelRewrite(params: URLSearchParams) {
      if (pendingFilterRef.current) clearTimeout(pendingFilterRef.current);
      pendingFilterRef.current = null;
      lastRequestedFiltersRef.current = JSON.stringify([params.get("q") ?? "", params.get("state") ?? "todos", params.get("warranty") ?? "todos"]);
    }
    function cancelRewriteOnHistoryNavigation() {
      cancelRewrite(new URLSearchParams(window.location.search));
    }
    function cancelRewriteOnLink(event: MouseEvent) {
      const url = getWorkshopLinkIntent(event);
      if (url) cancelRewrite(url.searchParams);
    }
    window.addEventListener("popstate", cancelRewriteOnHistoryNavigation);
    document.addEventListener("click", cancelRewriteOnLink);
    return () => {
      window.removeEventListener("popstate", cancelRewriteOnHistoryNavigation);
      document.removeEventListener("click", cancelRewriteOnLink);
    };
  }, []);
  useEffect(() => {
    if (isComposing || lastRequestedFiltersRef.current === filterKey) return;
    if (search === pageInfo.search && status === pageInfo.status && warranty === pageInfo.warranty) return;
    pendingFilterRef.current = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("view", "ordenes");
      params.delete("cursor");
      params.delete("order");
      params.delete("status");
      params.delete("error");
      if (search) params.set("q", search); else params.delete("q");
      if (status !== "todos") params.set("state", status); else params.delete("state");
      if (warranty !== "todos") params.set("warranty", warranty); else params.delete("warranty");
      pendingFilterRef.current = null;
      lastRequestedFiltersRef.current = filterKey;
      router.replace(`/reparaciones-access?${params}` as Route, { scroll: false });
    }, 350);
    return () => { if (pendingFilterRef.current) clearTimeout(pendingFilterRef.current); };
  }, [search, status, warranty, pageInfo.search, pageInfo.status, pageInfo.warranty, router, filterKey, isComposing]);
  function navigationParams() {
    // Explicit navigation must include pending filters and cancel their debounced rewrite.
    if (pendingFilterRef.current) clearTimeout(pendingFilterRef.current);
    pendingFilterRef.current = null;
    lastRequestedFiltersRef.current = filterKey;
    const params = new URLSearchParams(window.location.search);
    params.set("view", "ordenes");
    params.delete("order");
    params.delete("status");
    params.delete("error");
    if (search) params.set("q", search); else params.delete("q");
    if (status !== "todos") params.set("state", status); else params.delete("state");
    if (warranty !== "todos") params.set("warranty", warranty); else params.delete("warranty");
    return params;
  }
  function setScope(scope: string) {
    const p = navigationParams(); p.delete("cursor"); if (scope !== "all") p.set("scope", scope); else p.delete("scope"); router.push(`/reparaciones-access?${p}` as Route, { scroll: false });
  }
  function next() {
    const p = navigationParams();
    if (search !== pageInfo.search || status !== pageInfo.status || warranty !== pageInfo.warranty) p.delete("cursor");
    else if (pageInfo.nextCursor) p.set("cursor", pageInfo.nextCursor);
    router.push(`/reparaciones-access?${p}` as Route, { scroll: false });
  }
  function first() { const p = navigationParams(); p.delete("cursor"); router.push(`/reparaciones-access?${p}` as Route, { scroll: false }); }
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
      {pageInfo.cursor ? <Button variant="secondary" type="button" onClick={first}>Primera pagina</Button> : null}
      <Button variant="secondary" type="button" disabled={!pageInfo.nextCursor} onClick={next}>Siguiente</Button>
    </div>
  </div>;
}
