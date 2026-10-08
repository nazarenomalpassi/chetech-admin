"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { getSidebarItemsForRole, getSidebarGroupsForRole } from "@/lib/navigation";
import type { AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function MobileNavigation({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sidebarItems = getSidebarItemsForRole(role);
  const groups = getSidebarGroupsForRole(role);
  const currentSection = sidebarItems.find((item) => item.href === pathname)?.label ?? "Panel";

  return (
    <div className="no-print sticky top-0 z-40 -mx-1 px-1 pt-[env(safe-area-inset-top)] lg:hidden">
      <div data-navigation-theme="dark" className="rounded-xl bg-graphite p-2.5 text-white">
        <div className="flex items-center justify-between gap-3">
          <Link
            className="flex min-w-0 items-center gap-3"
            href="/dashboard"
            onClick={() => setOpen(false)}
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/[0.06]">
              <img alt="" className="h-6 w-6" width={24} height={24} src="/brand/chetech-isologo-white.svg" />
            </span>
            <span className="min-w-0">
              <span className="font-brand block text-lg">Chetech</span>
              <span className="block text-xs leading-5 text-white/80" data-testid="mobile-current-section">{currentSection}</span>
            </span>
          </Link>

          <Button
            aria-expanded={open}
            aria-controls={open ? "mobile-navigation" : undefined}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            className="h-11 w-11 flex-none rounded-lg border-white/10 bg-white text-graphite hover:bg-brand-50"
            onClick={() => setOpen((value) => !value)}
            type="button"
            variant="secondary"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {open ? (
          <div className="mt-3 max-h-[calc(100svh-7.5rem)] overflow-y-auto overscroll-contain border-t border-white/10 pt-3" id="mobile-navigation" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus(); } }}>
            <nav className="grid gap-3" aria-label="Navegacion del local">
              {groups.map((group) => <section key={group.label}><h2 className="mb-2 px-3 text-xs font-medium text-white/65">{group.label}</h2><div className="grid gap-1 sm:grid-cols-2">{group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                return (
                  <Link
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                      active
                        ? "bg-white text-graphite"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    )}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    key={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}</div></section>)}
            </nav>

            <form action="/auth/sign-out" className="mt-3 border-t border-white/8 pt-3" method="post">
              <button
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "min-h-12 w-full justify-center border-white/10 bg-white text-graphite hover:bg-brand-50"
                )}
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
