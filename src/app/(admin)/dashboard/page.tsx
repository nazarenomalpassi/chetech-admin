import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { TechnicianDashboard } from "@/features/dashboard/components/technician-dashboard";
import { getDashboardData } from "@/features/dashboard/queries";
import { getTechnicianDashboardData } from "@/features/dashboard/technician-queries";
import { getWorkshopInbox } from "@/features/repairs-access/coordination-queries";
import { OperationalInboxSection } from "@/features/workshop-business/components/operational-inbox-section";
import { getCurrentProfile } from "@/lib/auth";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { user, profile } = await getCurrentProfile();

  if (profile.role === "tecnico") {
    const [technicianData, inbox] = await Promise.all([getTechnicianDashboardData(user.id), getWorkshopInbox()]);
    return <TechnicianDashboard data={technicianData} technicianName={profile.full_name || "tecnico"}
      workshopInbox={<OperationalInboxSection inbox={inbox} />} />;
  }

  const [data, inbox] = await Promise.all([
    getDashboardData({ dateFrom: params.from, dateTo: params.to }),
    getWorkshopInbox()
  ]);

  return <DashboardOverview {...data} workshopInbox={<OperationalInboxSection inbox={inbox} />} />;
}
