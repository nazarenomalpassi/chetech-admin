import { Badge } from "@/components/ui/badge";
import type { RepairWarrantyState } from "@/features/repairs-access/warranty";

const toneVariants = {
  neutral: "default",
  info: "default",
  success: "success",
  warning: "warning",
  danger: "danger"
} as const;

export function RepairAccessWarrantyBadge({
  warranty,
  showDetail = false
}: {
  warranty: RepairWarrantyState;
  showDetail?: boolean;
}) {
  const detail =
    warranty.code === "active" && warranty.daysRemaining !== null
      ? `${warranty.daysRemaining} d`
      : warranty.code === "expired" && warranty.daysElapsed !== null
        ? `hace ${warranty.daysElapsed} d`
        : null;

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <Badge title={warranty.description} variant={toneVariants[warranty.tone]}>
        {warranty.label}
        {detail ? ` · ${detail}` : ""}
      </Badge>
      {showDetail ? (
        <span className="max-w-xs text-xs leading-5 text-slate-500">{warranty.description}</span>
      ) : null}
    </span>
  );
}
