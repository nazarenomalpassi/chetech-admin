import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { WorkshopInbox } from "@/features/repairs-access/components/workshop-inbox";
import type { WorkshopInbox as InboxData } from "@/features/repairs-access/coordination-queries";

export function OperationalInboxSection({ inbox }: { inbox: InboxData | null }) {
  return (
    <section aria-label="Bandeja operativa actual">
      {inbox ? <Card className="p-0 sm:p-0">
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none hover:bg-brand-50/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-600 sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block font-semibold text-slate-950">Bandeja del taller</span>
              <span className="mt-1 block text-sm text-slate-600">{inbox.counts.ready} listos para retirar · {inbox.counts.blockedParts} con repuestos pendientes</span>
            </span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-600 transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t border-graphite/10 p-3 sm:p-4">
            <p className="text-sm text-slate-600">Cola actual completa. No depende del periodo financiero seleccionado en el dashboard.</p>
            <WorkshopInbox inbox={inbox} />
          </div>
        </details>
      </Card> : (
        <Card role="status" className="border-amber-200 bg-amber-50">
          <h2 className="text-lg font-semibold">Bandeja operativa no disponible</h2>
          <p className="mt-1 text-sm">No se pudieron consultar los pendientes. Revisá las órdenes o intentá nuevamente.</p>
        </Card>
      )}
    </section>
  );
}
