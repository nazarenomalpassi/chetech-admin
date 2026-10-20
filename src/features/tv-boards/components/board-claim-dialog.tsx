"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { changeTvBoardSaleAction, refreshTvBoardSaleStateAction } from "@/features/tv-boards/claim-actions";
import type { TvBoardRow } from "@/features/tv-boards/model";
import { formatCurrency, formatDate } from "@/lib/utils";

type Resolution = "resume_sale" | "cancel_sale";

const SALE_STATE_LABELS: Record<TvBoardRow["saleStatus"], string> = {
  unsold: "sin venta",
  pending_release: "pendiente de confirmar",
  released: "liberacion confirmada",
  claim_open: "reclamo abierto",
  cancelled: "venta anulada"
};

export function BoardClaimDialog({ board, mode, onClose, onSaved }: {
  board: TvBoardRow;
  mode: "start" | "resolve";
  onClose: () => void;
  onSaved: (message: string, recordVersion: number | undefined) => void;
}) {
  const id = useId();
  const [notes, setNotes] = useState("");
  const [resolution, setResolution] = useState<Resolution>("resume_sale");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [stateNotice, setStateNotice] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [saleState, setSaleState] = useState(() => ({ version: board.version, status: board.saleStatus }));
  const [invalidField, setInvalidField] = useState<"notes" | "confirmation" | null>(null);
  const [isPending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const operationIds = useRef(new Map<string, string>());
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const isStarting = mode === "start";
  const isCancelling = !isStarting && resolution === "cancel_sale";
  const title = isStarting ? "Iniciar reclamo" : "Resolver reclamo";
  const isEligible = saleState.status === (isStarting ? "pending_release" : "claim_open");
  const blockedMessage = isEligible ? "" : `Estado actual: ${SALE_STATE_LABELS[saleState.status]}. No se puede ${isStarting ? "iniciar" : "resolver"} el reclamo desde este formulario. Tus notas se conservan; podes revisarlas antes de cerrar.`;
  const errorMessage = blockedMessage || message;

  function requestClose() {
    if (isPending || pendingRef.current) return;
    const changed = notes !== "" || resolution !== "resume_sale" || confirmed;
    if (changed && !window.confirm("Descartar los cambios del reclamo sin guardar?")) return;
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending || pendingRef.current || needsRefresh || !isEligible) return;
    setInvalidField(null);
    setMessage("");
    setStateNotice("");

    if (notes.length > 1000) {
      setInvalidField("notes");
      setMessage("Las notas pueden tener hasta 1000 caracteres.");
      notesRef.current?.focus();
      return;
    }
    if (isCancelling && !confirmed) {
      setInvalidField("confirmation");
      setMessage("Confirma que queres anular la venta sin reponer stock.");
      confirmationRef.current?.focus();
      return;
    }

    const payload = { id: board.id, version: saleState.version, kind: isStarting ? "start_claim" as const : resolution, notes };
    const fingerprint = JSON.stringify(payload);
    const operationId = operationIds.current.get(fingerprint) ?? crypto.randomUUID();
    // An uncertain response must retry the exact command with the same receipt key.
    operationIds.current.set(fingerprint, operationId);
    pendingRef.current = true;

    startTransition(async () => {
      try {
        const result = await changeTvBoardSaleAction({ ...payload, operationId });
        if (result.success) onSaved(result.message, result.recordVersion);
        else {
          setMessage(result.message);
          if (result.conflict) setNeedsRefresh(true);
        }
      } catch {
        setMessage("No se pudo confirmar el cambio. Tus notas se conservan. Reintenta sin cambiar los datos para recuperar el resultado sin duplicarlo.");
      } finally {
        pendingRef.current = false;
      }
    });
  }

  function refreshSaleState() {
    if (isPending || pendingRef.current) return;
    pendingRef.current = true;
    setMessage("");
    setStateNotice("");
    startTransition(async () => {
      try {
        const result = await refreshTvBoardSaleStateAction(board.id);
        if (!result.success || !result.state || result.state.id !== board.id) {
          setMessage(!result.success ? result.message : "No se pudo actualizar la placa. Tus notas se conservan; reintenta.");
          return;
        }
        setSaleState({ version: result.state.version, status: result.state.status });
        setNeedsRefresh(false);
        setStateNotice(result.message);
      } catch {
        setMessage("No se pudo actualizar la placa. Tus notas se conservan; reintenta.");
      } finally {
        pendingRef.current = false;
      }
    });
  }

  return (
    <DialogShell labelledBy={`${id}-title`} onClose={requestClose} panelClassName="max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-950" id={`${id}-title`}>{title}</h2>
          <p className="mt-2 break-words font-medium text-slate-800">{board.brand} {board.model}</p>
        </div>
        <Button aria-label="Cerrar reclamo" className="h-11 w-11 flex-none p-0" disabled={isPending} onClick={requestClose} type="button" variant="ghost">
          <X aria-hidden="true" className="h-5 w-5" />
        </Button>
      </div>
      <p className="mt-3 max-w-prose text-sm leading-6 text-slate-600">Este es un registro interno: no abre ni resuelve un reclamo en MercadoLibre. No registra dinero liberado ni genera movimientos de caja.</p>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <p>{isStarting ? "Neto que pasara de pendiente a retenido:" : "Neto retenido:"} <strong className="tabular-nums">{board.netAmount === null ? "Sin informar" : formatCurrency(board.netAmount)}</strong></p>
        {isStarting ? <p className="mt-1">Se conserva la venta. El importe queda separado hasta resolver el reclamo.</p> : (
          <>
            <p className="mt-1">Inicio: {board.claimOpenedAt ? <time dateTime={board.claimOpenedAt}>{formatDate(board.claimOpenedAt)}</time> : "Sin fecha registrada"}.</p>
            {board.claimNotes ? <p className="mt-2 whitespace-pre-wrap break-words">{board.claimNotes}</p> : null}
          </>
        )}
      </div>

      <form aria-busy={isPending} className="mt-4 space-y-4" noValidate onSubmit={handleSubmit}>
        <fieldset className="min-w-0 space-y-4" disabled={isPending}>
          <legend className="sr-only">{title}</legend>
          {!isStarting ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor={`${id}-resolution`}>Resolucion</label>
              <Select aria-describedby={`${id}-outcome`} disabled={isPending} id={`${id}-resolution`} onChange={(event) => {
                setResolution(event.target.value as Resolution);
                setConfirmed(false);
                if (!needsRefresh) setMessage("");
                setInvalidField(null);
              }} options={[{ label: "Volver a pendiente", value: "resume_sale" }, { label: "Anular venta", value: "cancel_sale" }]} value={resolution} />
              <p className="text-sm leading-6 text-slate-600" id={`${id}-outcome`}>
                {isCancelling
                  ? "Anular retira este neto de las ventas y de los importes a cobrar. Conserva el historial y no repone stock automaticamente."
                  : "El neto vuelve a pendiente de confirmar. Resolver el reclamo no confirma la liberacion del dinero."}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700" htmlFor={`${id}-notes`}>{isStarting ? "Notas del reclamo (opcional)" : "Notas de resolucion (opcional)"}</label>
            <Textarea aria-describedby={`${id}-notes-help${invalidField === "notes" ? ` ${id}-error` : ""}`} aria-invalid={invalidField === "notes"} disabled={isPending} id={`${id}-notes`} maxLength={1000} onChange={(event) => {
              setNotes(event.target.value);
              if (invalidField === "notes") { setInvalidField(null); setMessage(""); }
            }} ref={notesRef} rows={3} value={notes} />
            <p className="text-sm text-slate-600" id={`${id}-notes-help`}>Hasta 1000 caracteres. {notes.length}/1000.</p>
          </div>

          {isCancelling ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <div className="flex min-h-11 items-center gap-3">
                <input aria-describedby={invalidField === "confirmation" ? `${id}-error` : undefined} aria-invalid={invalidField === "confirmation"} checked={confirmed} className="h-5 w-5 shrink-0 accent-graphite focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-graphite" disabled={isPending} id={`${id}-confirm`} onChange={(event) => {
                  setConfirmed(event.target.checked);
                  if (invalidField === "confirmation") { setInvalidField(null); setMessage(""); }
                }} ref={confirmationRef} required type="checkbox" />
                <label className="flex min-h-11 flex-1 cursor-pointer items-center py-2 text-sm font-medium text-rose-900" htmlFor={`${id}-confirm`}>Confirmo anular esta venta sin reponer stock</label>
              </div>
            </div>
          ) : null}
        </fieldset>

        {errorMessage ? <p className="status-banner status-banner--error" id={`${id}-error`} role="alert">{errorMessage}</p> : null}
        {stateNotice && isEligible ? <p className="status-banner" role="status">{stateNotice}</p> : null}
        {needsRefresh ? <Button disabled={isPending} onClick={refreshSaleState} type="button" variant="secondary">Actualizar estado sin perder notas</Button> : null}
        <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button disabled={isPending} onClick={requestClose} type="button" variant="secondary">Cancelar</Button>
          <Button disabled={isPending || needsRefresh || !isEligible} type="submit" variant={isCancelling ? "danger" : "default"}>
            {isPending ? "Guardando..." : isStarting ? "Iniciar reclamo" : isCancelling ? "Anular venta" : "Volver a pendiente"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}
