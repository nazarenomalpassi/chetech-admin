import { RepairsList } from "@/features/repairs/components/repairs-list";
import { getRepairs } from "@/features/repairs/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";
import { parsePage } from "@/lib/pagination";
import { z } from "zod";

export default async function ReparacionesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string; page?: string; rep?: string; edit?: string; search?: string; receipt?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("repairs.manage");
  const receipt = z.string().uuid().safeParse(params.receipt);
  const repairsResult = await getRepairs(parsePage(params.page), params.rep, params.edit, params.search ?? "");
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <RepairsList
      key={`${params.rep ?? ""}:${repairsResult.collectionTarget?.repair?.id ?? ""}:${repairsResult.collectionTarget?.repair?.financialVersion ?? ""}:${receipt.success ? receipt.data : ""}`}
      collectionTarget={repairsResult.collectionTarget}
      canDelete={profile.role === "admin"}
      searchQuery={params.search ?? ""}
      draftOwnerId={profile.id}
      message={message}
      pagination={repairsResult.pagination}
      repairs={repairsResult.items}
    />
  );
}
