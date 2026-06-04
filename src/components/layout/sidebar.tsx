"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { sidebarItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="relative flex h-full w-full overflow-hidden rounded-[34px] border border-graphite/10 bg-[linear-gradient(180deg,rgba(19,19,18,0.96),rgba(28,27,25,0.98))] p-3.5 text-white shadow-pop lg:p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_28%)]" />

      <div className="relative z-10 flex h-full w-full flex-col">
        <div className="flex min-h-[138px] items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.045] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] lg:min-h-[148px]">
          <img alt="Chetech" className="h-auto w-[168px] max-w-full lg:w-[178px]" src="/brand/chetech-horizontal-white.svg" />
        </div>

        <div className="mt-5">
          <p className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-white/32">
            Navegacion
          </p>
          <nav className="mt-3 space-y-1.5">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-medium transition duration-200",
                    active
                      ? "bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,240,235,0.94))] text-graphite shadow-[0_18px_32px_rgba(0,0,0,0.16)]"
                      : "text-white/62 hover:bg-white/[0.065] hover:text-white"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-2xl transition",
                      active ? "bg-brand-100 text-graphite" : "bg-white/[0.04] text-white/72 group-hover:bg-white/[0.08]"
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto rounded-[26px] border border-white/7 bg-white/[0.035] p-3">
          <p className="mb-3 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-white/32">
            Sesion
          </p>
          <form action="/auth/sign-out" method="post">
            <button
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "w-full justify-center border-white/10 bg-white text-graphite hover:bg-brand-50"
              )}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
