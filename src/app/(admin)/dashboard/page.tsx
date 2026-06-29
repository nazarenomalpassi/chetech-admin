import { DashboardOverview } from "@/features/dashboard/components/dashboard-overview";
import { getDashboardData } from "@/features/dashboard/queries";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  await requireUser();
  const data = await getDashboardData({
    dateFrom: params.from,
    dateTo: params.to
  });

  return <DashboardOverview {...data} />;
}
