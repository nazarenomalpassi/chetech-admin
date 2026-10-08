"use client";

import { useEffect, useId, useRef, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activityPageSchema, type ActivityCursor, type ActivityPage } from "../activity";

export function RepairOrderActivity({ orderId }: { orderId: string }) {
  const regionId = useId();
  const request = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<ActivityPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setOpen(false);
    setPage(null);
    setLoading(false);
    setFailed(false);
    return () => { request.current?.abort(); request.current = null; };
  }, [orderId]);

  async function load(cursor: ActivityCursor | null) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ orderId, limit: cursor ? "30" : "20" });
    if (cursor) { params.set("cursorDate", cursor.date); params.set("cursorId", cursor.id); }
    try {
      const response = await fetch(`/api/repair-access/activity?${params}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Activity unavailable");
      const next = activityPageSchema.parse(await response.json());
      if (controller.signal.aborted || request.current !== controller) return;
      if (cursor && next.events.some((event) => page?.events.some((loaded) => loaded.id === event.id))) throw new Error("Activity page overlaps");
      setPage((current) => ({ events: cursor ? [...(current?.events ?? []), ...next.events] : next.events, nextCursor: next.nextCursor }));
    } catch {
      if (!controller.signal.aborted && request.current === controller) setFailed(true);
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }

  function toggle() {
    if (open) {
      request.current?.abort();
      request.current = null;
      setLoading(false);
    } else if (!page) void load(null);
    setOpen(!open);
  }

  return <div className="mt-4 border-t border-slate-100 pt-3">
    <button type="button" aria-expanded={open} aria-controls={regionId} onClick={toggle} className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left text-sm font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40">
      <History aria-hidden="true" className="h-4 w-4" />Historial de trabajo
    </button>
    {open ? <div id={regionId} aria-busy={loading}>
      <p className="mt-2 text-xs text-slate-500">{page && page.events.length > 20 ? `${page.events.length} movimientos cargados, del mas reciente al mas antiguo.` : "Ultimos 20 movimientos, del mas reciente al mas antiguo."}</p>
      {page?.events.length ? <ol className="mt-3 space-y-3 border-l border-slate-200 pl-3">{page.events.map((event) => <li key={event.id} className="text-sm">
        <p className="whitespace-pre-wrap break-words text-slate-700">{event.message}</p>
        <p className="mt-1 text-xs text-slate-500">{event.actorName} · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}</time></p>
      </li>)}</ol> : page && !loading ? <p className="mt-3 text-xs text-slate-500">No hay movimientos registrados.</p> : null}
      {loading ? <p role="status" className="mt-3 text-xs text-slate-500">Cargando historial...</p> : null}
      {failed ? <div className="mt-3 rounded-xl bg-rose-50 p-3">
        <p role="alert" className="text-xs text-rose-800">No se pudo cargar el historial. Intenta de nuevo.</p>
        <Button type="button" size="sm" variant="secondary" className="mt-2 min-h-11" onClick={() => void load(page?.nextCursor ?? null)}>Reintentar</Button>
      </div> : page?.nextCursor ? <Button type="button" size="sm" variant="secondary" disabled={loading} className="mt-3 min-h-11" onClick={() => void load(page.nextCursor)}>Cargar anteriores</Button> : null}
      {page && page.events.length > 0 && !page.nextCursor ? <p className="mt-3 text-xs text-slate-500">Inicio del historial alcanzado.</p> : null}
    </div> : null}
  </div>;
}
