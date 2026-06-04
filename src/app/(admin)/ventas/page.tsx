import { SalesList } from "@/features/sales/components/sales-list";
import { getSaleProductOptions, getSalesHistory } from "@/features/sales/queries";
import { getCurrentProfile } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function VentasPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const [{ profile }, sales, products] = await Promise.all([
    getCurrentProfile(),
    getSalesHistory(),
    getSaleProductOptions()
  ]);
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return <SalesList canManageHistory={profile.role === "admin"} message={message} products={products} sales={sales} />;
}
