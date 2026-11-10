import { RepairsAccessView } from "@/features/repairs-access/components/repairs-access-view";
import { getRepairWorkshopPage } from "@/features/repairs-access/page-queries";
import { getRepairWarrantySettings } from "@/lib/app-settings";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { getWorkshopInbox } from "@/features/repairs-access/coordination-queries";
import { getWarrantyReturnsCount, getWarrantyReturnsPage } from "@/features/repairs-access/warranty-queries";
import { getWorkshopPartsPage, getSupplierClaimsPage } from "@/features/repairs-access/parts-queries";
import { getWorkshopOperationalMetrics } from "@/features/repairs-access/operational-metrics-queries";
import { getOperationalMetricsRange } from "@/features/repairs-access/operational-metrics";

export default async function ReparacionesAccessPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; order?: string; view?: string; q?: string; state?: string; warranty?: string; scope?: string; cursor?: string; wq?: string; wp?: string; wh?: string; pp?: string; pq?: string; pf?: string; pc?: string; cp?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("repairs.view");
  let metricsRange = getOperationalMetricsRange();
  let rangeError: string | null = null;
  if (params.view === "metricas") {
    try { metricsRange = getOperationalMetricsRange({ from: params.from, to: params.to }); }
    catch { rangeError = "El periodo no es valido. Se muestra el mes actual hasta hoy."; }
  }

  const [{ orders, customers, latestImport, summary, pageInfo }, warrantySettings, inbox, warrantyReturnsCount, warrantyReturnsPage, partsPage, supplierClaimsPage, operationalMetrics] = await Promise.all([
    getRepairWorkshopPage(params, profile.role === "admin"),
    getRepairWarrantySettings(),
    getWorkshopInbox(),
    getWarrantyReturnsCount(),
    params.view === "garantias" ? getWarrantyReturnsPage({ page: params.wp, search: params.wq, closed: params.wh === "1" }) : Promise.resolve(null),
    params.view === "repuestos" ? getWorkshopPartsPage({ page: params.pp, search: params.pq, status: params.pf }) : Promise.resolve(null),
    params.view === "repuestos" && profile.role === "admin" ? getSupplierClaimsPage({ page: params.cp, closed: params.pc === "1" }) : Promise.resolve(null),
    params.view === "metricas" && profile.role === "admin" ? getWorkshopOperationalMetrics(metricsRange) : Promise.resolve(null)
  ]);
  const message = params.error
    ? { success: false, message: params.error }
    : rangeError ? { success: false, message: rangeError } : getStatusMessage(params.status);

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
      partsPage={partsPage}
      supplierClaimsPage={supplierClaimsPage}
      partsSearch={params.pq ?? ""}
      partsStatus={params.pf ?? "all"}
      supplierClaimsClosed={params.pc === "1"}
      operationalMetrics={operationalMetrics}
      metricsRange={metricsRange}
    />
  );
}
