"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OperationsPagination } from "@/features/visits/components/operations-pagination";
import type { PaginationMeta } from "@/lib/pagination";
import { OutsourcingOperations } from "@/features/outsourcings/components/outsourcing-operations";
import {
  cancelRepairOutsourcingAction,
  saveRepairOutsourcingAction
} from "@/features/outsourcings/actions";
import {
  getRepairOutsourcingStatusLabel,
  getRepairOutsourcingStatusTone
} from "@/features/outsourcings/helpers";
import type {
  RepairOutsourcingRecord,
  RepairOutsourcingSummary
} from "@/features/outsourcings/queries";
import type { ActionResult } from "@/lib/form-state";
import { formatDate, getLocalDateInputValue } from "@/lib/utils";
import { confirmSubmit } from "@/components/ui/confirm-dialog";

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
  filters,
  pagination,
  message
}: {
  records: RepairOutsourcingRecord[];
  summary: RepairOutsourcingSummary;
  filters: { search: string; status: string; date: string; view: string };
  pagination: PaginationMeta;
  message: ActionResult | null;
}) {
  const today = getLocalDateInputValue();
  const [orderNumber, setOrderNumber] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<LookupOrder | null>(null);
  const [sentAt, setSentAt] = useState(today);
  const [workshopName, setWorkshopName] = useState("");
  const [notes, setNotes] = useState("");
  const [lookupStatus, setLookupStatus] = useState<{
    loading: boolean;
    message: string;
    success: boolean;
  }>({
    loading: false,
    message: "",
    success: false
  });

  const filteredRecords = records;
  const params = new URLSearchParams({
    search: filters.search,
    outsourceStatus: filters.status,
    date: filters.date,
    view: filters.view
  });
  if (pagination.page > 1) params.set("page", String(pagination.page));
  const returnTo = `/terciarizaciones?${params.toString()}`;

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
      setLookupStatus({
        loading: false,
        message: "Ingresa un numero de orden REP.",
        success: false
      });
      return;
    }

    setLookupStatus({ loading: true, message: "Buscando orden de reparacion...", success: false });

    try {
      const response = await fetch(
        `/api/repair-access/orders/${encodeURIComponent(requestedNumber)}`,
        {
          headers: { accept: "application/json" }
        }
      );
      const result = await response.json();

      if (!response.ok || !result.order) {
        setSelectedOrder(null);
        setLookupStatus({
          loading: false,
          message: "No encontre una orden de Reparaciones con ese numero.",
          success: false
        });
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
      setLookupStatus({
        loading: false,
        message: "No pude consultar la orden. Proba de nuevo.",
        success: false
      });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-4">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold text-foreground">Terciarizaciones</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Equipos enviados a talleres externos. Registrar costos o retornos no mueve caja ni
              entrega al cliente.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Indicadores de todo el resultado filtrado.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 xl:grid-cols-6">
            <SummaryValue label="En talleres externos" value={summary.active} />
            <SummaryValue label="Retornadas al local" value={summary.retrieved} />
            <SummaryValue label="Talleres" value={summary.workshops} />
            <SummaryValue label="Enviadas hoy" value={summary.sentToday} />
            <SummaryValue label="Promesas vencidas" value={summary.overdue} />
            <SummaryValue label="Control pendiente" value={summary.pendingQuality} />
          </dl>
        </div>

        {message ? (
          <div
            role={message.success ? "status" : "alert"}
            aria-live="polite"
            className={
              message.success
                ? "status-banner status-banner--success mt-5"
                : "status-banner status-banner--error mt-5"
            }
          >
            {message.message}
          </div>
        ) : null}

        <form action={saveRepairOutsourcingAction} className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">Registrar envio a taller externo</h2>
          <input name="returnTo" type="hidden" value={returnTo} />
          <input name="repairAccessOrderId" type="hidden" value={selectedOrder?.id ?? ""} />

          <div className="border-t border-border pt-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label>
                <span className="mb-2 block text-sm font-medium text-body">
                  Numero de orden REP
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
              <Button
                disabled={lookupStatus.loading}
                onClick={() => void loadRepairOrder()}
                type="button"
              >
                {lookupStatus.loading ? "Buscando..." : "Cargar orden"}
              </Button>
            </div>
            {lookupStatus.message ? (
              <p
                role={lookupStatus.success || lookupStatus.loading ? "status" : "alert"}
                aria-live="polite"
                className={`mt-3 rounded-xl px-3 py-2 text-sm ${lookupStatus.success ? "bg-success-soft text-success" : "text-body"}`}
              >
                {lookupStatus.message}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Carga la REP para traer el cliente, equipo y falla.
              </p>
            )}
          </div>

          {selectedOrder ? (
            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 xl:grid-cols-4">
              <InfoBlock label="Orden" value={selectedOrder.repairNumber} />
              <InfoBlock
                label="Cliente"
                value={selectedOrder.customerName}
                helper={selectedOrder.customerPhone || selectedOrder.customerDni}
              />
              <InfoBlock
                label="Equipo"
                value={selectedOrder.device || "Equipo"}
                helper={selectedOrder.issueDescription}
              />
              <InfoBlock
                label="Ingreso"
                value={formatDate(selectedOrder.intakeDate)}
                helper={selectedOrder.status.replaceAll("_", " ")}
              />
            </div>
          ) : null}

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <label htmlFor="workshopName" className="mb-2 block text-sm font-medium text-body">
                Taller externo
              </label>
              <Input
                name="workshopName"
                aria-label="Lugar donde se llevo el equipo"
                onChange={(event) => setWorkshopName(event.target.value)}
                placeholder="Ej: Taller Roberto, Servicio Philips..."
                value={workshopName}
              />
            </div>
            <div>
              <label htmlFor="sentAt" className="mb-2 block text-sm font-medium text-body">
                Fecha de envio
              </label>
              <Input
                aria-label="Fecha de envio al taller"
                name="sentAt"
                onChange={(event) => setSentAt(event.target.value)}
                type="date"
                value={sentAt}
              />
            </div>
            <label className="grid gap-2 text-sm">
              Responsable del seguimiento
              <Input
                name="responsibleName"
                required
                maxLength={120}
                placeholder="Persona del local que consulta al tercero"
              />
            </label>
            <label className="grid gap-2 text-sm">
              Fecha prometida
              <Input name="promisedAt" type="date" min={sentAt} />
            </label>
            <label className="grid gap-2 text-sm">
              Costo previsto (opcional)
              <Input
                name="expectedCost"
                type="number"
                min="0"
                step="0.01"
                placeholder="Desconocido"
              />
            </label>
            <div className="sm:col-span-2">
              <label htmlFor="notes" className="mb-2 block text-sm font-medium text-body">
                Observaciones
              </label>
              <Textarea
                name="notes"
                aria-label="Observaciones de la terciarizacion"
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
        <div className="border-b border-border px-4 py-3">
          <form className="grid items-end gap-3 min-[1600px]:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] md:grid-cols-2">
            <div className="max-w-lg">
              <label htmlFor="search" className="mb-2 block text-sm font-medium text-body">
                Buscar terciarizacion
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Buscar terciarizaciones por orden, cliente, equipo o taller"
                  className="pl-10"
                  name="search"
                  placeholder="REP, cliente, equipo, serie o taller..."
                  defaultValue={filters.search}
                />
              </div>
            </div>
            <label className="grid gap-2 text-sm">
              Estado
              <Select
                aria-label="Estado de terciarizacion"
                name="outsourceStatus"
                defaultValue={filters.status}
                options={[
                  { value: "en_taller", label: "En taller" },
                  { value: "retirado", label: "Retornadas al local" },
                  { value: "vencidas", label: "Vencidas" },
                  { value: "cancelado", label: "Anuladas" },
                  { value: "todos", label: "Todas" }
                ]}
              />
            </label>
            <label className="grid gap-2 text-sm">
              Fecha de envio
              <Input
                aria-label="Fecha de envio"
                type="date"
                name="date"
                defaultValue={filters.date}
              />
            </label>
            <label className="grid gap-2 text-sm">
              Periodo
              <Select
                aria-label="Periodo de envios"
                name="view"
                defaultValue={filters.view}
                options={[
                  { value: "all", label: "Todo / fecha exacta" },
                  { value: "day", label: "Dia" },
                  { value: "week", label: "Semana (lunes a domingo)" }
                ]}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="submit">Filtrar</Button>
              <Link
                className="inline-flex min-h-11 items-center underline"
                href="/terciarizaciones"
              >
                Limpiar
              </Link>
            </div>
          </form>
        </div>

        <div className="divide-y divide-border px-4 lg:hidden">
          {filteredRecords.length ? (
            filteredRecords.map((record) => (
              <article className="py-4" key={record.id}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-body">{record.order.repairNumber}</p>
                    <p className="mt-1 font-medium text-foreground">{record.order.customerName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {record.order.customerPhone || record.order.customerDni || "-"}
                    </p>
                  </div>
                  <StatusPill status={record.status} />
                </div>
                <div className="mt-4 min-w-0">
                  <p className="text-sm text-muted-foreground">Equipo / falla</p>
                  <p className="mt-1 font-semibold text-foreground">{record.order.deviceLabel}</p>
                  {record.order.serialNumber ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Serie: {record.order.serialNumber}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {record.order.issueReported}
                  </p>
                </div>
                <div className="mt-3 min-w-0">
                  <p className="text-sm text-muted-foreground">Taller externo</p>
                  <p className="mt-1 font-semibold text-foreground">{record.workshopName}</p>
                  {record.notes ? (
                    <p className="mt-1 text-sm leading-5 whitespace-pre-line text-muted-foreground">
                      {record.notes}
                    </p>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Enviado: {formatDate(record.sentAt)} / Retorno:{" "}
                  {record.retrievedAt ? formatDate(record.retrievedAt) : "Pendiente"}
                </p>
                <div className="mt-4 space-y-2">
                  <OutsourcingOperations record={record} returnTo={returnTo} />
                  {record.status === "en_taller" ? (
                    <ActionMenu label="Más acciones">
                      <form
                        action={cancelRepairOutsourcingAction}
                        onSubmit={(event) =>
                          confirmSubmit(event, {
                            title: `¿Anular la terciarización de ${record.order.repairNumber}?`,
                            confirmLabel: "Anular terciarización",
                            tone: "danger"
                          })
                        }
                      >
                        <input name="id" type="hidden" value={record.id} />
                        <input name="returnTo" type="hidden" value={returnTo} />
                        <Button className="w-full" type="submit" variant="danger">
                          Anular
                        </Button>
                      </form>
                    </ActionMenu>
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
            <thead className="bg-white/80 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Orden</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Equipo / falla</th>
                <th className="px-4 py-3 font-medium">Taller externo</th>
                <th className="px-4 py-3 font-medium">Fechas</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record) => (
                <tr className="border-t border-border align-top" key={record.id}>
                  <td className="px-4 py-3 font-semibold text-body">{record.order.repairNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{record.order.customerName}</p>
                    <p className="text-sm text-muted-foreground">
                      {record.order.customerPhone || record.order.customerDni || "-"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p className="font-medium text-foreground">{record.order.deviceLabel}</p>
                    {record.order.serialNumber ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Serie: {record.order.serialNumber}
                      </p>
                    ) : null}
                    <p className="mt-1 max-w-sm text-sm leading-5 text-muted-foreground">
                      {record.order.issueReported}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{record.workshopName}</p>
                    {record.notes ? (
                      <p className="mt-1 max-w-xs text-sm leading-5 whitespace-pre-line text-muted-foreground">
                        {record.notes}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p>Enviado: {formatDate(record.sentAt)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Retorno: {record.retrievedAt ? formatDate(record.retrievedAt) : "Pendiente"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={record.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <OutsourcingOperations record={record} returnTo={returnTo} />
                      {record.status === "en_taller" ? (
                        <ActionMenu label="Más acciones">
                          <form
                            action={cancelRepairOutsourcingAction}
                            onSubmit={(event) =>
                              confirmSubmit(event, {
                                title: `¿Anular la terciarización de ${record.order.repairNumber}?`,
                                confirmLabel: "Anular terciarización",
                                tone: "danger"
                              })
                            }
                          >
                            <input name="id" type="hidden" value={record.id} />
                            <input name="returnTo" type="hidden" value={returnTo} />
                            <Button size="sm" type="submit" variant="danger">
                              Anular
                            </Button>
                          </form>
                        </ActionMenu>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRecords.length ? (
            <div className="empty-panel border-t border-border">
              No encontre terciarizaciones para esa busqueda o filtro.
            </div>
          ) : null}
        </div>
        <OperationsPagination pagination={pagination} baseHref={returnTo} />
      </div>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</dd>
    </div>
  );
}

function InfoBlock({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value || "-"}</p>
      {helper ? (
        <p className="mt-1 text-sm wrap-break-word text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <Badge variant={getRepairOutsourcingStatusTone(status)}>
      {getRepairOutsourcingStatusLabel(status)}
    </Badge>
  );
}
