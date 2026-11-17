import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { WorkshopInbox as InboxData } from "../coordination-queries";

export function WorkshopInbox({ inbox }: { inbox: InboxData | null }) {
  if (!inbox) return null;
  const cards = [
    {
      label: "Sin responsable",
      value: inbox.counts.unassigned,
      scope: "unassigned",
      tone: "bg-muted text-foreground"
    },
    {
      label: "Esperando cliente",
      value: inbox.counts.waitingCustomer,
      scope: "waiting_customer",
      tone: "bg-info-soft text-info"
    },
    {
      label: "Repuestos pendientes",
      value: inbox.counts.blockedParts,
      scope: "parts",
      tone: "bg-warning-soft text-warning"
    },
    {
      label: "Listos para retirar",
      value: inbox.counts.ready,
      scope: "ready",
      tone: "bg-success-soft text-success"
    },
    {
      label: "Pendientes de devolver",
      value: inbox.counts.awaitingReturn,
      scope: "return",
      tone: "bg-muted text-foreground"
    }
  ];
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Pendientes del taller</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <Link
            key={c.scope}
            href={`/reparaciones-access?view=ordenes&scope=${c.scope}`}
            className="min-h-20 rounded-lg border border-border p-3 text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <p className="text-sm">{c.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{c.value}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}
