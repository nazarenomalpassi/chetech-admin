import { RepairOutsourcingsView } from "@/features/outsourcings/components/repair-outsourcings-view";
import { getRepairOutsourcingDashboard } from "@/features/outsourcings/queries";
import { getStatusMessage } from "@/lib/form-state";

export default async function TerciarizacionesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { records, summary } = await getRepairOutsourcingDashboard();
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return <RepairOutsourcingsView message={message} records={records} summary={summary} />;
}
