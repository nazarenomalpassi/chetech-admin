import type { LucideIcon } from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";

export type MetricTone = "income" | "expense" | "service" | "success" | "warning" | "neutral";

const tones: Record<MetricTone, { icon: string; value: string; accent: string }> = {
  income: { icon: "bg-info-soft text-info", value: "text-info", accent: "bg-info/60" },
  expense: { icon: "bg-danger-soft text-danger", value: "text-danger", accent: "bg-danger/60" },
  service: { icon: "bg-success-soft text-success", value: "text-success", accent: "bg-success/60" },
  success: {
    icon: "bg-success-soft text-success",
    value: "text-success",
    accent: "bg-success/60"
  },
  warning: {
    icon: "bg-warning-soft text-warning",
    value: "text-warning",
    accent: "bg-warning/60"
  },
  neutral: { icon: "bg-accent text-foreground", value: "text-foreground", accent: "bg-primary/30" }
};

export function MetricCard({
  label,
  value,
  icon: Icon,
  description,
  tone = "neutral",
  format = "number",
  className
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
    <div
      className={cn("metric-tile relative min-w-0 overflow-hidden", className)}
      data-tone={effectiveTone}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-0.5", colors.accent)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm leading-5 font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-2 text-2xl leading-tight font-semibold tracking-tight wrap-break-word tabular-nums min-[1440px]:text-[1.75rem]",
              colors.value
            )}
          >
            {format === "currency" ? formatCurrency(value) : value.toLocaleString("es-AR")}
          </p>
          {description ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            colors.icon
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}
