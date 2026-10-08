"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getSidebarGroupsForRole } from "@/lib/navigation";
import type { AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function Sidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const groups = getSidebarGroupsForRole(role);

  return (
    <aside data-navigation-theme="dark" className="flex h-full max-h-full w-full overflow-hidden rounded-2xl bg-graphite p-3 text-white">

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
        <div className="flex min-h-[80px] flex-none items-center justify-center border-b border-white/10 px-3 py-4">
          <img alt="Chetech" className="h-auto w-[142px] max-w-full" width={142} height={42} src="/brand/chetech-horizontal-white.svg" />
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <nav aria-label="Navegación principal" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
            {groups.map((group) => <section key={group.label} className="space-y-1 pb-3"><h2 className="px-3 pt-2 text-xs font-medium text-white/65">{group.label}</h2>{group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-white",
                    active
                      ? "bg-white text-graphite"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center",
                      active ? "text-graphite" : "text-white/75"
                    )}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 leading-5">{item.label}</span>
                </Link>
              );
            })}</section>)}
          </nav>
        </div>

        <div className="mt-3 flex-none border-t border-white/10 pt-3">
          <form action="/auth/sign-out" method="post">
            <button
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "w-full justify-center border-white/10 bg-white text-graphite hover:bg-brand-50"
              )}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
