import { RepairsList } from "@/features/repairs/components/repairs-list";
import { getRepairs } from "@/features/repairs/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { parsePage } from "@/lib/pagination";

export default async function ReparacionesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; page?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("repairs.manage");
  const repairsResult = await getRepairs(parsePage(params.page));
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <RepairsList
      canDelete={profile.role === "admin"}
      message={message}
      pagination={repairsResult.pagination}
      repairs={repairsResult.items}
    />
  );
}
