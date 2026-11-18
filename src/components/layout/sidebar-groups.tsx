"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { NavigationPending } from "@/components/layout/navigation-pending";
import { isNavItemActive, type SidebarGroup, type SidebarItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "chetech:menu:grupos-abiertos";

function readStoredGroups(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function storeGroups(groups: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups]));
  } catch {
    // Sin almacenamiento (modo privado o bloqueado): el menú funciona igual, sin recordar.
  }
}

function activeGroupOf(groups: SidebarGroup[], pathname: string | null) {
  return groups.find((group) => group.items.some((item) => isNavItemActive(pathname, item.href)))
    ?.label;
}

/**
 * Grupos plegables del menú lateral. Recuerdan qué quedó abierto en este navegador y el grupo
 * de la sección actual siempre se abre al entrar. Si se pliega igual, la sección activa sigue
 * a la vista debajo del título.
 */
export function SidebarGroups({
  groups,
  pathname
}: {
  groups: SidebarGroup[];
  pathname: string | null;
}) {
  const activeGroup = activeGroupOf(groups, pathname);
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []));

  useEffect(() => {
    const stored = readStoredGroups();
    if (!stored.length) return;
    setOpen((current) => new Set([...current, ...stored]));
  }, []);

  useEffect(() => {
    if (!activeGroup) return;
    setOpen((current) => (current.has(activeGroup) ? current : new Set([...current, activeGroup])));
  }, [activeGroup]);

  const toggle = useCallback((label: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      storeGroups(next);
      return next;
    });
  }, []);

  return (
    <>
      {groups.map((group) =>
        group.items.length === 1 && group.label === "Inicio" ? (
          <div key={group.label} className="pb-2">
            <NavLink item={group.items[0]} pathname={pathname} />
          </div>
        ) : (
          <CollapsibleGroup
            group={group}
            key={group.label}
            onToggle={toggle}
            open={open.has(group.label)}
            pathname={pathname}
          />
        )
      )}
    </>
  );
}

function CollapsibleGroup({
  group,
  open,
  onToggle,
  pathname
}: {
  group: SidebarGroup;
  open: boolean;
  onToggle: (label: string) => void;
  pathname: string | null;
}) {
  const listId = useId();
  const visibleItems = open
    ? group.items
    : group.items.filter((item) => isNavItemActive(pathname, item.href));

  return (
    <section className="pb-1">
      <h2>
        <button
          aria-controls={listId}
          aria-expanded={open}
          className="nav-group-toggle flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-3 text-xs font-medium text-white/65"
          onClick={() => onToggle(group.label)}
          type="button"
        >
          <span>{group.label}</span>
          <span className="flex items-center gap-1.5">
            {!open ? (
              <span className="text-white/60 tabular-nums">{group.items.length}</span>
            ) : null}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none",
                open ? "rotate-0" : "-rotate-90"
              )}
            />
          </span>
        </button>
      </h2>
      <div className="space-y-1 pb-2" id={listId}>
        {visibleItems.map((item) => (
          <NavLink item={item} key={item.href} pathname={pathname} />
        ))}
      </div>
    </section>
  );
}

function NavLink({ item, pathname }: { item: SidebarItem; pathname: string | null }) {
  const Icon = item.icon;
  const active = isNavItemActive(pathname, item.href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "nav-section-link group flex min-h-10 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
        active ? "bg-white text-graphite" : "text-white/80"
      )}
      href={item.href}
    >
      <span
        className={cn(
          "nav-section-icon flex h-5 w-5 shrink-0 items-center justify-center",
          active ? "text-graphite" : "text-white/75"
        )}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <span className="min-w-0 leading-5">{item.label}</span>
      <NavigationPending label={item.label} />
    </Link>
  );
}
