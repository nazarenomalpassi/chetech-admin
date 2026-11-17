"use client";

import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BoardSaleHistory } from "@/features/tv-boards/components/board-sale-history";
import type { TvBoardRow } from "@/features/tv-boards/model";
import { formatCurrency, formatDate } from "@/lib/utils";

export function BoardClaimsSection({
  claims,
  canManage,
  onResolve,
  updatedVersions
}: {
  claims: TvBoardRow[];
  canManage: boolean;
  onResolve: (board: TvBoardRow) => void;
  updatedVersions?: Readonly<Record<string, number>>;
}) {
  const id = useId();

  return (
    <section
      aria-labelledby={id}
      className="overflow-hidden rounded-xl border border-warning-border bg-card sm:rounded-2xl"
    >
      <div className="border-b border-warning-border bg-warning-soft px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-foreground" id={id}>
            Reclamos / dinero retenido
          </h2>
          <Badge variant="warning">
            {claims.length} {claims.length === 1 ? "reclamo abierto" : "reclamos abiertos"}
          </Badge>
        </div>
        <p className="mt-1 max-w-prose text-sm text-warning">
          Todos los reclamos abiertos, sin aplicar los filtros del inventario. Registro interno; no
          abre un reclamo en MercadoLibre.
        </p>
      </div>
      {claims.length ? (
        <ul className="divide-y divide-border">
          {claims.map((board) => (
            <li className="px-4 py-4 sm:px-5" key={board.id}>
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0 space-y-2">
                  <h3 className="font-semibold wrap-break-word text-foreground">
                    {board.brand} {board.model}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Neto retenido:{" "}
                    <strong className="font-semibold text-warning tabular-nums">
                      {board.netAmount === null ? "Sin informar" : formatCurrency(board.netAmount)}
                    </strong>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Inicio:{" "}
                    {board.claimOpenedAt ? (
                      <time dateTime={board.claimOpenedAt}>{formatDate(board.claimOpenedAt)}</time>
                    ) : (
                      "Sin fecha registrada"
                    )}
                  </p>
                  <p className="max-w-prose text-sm wrap-break-word whitespace-pre-wrap text-body">
                    {board.claimNotes || "Sin notas del reclamo."}
                  </p>
                  <BoardSaleHistory events={board.events} />
                </div>
                {canManage ? (
                  <Button
                    disabled={(updatedVersions?.[board.id] ?? 0) > board.version}
                    onClick={() => onResolve(board)}
                    type="button"
                    variant="secondary"
                  >
                    Resolver reclamo
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground sm:px-5">
          No hay reclamos abiertos ni dinero retenido por reclamos.
        </p>
      )}
    </section>
  );
}
