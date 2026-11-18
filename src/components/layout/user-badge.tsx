import type { AppRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const roleLabels: Record<AppRole, string> = { admin: "Administración", tecnico: "Técnico" };

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Quién está usando el sistema, para que el mostrador compartido no deje dudas. */
export function UserBadge({
  name,
  role,
  className
}: {
  name: string;
  role: AppRole;
  className?: string;
}) {
  const label = name.trim() || roleLabels[role];
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white"
      >
        {getInitials(label)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white">{label}</span>
        <span className="block text-xs text-white/60">{roleLabels[role]}</span>
      </span>
    </div>
  );
}
