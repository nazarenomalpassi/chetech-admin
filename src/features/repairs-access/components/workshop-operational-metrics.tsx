import { Card } from "@/components/ui/card";
import type { WorkshopOperationalMetricsSnapshot } from "../operational-metrics";
import { getRepairAccessStatusLabel } from "./repair-access-helpers";

const number = (value: number) => value.toLocaleString("es-AR");
const date = (value: string) => value.split("-").reverse().join("/");
const duration = (value: number | null) => value === null ? "Sin muestra" : `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })} dias`;

export function WorkshopOperationalMetrics({ metrics }: { metrics: WorkshopOperationalMetricsSnapshot | null }) {
  if (!metrics) return <Card><p role="status">Metricas operativas no disponibles. Reintenta cuando se habilite la consulta del taller.</p></Card>;
  const { current, periodFlow, warranty, phaseDurations, quality } = metrics;
  const ageRows = [
    { label: "0 a 7 dias", value: current.age.days0to7 },
    { label: "8 a 14 dias", value: current.age.days8to14 },
    { label: "15 a 30 dias", value: current.age.days15to30 },
    { label: "31 dias o mas", value: current.age.days31plus }
  ];
  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-graphite">Metricas operativas</h2>
          <p className="mt-1 text-sm text-slate-600">Todas las ordenes del taller, no solo las de la pagina actual.</p>
        </div>
        <p className="text-xs text-slate-500">Estado actual al <time dateTime={metrics.asOf}>{date(metrics.asOf)}</time></p>
      </header>

      <section aria-label="Estado actual del taller" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Equipos abiertos" value={current.openOrders} detail="En custodia, incluso sin solucion o sin fallas, hasta registrar retiro." />
        <Stat label="Sin movimiento hace 7 dias" value={current.inactivity.staleOrders} detail={`Sobre ${number(current.inactivity.knownActivityOrders)} ordenes con actividad verificable.`} warning />
        <Stat label="Esperando autorizacion" value={current.waitingAuthorization} detail="Presupuestadas sin aceptacion o rechazo vigente." />
        <Stat label="Listos sin retirar" value={current.ready.orders} detail={`Espera mediana: ${duration(current.ready.medianWaitDays)}. Mayor espera: ${duration(current.ready.oldestWaitDays)}.`} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card role="region" aria-label="Antiguedad de equipos abiertos">
          <h3 className="text-base font-semibold text-graphite">Antiguedad en el local</h3>
          <p className="mt-1 text-xs text-slate-500">Dias calendario desde el ingreso. No es tiempo de trabajo tecnico.</p>
          <dl className="mt-4 space-y-3">
            {ageRows.map((row) => <div key={row.label}>
              <div className="flex items-center justify-between gap-3 text-sm"><dt>{row.label}</dt><dd className="font-semibold tabular-nums">{number(row.value)}</dd></div>
              <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-graphite" style={{ width: `${current.openOrders ? Math.min(100, row.value * 100 / current.openOrders) : 0}%` }} /></div>
            </div>)}
          </dl>
          <p className="mt-4 text-xs text-slate-500">{number(current.age.unknownIntakeOrders)} ordenes con ingreso sin fecha valida o futura.</p>
        </Card>
        <Card role="region" aria-label="Repuestos pendientes">
          <h3 className="text-base font-semibold text-graphite">Repuestos pendientes</h3>
          <p className="mt-1 text-sm text-slate-600">{number(current.parts.orders)} ordenes / {number(current.parts.requests)} solicitudes pendientes de recepcion.</p>
          <dl className="mt-5 grid grid-cols-2 gap-4">
            <Datum label="Unidades por comprar" value={number(current.parts.unitsToPurchase)} />
            <Datum label="Unidades en camino" value={number(current.parts.unitsInTransit)} />
            <Datum label="Total por recibir" value={number(current.parts.unitsToReceive)} />
          </dl>
          <p className="mt-4 text-xs text-slate-500">Sin duplicar ordenes con varios repuestos. Las solicitudes canceladas no cuentan.</p>
        </Card>
      </div>

      <Card role="region" aria-label="Movimiento del periodo">
        <div className="flex flex-col justify-between gap-2 sm:flex-row">
          <div><h3 className="text-base font-semibold text-graphite">Movimiento del periodo</h3><p className="mt-1 text-xs text-slate-500">{date(metrics.period.from)} al {date(metrics.period.to)}. Los retiros pueden corresponder a ingresos de otros meses.</p></div>
          <dl className="flex gap-8"><Datum label="Ingresos" value={number(periodFlow.intakes)} /><Datum label="Retiros registrados" value={number(periodFlow.closures)} /></dl>
        </div>
        <details className="mt-4 border-t border-line pt-3">
          <summary className="min-h-11 cursor-pointer rounded-md py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40">Ver movimiento diario</summary>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-sm"><caption className="sr-only">Ingresos y retiros por dia en el periodo seleccionado</caption><thead><tr><th scope="col" className="py-2">Fecha</th><th scope="col">Ingresos</th><th scope="col">Retiros</th></tr></thead><tbody>{periodFlow.days.map((day) => <tr className="border-t border-line" key={day.date}><th scope="row" className="py-2 font-normal">{date(day.date)}</th><td className="tabular-nums">{number(day.intakes)}</td><td className="tabular-nums">{number(day.closures)}</td></tr>)}</tbody></table>
          </div>
        </details>
        <p className="mt-2 text-xs text-slate-500">{number(periodFlow.closuresMissingDate)} retiros sin fecha verificable, excluidos del periodo.</p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card role="region" aria-label="Tiempos por estado">
          <h3 className="text-base font-semibold text-graphite">Mediana de tiempo por estado</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Solo intervalos cerrados entre cambios reales, cuya salida ocurrio en el periodo. No son horas trabajadas.</p>
          {phaseDurations.length ? <ul className="mt-4 divide-y divide-line">{phaseDurations.map((phase) => <li className="flex flex-wrap items-center justify-between gap-2 py-3" key={phase.status}>
            <div><p className="text-sm font-medium">{getRepairAccessStatusLabel(phase.status)}</p><p className="mt-1 text-xs text-slate-500">{number(phase.samples)} intervalos / {number(phase.orders)} ordenes</p></div><span className="text-sm font-semibold tabular-nums">{duration(phase.medianDays)}</span>
          </li>)}</ul> : <p className="mt-4 text-sm text-slate-600">Sin intervalos de estados verificables en este periodo.</p>}
        </Card>
        <Card role="region" aria-label="Reingresos por garantia">
          <h3 className="text-base font-semibold text-graphite">Reingresos por garantia</h3>
          <p className="mt-1 text-xs text-slate-500">Circuito separado del ingreso y retiro de la reparacion original.</p>
          <dl className="mt-4 grid grid-cols-3 gap-3"><Datum label="Activos hoy" value={number(warranty.activeReturns)} /><Datum label="Ingresos del periodo" value={number(warranty.openedInPeriod)} /><Datum label="Retiros del periodo" value={number(warranty.closedInPeriod)} /></dl>
          <p className="mt-3 text-xs text-slate-500">{number(warranty.uniqueOrdersInPeriod)} ordenes distintas con reingreso en el periodo.</p>
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-sm font-medium">Cohorte de entregas con garantia vencida</p>
            <p className="mt-1 text-xs text-slate-500">Entregadas en el periodo seleccionado y con plazo de garantia ya vencido.</p>
            <p className="mt-2 text-sm text-slate-600">{number(warranty.matureCohort.maturedOrders)} ordenes maduras / {number(warranty.matureCohort.returnedOrders)} con reingresos registrados.</p>
            <p className="mt-2 text-sm font-semibold">Tasa comparable: {warranty.matureCohort.returnRate === null ? "No disponible" : `${number(warranty.matureCohort.returnRate)} %`}</p>
            {warranty.matureCohort.reason && <p className="mt-2 text-xs leading-5 text-slate-500">{warranty.matureCohort.reason}</p>}
          </div>
        </Card>
      </div>

      <details className="rounded-xl border border-line bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <summary className="min-h-11 cursor-pointer rounded-md py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite/40">Fuentes y calidad de las fechas</summary>
        <div className="space-y-2 pb-3 leading-5">
          <p>{number(current.inactivity.unknownActivityOrders)} ordenes sin actividad verificable; no se cuentan como detenidas ni recientes.</p>
          <p>Actividad: cambios reales de estado y eventos operativos identificables. No se usa la ultima edicion de la ficha ni eventos genericos.</p>
          <p>{number(current.ready.unknownDateOrders)} equipos sin fecha de listo verificable. La espera usa el ultimo ingreso registrado al estado actual, no la fecha de creacion.</p>
          <p>{number(quality.reconstructedStatusEvents)} eventos reconstruidos excluidos; {number(quality.ambiguousStatusEvents)} eventos con hora ambigua y {number(quality.invalidStatusIntervals)} intervalos inconsistentes excluidos.</p>
          <p>Las garantias maduras se agrupan por fecha de entrega original dentro del periodo. Sin observacion continua verificada, no se supone que una orden sin reingreso registrado nunca volvio.</p>
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, detail, warning = false }: { label: string; value: number; detail: string; warning?: boolean }) {
  return <Card role="group" aria-label={label} className={warning ? "border-amber-200 bg-amber-50/40" : undefined}><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums text-graphite">{number(value)}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></Card>;
}

function Datum({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dd className="break-words text-xl font-semibold tabular-nums text-graphite">{value}</dd><dt className="mt-1 text-xs leading-5 text-slate-500">{label}</dt></div>;
}
