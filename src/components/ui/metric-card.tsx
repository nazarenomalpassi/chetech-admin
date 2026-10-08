import type { LucideIcon } from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";

export type MetricTone = "income" | "expense" | "service" | "success" | "warning" | "neutral";

const tones: Record<MetricTone, { icon: string; value: string; accent: string }> = {
  income: { icon: "bg-blue-50 text-blue-800", value: "text-blue-900", accent: "bg-blue-500/60" },
  expense: { icon: "bg-rose-50 text-rose-800", value: "text-rose-800", accent: "bg-rose-500/60" },
  service: { icon: "bg-teal-50 text-teal-800", value: "text-teal-900", accent: "bg-teal-500/60" },
  success: { icon: "bg-emerald-50 text-emerald-800", value: "text-emerald-800", accent: "bg-emerald-500/60" },
  warning: { icon: "bg-amber-50 text-amber-900", value: "text-amber-900", accent: "bg-amber-500/60" },
  neutral: { icon: "bg-brand-100 text-graphite", value: "text-slate-950", accent: "bg-graphite/30" }
};

export function MetricCard({
  label, value, icon: Icon, description, tone = "neutral", format = "number", className
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  description?: string;
  tone?: MetricTone;
  format?: "number" | "currency";
  className?: string;
}) {
  const effectiveTone = value < 0 ? "expense" : tone;
  const colors = tones[effectiveTone];
  return (
    <div className={cn("metric-tile relative min-w-0 overflow-hidden", className)} data-tone={effectiveTone}>
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", colors.accent)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-slate-600">{label}</p>
          <p className={cn("mt-2 break-words text-2xl font-semibold leading-tight tracking-tight tabular-nums min-[1440px]:text-[1.75rem]", colors.value)}>
            {format === "currency" ? formatCurrency(value) : value.toLocaleString("es-AR")}
          </p>
          {description ? <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p> : null}
        </div>
        <span aria-hidden="true" className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", colors.icon)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}
