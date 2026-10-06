import { RepairsAccessView } from "@/features/repairs-access/components/repairs-access-view";
import { getRepairWorkshopPage } from "@/features/repairs-access/page-queries";
import { getRepairWarrantySettings } from "@/lib/app-settings";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { getWorkshopInbox } from "@/features/repairs-access/coordination-queries";

export default async function ReparacionesAccessPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; order?: string; view?: string; q?: string; state?: string; warranty?: string; scope?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("repairs.view");

  const [{ orders, customers, latestImport, summary, pageInfo }, warrantySettings, inbox] = await Promise.all([
    getRepairWorkshopPage(params, profile.role === "admin"),
    getRepairWarrantySettings(),
    getWorkshopInbox()
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
      technicians={inbox?.technicians}
      inbox={inbox}
      pageInfo={pageInfo}
      summary={summary}
    />
  );
}
