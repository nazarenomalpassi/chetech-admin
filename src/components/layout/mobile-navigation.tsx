"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { getSidebarItemsForRole } from "@/lib/navigation";
import type { AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function MobileNavigation({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sidebarItems = getSidebarItemsForRole(role);
  const currentSection = sidebarItems.find((item) => item.href === pathname)?.label ?? "Panel";

  return (
    <div className="sticky top-0 z-40 -mx-1 px-1 pt-[env(safe-area-inset-top)] xl:hidden">
      <div className="rounded-[22px] border border-white/10 bg-graphite p-2.5 text-white shadow-[0_12px_30px_rgba(20,20,19,0.18)] sm:p-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            className="flex min-w-0 items-center gap-3"
            href="/dashboard"
            onClick={() => setOpen(false)}
          >
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.06] sm:h-12 sm:w-12">
              <img alt="" className="h-7 w-7" src="/brand/chetech-isologo-white.svg" />
            </span>
            <span className="min-w-0">
              <span className="font-brand block truncate text-xl tracking-[-0.04em]">Chetech</span>
              <span className="block truncate text-xs text-white/70" data-testid="mobile-current-section">{currentSection}</span>
            </span>
          </Link>

          <Button
            aria-expanded={open}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            className="h-11 w-11 flex-none rounded-[14px] border-white/10 bg-white text-graphite hover:bg-brand-50 sm:h-12 sm:w-12"
            onClick={() => setOpen((value) => !value)}
            type="button"
            variant="secondary"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {open ? (
          <div className="mt-3 max-h-[calc(100svh-7.5rem)] overflow-y-auto overscroll-contain rounded-[22px] border border-white/8 bg-white/[0.04] p-2">
            <nav className="grid gap-2 sm:grid-cols-2">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                return (
                  <Link
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-[18px] px-3 py-2.5 text-sm font-semibold transition",
                      active
                        ? "bg-white text-graphite shadow-[0_14px_24px_rgba(0,0,0,0.18)]"
                        : "text-white/68 hover:bg-white/[0.07] hover:text-white"
                    )}
                    href={item.href}
                    key={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-2xl", active ? "bg-brand-100" : "bg-white/[0.06]")}>
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
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
