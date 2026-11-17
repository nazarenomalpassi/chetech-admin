import { ArrowRight, ClipboardList, PackageCheck, UserRoundCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import {
  getRepairAccessStatusLabel,
  repairAccessLanes
} from "@/features/repairs-access/components/repair-access-helpers";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import type {
  RepairAccessOrderRecord,
  RepairAccessSummary
} from "@/features/repairs-access/queries";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RepairAccessCommandCenter({
  orders,
  summary,
  onNavigate,
  onOpenStatus,
  onOpenDetail
}: {
  orders: RepairAccessOrderRecord[];
  summary: RepairAccessSummary;
  onNavigate: (section: string) => void;
  onOpenStatus: (status: string) => void;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
}) {
  const readyOrders = orders.filter((order) => order.status === "listo_para_retirar").slice(0, 5);
  const waitingOrders = orders.filter((order) => order.status === "presupuestado").slice(0, 5);
  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Resumen del taller</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Selecciona un estado para continuar el trabajo.
              </p>
            </div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button
                className="w-full sm:w-auto"
                onClick={() => onNavigate("nueva")}
                type="button"
              >
                Nueva orden
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => onNavigate("clientes")}
                type="button"
                variant="secondary"
              >
                Buscar cliente
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => onNavigate("ordenes")}
                type="button"
                variant="secondary"
              >
                Ver ordenes
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <MetricCard
              icon={ClipboardList}
              label="Ingresadas hoy"
              tone="income"
              value={summary.intakeToday}
            />
            <MetricCard
              icon={Wrench}
              label="Pendientes / revision"
              tone="warning"
              value={summary.pendingBudget}
            />
            <MetricCard
              icon={PackageCheck}
              label="Listas para retirar"
              tone="success"
              value={summary.readyToPickup}
            />
            <MetricCard icon={UserRoundCheck} label="Cobro informado" value={summary.paidOrders} />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-foreground">Cobros informados</h2>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatCurrency(summary.totalCollected)}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Los cobros reales se registran en Cobros de reparaciones. Presupuestar o emitir
            documentos no modifica caja ni registra una entrega.
          </p>
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">Proyectado</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatCurrency(summary.totalProjected)}
            </p>
          </div>
        </Card>
      </section>

      <section aria-label="Etapas del taller" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {repairAccessLanes.map((lane) => {
          const total = lane.statuses.reduce(
            (acc, status) => acc + (summary.statusCounts[status] ?? 0),
            0
          );

          return (
            <Card key={lane.key}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-body">{lane.title}</h2>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{total}</p>
                </div>
              </div>
              <p className="mt-3 min-h-10 text-sm leading-5 text-muted-foreground">
                {lane.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {lane.statuses.map((status) => (
                  <button
                    className="min-h-11 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium text-body transition-colors hover:border-border-strong hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden"
                    key={status}
                    onClick={() => onOpenStatus(status)}
                    type="button"
                  >
                    {summary.statusCounts[status] ?? 0} {getRepairAccessStatusLabel(status)}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <AttentionList
          empty={
            summary.readyToPickup
              ? `Hay ${summary.readyToPickup} equipos listos fuera de esta vista previa. Abri Ver todas.`
              : "No hay equipos listos para retirar."
          }
          onOpenDetail={onOpenDetail}
          onViewAll={() => onOpenStatus("listo_para_retirar")}
          orders={readyOrders}
          title="Listas para retirar"
        />
        <AttentionList
          empty={
            summary.waitingCustomer
              ? `Hay ${summary.waitingCustomer} presupuestos fuera de esta vista previa. Abri Ver todas.`
              : "No hay presupuestos esperando respuesta."
          }
          onOpenDetail={onOpenDetail}
          onViewAll={() => onOpenStatus("presupuestado")}
          orders={waitingOrders}
          title="Esperando al cliente"
        />
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Trabajo pendiente</h2>
            </div>
            <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
              {summary.delayedOrders} demoradas
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <AlertRow label="Presupuestadas" value={summary.waitingCustomer} />
            <AlertRow label="Garantías vigentes" value={summary.activeWarranties} />
            <AlertRow label="Entregadas hoy" value={summary.deliveredToday} />
            <AlertRow label="Clientes importados" value={summary.totalCustomers} />
          </div>
          <Button
            className="mt-5 w-full"
            onClick={() => onNavigate("consultas")}
            type="button"
            variant="secondary"
          >
            Ir a consultas
          </Button>
        </Card>
      </section>
    </div>
  );
}

function AttentionList({
  title,
  orders,
  empty,
  onOpenDetail,
  onViewAll
}: {
  title: string;
  orders: RepairAccessOrderRecord[];
  empty: string;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
  onViewAll: () => void;
}) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-3">
        {orders.length ? (
          orders.map((order) => (
            <CompactOrder onOpenDetail={onOpenDetail} order={order} key={order.id} />
          ))
        ) : (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
      <Button className="mt-4 w-full" onClick={onViewAll} type="button" variant="secondary">
        Ver todas <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Button>
    </Card>
  );
}

function CompactOrder({
  order,
  onOpenDetail
}: {
  order: RepairAccessOrderRecord;
  onOpenDetail: (order: RepairAccessOrderRecord) => void;
}) {
  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className="w-full rounded-xl border border-border p-4 text-left transition-colors hover:border-border-strong hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-hidden"
      onClick={() => onOpenDetail(order)}
      type="button"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-sm font-semibold wrap-anywhere wrap-break-word text-foreground">
            {order.repairNumber}
          </p>
          <p className="font-semibold text-foreground">{order.customer.fullName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {deviceLabel || "Equipo"} - {formatDate(order.intakeDate)}
          </p>
        </div>
        <div className="shrink-0">
          <RepairAccessStatusBadge status={order.status} />
        </div>
      </div>
    </button>
  );
}

function AlertRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}
