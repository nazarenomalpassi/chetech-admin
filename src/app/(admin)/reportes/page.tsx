import { ReportsView } from "@/features/reports/components/reports-view";
import { getReportsData } from "@/features/reports/queries";
import { WorkshopBusinessReportView } from "@/features/workshop-business/components/workshop-business-report";
import { getWorkshopBusinessReport } from "@/features/workshop-business/queries";
import { requirePermission } from "@/lib/auth";

export default async function ReportesPage({
  searchParams
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("reports.manage");
  const [data, workshop] = await Promise.all([
    getReportsData(params.from, params.to),
    getWorkshopBusinessReport(params.from, params.to)
  ]);

  return <div className="space-y-8">
    <WorkshopBusinessReportView data={workshop} />
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Otros reportes por fecha de movimiento. Sus resumenes historicos no equivalen a la cohorte REP de ingreso ni al responsable actual.</p>
      <ReportsView canExport={profile.role === "admin"} data={data} />
    </div>
  </div>;
}
