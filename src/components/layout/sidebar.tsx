"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { sidebarItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-full flex-col rounded-[28px] border border-white/70 bg-[#12332c] p-4 text-white shadow-soft">
      <div className="rounded-3xl bg-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-400/25 text-brand-100">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-100/70">Chetech</p>
            <h1 className="text-xl font-semibold">Admin Panel</h1>
          </div>
        </div>
      </div>

      <nav className="mt-6 space-y-2">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                active ? "bg-white text-[#12332c]" : "text-slate-100 hover:bg-white/10"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <form action="/auth/sign-out" method="post">
          <button className={cn(buttonVariants({ variant: "secondary" }), "w-full justify-center")}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
