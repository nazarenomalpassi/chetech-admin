"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { MapPin, PackageCheck, Search, Truck, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import {
  cancelRepairOutsourcingAction,
  markRepairOutsourcingRetrievedAction,
  saveRepairOutsourcingAction
} from "@/features/outsourcings/actions";
import {
  getRepairOutsourcingStatusLabel,
  getRepairOutsourcingStatusTone
} from "@/features/outsourcings/helpers";
import type { RepairOutsourcingRecord, RepairOutsourcingSummary } from "@/features/outsourcings/queries";
import type { ActionResult } from "@/lib/form-state";
import { formatDate, getLocalDateInputValue } from "@/lib/utils";

type LookupOrder = {
  id: string;
  repairNumber: string;
  status: string;
  intakeDate: string;
  customerName: string;
  customerPhone: string;
  customerDni: string;
  customerAddress: string;
  device: string;
  issueDescription: string;
  observations: string;
};

export function RepairOutsourcingsView({
  records,
  summary,
  message
}: {
  records: RepairOutsourcingRecord[];
  summary: RepairOutsourcingSummary;
  message: ActionResult | null;
}) {
  const today = getLocalDateInputValue();
  const [orderNumber, setOrderNumber] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<LookupOrder | null>(null);
  const [sentAt, setSentAt] = useState(today);
  const [workshopName, setWorkshopName] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("en_taller");
  const [lookupStatus, setLookupStatus] = useState<{ loading: boolean; message: string; success: boolean }>({
    loading: false,
    message: "",
    success: false
  });

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      const matchesStatus = statusFilter === "todos" || record.status === statusFilter;
      if (!matchesStatus) return false;
      if (!query) return true;

      const haystack = [
        record.order.repairNumber,
        record.order.customerName,
        record.order.customerPhone,
        record.order.customerDni,
        record.order.deviceLabel,
        record.order.serialNumber,
        record.order.issueReported,
        record.workshopName,
        record.notes,
        getRepairOutsourcingStatusLabel(record.status)
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [records, search, statusFilter]);

  function resetForm() {
    setOrderNumber("");
    setSelectedOrder(null);
    setSentAt(today);
    setWorkshopName("");
    setNotes("");
    setLookupStatus({ loading: false, message: "", success: false });
  }

  async function loadRepairOrder() {
    const requestedNumber = orderNumber.trim();

    if (!requestedNumber) {
      setLookupStatus({ loading: false, message: "Ingresa un numero de orden REP.", success: false });
      return;
    }

    setLookupStatus({ loading: true, message: "Buscando orden de reparacion...", success: false });

    try {
      const response = await fetch(`/api/repair-access/orders/${encodeURIComponent(requestedNumber)}`, {
        headers: { accept: "application/json" }
      });
      const result = await response.json();

      if (!response.ok || !result.order) {
        setSelectedOrder(null);
        setLookupStatus({ loading: false, message: "No encontre una orden de Reparaciones con ese numero.", success: false });
        return;
      }

      setSelectedOrder(result.order as LookupOrder);
      setOrderNumber(result.order.repairNumber);
      setLookupStatus({
        loading: false,
        message: `Orden ${result.order.repairNumber} cargada. Ahora indica a que taller se llevo.`,
        success: true
      });
    } catch {
      setSelectedOrder(null);
      setLookupStatus({ loading: false, message: "No pude consultar la orden. Proba de nuevo.", success: false });
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[34px] p-5 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="panel-kicker">Control externo</p>
            <h1 className="panel-heading mt-3">Terciarizaciones</h1>
            <p className="panel-subheading mt-3">
              Registra las ordenes de reparacion que se llevan a talleres externos y controla donde esta cada equipo.
              Esta seccion no impacta caja ni pagos.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[34rem]">
            <MetricCard icon={<Truck className="h-4 w-4" />} label="En talleres externos" value={summary.active} />
            <MetricCard icon={<PackageCheck className="h-4 w-4" />} label="Buscadas" value={summary.retrieved} />
            <MetricCard icon={<MapPin className="h-4 w-4" />} label="Talleres" value={summary.workshops} />
            <MetricCard icon={<Undo2 className="h-4 w-4" />} label="Llevadas hoy" value={summary.sentToday} />
          </div>
        </div>

        {message ? (
          <div className={message.success ? "status-banner status-banner--success mt-5" : "status-banner status-banner--error mt-5"}>
            {message.message}
          </div>
        ) : null}

        <form action={saveRepairOutsourcingAction} className="mt-6 space-y-4">
          <input name="repairAccessOrderId" type="hidden" value={selectedOrder?.id ?? ""} />

          <div className="rounded-[30px] border border-brand-100 bg-brand-50/70 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Llamar orden de Reparaciones
                </span>
                <Input
                  onChange={(event) => setOrderNumber(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void loadRepairOrder();
                    }
                  }}
                  placeholder="REP-000266 o 266"
                  value={orderNumber}
                />
              </label>
              <Button disabled={lookupStatus.loading} onClick={() => void loadRepairOrder()} type="button">
                {lookupStatus.loading ? "Buscando..." : "Cargar orden"}
              </Button>
            </div>
            {lookupStatus.message ? (
              <p className={`mt-3 rounded-[22px] px-4 py-3 text-sm ${lookupStatus.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {lookupStatus.message}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Al cargar una REP se trae cliente, telefono, equipo y falla para evitar escribir datos duplicados.
              </p>
            )}
          </div>

          {selectedOrder ? (
            <div className="grid gap-3 rounded-[30px] border border-graphite/8 bg-white/82 p-4 lg:grid-cols-4">
              <InfoBlock label="Orden" value={selectedOrder.repairNumber} />
              <InfoBlock label="Cliente" value={selectedOrder.customerName} helper={selectedOrder.customerPhone || selectedOrder.customerDni} />
              <InfoBlock label="Equipo" value={selectedOrder.device || "Equipo"} helper={selectedOrder.issueDescription} />
              <InfoBlock label="Ingreso" value={formatDate(selectedOrder.intakeDate)} helper={selectedOrder.status.replaceAll("_", " ")} />
            </div>
          ) : null}

          <div className="grid gap-4 rounded-[30px] border border-graphite/8 bg-white/82 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Lugar donde se llevo
              </label>
              <Input
                name="workshopName"
                onChange={(event) => setWorkshopName(event.target.value)}
                placeholder="Ej: Taller Roberto, Servicio Philips..."
                value={workshopName}
              />
            </div>
            <div>
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Fecha
              </label>
              <Input name="sentAt" onChange={(event) => setSentAt(event.target.value)} type="date" value={sentAt} />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Observaciones
              </label>
              <textarea
                className="min-h-24 w-full rounded-[22px] border border-graphite/10 bg-white/90 px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
                name="notes"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Que se llevo, quien lo recibio, repuestos o indicaciones..."
                value={notes}
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {selectedOrder || workshopName || notes ? (
              <Button onClick={resetForm} type="button" variant="secondary">
                Limpiar
              </Button>
            ) : null}
            <FormSubmitButton idleLabel="Guardar terciarizacion" pendingLabel="Guardando..." />
          </div>
        </form>
      </Card>

      <div className="table-shell">
        <div className="border-b border-graphite/8 bg-brand-50/80 px-4 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-lg">
              <label className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Buscar terciarizacion
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-10"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="REP, cliente, equipo, serie o taller..."
                  value={search}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "en_taller", label: "En taller" },
                { value: "retirado", label: "Buscadas" },
                { value: "cancelado", label: "Anuladas" },
                { value: "todos", label: "Todas" }
              ].map((option) => (
                <button
                  className={`rounded-[18px] px-4 py-2 text-sm font-semibold transition ${statusFilter === option.value ? "bg-graphite text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-3 lg:hidden">
          {filteredRecords.length ? (
            filteredRecords.map((record) => (
              <article className="rounded-[24px] border border-graphite/8 bg-white/86 p-4 shadow-[0_10px_20px_rgba(20,20,19,0.04)]" key={record.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-brand-700">{record.order.repairNumber}</p>
                  <p className="mt-1 font-medium text-slate-950">{record.order.customerName}</p>
                  <p className="mt-1 text-xs text-slate-500">{record.order.customerPhone || record.order.customerDni || "-"}</p>
                </div>
                <StatusPill status={record.status} />
              </div>
              <div className="mt-4 rounded-[18px] bg-brand-50 px-3 py-2.5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Equipo / falla</p>
                <p className="mt-1 font-semibold text-slate-800">{record.order.deviceLabel}</p>
                {record.order.serialNumber ? <p className="mt-1 text-xs text-slate-500">Serie: {record.order.serialNumber}</p> : null}
                <p className="mt-1 text-xs leading-5 text-slate-500">{record.order.issueReported}</p>
              </div>
              <div className="mt-3 rounded-[18px] bg-brand-50 px-3 py-2.5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">Lugar</p>
                <p className="mt-1 font-semibold text-slate-950">{record.workshopName}</p>
                {record.notes ? <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{record.notes}</p> : null}
              </div>
                <p className="mt-3 text-xs text-slate-500">
                  Llevado: {formatDate(record.sentAt)} - Buscado: {record.retrievedAt ? formatDate(record.retrievedAt) : "-"}
                </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {record.status === "en_taller" ? (
                  <form action={markRepairOutsourcingRetrievedAction}>
                    <input name="id" type="hidden" value={record.id} />
                    <input name="retrievedAt" type="hidden" value={today} />
                    <Button className="w-full" type="submit">
                      Marcar buscado
                    </Button>
                  </form>
                ) : null}
                {record.status === "en_taller" ? (
                  <form
                    action={cancelRepairOutsourcingAction}
                    onSubmit={(event) => {
                      if (!window.confirm(`Anular la terciarizacion de ${record.order.repairNumber}?`)) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input name="id" type="hidden" value={record.id} />
                    <Button className="w-full" type="submit" variant="danger">
                      Anular
                    </Button>
                  </form>
                ) : null}
              </div>
              </article>
            ))
          ) : (
            <div className="empty-panel">
              No encontre terciarizaciones para esa busqueda o filtro.
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full text-sm">
            <thead className="bg-white/80 text-left text-slate-500">
              <tr>
                <th className="px-4 py-4 font-medium">Orden</th>
                <th className="px-4 py-4 font-medium">Cliente</th>
                <th className="px-4 py-4 font-medium">Equipo / falla</th>
                <th className="px-4 py-4 font-medium">Lugar</th>
                <th className="px-4 py-4 font-medium">Fechas</th>
                <th className="px-4 py-4 font-medium">Estado</th>
                <th className="px-4 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr className="border-t border-graphite/8 bg-white/72 align-top transition duration-200 hover:bg-white" key={record.id}>
                  <td className="px-4 py-4 font-semibold text-brand-700">{record.order.repairNumber}</td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-950">{record.order.customerName}</p>
                    <p className="text-xs text-slate-500">{record.order.customerPhone || record.order.customerDni || "-"}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <p className="font-medium text-slate-800">{record.order.deviceLabel}</p>
                    {record.order.serialNumber ? <p className="mt-1 text-xs text-slate-400">Serie: {record.order.serialNumber}</p> : null}
                    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{record.order.issueReported}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-950">{record.workshopName}</p>
                    {record.notes ? <p className="mt-1 max-w-xs whitespace-pre-line text-xs leading-5 text-slate-500">{record.notes}</p> : null}
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    <p>Llevado: {formatDate(record.sentAt)}</p>
                    <p className="mt-1 text-xs text-slate-500">Buscado: {record.retrievedAt ? formatDate(record.retrievedAt) : "-"}</p>
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill status={record.status} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap justify-end gap-2">
                      {record.status === "en_taller" ? (
                        <form action={markRepairOutsourcingRetrievedAction}>
                          <input name="id" type="hidden" value={record.id} />
                          <input name="retrievedAt" type="hidden" value={today} />
                          <Button size="sm" type="submit">
                            Marcar buscado
                          </Button>
                        </form>
                      ) : null}
                      {record.status === "en_taller" ? (
                        <form
                          action={cancelRepairOutsourcingAction}
                          onSubmit={(event) => {
                            if (!window.confirm(`Anular la terciarizacion de ${record.order.repairNumber}?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input name="id" type="hidden" value={record.id} />
                          <Button size="sm" type="submit" variant="danger">
                            Anular
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRecords.length ? (
            <div className="empty-panel border-t border-graphite/8">
              No encontre terciarizaciones para esa busqueda o filtro.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="metric-tile min-h-[unset] p-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-[16px] border border-graphite/8 bg-brand-100 text-graphite">
          {icon}
        </span>
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-[24px] bg-slate-50 px-4 py-3">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value || "-"}</p>
      {helper ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = getRepairOutsourcingStatusTone(status);
  const classes = {
    default: "bg-slate-100 text-slate-700",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-700"
  }[tone];

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${classes}`}>
      {getRepairOutsourcingStatusLabel(status)}
    </span>
  );
}
