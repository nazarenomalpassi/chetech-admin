"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveRepairAccessOrderAction } from "@/features/repairs-access/actions";
import { RepairAccessCommandCenter } from "@/features/repairs-access/components/repair-access-command-center";
import { RepairAccessCustomersSection } from "@/features/repairs-access/components/repair-access-customers-section";
import { RepairAccessNewOrderWizard } from "@/features/repairs-access/components/repair-access-new-order-wizard";
import { RepairAccessOrderDetail } from "@/features/repairs-access/components/repair-access-order-detail";
import { RepairAccessOrdersSection } from "@/features/repairs-access/components/repair-access-orders-section";
import type {
  RepairAccessCustomerSummary,
  RepairAccessImportSummary,
  RepairAccessOrderRecord,
  RepairAccessSummary
} from "@/features/repairs-access/queries";
import type { ActionResult } from "@/lib/form-state";
import { getFormDraftStorageKey } from "@/lib/form-draft";
import { formatDate } from "@/lib/utils";
import type { WorkshopTechnician } from "./order-coordination-panel";
import type { WorkshopPageInfo } from "../page-queries";
import type { WorkshopInbox as InboxData } from "../coordination-queries";
import { WorkshopUpdates } from "./workshop-updates";
import { WorkshopServerNavigation } from "./workshop-server-navigation";
import { WorkshopInbox } from "./workshop-inbox";

type RepairAccessSection = "panel" | "nueva" | "clientes" | "ordenes" | "detalle" | "consultas" | "importar";

const primarySections: { key: RepairAccessSection; label: string }[] = [
  { key: "ordenes", label: "Ordenes" },
  { key: "nueva", label: "Nueva orden" },
  { key: "clientes", label: "Clientes" }
];
const secondarySections: { key: RepairAccessSection; label: string }[] = [
  { key: "panel", label: "Resumen" },
  { key: "consultas", label: "Consultas" },
  { key: "importar", label: "Importar" }
];

export function RepairsAccessView({
  orders,
  technicians,
  pageInfo,
  inbox,
  customers,
  latestImport,
  summary,
  message,
  initialOrderId,
  actionStatus,
  initialView,
  canManageIntake,
  defaultWarrantyDays
}: {
  orders: RepairAccessOrderRecord[];
  technicians?: WorkshopTechnician[];
  pageInfo?: WorkshopPageInfo;
  inbox?: InboxData | null;
  customers: RepairAccessCustomerSummary[];
  latestImport: RepairAccessImportSummary | null;
  summary: RepairAccessSummary;
  message: ActionResult | null;
  initialOrderId?: string;
  actionStatus?: string;
  initialView?: string;
  canManageIntake: boolean;
  defaultWarrantyDays: number;
}) {
  const router = useRouter();
  const initialSelectedOrder = orders.find((order) => order.id === initialOrderId) ?? null;
  const requestedSection = [...primarySections, ...secondarySections].some((section) => section.key === initialView)
    ? (initialView as RepairAccessSection)
    : null;
  const intakeSaved = actionStatus === "repair_access_created" || actionStatus === "repair_access_intake_updated";
  let entrySection: RepairAccessSection = "ordenes";
  if (canManageIntake) {
    if (initialView === "detalle" && initialSelectedOrder) entrySection = "detalle";
    else if (requestedSection && requestedSection !== "nueva") entrySection = requestedSection;
    else if (!intakeSaved) entrySection = requestedSection ?? (message && !message.success && !initialOrderId ? "nueva" : "ordenes");
  }
  const [activeSection, setActiveSection] = useState<RepairAccessSection>(entrySection);
  const [editing, setEditing] = useState<RepairAccessOrderRecord | null>(() => entrySection === "nueva" ? initialSelectedOrder : null);
  const [selectedOrder, setSelectedOrder] = useState<RepairAccessOrderRecord | null>(initialSelectedOrder);
  const [customerSearch, setCustomerSearch] = useState("");
  const deepLinkSearch = initialSelectedOrder?.repairNumber ?? "";
  const [orderSearch, setOrderSearch] = useState(pageInfo?.search || deepLinkSearch);
  const [statusFilter, setStatusFilter] = useState(pageInfo?.status ?? "todos");
  const [warrantyFilter, setWarrantyFilter] = useState(pageInfo?.warranty ?? "todos");
  const [intakeDirty, setIntakeDirty] = useState(false);
  const orderHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousSectionRef = useRef(activeSection);
  const moreOptionsRef = useRef<HTMLDetailsElement>(null);
  const navigationKey = JSON.stringify([initialOrderId, initialView, actionStatus, canManageIntake]);
  const previousNavigationRef = useRef(navigationKey);
  const pendingNavigationRef = useRef<string | null>(null);
  const pageSearch = pageInfo?.search;
  const pageStatus = pageInfo?.status;
  const pageWarranty = pageInfo?.warranty;

  useEffect(() => {
    setOrderSearch(pageSearch || deepLinkSearch);
    setStatusFilter(pageStatus ?? "todos");
    setWarrantyFilter(pageWarranty ?? "todos");
  }, [pageSearch, pageStatus, pageWarranty, deepLinkSearch]);

  useEffect(() => {
    // A data refresh is not a new navigation intent, even when the URL still has an order.
    if (previousNavigationRef.current === navigationKey) return;
    previousNavigationRef.current = navigationKey;
    if (pendingNavigationRef.current === navigationKey) {
      pendingNavigationRef.current = null;
      return;
    }
    setActiveSection(entrySection);
    setSelectedOrder(initialSelectedOrder);
    setEditing(entrySection === "nueva" ? initialSelectedOrder : null);
    setIntakeDirty(false);
  }, [navigationKey, entrySection, initialSelectedOrder]);

  useEffect(() => {
    const sectionChanged = previousSectionRef.current !== activeSection;
    previousSectionRef.current = activeSection;
    if (sectionChanged && activeSection === "ordenes") orderHeadingRef.current?.focus();
  }, [activeSection]);

  function updateSectionUrl(section: RepairAccessSection, orderId?: string, filters?: { search: string; status: string; warranty: string }) {
    const params = new URLSearchParams(window.location.search);
    params.set("view", section);
    if (orderId) params.set("order", orderId); else params.delete("order");
    params.delete("status");
    params.delete("error");
    const nextFilters = filters ?? { search: orderSearch, status: statusFilter, warranty: warrantyFilter };
    if (nextFilters.search !== (pageSearch ?? "") || nextFilters.status !== (pageStatus ?? "todos") || nextFilters.warranty !== (pageWarranty ?? "todos")) params.delete("cursor");
    if (nextFilters.search) params.set("q", nextFilters.search); else params.delete("q");
    if (nextFilters.status !== "todos") params.set("state", nextFilters.status); else params.delete("state");
    if (nextFilters.warranty !== "todos") params.set("warranty", nextFilters.warranty); else params.delete("warranty");
    pendingNavigationRef.current = JSON.stringify([orderId, section, undefined, canManageIntake]);
    router.push(`/reparaciones-access?${params}` as Route, { scroll: false });
  }

  function navigate(section: string) {
    if (![...primarySections, ...secondarySections].some((item) => item.key === section)) return;
    if (!canManageIntake && section !== "ordenes") return;
    if (activeSection === "nueva" && section === "nueva" && !editing) return;
    if (
      activeSection === "nueva" &&
      (section !== "nueva" || editing) &&
      intakeDirty &&
      !window.confirm("Hay cambios sin guardar. El borrador quedará disponible para recuperarlo. ¿Querés salir?")
    ) {
      return;
    }
    setEditing(null);
    setIntakeDirty(false);
    setActiveSection(section as RepairAccessSection);
    if (moreOptionsRef.current) moreOptionsRef.current.open = false;
    updateSectionUrl(section as RepairAccessSection);
  }

  function startEdit(order: RepairAccessOrderRecord) {
    if (!canManageIntake) return;
    setEditing(order);
    setIntakeDirty(false);
    setActiveSection("nueva");
    updateSectionUrl("nueva", order.id);
  }

  function openDetail(order: RepairAccessOrderRecord) {
    if (!canManageIntake) return;
    setSelectedOrder(order);
    setEditing(null);
    setActiveSection("detalle");
    updateSectionUrl("detalle", order.id);
  }

  function stopEdit() {
    if (intakeDirty && !window.confirm("Hay cambios sin guardar. ¿Querés cancelar y conservar el borrador?")) {
      return;
    }
    setEditing(null);
    setIntakeDirty(false);
    setActiveSection("ordenes");
    updateSectionUrl("ordenes");
  }

  function openStatus(status: string) {
    setOrderSearch("");
    setStatusFilter(status);
    setWarrantyFilter("todos");
    setActiveSection("ordenes");
    updateSectionUrl("ordenes", undefined, { search: "", status, warranty: "todos" });
  }

  useEffect(() => {
    if (!actionStatus) return;

    if (actionStatus === "repair_access_created") {
      window.localStorage.removeItem(getFormDraftStorageKey("repair-access:intake:new"));
    }
    if (actionStatus === "repair_access_intake_updated" && initialOrderId) {
      window.localStorage.removeItem(getFormDraftStorageKey(`repair-access:intake:${initialOrderId}`));
    }
    if (actionStatus === "repair_access_technical_updated" && initialOrderId) {
      window.localStorage.removeItem(getFormDraftStorageKey(`repair-access:technical:${initialOrderId}`));
    }
  }, [actionStatus, initialOrderId]);

  useEffect(() => {
    setSelectedOrder((current) => {
      if (!current) return current;
      return orders.find((order) => order.id === current.id) ?? current;
    });
    setEditing((current) => {
      if (!current || intakeDirty) return current;
      return orders.find((order) => order.id === current.id) ?? current;
    });
  }, [orders, intakeDirty]);

  return (
    <div className="space-y-5">
      {message ? (
        <p className={`rounded-3xl px-5 py-4 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {message.message}
        </p>
      ) : null}

      {canManageIntake ? (
        <Card className="p-2 sm:p-2">
          <nav aria-label="Secciones de reparaciones" className="flex flex-wrap items-start gap-2">
            {primarySections.map((section) => (
              <button
                aria-current={activeSection === section.key ? "page" : undefined}
                className={`min-h-11 rounded-2xl px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40 ${activeSection === section.key ? "bg-graphite text-white" : "text-slate-600 hover:bg-slate-100"}`}
                key={section.key}
                onClick={() => navigate(section.key)}
                type="button"
              >
                {section.label}
              </button>
            ))}
            <details className="min-w-0 rounded-2xl sm:ml-auto" ref={moreOptionsRef}>
              <summary className={`flex min-h-11 cursor-pointer items-center rounded-2xl px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40 ${secondarySections.some((section) => section.key === activeSection) ? "bg-slate-100 text-graphite" : "text-slate-600 hover:bg-slate-100"}`}>Mas opciones</summary>
              <div className="flex flex-wrap gap-2 pt-2">
                {secondarySections.map((section) => (
                  <Button aria-current={activeSection === section.key ? "page" : undefined} key={section.key} onClick={() => navigate(section.key)} type="button" variant="ghost">{section.label}</Button>
                ))}
              </div>
            </details>
          </nav>
        </Card>
      ) : null}

      {pageInfo ? <WorkshopUpdates disabled={intakeDirty} /> : null}
      {activeSection === "panel" && inbox ? <WorkshopInbox inbox={inbox} /> : null}
      {activeSection === "panel" ? <RepairAccessCommandCenter onNavigate={navigate} onOpenStatus={openStatus} onOpenDetail={openDetail} orders={orders} summary={summary} /> : null}
      {activeSection === "ordenes" && pageInfo ? <WorkshopServerNavigation pageInfo={pageInfo} search={orderSearch} status={statusFilter} warranty={warrantyFilter} /> : null}

      {activeSection === "nueva" ? (
        <RepairAccessNewOrderWizard
          action={saveRepairAccessOrderAction}
          customers={customers}
          editing={editing}
          onCancel={stopEdit}
          onDirtyChange={setIntakeDirty}
        />
      ) : null}

      {activeSection === "clientes" ? (
        <RepairAccessCustomersSection customers={customers} onSearchChange={setCustomerSearch} search={customerSearch} />
      ) : null}

      {activeSection === "ordenes" ? (
        <RepairAccessOrdersSection
          canManageIntake={canManageIntake}
          headingRef={orderHeadingRef}
          onEdit={startEdit}
          onOpenDetail={openDetail}
          onNew={canManageIntake ? () => navigate("nueva") : undefined}
          onSearchChange={setOrderSearch}
          onStatusFilterChange={setStatusFilter}
          onWarrantyFilterChange={setWarrantyFilter}
          orders={orders}
          technicians={technicians}
          search={orderSearch}
          statusFilter={statusFilter}
          warrantyFilter={warrantyFilter}
        />
      ) : null}

      {canManageIntake && activeSection === "detalle" && selectedOrder ? (
        <RepairAccessOrderDetail
          onBack={() => navigate("ordenes")}
          defaultWarrantyDays={defaultWarrantyDays}
          onEditIntake={startEdit}
          order={orders.find((order) => order.id === selectedOrder.id) ?? selectedOrder}
          technicians={technicians}
        />
      ) : null}

      {activeSection === "consultas" ? <RepairAccessQueriesPlaceholder onNavigate={navigate} summary={summary} /> : null}
      {activeSection === "importar" ? <RepairAccessImportPanel latestImport={latestImport} /> : null}
    </div>
  );
}

function RepairAccessQueriesPlaceholder({ summary, onNavigate }: { summary: RepairAccessSummary; onNavigate: (section: string) => void }) {
  const queryCards = [
    { title: "Pendientes de revision", value: summary.statusCounts.pendiente_revision ?? 0, action: "Ver ordenes" },
    { title: "Esperando cliente", value: summary.waitingCustomer, action: "Filtrar" },
    { title: "Listas para retirar", value: summary.readyToPickup, action: "Ver retiros" },
    { title: "Garantias vigentes", value: summary.activeWarranties, action: "Ver garantias" },
    { title: "Demoradas", value: summary.delayedOrders, action: "Controlar" },
    { title: "Cobradas hoy", value: summary.collectedToday, action: "Auditar" }
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Consultas</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Vistas rapidas del taller</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Abri una vista filtrada para revisar esperas, entregas y garantias del taller.
          </p>
        </div>
        <Button onClick={() => onNavigate("ordenes")} type="button" variant="secondary">Abrir ordenes</Button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {queryCards.map((card) => (
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5" key={card.title}>
            <p className="text-sm font-medium text-slate-600">{card.title}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{card.value}</p>
            <Link className="mt-3 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4" href={`/reparaciones-access?view=ordenes&${card.title === "Esperando cliente" ? "scope=waiting_customer" : card.title === "Listas para retirar" ? "scope=ready" : card.title === "Garantias vigentes" ? "warranty=active" : card.title === "Demoradas" ? "scope=overdue" : card.title === "Pendientes de revision" ? "state=pendiente_revision" : "scope=all"}`}>{card.action}</Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RepairAccessImportPanel({ latestImport }: { latestImport: RepairAccessImportSummary | null }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Importacion historica</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Trazabilidad del Excel</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Resume el ultimo lote reproducible de clientes y ordenes historicas. La importacion conserva
        cada fila original para auditoria, evita duplicados y no impacta caja.
      </p>

      {latestImport ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ImportMetric label="Archivo" value={latestImport.fileName} />
          <ImportMetric label="Filas" value={String(latestImport.totalRows)} />
          <ImportMetric label="Importados" value={String(latestImport.importedCount)} />
          <ImportMetric label="Actualizados" value={String(latestImport.updatedCount)} />
          <ImportMetric label="Errores" value={String(latestImport.errorCount)} />
        </div>
      ) : (
        <p className="mt-6 rounded-3xl bg-slate-50 p-5 text-sm text-slate-500">Todavia no hay importaciones registradas.</p>
      )}

      {latestImport ? <p className="mt-4 text-sm text-slate-500">Ultima importacion: {formatDate(latestImport.createdAt)}</p> : null}
    </Card>
  );
}

function ImportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
