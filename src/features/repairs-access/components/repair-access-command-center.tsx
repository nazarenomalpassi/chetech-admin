import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { repairAccessLanes } from "@/features/repairs-access/components/repair-access-helpers";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";
import type { RepairAccessOrderRecord, RepairAccessSummary } from "@/features/repairs-access/queries";
import { formatCurrency, formatDate } from "@/lib/utils";

export function RepairAccessCommandCenter({
  orders,
  summary,
  onNavigate
}: {
  orders: RepairAccessOrderRecord[];
  summary: RepairAccessSummary;
  onNavigate: (section: string) => void;
}) {
  const readyOrders = orders.filter((order) => order.status === "listo_para_retirar").slice(0, 5);
  const waitingOrders = orders.filter((order) => order.status === "presupuestado").slice(0, 5);
  const delayedOrders = orders
    .filter((order) => !["retirado", "sin_solucion", "presupuestado_rechazado"].includes(order.status))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(15,118,110,0.13),transparent_32%),linear-gradient(135deg,#ffffff,#f7fbf9)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Centro de servicio</p>
              <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-slate-950">
                Reparaciones Access
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                Flujo paralelo para recepcion, mesa tecnica y administracion. Aca vemos donde esta cada equipo sin mezclar ingreso, diagnostico, presupuesto y cobro.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onNavigate("nueva")} type="button">Nueva orden</Button>
              <Button onClick={() => onNavigate("clientes")} type="button" variant="secondary">Buscar cliente</Button>
              <Button onClick={() => onNavigate("ordenes")} type="button" variant="secondary">Ver ordenes</Button>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Ingresadas hoy" value={summary.intakeToday} />
            <MetricCard label="Pendientes/revision" value={summary.pendingBudget} />
            <MetricCard label="Listas p/retiro" value={summary.readyToPickup} />
            <MetricCard label="Cobro informado" value={summary.paidOrders} />
          </div>
        </Card>

        <Card className="bg-slate-950 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Caja protegida</p>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{formatCurrency(summary.totalCollected)}</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Total informado en fichas Access. No impacta caja: la caja se mueve solo cuando facturas desde Reparaciones.
          </p>
          <div className="mt-5 rounded-2xl bg-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Proyectado</p>
            <p className="mt-1 text-xl font-semibold">{formatCurrency(summary.totalProjected)}</p>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {repairAccessLanes.map((lane) => {
          const total = lane.statuses.reduce((acc, status) => acc + (summary.statusCounts[status] ?? 0), 0);

          return (
            <Card className="p-5" key={lane.key}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{lane.title}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{total}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{lane.statuses.length} estados</span>
              </div>
              <p className="mt-3 min-h-10 text-sm leading-5 text-slate-500">{lane.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {lane.statuses.map((status) => (
                  <button
                    className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                    key={status}
                    onClick={() => onNavigate("ordenes")}
                    type="button"
                  >
                    {summary.statusCounts[status] ?? 0} {status.replaceAll("_", " ")}
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <AttentionList empty="No hay equipos listos para retirar." orders={readyOrders} title="Terminadas / listas para retirar" />
        <AttentionList empty="No hay presupuestos esperando respuesta." orders={waitingOrders} title="Presupuestadas sin decision" />
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Alertas de control</p>
              <h2 className="text-xl font-semibold text-slate-950">Trabajo pendiente</h2>
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    </div>
  );
}

function AttentionList({ title, orders, empty }: { title: string; orders: RepairAccessOrderRecord[]; empty: string }) {
  return (
    <Card>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 space-y-3">
        {orders.length ? orders.map((order) => <CompactOrder order={order} key={order.id} />) : <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">{empty}</p>}
      </div>
    </Card>
  );
}

function CompactOrder({ order }: { order: RepairAccessOrderRecord }) {
  const deviceLabel = [order.device.deviceType, order.device.brand, order.device.model].filter(Boolean).join(" ");

  return (
    <div className="rounded-2xl border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{order.customer.fullName}</p>
          <p className="mt-1 text-xs text-slate-500">{deviceLabel || "Equipo"} - {formatDate(order.intakeDate)}</p>
        </div>
        <RepairAccessStatusBadge status={order.status} />
      </div>
    </div>
  );
}

function AlertRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-950">{value}</span>
    </div>
  );
}
