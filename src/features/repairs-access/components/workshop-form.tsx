"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DraftRecoveryBanner } from "@/components/forms/draft-recovery-banner";
import { usePersistentFormDraft } from "@/hooks/use-persistent-form-draft";
import { saveWorkshopForm } from "../coordination-actions";
import type { WorkshopSaveResult } from "../workflow";

type Fields = Record<string, string>;

export function WorkshopForm({ orderId, orderVersion, children, action = saveWorkshopForm }: {
  orderId: string; orderVersion?: number;
  children: ReactNode | ((fields: Fields, submitting: boolean) => ReactNode);
  action?: (previous: WorkshopSaveResult | null, form: FormData) => Promise<WorkshopSaveResult>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<Fields>({});
  const [dirty, setDirty] = useState(false);
  const originalVersion = useRef<string | null>(null);
  const operation = useRef<{ id: string; fingerprint: string } | null>(null);
  const [renderVersion, setRenderVersion] = useState(orderVersion);
  const [result, submit, pending] = useActionState(async (previous: WorkshopSaveResult | null, data: FormData) => {
    try { return await action(previous, data); }
    catch { return { success: false, message: "No se pudo confirmar el guardado. Tus datos siguen disponibles; revisa la conexion y reintenta." }; }
  }, null);
  const draft = usePersistentFormDraft<Fields>({
    draftKey: `repair-access:workshop:${orderId}`, isDirty: dirty, value: fields,
    onRestore: (saved) => {
      originalVersion.current = saved.expectedVersion ?? null;
      operation.current = saved.operationId && saved._requestFingerprint ? { id: saved.operationId, fingerprint: saved._requestFingerprint } : null;
      for (const [name, value] of Object.entries(saved)) {
        const control = formRef.current?.elements.namedItem(name);
        if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = value === "on";
        else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) control.value = value;
      }
      setFields(saved); setDirty(true);
    }
  });
  const clearDraft = draft.clearDraft;
  useEffect(() => {
    if (dirty) return;
    originalVersion.current = null;
    setRenderVersion(orderVersion);
  }, [orderVersion, dirty]);
  useEffect(() => {
    if (!result?.success) return;
    setDirty(false); setFields({}); operation.current = null; clearDraft();
    window.dispatchEvent(new Event("chetech:workshop-saved"));
    router.refresh();
  }, [result, router, clearDraft]);

  function capture(event?: { target: EventTarget | null }) {
    if (!formRef.current) return;
    if (originalVersion.current === null) originalVersion.current = String(new FormData(formRef.current).get("expectedVersion") ?? "");
    const next: Fields = {};
    for (const control of Array.from(formRef.current.elements)) {
      if (control instanceof HTMLInputElement && control.type === "hidden") continue;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.name || control.disabled) continue;
      next[control.name] = control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked ? "on" : "" : control.value;
    }
    if (originalVersion.current) next.expectedVersion = originalVersion.current;
    const changed = event?.target;
    if ((changed instanceof HTMLInputElement || changed instanceof HTMLTextAreaElement) && ["repairAmount", "budgetDetail"].includes(changed.name)) {
      next.confirmCustomer = ""; next.qualityChecked = "";
    }
    if (operation.current) { next.operationId = operation.current.id; next._requestFingerprint = operation.current.fingerprint; }
    // Keep inactive conditional fields in the draft; only mounted controls are submitted.
    setFields((previous) => ({ ...previous, ...next })); setDirty(true);
  }
  const refreshing = Boolean(result?.success && (result.orderClosed || (result.recordVersion && (orderVersion ?? 0) < result.recordVersion)));
  return <form ref={formRef} data-workshop-form className="grid gap-4 border-t border-graphite/10 p-4" onChange={capture} onInput={capture} onSubmit={(event) => {
    event.preventDefault();
    if (pending || refreshing) return;
    const data = new FormData(event.currentTarget);
    if (originalVersion.current) data.set("expectedVersion", originalVersion.current);
    const fingerprint = JSON.stringify(Array.from(data.entries()).filter(([key]) => key !== "operationId" && !key.startsWith("$") && !key.startsWith("_")).sort(([a], [b]) => a.localeCompare(b)));
    if (!operation.current || operation.current.fingerprint !== fingerprint) operation.current = { id: crypto.randomUUID(), fingerprint };
    data.set("operationId", operation.current.id);
    const snapshot = Object.fromEntries(Array.from(data.entries()).filter((entry): entry is [string, string] => typeof entry[1] === "string" && !entry[0].startsWith("$")));
    setFields((previous) => ({ ...previous, ...snapshot, _requestFingerprint: fingerprint })); setDirty(true);
    // Manual dispatch avoids React's uncontrolled-form reset on a failed save.
    startTransition(() => submit(data));
  }}>
    {draft.pendingDraft ? <DraftRecoveryBanner onDiscard={draft.discardDraft} onRestore={draft.restoreDraft} updatedAt={draft.pendingDraft.updatedAt} /> : null}
    <fieldset key={renderVersion} disabled={pending || refreshing} className="grid min-w-0 gap-4">{typeof children === "function" ? children(fields, pending || refreshing) : children}</fieldset>
    {pending ? <p role="status" className="text-sm text-slate-500">Guardando actualizacion...</p> : null}
    {refreshing ? <p role="status" className="text-sm text-slate-500">Guardado. Actualizando la ficha...</p> : null}
    {!pending && result ? <p role={result.success ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${result.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{result.message}</p> : null}
    {dirty && draft.lastSavedAt ? <p className="text-xs text-slate-500">Borrador local. Pendiente de guardar en el taller.</p> : null}
  </form>;
}
