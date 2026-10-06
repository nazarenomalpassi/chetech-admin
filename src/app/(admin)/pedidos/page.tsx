import { ReplenishmentView } from "@/features/replenishment/components/replenishment-view";
import { getReplenishmentData } from "@/features/replenishment/queries";
import { requirePermission } from "@/lib/auth";
import { getRepairPartsInbox } from "@/features/repairs-access/coordination-queries";
import { PartsInbox } from "@/features/repairs-access/components/parts-inbox";

export default async function PedidosPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; search?: string; status?: string; error?: string }>;
}) {
  const params = await searchParams;
  await requirePermission("orders.manage");
  const [data, parts] = await Promise.all([getReplenishmentData(params.month, params.search), getRepairPartsInbox()]);
  const message = params.error
    ? { success: false, message: params.error }
    : params.status === "order_updated"
      ? { success: true, message: "Pedido actualizado. El stock no fue modificado." }
      : null;

  return <div className="space-y-5"><PartsInbox items={parts} /><ReplenishmentView data={data} message={message} search={params.search ?? ""} /></div>;
}
