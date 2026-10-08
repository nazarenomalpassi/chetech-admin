"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCashMethod } from "@/lib/cash";
import { formatCurrency, formatDate } from "@/lib/utils";
import { loadCashReconciliationsAction, saveCashReconciliationAction } from "./reconciliation-actions";
import type { CashReconciliationRecord } from "./reconciliation-model";
import { ReconciliationAmendmentDialog } from "./reconciliation-amendment-dialog";
import type { PaginationMeta } from "@/lib/pagination";

export function ReconciliationPanel({ today, balances }: { today: string; balances: Array<{ method: string; balance: number }> }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [requestId] = useState(() => crypto.randomUUID());
  const [records, setRecords] = useState<CashReconciliationRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [amendmentsReady, setAmendmentsReady] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void loadCashReconciliationsAction(historyPage).then((result) => {
      if (!active) return;
      setReady(result.ready);
      setRecords(result.records);
      setAmendmentsReady(Boolean(result.amendmentsReady));
      setPagination(result.pagination ?? null);
      setMessage(result.message);
    }).catch(() => {
      if (active) setMessage("No se pudo leer el historial de arqueos. Actualiza y reintenta.");
    });
    return () => { active = false; };
  }, [historyPage]);

  const closedToday = records.some((record) => record.business_date === today);
  const cannotCount = closedToday || historyPage > 1 || isPending;
  async function refreshHistory() {
    const history = await loadCashReconciliationsAction(historyPage);
    setRecords(history.records); setAmendmentsReady(Boolean(history.amendmentsReady)); setPagination(history.pagination ?? null);
    if (history.message) setMessage(history.message);
  }

  return <div className="mt-4 space-y-4">
    <p className="text-sm text-slate-600">Compara el efectivo contado y los saldos verificados en cada cuenta. Una diferencia exige motivo y no ajusta el balance del sistema.</p>
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(async () => {
        try {
          const result = await saveCashReconciliationAction({
            id: requestId, date: today, observations: String(formData.get("observations") ?? ""),
            accounts: balances.map((account) => ({ method: account.method, expected: account.balance,
              physical: Number(counts[account.method]), reason: String(formData.get(`reason-${account.method}`) ?? "") }))
          });
          setMessage(result.message);
          if (result.success) {
            await refreshHistory();
            router.refresh();
          }
        } catch {
          setMessage("No se pudo confirmar el cierre. Reintenta: el identificador evita duplicados.");
        }
      });
    }}>
      {balances.map((account) => {
        const physical = counts[account.method];
        const difference = physical != null && physical !== "" ? (Math.round(Number(physical) * 100) - Math.round(account.balance * 100)) / 100 : null;
        return <fieldset key={account.method} className="border-t border-slate-200 py-4">
          <legend className="pr-2 text-sm font-semibold">{formatCashMethod(account.method)}</legend>
          <p className="text-sm">Esperado: <strong>{formatCurrency(account.balance)}</strong></p>
          <label className="mt-3 grid gap-2 text-sm">{account.method === "efectivo" ? "Efectivo fisico contado" : "Saldo verificado en la cuenta"}
            <Input name={`physical-${account.method}`} required min="0" step="0.01" type="number" value={physical ?? ""} disabled={cannotCount} onChange={(event) => setCounts((current) => ({ ...current, [account.method]: event.target.value }))} />
          </label>
          <p aria-live="polite" className="mt-2 text-sm">Diferencia: {difference == null ? "Pendiente de contar" : formatCurrency(difference)}</p>
          <label className="mt-3 grid gap-2 text-sm">Motivo de la diferencia{difference ? " (obligatorio)" : " (opcional)"}
            <Input name={`reason-${account.method}`} required={difference !== null && difference !== 0} minLength={difference ? 3 : undefined} maxLength={1000} disabled={cannotCount} />
          </label>
        </fieldset>;
      })}
      <label className="grid gap-2 text-sm">Observaciones del cierre<Textarea name="observations" maxLength={2000} disabled={cannotCount} /></label>
      <Button disabled={!ready || cannotCount} type="submit">{isPending ? "Cerrando..." : historyPage > 1 ? "Volver a primera pagina para cerrar hoy" : closedToday ? "Hoy ya tiene cierre auditado" : "Cerrar arqueo sin ajustar saldos"}</Button>
    </form>
    {message ? <p role="status" aria-live="polite" className="rounded-2xl bg-brand-50 p-3 text-sm">{message}</p> : null}
    <div className="space-y-3">
      <h3 className="font-semibold">Arqueos auditados</h3>
      {records.map((record) => <article key={record.id} className="border-t border-slate-200 py-4 text-sm">
        <p className="font-semibold">{formatDate(record.business_date)}: cierre inmutable</p>
        <p className="mt-1 break-all text-xs text-slate-500">Registrado: {new Date(record.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} | Usuario: {record.created_by}</p>
        {record.accounts.map((account) => <div key={account.method} className="mt-3">
          <p className="font-medium">{formatCashMethod(account.method)}</p>
          <p>Esperado {formatCurrency(account.expected)} | Verificado {formatCurrency(account.physical)} | Diferencia {formatCurrency(account.difference)}</p>
          {account.reason ? <p className="text-slate-500">{account.reason}</p> : null}
        </div>)}
        {record.observations ? <p className="mt-2 text-slate-600">{record.observations}</p> : null}
        {record.amendments?.map((amendment, index) => <div key={amendment.id} className="mt-3 border-l-2 border-slate-200 pl-3">
          <p className="font-semibold">Revision {index + 1}: {amendment.kind === "reopened" ? "Reapertura" : "Cierre corregido"}</p>
          <p>Motivo: {amendment.reason}</p><p className="break-all text-xs text-slate-500">Usuario: {amendment.created_by} | {new Date(amendment.created_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p>
          {amendment.kind === "closed" ? amendment.accounts.map((account) => <p key={account.method}>{formatCashMethod(account.method)}: verificado {formatCurrency(account.physical)}, diferencia {formatCurrency(account.difference)}. {account.reason}</p>) : null}
          {amendment.observations ? <p>Observaciones: {amendment.observations}</p> : null}
        </div>)}
        {amendmentsReady ? <ReconciliationAmendmentDialog key={record.amendments?.at(-1)?.id ?? record.id} record={record} onRecorded={refreshHistory} /> : null}
      </article>)}
      {ready && !records.length ? <p className="text-sm text-slate-500">Todavia no hay arqueos por cuenta. Los cierres anteriores permanecen abajo.</p> : null}
      {pagination ? <nav aria-label="Historial de arqueos" className="flex flex-wrap items-center gap-3"><span>Pagina {pagination.page} de {pagination.totalPages}</span><Button type="button" variant="secondary" disabled={!pagination.hasPreviousPage} onClick={() => setHistoryPage((page) => page - 1)}>Anterior</Button><Button type="button" variant="secondary" disabled={!pagination.hasNextPage} onClick={() => setHistoryPage((page) => page + 1)}>Siguiente</Button></nav> : null}
    </div>
  </div>;
}
