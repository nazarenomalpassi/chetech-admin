import { RepairsAccessView } from "@/features/repairs-access/components/repairs-access-view";
import { getRepairsAccessDashboard } from "@/features/repairs-access/queries";
import { getRepairWarrantySettings } from "@/lib/app-settings";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function ReparacionesAccessPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; order?: string; view?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("repairs.view");

  const [{ orders, customers, latestImport, summary }, warrantySettings] = await Promise.all([
    getRepairsAccessDashboard({
      includeAdministration: profile.role === "admin"
    }),
    getRepairWarrantySettings()
  ]);
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <RepairsAccessView
      canManageIntake={profile.role === "admin"}
      customers={customers}
      defaultWarrantyDays={warrantySettings.defaultDays}
      actionStatus={params.status}
      initialOrderId={params.order}
      initialView={params.view}
      latestImport={latestImport}
      message={message}
      orders={orders}
      summary={summary}
    />
  );
}
