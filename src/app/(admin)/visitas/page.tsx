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
    view?: string;
    technicianId?: string;
    visitStatus?: string;
    page?: string;
    savedDraftToken?: string;
    savedDraftVisitId?: string;
  }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("visits.view");
  const data = await getVisitsData({
    search: params.search,
    status: params.visitStatus,
    date: params.date,
    view: ["day", "week"].includes(params.view ?? "") ? params.view : "all",
    technicianId: params.technicianId,
    page: params.page
  });
  const message = params.error
    ? { success: false, message: params.error }
    : params.status === "visit_cancelled" ? { success: true, message: "Visita cancelada; historial conservado." }
    : params.status === "visit_already_created" ? { success: true, message: "La visita ya se guardo en el primer intento. No se duplico: revisa el registro antes de editar sus datos." }
    : getStatusMessage(params.status);

  return (
    <VisitsView
      canDelete={profile.role === "admin"}
      canManage={profile.role === "admin"}
      draftOwnerId={profile.id}
      savedDraftToken={params.savedDraftToken}
      savedDraftVisitId={params.savedDraftVisitId}
      data={data}
      message={message}
    />
  );
}
