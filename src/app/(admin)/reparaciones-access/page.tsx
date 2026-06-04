import { RepairsAccessView } from "@/features/repairs-access/components/repairs-access-view";
import { getRepairsAccessDashboard } from "@/features/repairs-access/queries";
import { getStatusMessage } from "@/lib/form-state";

export default async function ReparacionesAccessPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; order?: string }>;
}) {
  const params = await searchParams;
  const { orders, customers, latestImport, summary } = await getRepairsAccessDashboard();
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <RepairsAccessView
      customers={customers}
      initialOrderId={params.order}
      latestImport={latestImport}
      message={message}
      orders={orders}
      summary={summary}
    />
  );
}
