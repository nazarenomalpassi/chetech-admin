import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { TechnicianDashboard } from "@/features/dashboard/components/technician-dashboard";
import { WorkshopTodaySection } from "@/features/dashboard/components/workshop-today-section";
import { getDashboardData } from "@/features/dashboard/queries";
import { getTechnicianDashboardData } from "@/features/dashboard/technician-queries";
import { getWorkshopToday } from "@/features/dashboard/workshop-today";
import { getWorkshopInbox } from "@/features/repairs-access/coordination-queries";
import { OperationalInboxSection } from "@/features/workshop-business/components/operational-inbox-section";
import { getCurrentProfile } from "@/lib/auth";

/** Si el estado del taller no responde, el inicio muestra el aviso en lugar de fallar entero. */
function readWorkshopToday() {
  return getWorkshopToday().catch((error: unknown) => {
    console.error("[inicio] estado del taller", error);
    return null;
  });
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { user, profile } = await getCurrentProfile();

  if (profile.role === "tecnico") {
    const [technicianData, inbox, today] = await Promise.all([
      getTechnicianDashboardData(user.id),
      getWorkshopInbox(),
      readWorkshopToday()
    ]);
    return (
      <TechnicianDashboard
        data={technicianData}
        technicianName={profile.full_name || "técnico"}
        workshopInbox={<OperationalInboxSection inbox={inbox} />}
        workshopToday={
          <WorkshopTodaySection
            canCreateOrder={false}
            today={today}
            visits={technicianData.visits}
          />
        }
      />
    );
  }

  const [data, inbox, today] = await Promise.all([
    getDashboardData({ dateFrom: params.from, dateTo: params.to }),
    getWorkshopInbox(),
    readWorkshopToday()
  ]);

  return (
    <DashboardOverview
      {...data}
      workshopInbox={<OperationalInboxSection inbox={inbox} />}
      workshopToday={
        <WorkshopTodaySection canCreateOrder today={today} visits={data.visitsDashboard} />
      }
    />
  );
}
