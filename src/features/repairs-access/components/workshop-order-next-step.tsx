import { CalendarDays, MapPin } from "lucide-react";
import type { WorkshopOrderSummary } from "../workshop-order-summary";
import { cn, formatDate } from "@/lib/utils";

export function WorkshopOrderNextStep({ repairNumber, summary }: { repairNumber: string; summary: WorkshopOrderSummary }) {
  const blocked = summary.blockers.length > 0;
  return <aside role="note" aria-label={`Proximo paso de ${repairNumber}`} className={cn(
    "min-w-0 space-y-2 rounded-lg border-l-4 p-3 text-sm",
    blocked ? "border-amber-400 bg-amber-50 text-amber-950" : "border-slate-300 bg-slate-50 text-slate-900"
  )}>
    <p className="text-xs font-medium">Proximo paso{summary.activeReturn ? " del reingreso" : ""}</p>
    <p className="break-words font-semibold leading-5 [overflow-wrap:anywhere]">{summary.nextAction}</p>
    {blocked ? <ul className="space-y-1 text-xs leading-5">{summary.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
    {summary.location || summary.nextActionDate ? <dl className="grid min-w-0 gap-2 border-t border-current/10 pt-2 text-xs">
      {summary.location ? <div className="min-w-0">
        <dt className="flex items-center gap-1.5"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />Ubicacion registrada</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words font-medium [overflow-wrap:anywhere]">{summary.location}</dd>
      </div> : null}
      {summary.nextActionDate ? <div className="min-w-0">
        <dt className="flex items-center gap-1.5"><CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />Proxima revision</dt>
        <dd className="mt-1 font-medium"><time dateTime={summary.nextActionDate}>{formatDate(summary.nextActionDate)}</time></dd>
      </div> : null}
    </dl> : null}
  </aside>;
}
