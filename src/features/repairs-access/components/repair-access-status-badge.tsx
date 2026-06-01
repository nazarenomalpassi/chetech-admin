import { Badge } from "@/components/ui/badge";
import { getRepairAccessStatusLabel, getRepairAccessStatusTone } from "@/features/repairs-access/components/repair-access-helpers";

export function RepairAccessStatusBadge({ status }: { status: string }) {
  return <Badge variant={getRepairAccessStatusTone(status)}>{getRepairAccessStatusLabel(status)}</Badge>;
}
