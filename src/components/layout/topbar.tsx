"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getSidebarGroupsForRole, isNavItemActive } from "@/lib/navigation";
import type { AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function getArgentinaDateLabel() {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(new Date());
}

/** Dónde está la persona y la acción más frecuente del mostrador, siempre a mano. */
export function Topbar({ role = "admin" }: { role?: AppRole }) {
  const pathname = usePathname();
  const groups = getSidebarGroupsForRole(role);
  const current = groups
    .flatMap((group) => group.items.map((item) => ({ group: group.label, item })))
    .find(({ item }) => isNavItemActive(pathname, item.href));
  const dateLabel = getArgentinaDateLabel();
  const onIntake = pathname?.startsWith("/reparaciones-access") ?? false;

  return (
    <header className="flex min-h-11 items-center justify-between gap-4 border-b border-border pb-3">
      <p className="flex min-w-0 items-center gap-2 text-sm">
        {current && current.group !== current.item.label ? (
          <>
            <span className="text-muted-foreground">{current.group}</span>
            <span aria-hidden="true" className="text-border-strong">
              /
            </span>
          </>
        ) : null}
        <span className="truncate font-medium text-foreground">
          {current?.item.label ?? "Gestión del local"}
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-4">
        <time className="text-sm text-muted-foreground first-letter:uppercase">{dateLabel}</time>
        {role === "admin" && !onIntake ? (
          <Link
            className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
            href={"/reparaciones-access?view=nueva" as Route}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Nueva orden
          </Link>
        ) : null}
      </div>
    </header>
  );
}
