import { VisitsView } from "@/features/visits/components/visits-view";
import { getVisitsData } from "@/features/visits/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function VisitasPage({
  searchParams
}: {
  searchParams: Promise<{
    status?: string;
    error?: string;
    search?: string;
    date?: string;
    visitStatus?: string;
  }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("visits.view");
  const data = await getVisitsData({
    search: params.search,
    status: params.visitStatus,
    date: params.date
  });
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return (
    <VisitsView
      canDelete={profile.role === "admin"}
      canManage={profile.role === "admin"}
      data={data}
      message={message}
    />
  );
}
