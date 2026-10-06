import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { buildPaginationHref, type PaginationMeta } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export function PaginationNav({
  meta,
  pathname,
  searchParams = {}
}: {
  meta: PaginationMeta;
  pathname: string;
  searchParams?: Record<string, string | undefined>;
}) {
  if (meta.totalPages <= 1) return null;

  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value && key !== "page") params.set(key, value);
  });

  const previousHref = buildPaginationHref(pathname, params, meta.page - 1) as Route;
  const nextHref = buildPaginationHref(pathname, params, meta.page + 1) as Route;

  return (
    <nav
      aria-label="Paginación del historial"
      className="flex flex-col gap-3 border-t border-graphite/8 bg-brand-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p aria-live="polite" className="text-sm text-slate-600">
        Página <strong className="text-slate-950">{meta.page}</strong> de {meta.totalPages} · {meta.total} registros
      </p>
      <div className="grid grid-cols-2 gap-2">
        {meta.hasPreviousPage ? (
          <Link className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "min-w-28")} href={previousHref}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Anterior
          </Link>
        ) : (
          <span aria-disabled="true" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "min-w-28 opacity-45")}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            Anterior
          </span>
        )}
        {meta.hasNextPage ? (
          <Link className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "min-w-28")} href={nextHref}>
            Siguiente
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : (
          <span aria-disabled="true" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "min-w-28 opacity-45")}>
            Siguiente
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </span>
        )}
      </div>
    </nav>
  );
}
