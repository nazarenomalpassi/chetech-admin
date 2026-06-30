import { BalanceTransfersView } from "@/features/balance-transfers/components/balance-transfers-view";
import { getBalanceTransfersData } from "@/features/balance-transfers/queries";
import { requireUser } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function CambioBalancePage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  await requireUser();
  const data = await getBalanceTransfersData();
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return <BalanceTransfersView message={message} summary={data.summary} transfers={data.transfers} />;
}
