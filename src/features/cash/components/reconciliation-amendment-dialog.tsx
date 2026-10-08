"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCashMethod } from "@/lib/cash";
import { formatCurrency, formatDate } from "@/lib/utils";
import { closeCashReconciliationCorrectionAction, reopenCashReconciliationAction } from "./reconciliation-actions";
import type { CashReconciliationRecord } from "./reconciliation-model";

export function ReconciliationAmendmentDialog({ record, onRecorded }: { record: CashReconciliationRecord; onRecorded: () => Promise<void> }) {
  const head = record.amendments?.at(-1);
  const isOpenRevision = head?.kind === "reopened";
  const accounts = head?.accounts ?? record.accounts;
  const [open, setOpen] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const initialFormRef = useRef("");
  useEffect(() => {
    if (open && formRef.current) {
      initialFormRef.current = JSON.stringify(Array.from(new FormData(formRef.current).entries()));
    }
  }, [open]);

  function closeDialog() {
    if (pending) return;
    const form = formRef.current;
    const changed = form && JSON.stringify(Array.from(new FormData(form).entries())) !== initialFormRef.current;
    if (changed && !window.confirm("Descartar los cambios del arqueo sin guardar?")) return;
    setOpen(false);
  }
  return <div className="mt-3">
    <p className="font-semibold">Estado vigente: {isOpenRevision ? "Reabierto; pendiente de corregir y cerrar" : "Cerrado"}</p>
    <Button className="mt-2" type="button" variant="secondary" onClick={() => { setMessage(""); setOpen(true); }}>{isOpenRevision ? "Corregir conteo y volver a cerrar" : "Reabrir con motivo"}</Button>
    {open ? <DialogShell labelledBy={`cash-amend-${record.id}`} onClose={closeDialog} panelClassName="max-w-2xl">
      <h2 className="text-xl font-semibold" id={`cash-amend-${record.id}`}>{isOpenRevision ? "Correccion del conteo" : "Reapertura auditada"}: {formatDate(record.business_date)}</h2>
      <p className="mt-2 text-sm text-slate-600">El saldo esperado sigue siendo el del cierre historico. Esto no corrige balances ni registra pagos posteriores. El original y cada revision se conservan.</p>
      <form className="mt-4 space-y-4" ref={formRef} onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
            const input = { id: requestId, rootId: record.id, expectedHeadId: head?.id ?? record.id, reason: String(form.get("amendmentReason") ?? "") };
            const result = isOpenRevision ? await closeCashReconciliationCorrectionAction({ ...input, observations: String(form.get("observations") ?? ""),
              accounts: accounts.map((account) => ({ method: account.method, expected: account.expected, physical: Number(form.get(`physical-${account.method}`)), reason: String(form.get(`reason-${account.method}`) ?? "") }))
            }) : await reopenCashReconciliationAction(input);
            setMessage(result.message);
            if (result.success) { await onRecorded(); setOpen(false); }
          } catch { setMessage("No se pudo confirmar la revision. Reintenta sin cambiar el identificador; no se duplicara."); }
        });
      }}>
        <label className="grid gap-2 text-sm">Motivo obligatorio<Textarea name="amendmentReason" required minLength={3} maxLength={2000} /></label>
        {isOpenRevision ? <>
          {accounts.map((account) => <fieldset className="border-t border-slate-200 py-3" key={account.method}>
            <legend className="pr-2 font-semibold">{formatCashMethod(account.method)}</legend>
            <p className="text-sm">Esperado historico: {formatCurrency(account.expected)} | Conteo previo: {formatCurrency(account.physical)}</p>
            <label className="mt-2 grid gap-2 text-sm">Conteo corregido<Input name={`physical-${account.method}`} required type="number" step="0.01" min="0" defaultValue={account.physical} /></label>
            <label className="mt-2 grid gap-2 text-sm">Motivo de diferencia con el esperado<Input name={`reason-${account.method}`} maxLength={1000} defaultValue={account.reason} /></label>
          </fieldset>)}
          <label className="grid gap-2 text-sm">Observaciones<Textarea name="observations" maxLength={2000} /></label>
        </> : null}
        {message ? <p role="status" aria-live="polite" className="text-sm">{message}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="secondary" disabled={pending} onClick={closeDialog}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Registrando..." : isOpenRevision ? "Cerrar correccion inmutable" : "Registrar reapertura"}</Button></div>
      </form>
    </DialogShell> : null}
  </div>;
}
