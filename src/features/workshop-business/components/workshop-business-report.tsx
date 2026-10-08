import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { workshopCategoryHref, type WorkshopBusinessReportResult, type WorkshopCategory } from "../model";

const numberFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const days = (value: number | null) => value === null ? "Sin datos" : `${numberFormat.format(value)} dias`;
const money = (value: number | null) => value === null ? "Datos incompletos" : formatCurrency(value);

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card role="group" aria-label={label} className="min-w-0 space-y-2">
    <p className="text-sm font-medium text-slate-600">{label}</p>
    <p className="break-words text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
    <p className="text-xs leading-relaxed text-slate-600">{detail}</p>
  </Card>;
}

export function WorkshopBusinessReportView({ data }: { data: WorkshopBusinessReportResult }) {
  const { report, range } = data;
  const totals = report?.totals;
  const categories: { key: WorkshopCategory; label: string }[] = [
    { key: "unassigned", label: "Sin tecnico asignado" },
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
            <h2 id="workshop-business-heading" className="text-xl font-semibold text-slate-950">Negocio del taller</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Estado actual de las ordenes ingresadas en el rango elegido. Los cobros y costos incluyen toda su historia registrada, no solo movimientos de esas fechas.</p>
          </div>
          <form action="/reportes" method="get" className="grid gap-3 sm:grid-cols-[minmax(0,170px)_minmax(0,170px)_auto]">
            <div><label htmlFor="workshop-from" className="mb-2 block text-sm font-medium">Ingreso desde</label><Input id="workshop-from" name="from" type="date" defaultValue={range.from} required /></div>
            <div><label htmlFor="workshop-to" className="mb-2 block text-sm font-medium">Ingreso hasta</label><Input id="workshop-to" name="to" type="date" defaultValue={range.to} required /></div>
            <Button type="submit" className="self-end">Aplicar ingreso</Button>
          </form>
        </div>
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-slate-600">
          Ingreso: {formatDate(range.from)} al {formatDate(range.to)}.
          {report && <> Foto actual al {formatDate(report.snapshotAt)}. No reconstruye el estado historico al cierre del rango.</>}
        </p>
      </Card>

      {!report || !totals ? <Card role="status" className="border-amber-200"><p>Informe no disponible: falta habilitar la migracion de lectura de negocio del taller. No se muestran totales ficticios.</p></Card> : <>
        {totals.orders === 0 && <Card role="status">No hay ordenes ingresadas en este rango.</Card>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Ordenes ingresadas" value={numberFormat.format(totals.orders)} detail={`${totals.activeCustody} siguen en custodia. Agregado completo, sin limite de filas.`} />
          <Metric label="Cobrado real" value={money(totals.collected)} detail="Pagos nativos e historicos efectivos, incluidos parciales. Sin duplicar sus espejos ni sumar comprobantes." />
          <Metric label="Saldo pendiente de estas ordenes" value={money(totals.debt)} detail={totals.unknownChargeOrders > 0 ? `Subtotal conocido: ${money(totals.knownDebtSubtotal)}. ${totals.unknownChargeOrders} ordenes sin importe a cobrar definido.` : `Importe a cobrar menos pagos por orden. Credito conocido a favor: ${money(totals.knownCreditSubtotal)}.`} />
          <Metric label="Costo directo registrado" value={money(totals.directCost)} detail={`Subtotal registrado: ${money(totals.knownDirectCostSubtotal)}. ${totals.unknownCostOrders} ordenes con costos incompletos o ambiguos.`} />
          <Metric label="Margen directo registrado" value={money(totals.directMargin)} detail={`Subtotal de ordenes con importe y costos conocidos: ${money(totals.knownDirectMarginSubtotal)}. No es utilidad neta: excluye mano de obra y gastos generales.`} />
          <Metric label="Aceptacion vigente" value={totals.acceptanceRate === null ? "Sin decisiones" : `${numberFormat.format(totals.acceptanceRate)}%`} detail={`${totals.acceptedCurrent} aceptadas / ${totals.rejectedCurrent} rechazadas con evidencia de la version actual. Denominador: esas decisiones vigentes, no todas las ordenes.`} />
        </div>

        <Card className="space-y-4">
          <div><h3 className="text-lg font-semibold">Pendientes de estas ordenes</h3><p className="mt-1 text-sm text-slate-600">Los números corresponden al rango de ingreso. Los enlaces abren las colas actuales completas del taller.</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {categories.map(({ key, label }) => <Link key={key} href={workshopCategoryHref(key)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600">
              <p className="text-xs font-medium">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{report.categories[key]}</p><p className="mt-2 text-xs underline">Ver cola actual completa</p>
            </Link>)}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <h3 className="text-lg font-semibold">Antiguedad desde ingreso</h3>
            <dl className="grid grid-cols-2 gap-4"><div><dt className="text-sm text-slate-600">Mediana</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{days(totals.intakeAgeMedianDays)}</dd></div><div><dt className="text-sm text-slate-600">Percentil 90</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{days(totals.intakeAgeP90Days)}</dd></div></dl>
            <p className="text-sm text-slate-600">Edad al {formatDate(report.asOf)} de las ordenes que siguen en custodia. No mide esperas por fase. Excluye {totals.futureIntakeOrders} ingresos futuros del calculo de edad.</p>
          </Card>
          <Card className="space-y-3">
            <h3 className="text-lg font-semibold">Garantia registrada</h3>
            <dl className="grid grid-cols-3 gap-3">{[
              ["Con garantia", totals.warrantyOrders], ["Vigentes", totals.activeWarrantyOrders], ["Por revisar", totals.warrantyReviewOrders]
            ].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
            <p className="text-sm text-slate-600">Cuenta ordenes con cobertura, no reingresos ni tasa de retrabajo. No existe aqui evidencia suficiente para esas metricas.</p>
          </Card>
        </div>

        <Card className="space-y-4">
          <div><h3 className="text-lg font-semibold">Por tecnico asignado</h3><p className="mt-1 text-sm text-slate-600">Agrupa por responsable actual de la REP, no por quien la creo. No atribuye historicamente trabajo o cobros anteriores a una reasignacion.</p></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.technicians.map((technician) => <article key={technician.technicianId ?? "unassigned"} className="min-w-0 rounded-2xl border border-slate-200 bg-white/70 p-4">
              <h4 className="break-words font-semibold">{technician.technicianName}</h4>
              <p className="mt-1 text-xs text-slate-600">{technician.orders} ordenes / {technician.activeCustody} en custodia / {technician.acceptedCurrent} aceptadas vigentes</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex flex-wrap justify-between gap-1"><dt>Cobrado real</dt><dd className="font-semibold tabular-nums">{money(technician.collected)}</dd></div>
                <div className="flex flex-wrap justify-between gap-1"><dt>Deuda conocida, parcial</dt><dd className="font-semibold tabular-nums">{money(technician.knownDebtSubtotal)}</dd></div>
                <div className="flex flex-wrap justify-between gap-1"><dt>Costo directo</dt><dd className="font-semibold tabular-nums">{money(technician.directCost)}</dd></div>
                <div className="flex flex-wrap justify-between gap-1"><dt>Edad: mediana / P90</dt><dd className="font-semibold tabular-nums">{days(technician.intakeAgeMedianDays)} / {days(technician.intakeAgeP90Days)}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-slate-600">Costo registrado conocido: {money(technician.knownDirectCostSubtotal)}; {technician.unknownCostOrders} incompletas. {technician.creatorDifferentOrders} creadas por otra persona.</p>
            </article>)}
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-lg font-semibold">Calidad de los datos</h3>
          <p className="text-sm text-slate-700">{totals.staleAcceptanceOrders} aceptaciones sin evidencia vigente; {totals.paidFlagWithoutPaymentsOrders} marcas de pagado sin registros de pago; {totals.unknownCostOrders} ordenes con costo incompleto. No se corrigen saldos ni historia desde este informe.</p>
          <details className="rounded-2xl border border-slate-200 bg-white/70 p-4">
            <summary className="cursor-pointer font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600">Fuentes y reglas de calculo</summary>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">
              <p>Repuestos consumidos: {numberFormat.format(totals.consumedPartsQuantity)} unidades; costo registrado {money(totals.consumedPartsCostKnown)}. Se calcula cantidad instalada por costo unitario. Pedidos sin consumir y compras no se cargan otra vez como costo.</p>
              <p>Terceros no cancelados: costo real registrado {money(totals.thirdPartyCostKnown)}. No se usan promesas o estimaciones como costos reales. Un costo unitario o real faltante conserva el total completo como desconocido; un cero explicito sigue siendo cero.</p>
              <p>Pagos vinculados a compras: {money(totals.linkedPurchasePayments)}, excluidos del costo para evitar duplicar el consumo. Gastos REP sin clasificacion: {money(totals.unclassifiedRepExpenses)}; no se suman automaticamente a terceros o repuestos y marcan el costo como incompleto.</p>
              <p>Deuda: monto final distinto de cero, o presupuesto vigente aceptado con evidencia, o precio final historico unico, menos cobros reales por orden, con piso cero. El cero por defecto del monto final no oculta un presupuesto aceptado ni prueba que el servicio sea gratuito. Un presupuesto gratuito aceptado conserva el cero; uno pendiente no genera deuda conocida. Credito conocido: {money(totals.knownCreditSubtotal)}. Una marca de pagado o un comprobante no es un pago.</p>
              <p>Margen directo: importe exigible menos costos directos registrados. No es resultado de caja ni utilidad neta. La falta de costo estructurado en historia importada o notas de repuestos tambien se advierte; no se inventa un costo historico.</p>
            </div>
          </details>
        </Card>
      </>}
    </section>
  );
}
