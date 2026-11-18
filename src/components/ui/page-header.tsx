import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Cabecera de cada sección: título, una línea de contexto y las acciones de la vista.
 * Un solo botón primario por cabecera; el resto, secundarios o en un menú.
 */
export function PageHeader({
  title,
  description,
  actions,
  aside,
  children,
  className,
  titleId
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Botones de la vista. En celular se apilan debajo del título. */
  actions?: ReactNode;
  /** Un dato de contexto (un saldo, un total) que acompaña al título a la derecha. */
  aside?: ReactNode;
  children?: ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <header className={cn("page-header", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="max-w-3xl min-w-0">
          <h1 className="page-title" id={titleId}>
            {title}
          </h1>
          {description ? <div className="page-description">{description}</div> : null}
        </div>
        {aside || actions ? (
          <div className="flex shrink-0 flex-col gap-3 sm:items-end">
            {aside}
            {actions ? (
              <div className="page-actions flex flex-wrap gap-2 sm:justify-end">{actions}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      {children}
    </header>
  );
}
