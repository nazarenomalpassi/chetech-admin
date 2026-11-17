/**
 * Hoja de referencia visual de los componentes base, renderizada con el CSS compilado.
 * Uso: npm run build && npx tsx scripts/qa/ui-reference.tsx > tmp/qa/ui-reference.html
 * Después se abre en un navegador o se fotografía con Playwright.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RepairAccessStatusBadge } from "@/features/repairs-access/components/repair-access-status-badge";

// tsx usa la transformación clásica de JSX en los componentes importados.
Object.assign(globalThis, { React });

const cssDir = path.resolve(".next/static/css");
const css = readdirSync(cssDir)
  .filter((file) => file.endsWith(".css"))
  .map((file) => `<link rel="stylesheet" href="file://${path.join(cssDir, file)}">`)
  .join("");

const statuses = [
  "pendiente_revision",
  "en_revision",
  "presupuestado",
  "presupuestado_aceptado",
  "presupuestado_rechazado",
  "en_reparacion",
  "en_pruebas",
  "listo_para_retirar",
  "retirado",
  "sin_solucion",
  "no_presenta_fallas"
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </Card>
  );
}

const page = (
  <main className="mx-auto max-w-5xl space-y-5 p-6">
    <header>
      <p className="panel-kicker">Referencia</p>
      <h1 className="panel-heading">Componentes base</h1>
      <p className="panel-subheading">Tokens, botones, campos y estados de la interfaz.</p>
    </header>
    <Section title="Botones">
      <div className="flex flex-wrap gap-3">
        <Button>Guardar ingreso</Button>
        <Button variant="secondary">Imprimir etiqueta</Button>
        <Button variant="ghost">Ver historial</Button>
        <Button variant="danger">Anular orden</Button>
        <Button loading>Guardando</Button>
        <Button disabled>Deshabilitado</Button>
        <Button size="sm" variant="secondary">
          Chico
        </Button>
      </div>
    </Section>
    <Section title="Campos">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-medium text-body">
          Cliente
          <Input placeholder="Nombre y apellido" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-body">
          Estado
          <Select
            options={[
              { label: "Pendiente de revisión", value: "a" },
              { label: "Presupuestado", value: "b" }
            ]}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-body">
          Con error
          <Input aria-invalid="true" defaultValue="abc" />
        </label>
      </div>
      <Textarea placeholder="Falla reportada" />
    </Section>
    <Section title="Insignias y estados de orden">
      <div className="flex flex-wrap gap-2">
        <Badge>Neutral</Badge>
        <Badge variant="success">Cobrada</Badge>
        <Badge variant="warning">Pendiente</Badge>
        <Badge variant="danger">Vencida</Badge>
        <Badge variant="info">Informativa</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {statuses.map((status) => (
          <RepairAccessStatusBadge key={status} status={status} />
        ))}
      </div>
    </Section>
    <Section title="Texto">
      <p className="text-foreground">Texto principal: REP-000600 · $ 90.000,00</p>
      <p className="text-body">Texto de cuerpo para etiquetas y detalles.</p>
      <p className="text-muted-foreground">Texto secundario para descripciones.</p>
      <p className="text-subtle-foreground">Texto tenue para ayudas.</p>
      <p className="text-xs text-muted-foreground">Texto más chico de la interfaz (13 px).</p>
    </Section>
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard
        label="Ventas"
        tone="income"
        format="currency"
        icon={TrendingUp}
        value={411500}
        description="Ingresos de mostrador"
      />
      <MetricCard
        label="Gastos"
        tone="expense"
        format="currency"
        icon={TrendingDown}
        value={1813013}
        description="Egresos operativos"
      />
      <MetricCard
        label="Esperando autorización"
        tone="warning"
        icon={Clock}
        value={54}
        description="Presupuestos sin respuesta"
      />
    </div>
  </main>
);

process.stdout.write(
  `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">${css}</head><body>${renderToStaticMarkup(page)}</body></html>`
);
