import Link from "next/link";
import type { Route } from "next";
import { buttonVariants } from "@/components/ui/button";
import { buildPaginationHref, type PaginationMeta } from "@/lib/pagination";

export function OperationsPagination({ pagination, baseHref }: { pagination: PaginationMeta; baseHref: string }) {
  const url = new URL(baseHref, "http://localhost");
  return <nav aria-label="Paginacion de historial" className="flex flex-wrap items-center justify-between gap-3 border-t border-graphite/10 p-4 text-sm">
    <p>Pagina {pagination.page} de {pagination.totalPages} | {pagination.total} registros</p>
    <div className="flex gap-2">
      {pagination.hasPreviousPage ? <Link className={buttonVariants({ variant: "secondary" })} href={buildPaginationHref(url.pathname, url.searchParams, pagination.page - 1) as Route}>Anterior</Link> : null}
      {pagination.hasNextPage ? <Link className={buttonVariants({ variant: "secondary" })} href={buildPaginationHref(url.pathname, url.searchParams, pagination.page + 1) as Route}>Siguiente</Link> : null}
    </div>
  </nav>;
}
