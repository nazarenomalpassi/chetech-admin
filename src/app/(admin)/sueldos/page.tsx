import { SalariesView } from "@/features/salaries/components/salaries-view";
import { getSalaryPlanningData } from "@/features/salaries/queries";
import { requirePermission } from "@/lib/auth";
import { getStatusMessage } from "@/lib/form-state";

export default async function SueldosPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("salaries.manage");
  const data = await getSalaryPlanningData(params.month);
  const message = params.error
    ? { success: false, message: params.error }
    : params.status === "salary_liquidated"
      ? { success: true, message: "Liquidacion confirmada e impactada una sola vez en caja." }
      : params.status === "salary_config_updated"
        ? { success: true, message: "Objetivos y reservas actualizados." }
        : getStatusMessage(params.status);

  return <SalariesView canManage={profile.role === "admin"} data={data} message={message} />;
}
