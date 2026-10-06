"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { getExpenseLinkOptionsAction } from "../actions";
import type { ExpenseLinkOption, ExpenseLinkOptions } from "../linkage-types";

export function ExpenseLinkSelector({ prefix, initial }: {
  prefix: string; initial?: { orderId: string | null; partRequestId: string | null; label: string };
}) {
  const [kind, setKind] = useState<"none" | "part" | "repair">(initial?.partRequestId ? "part" : initial?.orderId ? "repair" : "none");
  const [selected, setSelected] = useState<ExpenseLinkOption | null>(initial?.orderId ? {
    id: initial.partRequestId ?? initial.orderId, orderId: initial.orderId, repairNumber: initial.label, description: "Vinculo actual"
  } : null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<ExpenseLinkOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (kind === "none") return;
    let active = true;
    setLoading(true);
    setError(null);
    getExpenseLinkOptionsAction(kind, query, page).then((result) => {
      if (!active) return;
      setData(result.data);
      setError(result.error);
    }).catch(() => { if (active) setError("No se pudieron cargar las compras. Vuelve a buscar."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, query, page, reload]);

  function changeKind(value: "none" | "part" | "repair") {
    setKind(value);
    setPage(1);
    setData(null);
    setSelected(value === "repair" && selected ? { ...selected, id: selected.orderId } : null);
  }

  return <fieldset className="min-w-0 space-y-3 rounded-[22px] border border-graphite/10 bg-brand-50/70 p-4">
    <legend className="px-1 text-sm font-semibold text-slate-800">Compra o gasto directo de REP</legend>
    <input name="linkKind" type="hidden" value={kind} />
    <input name="partRequestId" type="hidden" value={kind === "part" ? selected?.id ?? "" : ""} />
    <input name="repairOrderId" type="hidden" value={kind === "none" ? "" : selected?.orderId ?? ""} />
    <label className="block text-sm font-semibold text-slate-700" htmlFor={`${prefix}-kind`}>Destino del gasto</label>
    <Select id={`${prefix}-kind`} value={kind} onChange={(event) => changeKind(event.target.value as typeof kind)} options={[
      { value: "none", label: "Sin vinculo" }, { value: "part", label: "Pago de compra de repuesto" }, { value: "repair", label: "Otro gasto directo de REP" }
    ]} />
    <p className="text-sm leading-6 text-slate-600">Vincular no registra otro pago. Solo un pago de repuesto reduce su compromiso; un gasto directo de REP no paga sus partes.</p>
    {kind !== "none" ? <>
      <label className="block text-sm font-semibold text-slate-700" htmlFor={`${prefix}-search`}>{kind === "part" ? "Buscar REP, repuesto o proveedor" : "Buscar numero REP"}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={`${prefix}-search`} maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); setQuery(search.trim()); setPage(1); setReload((value) => value + 1); }
        }} />
        <Button type="button" variant="secondary" disabled={loading} onClick={() => { setQuery(search.trim()); setPage(1); setReload((value) => value + 1); }}>Buscar</Button>
      </div>
      {selected ? <p className="break-words text-sm font-semibold text-slate-800">Seleccionado: {selected.repairNumber} / {selected.description}</p> : <p className="text-sm text-slate-600">Selecciona un destino antes de guardar.</p>}
      <div aria-live="polite" aria-busy={loading}>
        {loading ? <p className="text-sm text-slate-600">Cargando destinos...</p> : null}
        {error ? <p className="status-banner status-banner--error" role="alert">{error}</p> : null}
        {!loading && !error && data ? <>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {data.items.map((item) => <label className="flex min-h-11 cursor-pointer gap-3 rounded-[16px] border border-graphite/10 bg-white p-3 text-sm" key={item.id}>
              <input type="radio" name={`${prefix}-selection`} checked={selected?.id === item.id} onChange={() => setSelected(item)} value={item.id} className="mt-1 shrink-0" />
              <span className="min-w-0 break-words"><span className="font-semibold text-slate-950">{item.repairNumber} / {item.description}</span>
                {kind === "part" ? <span className="mt-1 block text-slate-600">{item.supplier ?? "Sin proveedor"} · {item.expectedCost == null ? "Costo desconocido; pendiente desconocido" : `Costo ${formatCurrency(item.expectedCost)} · Pendiente ${formatCurrency(item.outstanding ?? 0)}`} · Pagado {formatCurrency(item.paidAmount ?? 0)}</span> : null}
              </span>
            </label>)}
            {!data.items.length ? <p className="text-sm text-slate-600">No hay destinos para esta busqueda.</p> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="secondary" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Anterior</Button>
            <span className="text-sm text-slate-600">Pagina {data.page} de {data.totalPages} · {data.total} destinos</span>
            <Button type="button" variant="secondary" disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)}>Siguiente</Button>
          </div>
        </> : null}
      </div>
    </> : null}
  </fieldset>;
}
