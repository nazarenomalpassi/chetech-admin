import { RepairsList } from "@/features/repairs/components/repairs-list";
import { getRepairs } from "@/features/repairs/queries";
import { getCurrentProfile } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function ReparacionesPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentProfile();
  const repairs = await getRepairs();
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return <RepairsList canDelete={profile.role === "admin"} message={message} repairs={repairs} />;
}
