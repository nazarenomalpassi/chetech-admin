import Link from "next/link";
import type { Route } from "next";
import { PackageOpen, Plus } from "lucide-react";

import { TV_BOARD_TYPE_LABELS, type TvBoardBox } from "@/features/tv-boards/model";
import { cn } from "@/lib/utils";

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Las cajas como las ve el local: número grande, cuántas placas y qué hay adentro. */
export function BoxGrid({
  boxes,
  unboxedCount,
  canManage,
  onCreate
}: {
  boxes: TvBoardBox[];
  unboxedCount: number;
  canManage: boolean;
  onCreate: () => void;
}) {
  const nextNumber = (boxes.at(-1)?.number ?? 0) + 1;

  return (
    <ul
      className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-4"
      aria-label="Cajas"
    >
      {boxes.map((box) => (
        <li key={box.id}>
          <BoxCard box={box} />
        </li>
      ))}

      {unboxedCount > 0 ? (
        <li>
          <Link
            className="box-card flex h-full min-h-32 flex-col justify-between rounded-xl border border-dashed border-border-strong bg-card/60 p-3 sm:min-h-44 sm:p-4"
            href={"/placas-tv?caja=sin" as Route}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Sin caja</p>
                <p className="mt-1 text-4xl leading-none font-semibold text-muted-foreground tabular-nums">
                  {unboxedCount}
                </p>
              </div>
              <PackageOpen aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="hidden text-sm leading-5 text-muted-foreground sm:block">
              {unboxedCount === 1
                ? "Placa guardada sin caja. Asignale una desde Editar."
                : "Placas guardadas sin caja. Asignales una desde Editar."}
            </p>
          </Link>
        </li>
      ) : null}

      {canManage ? (
        <li>
          <button
            className="box-card flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-3 text-muted-foreground hover:text-foreground sm:min-h-44 sm:p-4"
            onClick={onCreate}
            type="button"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Plus aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-foreground">Nueva caja</span>
            <span className="text-center text-sm">Va a ser la Caja {nextNumber}</span>
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function BoxCard({ box }: { box: TvBoardBox }) {
  const types = (Object.keys(box.byType) as Array<keyof TvBoardBox["byType"]>).filter(
    (type) => box.byType[type] > 0
  );
  const hidden = box.inStock - box.preview.length;

  return (
    <Link
      aria-label={`Caja ${box.number}: ${plural(box.inStock, "placa", "placas")}`}
      className="box-card group flex h-full min-h-32 flex-col rounded-xl border border-border bg-card p-3 sm:min-h-44 sm:p-4"
      href={`/placas-tv?caja=${box.number}` as Route}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Caja</p>
          <p className="mt-1 text-4xl leading-none font-semibold tracking-tight text-foreground tabular-nums">
            {box.number}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-sm font-medium tabular-nums",
            box.inStock ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground"
          )}
        >
          {box.inStock ? plural(box.inStock, "placa", "placas") : "Vacía"}
        </span>
      </div>

      {box.label ? (
        <p className="mt-2 truncate text-sm text-muted-foreground" title={box.label}>
          {box.label}
        </p>
      ) : null}

      {types.length ? (
        <ul aria-label="Tipos de placa" className="mt-3 hidden flex-wrap gap-1.5 sm:flex">
          {types.map((type) => (
            <li
              className="rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-body"
              key={type}
            >
              {TV_BOARD_TYPE_LABELS[type]} {box.byType[type]}
            </li>
          ))}
        </ul>
      ) : null}

      {box.preview.length ? (
        <ul className="mt-3 hidden space-y-0.5 border-t border-border pt-3 text-sm text-body sm:block">
          {box.preview.map((model, index) => (
            <li className="truncate" key={`${model}-${index}`}>
              {model}
            </li>
          ))}
          {hidden > 0 ? <li className="text-muted-foreground">y {hidden} más</li> : null}
        </ul>
      ) : (
        <p className="mt-auto hidden pt-3 text-sm text-muted-foreground sm:block">
          Todavía no hay placas en esta caja.
        </p>
      )}
    </Link>
  );
}
