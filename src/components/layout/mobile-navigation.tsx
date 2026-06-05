"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { sidebarItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 -mx-1 px-1 pt-[env(safe-area-inset-top)] xl:hidden">
      <div className="rounded-[28px] border border-graphite/10 bg-[linear-gradient(180deg,rgba(19,19,18,0.98),rgba(28,27,25,0.98))] p-3 text-white shadow-pop">
        <div className="flex items-center justify-between gap-3">
          <Link className="flex min-w-0 items-center gap-3" href="/dashboard" onClick={() => setOpen(false)}>
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.06]">
              <img alt="" className="h-7 w-7" src="/brand/chetech-isologo-white.svg" />
            </span>
            <span className="min-w-0">
              <span className="font-brand block truncate text-xl tracking-[-0.04em]">Chetech</span>
              <span className="block text-xs text-white/48">Panel administrativo</span>
            </span>
          </Link>

          <Button
            aria-expanded={open}
            aria-label={open ? "Cerrar menu" : "Abrir menu"}
            className="h-12 w-12 flex-none rounded-[18px] border-white/10 bg-white text-graphite hover:bg-brand-50"
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
                Cerrar sesion
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
