import { ReplenishmentView } from "@/features/replenishment/components/replenishment-view";
import { getReplenishmentData } from "@/features/replenishment/queries";
import { requirePermission } from "@/lib/auth";

export default async function PedidosPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; search?: string; status?: string; error?: string }>;
}) {
  const params = await searchParams;
  await requirePermission("orders.manage");
  const data = await getReplenishmentData(params.month, params.search);
  const message = params.error
    ? { success: false, message: params.error }
    : params.status === "order_updated"
      ? { success: true, message: "Pedido actualizado. El stock no fue modificado." }
      : null;

  return <ReplenishmentView data={data} message={message} search={params.search ?? ""} />;
}
