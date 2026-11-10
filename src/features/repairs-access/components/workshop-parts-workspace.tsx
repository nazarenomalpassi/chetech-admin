"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { PackageCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getOperationalDate } from "../warranty";
import type { PartInboxItem } from "../coordination-queries";
import type { SupplierClaimsPage } from "../parts-queries";
import {
  SUPPLIER_CLAIM_LABELS,
  type SupplierClaim,
  type WorkshopPartsPage,
} from "../supplier-claims";
import { PART_STATUS_LABELS } from "../workflow";
import { saveSupplierClaim } from "../supplier-claim-actions";
import {
  CoordinationDialog,
  DialogField,
  PartManagementDialog,
} from "./order-coordination-panel";

export function WorkshopPartsWorkspace({
  data,
  claims,
  canManage,
  search = "",
  status = "all",
  closed = false,
}: {
  data: WorkshopPartsPage | null;
  claims: SupplierClaimsPage | null;
  canManage: boolean;
  search?: string;
  status?: string;
  closed?: boolean;
}) {
  const [manage, setManage] = useState<PartInboxItem | null>(null);
  const [claimPart, setClaimPart] = useState<PartInboxItem | null>(null);
  const [claim, setClaim] = useState<SupplierClaim | null>(null);
  const today = getOperationalDate();
  const href = (patch: Record<string, string>) =>
    `/reparaciones-access?${new URLSearchParams({ view: "repuestos", pq: search, pf: status, pp: String(data?.page ?? 1), pc: closed ? "1" : "0", cp: String(claims?.page ?? 1), ...patch })}` as Route;
  if (!data)
    return (
      <Card>
        <p role="status">No se pudo cargar la bandeja de repuestos.</p>
      </Card>
    );
  return (
    <div className="min-w-0 space-y-4">
      <header>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <PackageCheck className="h-5 w-5" aria-hidden="true" />
          Repuestos del taller
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Del pedido a la instalacion, siempre vinculado a su orden.
        </p>
      </header>
      <nav
        aria-label="Colas de repuestos"
        className={`grid grid-cols-2 gap-2 ${canManage ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
      >
        {(
          [
            {
              key: "requested",
              label: "Sin comprar",
              value: data.counts.requested,
            },
            {
              key: "ordered",
              label: "En camino / parcial",
              value: data.counts.ordered,
            },
            {
              key: "available",
              label: "Listos para usar",
              value: data.counts.available,
            },
            {
              key: "overdue",
              label: "Llegada vencida",
              value: data.counts.overdue,
            },
          ] as const
        ).map((item) => (
          <Link
            key={item.key}
            href={href({ pf: item.key, pp: "1" })}
            aria-current={status === item.key ? "page" : undefined}
            className={`min-h-20 rounded-xl border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40 ${status === item.key ? "border-graphite bg-graphite text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            <span className="text-xs">{item.label}</span>
            <strong className="mt-1 block text-xl tabular-nums">
              {item.value}
            </strong>
          </Link>
        ))}
        {canManage ? (
          <a
            href="#supplier-claims"
            className="min-h-20 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            <span className="text-xs">Reclamos activos</span>
            <strong className="mt-1 block text-xl tabular-nums">
              {data.counts.claims}
            </strong>
          </a>
        ) : null}
      </nav>
      <Card className="space-y-4">
        <form
          action="/reparaciones-access"
          method="get"
          className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <input name="view" value="repuestos" type="hidden" />
          <DialogField label="Buscar repuesto u orden">
            <Input
              name="pq"
              key={search}
              defaultValue={search}
              maxLength={200}
              placeholder="Repuesto, REP, cliente o proveedor"
            />
          </DialogField>
          <DialogField label="Estado del repuesto">
            <Select
              name="pf"
              key={status}
              defaultValue={status}
              options={[
                { value: "all", label: "Todos los pendientes" },
                { value: "requested", label: "Sin comprar" },
                { value: "ordered", label: "En camino / parcial" },
                { value: "received", label: "Recibidos" },
                { value: "available", label: "Listos para usar" },
                { value: "overdue", label: "Llegada vencida" },
                { value: "installed", label: "Utilizados / reclamar" },
              ]}
            />
          </DialogField>
          <Button type="submit" className="min-h-11">
            Buscar
          </Button>
        </form>
        <p className="text-xs text-slate-500">
          {data.total} solicitudes en este filtro. Las compras no registran
          egresos automaticos.
        </p>
        <div className="grid gap-3 xl:grid-cols-2">
          {data.items.map((part) => {
            const held = (part.claimedQuantity ?? 0) > 0;
            const partial =
              part.receivedQuantity > 0 &&
              part.receivedQuantity < part.quantity;
            const overdue =
              part.expectedDate &&
              part.expectedDate < today &&
              part.receivedQuantity < part.quantity;
            const manageable =
              part.status !== "installed" &&
              !held &&
              (canManage || part.receivedQuantity > part.installedQuantity);
            return (
              <article
                key={part.id}
                className="min-w-0 rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    className="inline-flex min-h-11 items-center rounded font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40"
                    href={`/reparaciones-access?view=detalle&order=${part.orderId}`}
                  >
                    {part.repairNumber}
                  </Link>
                  <span
                    className={`rounded-md px-2 py-1 text-xs ${overdue || held ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}
                  >
                    {held
                      ? "Con reclamo activo"
                      : overdue
                        ? "Llegada vencida"
                        : partial
                          ? "Recepcion parcial"
                          : PART_STATUS_LABELS[part.status]}
                  </span>
                </div>
                <h3 className="mt-2 break-words font-semibold">
                  {part.description}
                </h3>
                <p className="mt-1 break-words text-sm text-slate-500">
                  {part.customerName}
                </p>
                <p className="mt-3 text-sm font-medium">
                  {part.receivedQuantity} de {part.quantity} recibidos ·{" "}
                  {part.installedQuantity} usados
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {part.expectedDate
                    ? `Llegada esperada: ${formatDate(part.expectedDate)}`
                    : "Sin fecha de llegada informada"}
                </p>
                {canManage ? (
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Proveedor</dt>
                      <dd className="mt-1 break-words">
                        {part.supplier || "Por definir"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">
                        Costo por unidad
                      </dt>
                      <dd className="mt-1">
                        {part.unitCost === null
                          ? "Sin informar"
                          : formatCurrency(part.unitCost)}
                      </dd>
                    </div>
                  </dl>
                ) : null}
                {held ? (
                  <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    Resolver reclamo antes de usar o cancelar este repuesto.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {manageable ? (
                    <Button
                      type="button"
                      className="min-h-11"
                      variant="secondary"
                      onClick={() => setManage(part)}
                    >
                      {canManage ? "Gestionar repuesto" : "Registrar uso"}
                    </Button>
                  ) : null}
                  {canManage && !held && part.receivedQuantity > 0 ? (
                    <Button
                      type="button"
                      className="min-h-11"
                      variant="secondary"
                      onClick={() => setClaimPart(part)}
                    >
                      Reclamar al proveedor
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        {!data.items.length ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No hay repuestos para este filtro.
          </p>
        ) : null}
        <Pagination
          page={data.page}
          total={data.total}
          size={data.pageSize}
          name="repuestos"
          link={(page) => href({ pp: String(page) })}
        />
      </Card>
      {canManage ? (
        <Card id="supplier-claims" className="space-y-4 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                Reclamos al proveedor
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Separados de la garantia del cliente. No generan devoluciones de
                dinero ni movimientos de stock.
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
              href={href({ pc: closed ? "0" : "1", cp: "1" })}
            >
              {closed ? "Ver activos" : "Ver historial de cerrados"}
            </Link>
          </div>
          {claims?.items.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  className="inline-flex min-h-11 items-center font-semibold underline"
                  href={`/reparaciones-access?view=detalle&order=${item.orderId}`}
                >
                  {item.repairNumber} · {item.description}
                </Link>
                <span
                  className={`rounded-md px-2 py-1 text-xs ${item.closedAt ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
                >
                  {SUPPLIER_CLAIM_LABELS[item.status]}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                {item.reason}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {item.quantity} unidad(es) ·{" "}
                {item.supplier || "Proveedor sin informar"} ·{" "}
                {formatDate(item.createdAt)}
                {item.warrantyReturnId
                  ? " · Vinculado a reingreso por garantia"
                  : ""}
              </p>
              {item.resolution ? (
                <p className="mt-2 whitespace-pre-wrap text-sm">
                  Resolucion: {item.resolution}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                Costo adicional:{" "}
                {item.extraCost === null
                  ? "Sin informar"
                  : formatCurrency(item.extraCost)}
              </p>
              {!item.closedAt ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 min-h-11"
                  onClick={() => setClaim(item)}
                >
                  Actualizar reclamo
                </Button>
              ) : null}
            </article>
          ))}
          {!claims?.items.length ? (
            <p className="text-sm text-slate-500">
              No hay reclamos {closed ? "cerrados" : "activos"}.
            </p>
          ) : null}
          {claims ? (
            <Pagination
              page={claims.page}
              total={claims.total}
              size={claims.pageSize}
              name="reclamos"
              link={(page) => href({ cp: String(page) })}
            />
          ) : null}
        </Card>
      ) : null}
      {manage ? (
        <PartManagementDialog
          key={`${manage.id}:${manage.version}`}
          part={manage}
          canManage={canManage}
          onClose={() => setManage(null)}
        />
      ) : null}
      {claimPart ? (
        <CoordinationDialog
          title="Reclamar repuesto al proveedor"
          action={saveSupplierClaim}
          onClose={() => setClaimPart(null)}
        >
          <input type="hidden" name="partId" value={claimPart.id} />
          <input type="hidden" name="version" value={claimPart.version} />
          <p className="text-sm font-semibold">
            {claimPart.repairNumber} · {claimPart.description}
          </p>
          <DialogField label="Falla o motivo del reclamo">
            <Textarea name="reason" minLength={3} maxLength={2000} required />
          </DialogField>
          <DialogField label="Cantidad defectuosa">
            <Input
              name="quantity"
              type="number"
              min={1}
              max={
                claimPart.receivedQuantity - (claimPart.claimedQuantity ?? 0)
              }
              step={1}
              defaultValue={1}
              required
            />
          </DialogField>
          {claimPart.warrantyReturnId ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                name="warrantyReturnId"
                type="checkbox"
                value={claimPart.warrantyReturnId}
                className="h-5 w-5 accent-graphite"
              />
              Vincular al reingreso por garantia activo de esta orden
            </label>
          ) : null}
          <DialogField label="Costo adicional conocido (opcional)">
            <Input name="extraCost" type="number" min={0} step="0.01" />
          </DialogField>
          <p className="text-xs text-slate-500">
            Dejalo vacio si no se conoce. No registra un egreso en Caja; el
            importe real se carga en Gastos cuando corresponda.
          </p>
        </CoordinationDialog>
      ) : null}
      {claim ? (
        <CoordinationDialog
          title="Actualizar reclamo al proveedor"
          action={saveSupplierClaim}
          onClose={() => setClaim(null)}
        >
          <input type="hidden" name="claimId" value={claim.id} />
          <input type="hidden" name="partId" value={claim.partId} />
          <input type="hidden" name="version" value={claim.version} />
          <p className="text-sm font-semibold">
            {claim.repairNumber} · {claim.description}
          </p>
          <DialogField label="Estado del reclamo">
            <Select
              name="claimStatus"
              defaultValue={claim.status}
              options={Object.entries(SUPPLIER_CLAIM_LABELS).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </DialogField>
          <DialogField label="Avance o resolucion">
            <Textarea
              name="resolution"
              maxLength={2000}
              defaultValue={claim.resolution ?? ""}
            />
          </DialogField>
          <DialogField label="Costo adicional conocido (opcional)">
            <Input
              name="extraCost"
              type="number"
              min={0}
              step="0.01"
              defaultValue={claim.extraCost ?? ""}
            />
          </DialogField>
          <p className="text-xs text-slate-500">
            Al resolver o cancelar se requiere un detalle. El historial se
            conserva; no se modifica automaticamente el inventario ni el dinero.
          </p>
        </CoordinationDialog>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  total,
  size,
  name,
  link,
}: {
  page: number;
  total: number;
  size: number;
  name: string;
  link: (page: number) => Route;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav
      aria-label={`Paginas de ${name}`}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm"
    >
      <span>
        Pagina {page} de {pages} · {total} registros
      </span>
      <div className="flex gap-4">
        {page > 1 ? (
          <Link
            aria-label={`Pagina anterior de ${name}`}
            className="inline-flex min-h-11 items-center underline"
            href={link(page - 1)}
          >
            Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link
            aria-label={`Siguiente pagina de ${name}`}
            className="inline-flex min-h-11 items-center underline"
            href={link(page + 1)}
          >
            Siguiente
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
