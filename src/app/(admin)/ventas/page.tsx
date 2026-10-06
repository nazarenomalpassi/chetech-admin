import { SalesList } from "@/features/sales/components/sales-list";
import { getSaleProductOptions, getSalesHistory } from "@/features/sales/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { parsePage } from "@/lib/pagination";

export default async function VentasPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; page?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("sales.manage");
  const [salesResult, products] = await Promise.all([getSalesHistory(parsePage(params.page)), getSaleProductOptions()]);
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <SalesList
      canManageHistory={profile.role === "admin"}
      actionStatus={params.status}
      message={message}
      pagination={salesResult.pagination}
      products={products}
      sales={salesResult.items}
    />
  );
}
