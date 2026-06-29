import { SalariesView } from "@/features/salaries/components/salaries-view";
import { getSalaryWithdrawalsData } from "@/features/salaries/queries";
import { getCurrentProfile } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function SueldosPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getCurrentProfile();
  const data = await getSalaryWithdrawalsData();
  const message = params.error
    ? { success: false, message: params.error }
    : getStatusMessage(params.status);

  return <SalariesView canManage={profile.role === "admin"} data={data} message={message} />;
}
