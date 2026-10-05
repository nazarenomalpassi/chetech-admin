import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { TechnicianDashboard } from "@/features/dashboard/components/technician-dashboard";
import { getDashboardData } from "@/features/dashboard/queries";
import { getTechnicianDashboardData } from "@/features/dashboard/technician-queries";
import { getCurrentProfile } from "@/lib/auth";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { user, profile } = await getCurrentProfile();

  if (profile.role === "tecnico") {
    const technicianData = await getTechnicianDashboardData(user.id);
    return <TechnicianDashboard data={technicianData} technicianName={profile.full_name || "tecnico"} />;
  }

  const data = await getDashboardData({
    dateFrom: params.from,
    dateTo: params.to
  });

  return <DashboardOverview {...data} />;
}
