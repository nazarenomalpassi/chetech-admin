"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { markTvBoardReleasedAction } from "@/features/tv-boards/actions";
import { refreshTvBoardSaleStateAction } from "@/features/tv-boards/claim-actions";
import type { TvBoardRow } from "@/features/tv-boards/model";
import { formatCurrency } from "@/lib/utils";

type ReleaseResult = Awaited<ReturnType<typeof markTvBoardReleasedAction>>;

export function BoardReleaseDialog({ board, operationIds, onClose, onSaved }: {
  board: TvBoardRow;
  operationIds?: Map<string, string>;
  onClose: () => void;
  onSaved: (result: ReleaseResult) => void;
}) {
  const id = useId();
  const [method, setMethod] = useState<"" | "nx" | "mp">("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [saleState, setSaleState] = useState(() => ({ version: board.version, status: board.saleStatus }));
  const [invalidField, setInvalidField] = useState<"account" | "confirmation" | null>(null);
  const [isPending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const ownOperationIds = useRef(new Map<string, string>());
  const accountRef = useRef<HTMLSelectElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const hasFiniteNet = board.netAmount != null && Number.isFinite(board.netAmount);
  const hasValidNet = hasFiniteNet && board.netAmount! > 0;
  const eligible = board.isSold && saleState.status === "pending_release" && !board.releasedAt && !board.linkedSale;
  const blockedMessage = !hasFiniteNet ? "El importe neto esta incompleto o no es valido. Revisa la placa antes de confirmar."
    : !hasValidNet ? "El importe neto debe ser mayor que cero para registrar la venta y el cobro."
    : !eligible ? "La placa ya no esta pendiente de liberacion. Cierra este formulario y revisa el listado." : "";
  const errorMessage = blockedMessage || message;

  useEffect(() => {
    if (message && invalidField === null) errorRef.current?.focus();
  }, [message, invalidField]);

  function requestClose() {
    if (!isPending && !pendingRef.current) onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || pendingRef.current || needsRefresh || !eligible || !hasValidNet) return;
    setInvalidField(null);
    setMessage("");
    if (method !== "nx" && method !== "mp") {
      setInvalidField("account");
      setMessage("Selecciona la cuenta donde recibiste el dinero.");
      accountRef.current?.focus();
      return;
    }
    if (!confirmed) {
      setInvalidField("confirmation");
      setMessage("Confirma que el dinero ya fue transferido a la cuenta seleccionada.");
      confirmationRef.current?.focus();
      return;
    }

    const payload = { id: board.id, version: saleState.version, method };
    const fingerprint = JSON.stringify(payload);
    const receipts = operationIds ?? ownOperationIds.current;
    const operationId = receipts.get(fingerprint) ?? crypto.randomUUID();
    // Keep the receipt key when the server may have committed before a lost response.
    receipts.set(fingerprint, operationId);
    pendingRef.current = true;
    startTransition(async () => {
      try {
        const result = await markTvBoardReleasedAction({ ...payload, operationId });
        if (result.success) onSaved(result);
        else {
          setMessage(result.message);
          if (result.conflict) setNeedsRefresh(true);
        }
      } catch {
        setMessage("No se pudo confirmar el registro. Reintenta sin cambiar los datos para recuperar la misma venta sin duplicarla.");
      } finally {
        pendingRef.current = false;
      }
    });
  }

  function refreshState() {
    if (isPending || pendingRef.current) return;
    pendingRef.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await refreshTvBoardSaleStateAction(board.id);
        if (!result.success || !result.state || result.state.id !== board.id) {
          setMessage(!result.success ? result.message : "No se pudo actualizar el estado. Reintenta.");
          return;
        }
        setSaleState({ version: result.state.version, status: result.state.status });
        setConfirmed(false);
        setNeedsRefresh(false);
      } catch {
        setMessage("No se pudo actualizar el estado. La cuenta seleccionada se conserva; reintenta.");
      } finally {
        pendingRef.current = false;
      }
    });
  }

  return (
    <DialogShell labelledBy={`${id}-title`} onClose={requestClose} panelClassName="max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-950" id={`${id}-title`}>Confirmar liberacion</h2>
          <p className="mt-2 break-words font-medium text-slate-800">{board.brand} {board.model}</p>
        </div>
        <Button aria-label="Cerrar liberacion" className="h-11 w-11 flex-none p-0" disabled={isPending} onClick={requestClose} type="button" variant="ghost">
          <X aria-hidden="true" className="h-5 w-5" />
        </Button>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600" id={`${id}-outcome`}>Registra el neto recibido despues de las retenciones de MercadoLibre. Se crea una venta numerada con el detalle de la placa y un movimiento de caja en la cuenta elegida, sin descontar stock de productos.</p>

      <form aria-busy={isPending} className="mt-4 space-y-4" noValidate onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor={`${id}-net`}>Neto a registrar</label>
          <Input className="font-semibold tabular-nums" id={`${id}-net`} readOnly value={hasFiniteNet ? formatCurrency(board.netAmount!) : "Sin informar"} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor={`${id}-method`}>Cuenta de destino</label>
          <Select aria-describedby={`${id}-outcome${invalidField === "account" ? ` ${id}-error` : ""}`} aria-invalid={invalidField === "account"} disabled={isPending} id={`${id}-method`} onChange={(event) => {
            const next = event.target.value;
            setMethod(next === "nx" || next === "mp" ? next : "");
            setConfirmed(false);
            setInvalidField(null);
            if (!needsRefresh) setMessage("");
          }} options={[{ value: "", label: "Selecciona una cuenta" }, { value: "nx", label: "NX SANTI" }, { value: "mp", label: "NX LOCAL" }]} ref={accountRef} required value={method} />
        </div>
        <div className="flex items-start gap-3 border-t border-line pt-3">
          <input aria-describedby={invalidField === "confirmation" ? `${id}-error` : undefined} aria-invalid={invalidField === "confirmation"} checked={confirmed} className="mt-3 h-5 w-5 shrink-0 accent-graphite focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-graphite" disabled={isPending} id={`${id}-confirm`} onChange={(event) => {
            setConfirmed(event.target.checked);
            if (invalidField === "confirmation") { setInvalidField(null); setMessage(""); }
          }} ref={confirmationRef} required type="checkbox" />
          <label className="flex min-h-11 cursor-pointer items-center py-2 text-sm leading-6 text-slate-700" htmlFor={`${id}-confirm`}>Confirmo que el dinero ya fue transferido a la cuenta seleccionada y quiero registrar la venta y el cobro.</label>
        </div>
        {errorMessage ? <p className="status-banner status-banner--error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite" id={`${id}-error`} ref={errorRef} role="alert" tabIndex={-1}>{errorMessage}</p> : null}
        {needsRefresh ? <Button disabled={isPending} onClick={refreshState} type="button" variant="secondary">Actualizar estado</Button> : null}
        <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button disabled={isPending} onClick={requestClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={isPending || needsRefresh || !eligible || !hasValidNet} type="submit">{isPending ? "Registrando..." : "Confirmar y registrar venta"}</Button>
        </div>
      </form>
    </DialogShell>
  );
}
