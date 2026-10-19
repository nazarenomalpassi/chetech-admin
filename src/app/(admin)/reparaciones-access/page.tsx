import { RepairsAccessView } from "@/features/repairs-access/components/repairs-access-view";
import { getRepairWorkshopPage } from "@/features/repairs-access/page-queries";
import { getRepairWarrantySettings } from "@/lib/app-settings";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { getWorkshopInbox } from "@/features/repairs-access/coordination-queries";
import { getWarrantyReturnsCount, getWarrantyReturnsPage } from "@/features/repairs-access/warranty-queries";

export default async function ReparacionesAccessPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; order?: string; view?: string; q?: string; state?: string; warranty?: string; scope?: string; cursor?: string; wq?: string; wp?: string; wh?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("repairs.view");

  const [{ orders, customers, latestImport, summary, pageInfo }, warrantySettings, inbox, warrantyReturnsCount, warrantyReturnsPage] = await Promise.all([
    getRepairWorkshopPage(params, profile.role === "admin"),
    getRepairWarrantySettings(),
    getWorkshopInbox(),
    getWarrantyReturnsCount(),
    params.view === "garantias" ? getWarrantyReturnsPage({ page: params.wp, search: params.wq, closed: params.wh === "1" }) : Promise.resolve(null)
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
      warrantyReturnsCount={warrantyReturnsCount}
      warrantyReturnsPage={warrantyReturnsPage}
      warrantyReturnsSearch={params.wq ?? ""}
      warrantyReturnsClosed={params.wh === "1"}
    />
  );
}
