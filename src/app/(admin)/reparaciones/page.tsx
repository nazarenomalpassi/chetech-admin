import { RepairsList } from "@/features/repairs/components/repairs-list";
import { getRepairs } from "@/features/repairs/queries";
import { getStatusMessage } from "@/lib/form-state";

export default async function ReparacionesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const repairs = await getRepairs();
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return <RepairsList message={message} repairs={repairs} />;
}
