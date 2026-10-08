import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PurchaseCommitments } from "../commitments";
import { formatCurrency } from "@/lib/utils";

export function PurchaseCommitmentsNotice({ commitments }: { commitments: PurchaseCommitments }) {
  return <section className="rounded-xl border border-graphite/10 bg-brand-50 p-4 text-sm text-slate-700" aria-label="Compromisos de compras">
    <h2 className="font-semibold text-slate-950">Compras de taller pendientes de pago</h2>
    {commitments.ready ? <>
      <p className="mt-2">Saldo conocido reservado en el sugerido: <strong>{formatCurrency(commitments.knownOutstanding ?? 0)}</strong>.</p>
      {commitments.unknownCostCount ? <p className="mt-2 text-amber-800">{commitments.unknownCostCount} compras sin costo conocido: no se descuentan. El disponible sugerido es incompleto hasta cotizarlas.</p> : null}
      <p className="mt-2">Costo unitario por cantidad menos gastos pagados vinculados y vigentes. Incluye compras pendientes de cualquier mes, no reservas de stock. No modifica caja, retiros confirmados ni el reparto salarial.</p>
    </> : <p className="mt-2 text-amber-800" role="alert">El sugerido no incluye compromisos: falta la migracion de vinculos o no se pudo consultar. Revisa las compras antes de retirar.</p>}
    <p className="mt-2">Los pagos historicos no se deducen de notas: deben vincularse expresamente en Gastos.</p>
    <Link href="/gastos" className={cn(buttonVariants({ variant: "secondary" }), "mt-3 w-full sm:w-auto")}>Revisar pagos en Gastos</Link>
  </section>;
}
