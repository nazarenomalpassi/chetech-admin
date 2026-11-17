import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getRepairAccessStatusLabel,
  getRepairAccessStatusTone
} from "@/features/repairs-access/components/repair-access-helpers";
import { cn } from "@/lib/utils";

type TechnicianDashboardProps = {
  technicianName: string;
  workshopToday?: ReactNode;
  workshopInbox?: ReactNode;
  data: Awaited<
    ReturnType<typeof import("@/features/dashboard/technician-queries").getTechnicianDashboardData>
  >;
};

export function TechnicianDashboard({
  technicianName,
  data,
  workshopToday,
  workshopInbox
}: TechnicianDashboardProps) {
  const { assigned } = data.summary;

  return (
    <div className="space-y-8">
      {workshopToday}

      {workshopInbox}

      <section aria-labelledby="tu-trabajo" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground" id="tu-trabajo">
              Tu trabajo, {technicianName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {assigned === 1 ? "1 orden asignada a vos." : `${assigned} órdenes asignadas a vos.`}
            </p>
          </div>
          <Link
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            href="/reparaciones-access?view=ordenes&scope=mine"
          >
            Ver mis órdenes
          </Link>
        </div>

        <Card className="p-0 sm:p-0">
          {data.recentOrders.length ? (
            <ul className="divide-y divide-border">
              {data.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted sm:flex-row sm:items-start sm:justify-between sm:px-5"
                    href={`/reparaciones-access?view=ordenes&order=${order.id}`}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium text-foreground">
                        {order.repairNumber}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {order.customerName}. {order.device}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {order.issueReported}
                      </p>
                    </div>
                    <Badge variant={getRepairAccessStatusTone(order.status)}>
                      {getRepairAccessStatusLabel(order.status)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
              No hay órdenes activas para mostrar.
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}
