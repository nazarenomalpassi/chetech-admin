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
    <aside className="relative flex h-full max-h-full w-full overflow-hidden rounded-[30px] border border-graphite/10 bg-[linear-gradient(180deg,rgba(19,19,18,0.96),rgba(28,27,25,0.98))] p-3 text-white shadow-pop 2xl:p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_28%)]" />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
        <div className="flex min-h-[124px] flex-none items-center justify-center rounded-[24px] border border-white/8 bg-white/[0.045] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] 2xl:min-h-[138px]">
          <img alt="Chetech" className="h-auto w-[146px] max-w-full 2xl:w-[164px]" src="/brand/chetech-horizontal-white.svg" />
        </div>

        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <p className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-white/32">
            Navegación
          </p>
          <nav className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
            {groups.map((group) => <section key={group.label} className="space-y-1.5 pb-3"><h2 className="px-3 pt-2 text-xs font-medium text-white/45">{group.label}</h2>{group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-[18px] px-3 py-2.5 text-sm font-medium transition duration-200 2xl:gap-3 2xl:px-4 2xl:py-3",
                    active
                      ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,240,235,0.94))] text-graphite shadow-[0_18px_32px_rgba(0,0,0,0.16)]"
                      : "text-white/62 hover:bg-white/[0.065] hover:text-white"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] transition 2xl:h-9 2xl:w-9 2xl:rounded-2xl",
                      active ? "bg-brand-100 text-graphite" : "bg-white/[0.04] text-white/72 group-hover:bg-white/[0.08]"
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}</section>)}
          </nav>
        </div>

        <div className="mt-4 flex-none rounded-[26px] border border-white/7 bg-white/[0.035] p-3">
          <p className="mb-3 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-white/32">
            Sesión
          </p>
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
