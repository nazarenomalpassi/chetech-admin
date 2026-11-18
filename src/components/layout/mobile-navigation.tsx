"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { NavigationPending } from "@/components/layout/navigation-pending";
import { UserBadge } from "@/components/layout/user-badge";
import {
  getSidebarItemsForRole,
  getSidebarGroupsForRole,
  isNavItemActive,
  type SidebarItem
} from "@/lib/navigation";
import type { AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Las cuatro secciones que más se abren desde el celular, por rol. */
const quickBarByRole: Record<AppRole, string[]> = {
  admin: ["/dashboard", "/reparaciones-access", "/ventas", "/caja"],
  tecnico: ["/dashboard", "/reparaciones-access", "/visitas", "/productos"]
};

export function MobileNavigation({ role, userName = "" }: { role: AppRole; userName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sidebarItems = getSidebarItemsForRole(role);
  const groups = getSidebarGroupsForRole(role);
  const currentSection =
    sidebarItems.find((item) => isNavItemActive(pathname, item.href))?.label ?? "Panel";
  const quickItems = quickBarByRole[role]
    .map((href) => sidebarItems.find((item) => item.href === href))
    .filter((item): item is SidebarItem => Boolean(item));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function closeAndFocusToggle(target: HTMLElement) {
    setOpen(false);
    target
      .closest(".mobile-shell")
      ?.querySelector<HTMLButtonElement>("button[data-menu-toggle]")
      ?.focus();
  }

  return (
    <div className="mobile-shell no-print lg:hidden">
      <div className="sticky top-0 z-50 -mx-1 px-1 pt-[env(safe-area-inset-top)]">
        <div
          data-navigation-theme="dark"
          className="flex items-center justify-between gap-3 rounded-xl bg-graphite p-2.5 text-white"
        >
          <Link
            className="flex min-w-0 items-center gap-3"
            href="/dashboard"
            onClick={() => setOpen(false)}
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/6">
              <img
                alt=""
                className="h-6 w-6"
                width={24}
                height={24}
                src="/brand/chetech-isologo-white.svg"
              />
            </span>
            <span className="min-w-0">
              <span className="block font-brand text-lg leading-6">Chetech</span>
              <span
                className="block text-xs leading-4 text-white/80"
                data-testid="mobile-current-section"
              >
                {currentSection}
              </span>
            </span>
          </Link>

          <Button
            aria-expanded={open}
            aria-controls={open ? "mobile-navigation" : undefined}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            className="h-11 w-11 flex-none rounded-lg border-white/10 bg-white text-graphite hover:bg-brand-50"
            data-menu-toggle
            onClick={() => setOpen((value) => !value)}
            type="button"
            variant="secondary"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="absolute inset-x-2 top-[calc(4.75rem+env(safe-area-inset-top))] bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-col overflow-hidden rounded-xl bg-graphite text-white shadow-pop"
            data-navigation-theme="dark"
            id="mobile-navigation"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeAndFocusToggle(event.currentTarget);
            }}
          >
            <nav
              aria-label="Navegación del local"
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3"
            >
              {groups.map((group) => (
                <section key={group.label}>
                  <h2 className="mb-1.5 px-3 text-xs font-medium text-white/65">{group.label}</h2>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isNavItemActive(pathname, item.href);

                      return (
                        <Link
                          className={cn(
                            "nav-section-link flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                            active ? "bg-white text-graphite" : "text-white/80"
                          )}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          key={item.href}
                          onClick={() => {
                            // Keep Link's pending feedback mounted until the new route arrives.
                            if (active) setOpen(false);
                          }}
                        >
                          <span className="nav-section-icon flex h-5 w-5 shrink-0 items-center justify-center">
                            <Icon aria-hidden="true" className="h-4 w-4" />
                          </span>
                          <span>{item.label}</span>
                          <NavigationPending label={item.label} />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </nav>

            <div className="flex items-center justify-between gap-3 border-t border-white/10 p-3">
              <UserBadge name={userName} role={role} />
              <form action="/auth/sign-out" method="post">
                <button
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "border-white/10 bg-white text-graphite hover:bg-brand-50"
                  )}
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Accesos rápidos"
        className="mobile-quickbar fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="grid grid-cols-5">
          {quickItems.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item.href) && !open;
            return (
              <li key={item.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "mobile-quickbar-item",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                  href={item.href}
                  onClick={() => setOpen(false)}
                >
                  <Icon aria-hidden="true" className="h-5 w-5" />
                  <span>{item.label === "Reparaciones" ? "Taller" : item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              aria-expanded={open}
              aria-controls={open ? "mobile-navigation" : undefined}
              className={cn(
                "mobile-quickbar-item w-full",
                open ? "text-foreground" : "text-muted-foreground"
              )}
              onClick={() => setOpen((value) => !value)}
              type="button"
            >
              {open ? (
                <X aria-hidden="true" className="h-5 w-5" />
              ) : (
                <Menu aria-hidden="true" className="h-5 w-5" />
              )}
              <span>Menú</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
