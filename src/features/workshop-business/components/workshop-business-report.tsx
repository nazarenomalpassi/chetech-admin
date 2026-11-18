import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BusinessChart } from "@/features/reports/components/business-chart";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  workshopCategoryHref,
  type WorkshopBusinessReportResult,
  type WorkshopCategory
} from "../model";

const numberFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const days = (value: number | null) =>
  value === null ? "Sin datos" : `${numberFormat.format(value)} dias`;
const money = (value: number | null) => (value === null ? "Por determinar" : formatCurrency(value));

function Metric({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "income" | "expense" | "pending" | "neutral";
}) {
  const tones = {
    income: "border-t-success bg-success-soft/50",
    expense: "border-t-danger bg-danger-soft/50",
    pending: "border-t-warning bg-warning-soft/50",
    neutral: "border-t-info bg-info-soft/40"
  };
  const textTones = {
    income: "text-success",
    expense: "text-danger",
    pending: "text-warning",
    neutral: "text-foreground"
  };
  return (
    <Card
      role="group"
      aria-label={label}
      className={cn("min-w-0 space-y-2 border-t-2", tones[tone])}
    >
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tracking-tight wrap-break-word tabular-nums",
          textTones[tone]
        )}
      >
        {value}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{detail}</p>
    </Card>
  );
}

export function WorkshopBusinessReportView({ data }: { data: WorkshopBusinessReportResult }) {
  const { report, range } = data;
  const totals = report?.totals;
  const categories: { key: WorkshopCategory; label: string }[] = [
    { key: "unassigned", label: "Sin técnico asignado" },
    { key: "waiting_customer", label: "Esperando cliente" },
    { key: "parts", label: "Repuestos pendientes" },
    { key: "ready", label: "Listos para retirar" },
    { key: "return", label: "Pendientes de devolver" }
  ];
  return (
    <section aria-labelledby="workshop-business-heading" className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h2 id="workshop-business-heading" className="text-xl font-semibold text-foreground">
              Negocio del taller
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Estado actual de las ordenes ingresadas en el rango elegido. Los cobros y costos
              incluyen toda su historia registrada, no solo movimientos de esas fechas.
            </p>
          </div>
          <form
            action="/reportes"
            method="get"
            className="grid gap-3 sm:grid-cols-[minmax(0,170px)_minmax(0,170px)_auto]"
          >
            <div>
              <label htmlFor="workshop-from" className="mb-2 block text-sm font-medium">
                Ingreso desde
              </label>
              <Input
                id="workshop-from"
                name="from"
                type="date"
                defaultValue={range.from}
                required
              />
            </div>
            <div>
              <label htmlFor="workshop-to" className="mb-2 block text-sm font-medium">
                Ingreso hasta
              </label>
              <Input id="workshop-to" name="to" type="date" defaultValue={range.to} required />
            </div>
            <Button type="submit" className="self-end">
              Aplicar ingreso
            </Button>
          </form>
        </div>
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Ingreso: {formatDate(range.from)} al {formatDate(range.to)}.
          {report && (
            <>
              {" "}
              Foto actual al {formatDate(report.snapshotAt)}. No reconstruye el estado historico al
              cierre del rango.
            </>
          )}
        </p>
      </Card>

      {!report || !totals ? (
        <Card role="status" className="border-warning-border">
          <p>
            Informe no disponible: falta habilitar la migración de lectura de negocio del taller. No
            se muestran totales ficticios.
          </p>
        </Card>
      ) : (
        <>
          {totals.orders === 0 && (
            <Card role="status">No hay ordenes ingresadas en este rango.</Card>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Cobrado real"
              value={money(totals.collected)}
              tone="income"
              detail="Pagos efectivos de estas ordenes, incluidos parciales. No suma comprobantes ni duplica sus espejos."
            />
            <Metric
              label="Pendiente conocido"
              value={money(totals.debt ?? totals.knownDebtSubtotal)}
              tone="pending"
              detail={
                totals.debt === null
                  ? `Subtotal parcial. ${totals.unknownChargeOrders} ordenes sin importe a cobrar definido; no representa toda la deuda.`
                  : `Importe exigible menos pagos por orden. Crédito conocido a favor: ${money(totals.knownCreditSubtotal)}.`
              }
            />
            <Metric
              label="Costo directo registrado"
              value={money(totals.directCost)}
              tone={totals.directCost === null ? "neutral" : "expense"}
              detail={
                totals.directCost === null
                  ? `${totals.unknownCostOrders} ordenes requieren completar costos. Registrado conocido: ${money(totals.knownDirectCostSubtotal)}; no es el costo total.`
                  : "Repuestos consumidos y terceros con costo real. No vuelve a sumar compras vinculadas."
              }
            />
            <Metric
              label="Margen directo registrado"
              value={money(totals.directMargin)}
              tone={
                totals.directMargin === null
                  ? "neutral"
                  : totals.directMargin < 0
                    ? "expense"
                    : "income"
              }
              detail="Importe exigible menos costo directo completo. No es utilidad neta: excluye mano de obra y gastos generales."
            />
          </div>

          <BusinessChart
            title="Cobros, cargos y costos de la cohorte"
            description="Importes independientes, no sumables. Cobrado: pagos reales de toda la historia de las ordenes ingresadas en el rango. Exigible y pendiente: solo importes conocidos; no son ingresos adicionales."
            rows={[
              { label: "Cobrado real", value: totals.collected, tone: "income" },
              { label: "Exigible conocido", value: totals.knownChargeSubtotal, tone: "service" },
              {
                label: totals.debt === null ? "Pendiente parcial" : "Pendiente",
                value: totals.debt ?? totals.knownDebtSubtotal,
                tone: "pending"
              },
              { label: "Costo directo total", value: totals.directCost, tone: "expense" },
              { label: "Margen directo total", value: totals.directMargin, tone: "margin" }
            ]}
          />

          <Card className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Pendientes de estas ordenes</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {totals.orders} ordenes ingresadas; {totals.activeCustody} siguen en custodia. Las
                colas pueden superponerse: no se suman. Los enlaces abren las colas actuales
                completas del taller.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {categories.map(({ key, label }) => (
                <Link
                  key={key}
                  href={workshopCategoryHref(key)}
                  className={cn(
                    "rounded-xl border p-4 text-foreground hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
                    key === "ready"
                      ? "border-success-border bg-success-soft"
                      : key === "parts" || key === "return"
                        ? "border-warning-border bg-warning-soft"
                        : "border-info-border bg-info-soft"
                  )}
                >
                  <p className="text-xs font-medium">{label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {report.categories[key]}
                  </p>
                  <p className="mt-2 text-xs underline">Ver cola actual completa</p>
                </Link>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-3">
              <h3 className="text-lg font-semibold">Antigüedad desde ingreso</h3>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">Mediana</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {days(totals.intakeAgeMedianDays)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Percentil 90</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {days(totals.intakeAgeP90Days)}
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                Edad al {formatDate(report.asOf)} de las ordenes que siguen en custodia. No mide
                esperas por fase. Excluye {totals.futureIntakeOrders} ingresos futuros del calculo
                de edad.
              </p>
            </Card>
            <Card className="space-y-3">
              <h3 className="text-lg font-semibold">Garantía registrada</h3>
              <dl className="grid grid-cols-3 gap-3">
                {[
                  ["Con garantia", totals.warrantyOrders],
                  ["Vigentes", totals.activeWarrantyOrders],
                  ["Por revisar", totals.warrantyReviewOrders]
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-muted-foreground">
                Cuenta ordenes con cobertura, no reingresos ni tasa de retrabajo. No existe aquí
                evidencia suficiente para esas metricas.
              </p>
            </Card>
          </div>

          <Card className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Por técnico asignado</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Agrupa por responsable actual de la REP, no por quien la creo. No atribuye
                historicamente trabajo o cobros anteriores a una reasignacion.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {report.technicians.map((technician) => (
                <article
                  key={technician.technicianId ?? "unassigned"}
                  className="min-w-0 rounded-2xl border border-border bg-white/70 p-4"
                >
                  <h4 className="font-semibold wrap-break-word">{technician.technicianName}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {technician.orders} ordenes / {technician.activeCustody} en custodia /{" "}
                    {technician.acceptedCurrent} aceptadas vigentes
                  </p>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex flex-wrap justify-between gap-1">
                      <dt>Cobrado real</dt>
                      <dd className="font-semibold tabular-nums">{money(technician.collected)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-1">
                      <dt>Deuda conocida, parcial</dt>
                      <dd className="font-semibold tabular-nums">
                        {money(technician.knownDebtSubtotal)}
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-1">
                      <dt>Costo directo</dt>
                      <dd className="font-semibold tabular-nums">{money(technician.directCost)}</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-1">
                      <dt>Edad: mediana / P90</dt>
                      <dd className="font-semibold tabular-nums">
                        {days(technician.intakeAgeMedianDays)} / {days(technician.intakeAgeP90Days)}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Costo registrado conocido: {money(technician.knownDirectCostSubtotal)};{" "}
                    {technician.unknownCostOrders} incompletas. {technician.creatorDifferentOrders}{" "}
                    creadas por otra persona.
                  </p>
                </article>
              ))}
            </div>
          </Card>

          <Card className="p-0 sm:p-0">
            <details>
              <summary className="min-h-14 cursor-pointer rounded-xl p-4 text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid">
                <span className="font-semibold">Calidad y alcance de los datos</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {totals.unknownCostOrders} ordenes con costos por completar;{" "}
                  {totals.unknownChargeOrders} sin importe definido. Ver evidencia y reglas.
                </span>
              </summary>
              <div className="space-y-3 border-t border-border p-4 sm:p-5">
                <p className="text-sm text-body">
                  {totals.staleAcceptanceOrders} aceptaciones sin evidencia vigente;{" "}
                  {totals.paidFlagWithoutPaymentsOrders} marcas de pagado sin registros de pago;{" "}
                  {totals.unknownCostOrders} ordenes con costo incompleto. No se corrigen saldos ni
                  historia desde este informe.
                </p>
                <p className="text-sm text-body">
                  Deuda total: {money(totals.debt)}. Margen conocido parcial:{" "}
                  {money(totals.knownDirectMarginSubtotal)}; solo ordenes con importe y costos
                  conocidos. Nunca se extrapola a las demas ordenes.
                </p>
                <p className="text-sm text-body">
                  Aceptacion vigente:{" "}
                  {totals.acceptanceRate === null
                    ? "Sin decisiones"
                    : `${numberFormat.format(totals.acceptanceRate)}%`}
                  ; {totals.acceptedCurrent} aceptadas / {totals.rejectedCurrent} rechazadas con
                  evidencia de la version actual. Denominador: esas decisiones vigentes, no todas
                  las ordenes.
                </p>
                <details className="rounded-2xl border border-border bg-white/70 p-4">
                  <summary className="cursor-pointer font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
                    Fuentes y reglas de calculo
                  </summary>
                  <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                    <p>
                      Repuestos consumidos: {numberFormat.format(totals.consumedPartsQuantity)}{" "}
                      unidades; costo registrado {money(totals.consumedPartsCostKnown)}. Se calcula
                      cantidad instalada por costo unitario. Pedidos sin consumir y compras no se
                      cargan otra vez como costo.
                    </p>
                    <p>
                      Terceros no cancelados: costo real registrado{" "}
                      {money(totals.thirdPartyCostKnown)}. No se usan promesas o estimaciones como
                      costos reales. Un costo unitario o real faltante conserva el total completo
                      como desconocido; un cero explicito sigue siendo cero.
                    </p>
                    <p>
                      Pagos vinculados a compras: {money(totals.linkedPurchasePayments)}, excluidos
                      del costo para evitar duplicar el consumo. Gastos REP sin clasificacion:{" "}
                      {money(totals.unclassifiedRepExpenses)}; no se suman automaticamente a
                      terceros o repuestos y marcan el costo como incompleto.
                    </p>
                    <p>
                      Deuda: monto final distinto de cero, o presupuesto vigente aceptado con
                      evidencia, o precio final histórico único, menos cobros reales por orden, con
                      piso cero. El cero por defecto del monto final no oculta un presupuesto
                      aceptado ni prueba que el servicio sea gratuito. Un presupuesto gratuito
                      aceptado conserva el cero; uno pendiente no genera deuda conocida. Crédito
                      conocido: {money(totals.knownCreditSubtotal)}. Una marca de pagado o un
                      comprobante no es un pago.
                    </p>
                    <p>
                      Margen directo: importe exigible menos costos directos registrados. No es
                      resultado de caja ni utilidad neta. La falta de costo estructurado en historia
                      importada o notas de repuestos tambien se advierte; no se inventa un costo
                      historico.
                    </p>
                  </div>
                </details>
              </div>
            </details>
          </Card>
        </>
      )}
    </section>
  );
}
