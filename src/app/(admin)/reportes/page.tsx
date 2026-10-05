import { ReportsView } from "@/features/reports/components/reports-view";
import { getReportsData } from "@/features/reports/queries";
import { requirePermission } from "@/lib/auth";

export default async function ReportesPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("reports.manage");
  const data = await getReportsData(params.from, params.to);

  return <ReportsView canExport={profile.role === "admin"} data={data} />;
}
