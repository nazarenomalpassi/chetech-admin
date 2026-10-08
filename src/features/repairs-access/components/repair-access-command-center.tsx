import { ArrowRight, ClipboardList, PackageCheck, UserRoundCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { getRepairAccessStatusLabel, repairAccessLanes } from "@/features/repairs-access/components/repair-access-helpers";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import type { RepairAccessOrderRecord, RepairAccessSummary } from "@/features/repairs-access/queries";
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
              <h1 className="text-xl font-semibold text-slate-950">
                Resumen del taller
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Selecciona un estado para continuar el trabajo.
              </p>
            </div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <Button className="w-full sm:w-auto" onClick={() => onNavigate("nueva")} type="button">Nueva orden</Button>
              <Button className="w-full sm:w-auto" onClick={() => onNavigate("clientes")} type="button" variant="secondary">Buscar cliente</Button>
              <Button className="w-full sm:w-auto" onClick={() => onNavigate("ordenes")} type="button" variant="secondary">Ver ordenes</Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <MetricCard icon={ClipboardList} label="Ingresadas hoy" tone="income" value={summary.intakeToday} />
            <MetricCard icon={Wrench} label="Pendientes / revision" tone="warning" value={summary.pendingBudget} />
            <MetricCard icon={PackageCheck} label="Listas para retirar" tone="success" value={summary.readyToPickup} />
            <MetricCard icon={UserRoundCheck} label="Cobro informado" value={summary.paidOrders} />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-950">Cobros informados</h2>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCurrency(summary.totalCollected)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Los cobros reales se registran en Pagos de reparaciones. Presupuestar o emitir documentos no modifica caja ni registra una entrega.
          </p>
          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="text-sm text-slate-500">Proyectado</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{formatCurrency(summary.totalProjected)}</p>
          </div>
        </Card>
      </section>

      <section aria-label="Etapas del taller" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {repairAccessLanes.map((lane) => {
          const total = lane.statuses.reduce((acc, status) => acc + (summary.statusCounts[status] ?? 0), 0);

          return (
            <Card key={lane.key}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-700">{lane.title}</h2>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{total}</p>
                </div>
              </div>
              <p className="mt-3 min-h-10 text-sm leading-5 text-slate-500">{lane.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {lane.statuses.map((status) => (
                  <button
                    className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:border-graphite/30 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40"
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
        <AttentionList empty={summary.readyToPickup ? `Hay ${summary.readyToPickup} equipos listos fuera de esta vista previa. Abri Ver todas.` : "No hay equipos listos para retirar."} onOpenDetail={onOpenDetail} onViewAll={() => onOpenStatus("listo_para_retirar")} orders={readyOrders} title="Listas para retirar" />
        <AttentionList empty={summary.waitingCustomer ? `Hay ${summary.waitingCustomer} presupuestos fuera de esta vista previa. Abri Ver todas.` : "No hay presupuestos esperando respuesta."} onOpenDetail={onOpenDetail} onViewAll={() => onOpenStatus("presupuestado")} orders={waitingOrders} title="Esperando al cliente" />
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Trabajo pendiente</h2>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{summary.delayedOrders} demoradas</span>
          </div>
          <div className="mt-4 space-y-3">
            <AlertRow label="Presupuestadas" value={summary.waitingCustomer} />
            <AlertRow label="Garantias vigentes" value={summary.activeWarranties} />
            <AlertRow label="Entregadas hoy" value={summary.deliveredToday} />
            <AlertRow label="Clientes importados" value={summary.totalCustomers} />
          </div>
          <Button className="mt-5 w-full" onClick={() => onNavigate("consultas")} type="button" variant="secondary">
            Ir a consultas
          </Button>
        </Card>
      </section>
    </div>
  );
}

function AttentionList({ title, orders, empty, onOpenDetail, onViewAll }: { title: string; orders: RepairAccessOrderRecord[]; empty: string; onOpenDetail: (order: RepairAccessOrderRecord) => void; onViewAll: () => void }) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-3">
        {orders.length ? orders.map((order) => <CompactOrder onOpenDetail={onOpenDetail} order={order} key={order.id} />) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>}
      </div>
      <Button className="mt-4 w-full" onClick={onViewAll} type="button" variant="secondary">Ver todas <ArrowRight aria-hidden="true" className="h-4 w-4" /></Button>
    </Card>
  );
}

function CompactOrder({ order, onOpenDetail }: { order: RepairAccessOrderRecord; onOpenDetail: (order: RepairAccessOrderRecord) => void }) {
  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" ");

  return (
    <button className="w-full rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-graphite/30 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40" onClick={() => onOpenDetail(order)} type="button">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 break-words text-sm font-semibold text-slate-950 [overflow-wrap:anywhere]">{order.repairNumber}</p>
          <p className="font-semibold text-slate-950">{order.customer.fullName}</p>
          <p className="mt-1 text-xs text-slate-500">{deviceLabel || "Equipo"} - {formatDate(order.intakeDate)}</p>
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
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-950">{value}</span>
    </div>
  );
}
