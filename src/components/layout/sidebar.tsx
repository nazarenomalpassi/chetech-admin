"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { SidebarGroups } from "@/components/layout/sidebar-groups";
import { UserBadge } from "@/components/layout/user-badge";
import { getSidebarGroupsForRole } from "@/lib/navigation";
import type { AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function Sidebar({ role, userName = "" }: { role: AppRole; userName?: string }) {
  const pathname = usePathname();
  const groups = getSidebarGroupsForRole(role);

  return (
    <aside
      data-navigation-theme="dark"
      className="flex h-full max-h-full w-full overflow-hidden rounded-2xl bg-graphite p-3 text-white"
    >
      <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
        <div className="flex min-h-[80px] flex-none items-center justify-center border-b border-white/10 px-3 py-4">
          <img
            alt="Chetech"
            className="h-auto w-[142px] max-w-full"
            width={142}
            height={42}
            src="/brand/chetech-horizontal-white.svg"
          />
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <nav
            aria-label="Navegación principal"
            className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto overscroll-contain pr-1"
          >
            <SidebarGroups groups={groups} pathname={pathname} />
          </nav>
        </div>

        <div className="mt-3 flex flex-none items-center justify-between gap-2 border-t border-white/10 pt-3">
          <UserBadge name={userName} role={role} />
          <form action="/auth/sign-out" method="post">
            <button
              aria-label="Cerrar sesión"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "shrink-0 text-white/75 hover:bg-white/10 hover:text-white focus-visible:ring-white focus-visible:ring-offset-graphite"
              )}
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
