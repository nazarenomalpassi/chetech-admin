"use client";

import { useState } from "react";
import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { PartManagementDialog } from "./order-coordination-panel";
import { getPartOutstandingQuantity, PART_STATUS_LABELS } from "../workflow";
import type { PartInboxItem } from "../coordination-queries";
import { formatDate, formatCurrency } from "@/lib/utils";
import { getOperationalDate } from "../warranty";

export function PartsInbox({ items }: { items: PartInboxItem[] }) {
  const [selected, setSelected] = useState<PartInboxItem | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const today = getOperationalDate();
  const visible = items.filter((p) => (status === "all" || p.status === status) && `${p.description} ${p.repairNumber} ${p.customerName} ${p.supplier ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <Card className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><PackageSearch className="h-5 w-5 text-slate-500" />Repuestos del taller</h2><p className="mt-2 text-sm text-slate-500">Solicitudes vinculadas a cada orden. Mostrador registra compras y recepciones.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">{items.length} por gestionar</span></div>
    <div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Buscar repuesto u orden" placeholder="Repuesto, REP, cliente o proveedor" value={search} onChange={(e) => setSearch(e.target.value)} /><Select aria-label="Filtrar pedidos del taller" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: "all", label: "Todos los pendientes" }, { value: "requested", label: "Sin comprar" }, { value: "ordered", label: "Comprados / en camino" }, { value: "received", label: "Recibidos" }]} /></div>
    <div className="grid gap-3 lg:grid-cols-2">{visible.map((p) => <article key={p.id} className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap justify-between gap-2"><Link href={`/reparaciones-access?order=${p.orderId}`} className="text-sm font-semibold underline underline-offset-4">{p.repairNumber}</Link><span className={`rounded-full px-2 py-1 text-xs ${p.expectedDate && p.expectedDate < today && getPartOutstandingQuantity(p) > 0 ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-700"}`}>{p.expectedDate && p.expectedDate < today && getPartOutstandingQuantity(p) > 0 ? "Llegada vencida" : PART_STATUS_LABELS[p.status]}</span></div>
      <h3 className="mt-3 font-semibold text-slate-900">{p.description}</h3><p className="mt-1 text-sm text-slate-500">{p.customerName}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Recibidos</dt><dd className="mt-1">{p.receivedQuantity} de {p.quantity}</dd></div><div><dt className="text-xs text-slate-500">Fecha esperada</dt><dd className="mt-1">{p.expectedDate ? formatDate(p.expectedDate) : "Sin fecha"}</dd></div><div><dt className="text-xs text-slate-500">Proveedor</dt><dd className="mt-1">{p.supplier || "Por definir"}</dd></div><div><dt className="text-xs text-slate-500">Costo por unidad</dt><dd className="mt-1">{p.unitCost === null ? "Sin informar" : formatCurrency(p.unitCost)}</dd></div></dl>
      <Button className="mt-4 min-h-11 w-full" variant="secondary" type="button" onClick={() => setSelected(p)}>Gestionar solicitud</Button>
    </article>)}</div>
    {!visible.length ? <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-slate-500">No hay solicitudes pendientes para este filtro.</p> : null}
    {selected ? <PartManagementDialog key={`${selected.id}:${selected.version}`} part={selected} canManage onClose={() => setSelected(null)} /> : null}
  </Card>;
}
