"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveRepairAccessOrderAction } from "@/features/repairs-access/actions";
import { RepairAccessCommandCenter } from "@/features/repairs-access/components/repair-access-command-center";
import { RepairAccessCustomersSection } from "@/features/repairs-access/components/repair-access-customers-section";
import { RepairAccessNewOrderWizard } from "@/features/repairs-access/components/repair-access-new-order-wizard";
import { RepairAccessOrdersSection } from "@/features/repairs-access/components/repair-access-orders-section";
import type {
  RepairAccessCustomerSummary,
  RepairAccessImportSummary,
  RepairAccessOrderRecord,
  RepairAccessSummary
} from "@/features/repairs-access/queries";
import type { ActionResult } from "@/lib/form-state";
import { formatDate } from "@/lib/utils";

type RepairAccessSection = "panel" | "nueva" | "clientes" | "ordenes" | "consultas" | "importar";

const sections: { key: RepairAccessSection; label: string; helper: string }[] = [
  { key: "panel", label: "Panel", helper: "Resumen operativo" },
  { key: "nueva", label: "Nueva orden", helper: "Ingreso por pasos" },
  { key: "clientes", label: "Clientes", helper: "Buscar y consultar" },
  { key: "ordenes", label: "Ordenes", helper: "Estados y filtros" },
  { key: "consultas", label: "Consultas", helper: "Vistas del taller" },
  { key: "importar", label: "Importar", helper: "Clientes Access" }
];

export function RepairsAccessView({
  orders,
  customers,
  latestImport,
  summary,
  message
}: {
  orders: RepairAccessOrderRecord[];
  customers: RepairAccessCustomerSummary[];
  latestImport: RepairAccessImportSummary | null;
  summary: RepairAccessSummary;
  message: ActionResult | null;
}) {
  const [activeSection, setActiveSection] = useState<RepairAccessSection>("panel");
  const [editing, setEditing] = useState<RepairAccessOrderRecord | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  function navigate(section: string) {
    setActiveSection(section as RepairAccessSection);
  }

  function startEdit(order: RepairAccessOrderRecord) {
    setEditing(order);
    setActiveSection("nueva");
  }

  function stopEdit() {
    setEditing(null);
  }

  return (
    <div className="space-y-5">
      {message ? (
        <p className={`rounded-3xl px-5 py-4 text-sm ${message.success ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          {message.message}
        </p>
      ) : null}

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {sections.map((section) => (
            <button
              className={`rounded-2xl px-4 py-3 text-left transition ${activeSection === section.key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              type="button"
            >
              <span className="block text-sm font-semibold">{section.label}</span>
              <span className={`mt-1 block text-xs ${activeSection === section.key ? "text-slate-300" : "text-slate-400"}`}>{section.helper}</span>
            </button>
          ))}
        </div>
      </Card>

      {activeSection === "panel" ? <RepairAccessCommandCenter onNavigate={navigate} orders={orders} summary={summary} /> : null}

      {activeSection === "nueva" ? (
        <RepairAccessNewOrderWizard action={saveRepairAccessOrderAction} editing={editing} onCancel={stopEdit} />
      ) : null}

      {activeSection === "clientes" ? (
        <RepairAccessCustomersSection customers={customers} onSearchChange={setCustomerSearch} search={customerSearch} />
      ) : null}

      {activeSection === "ordenes" ? (
        <RepairAccessOrdersSection
          onEdit={startEdit}
          onSearchChange={setOrderSearch}
          onStatusFilterChange={setStatusFilter}
          orders={orders}
          search={orderSearch}
          statusFilter={statusFilter}
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
            Base preparada para consultas tipo Access: cliente, telefono, serie, tecnico, sin avisar, sin retirar y garantias.
          </p>
        </div>
        <Button onClick={() => onNavigate("ordenes")} type="button" variant="secondary">Abrir ordenes</Button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {queryCards.map((card) => (
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5" key={card.title}>
            <p className="text-sm font-medium text-slate-600">{card.title}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{card.value}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">{card.action}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RepairAccessImportPanel({ latestImport }: { latestImport: RepairAccessImportSummary | null }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand-700">Importar clientes</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Migracion desde Access</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Esta pantalla queda reservada para importar clientes exportados desde Access. No importa reparaciones viejas ni impacta caja.
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
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
