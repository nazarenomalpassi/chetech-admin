import { RepairOutsourcingsView } from "@/features/outsourcings/components/repair-outsourcings-view";
import { getRepairOutsourcingDashboard } from "@/features/outsourcings/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function TerciarizacionesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; page?: string; search?: string; outsourceStatus?: string; date?: string; view?: string }>;
}) {
  const params = await searchParams;
  await requirePermission("outsourcings.manage");
  const { records, summary, pagination, filters } = await getRepairOutsourcingDashboard({ ...params, status: params.outsourceStatus });
  const message = params.error
    ? { success: false, message: params.error }
    : params.status === "outsourcing_updated" ? { success: true, message: "Seguimiento guardado sin cambiar la REP ni los pagos." }
    : params.status === "outsourcing_quality_saved" ? { success: true, message: "Control de calidad registrado." }
    : getStatusMessage(params.status);

  return <RepairOutsourcingsView message={message} records={records} summary={summary} pagination={pagination} filters={filters} />;
}
