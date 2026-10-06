import { CashView } from "@/features/cash/components/cash-view";
import { getCashData } from "@/features/cash/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function CajaPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const message = sp.error ? { success: false, message: sp.error } : getStatusMessage(sp.status);
  const profile = await requirePermission("cash.manage");
  const data = await getCashData();

  return <CashView canClose={profile.role === "admin"} data={data} message={message} />;
}
