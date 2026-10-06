import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { WorkshopInbox as InboxData } from "../coordination-queries";

export function WorkshopInbox({ inbox }: { inbox: InboxData | null }) {
  if (!inbox) return null;
  const cards = [
    { label: "Sin responsable", value: inbox.counts.unassigned, scope: "unassigned", tone: "bg-slate-50 text-slate-800" },
    { label: "Esperando cliente", value: inbox.counts.waitingCustomer, scope: "waiting_customer", tone: "bg-sky-50 text-sky-800" },
    { label: "Repuestos pendientes", value: inbox.counts.blockedParts, scope: "parts", tone: "bg-amber-50 text-amber-800" },
    { label: "Listos para retirar", value: inbox.counts.ready, scope: "ready", tone: "bg-emerald-50 text-emerald-800" },
    { label: "Pendientes de devolver", value: inbox.counts.awaitingReturn, scope: "return", tone: "bg-slate-50 text-slate-800" }
  ];
  return <Card className="space-y-4"><div><h2 className="text-lg font-semibold">Pendientes del taller</h2><p className="mt-1 text-sm text-slate-500">Cada indicador abre las ordenes que necesitan una accion.</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{cards.map((c) => <Link key={c.scope} href={`/reparaciones-access?view=ordenes&scope=${c.scope}`} className={`min-h-24 rounded-2xl border border-transparent p-4 transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 ${c.tone}`}><p className="text-xs font-medium">{c.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</p></Link>)}</div></Card>;
}
