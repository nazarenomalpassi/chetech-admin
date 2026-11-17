import type { TvBoardRow, TvBoardSaleEventKind } from "@/features/tv-boards/model";
import { formatCurrency, formatDate } from "@/lib/utils";

const EVENT_LABELS: Record<TvBoardSaleEventKind, string> = {
  start_claim: "Reclamo iniciado",
  resume_sale: "Venta devuelta a pendiente",
  cancel_sale: "Venta anulada",
  confirm_release: "Liberacion confirmada"
};

export function BoardSaleHistory({ events }: { events: TvBoardRow["events"] }) {
  if (!events.length) return null;

  return (
    <details className="mt-2 text-sm">
      <summary className="min-h-11 cursor-pointer content-center rounded-lg px-2 font-medium text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
        Ver historial ({events.length})
      </summary>
      <ol className="space-y-3 border-t border-border py-3">
        {events.map((event) => (
          <li className="space-y-1 wrap-break-word" key={event.id}>
            <p className="font-medium text-foreground">{EVENT_LABELS[event.kind]}</p>
            <p className="text-muted-foreground">
              <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>. Neto:{" "}
              {formatCurrency(event.netAmount)}.
            </p>
            {event.notes ? (
              <p className="whitespace-pre-wrap text-muted-foreground">{event.notes}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
