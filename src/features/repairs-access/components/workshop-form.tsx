"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DraftRecoveryBanner } from "@/components/forms/draft-recovery-banner";
import { usePersistentFormDraft } from "@/hooks/use-persistent-form-draft";
import { saveWorkshopForm } from "../coordination-actions";
import type { ActionResult } from "@/lib/form-state";

type Fields = Record<string, string>;

export function WorkshopForm({ orderId, orderVersion, children }: { orderId: string; orderVersion?: number; children: ReactNode }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [fields, setFields] = useState<Fields>({});
  const [dirty, setDirty] = useState(false);
  const originalVersion = useRef<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(orderVersion);
  const [result, submit, pending] = useActionState(async (previous: ActionResult | null, data: FormData) => {
    try { return await saveWorkshopForm(previous, data); }
    catch { return { success: false, message: "No se pudo confirmar el guardado. Tus datos siguen disponibles; revisa la conexion y reintenta." }; }
  }, null);
  const draft = usePersistentFormDraft<Fields>({
    draftKey: `repair-access:workshop:${orderId}`, isDirty: dirty, value: fields,
    onRestore: (saved) => {
      originalVersion.current = saved.expectedVersion ?? null;
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
    setDirty(false); setFields({}); clearDraft();
    window.dispatchEvent(new Event("chetech:workshop-saved"));
    router.refresh();
  }, [result, router, clearDraft]);

  function capture() {
    if (!formRef.current) return;
    if (originalVersion.current === null) originalVersion.current = String(new FormData(formRef.current).get("expectedVersion") ?? "");
    const next: Fields = {};
    for (const control of Array.from(formRef.current.elements)) {
      if (control instanceof HTMLInputElement && control.type === "hidden") continue;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) || !control.name || control.disabled) continue;
      next[control.name] = control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked ? "on" : "" : control.value;
    }
    if (originalVersion.current) next.expectedVersion = originalVersion.current;
    setFields(next); setDirty(true);
  }
  return <form ref={formRef} data-workshop-form className="grid gap-4 border-t border-graphite/10 p-4" onChange={capture} onInput={capture} onSubmit={(event) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    if (originalVersion.current) data.set("expectedVersion", originalVersion.current);
    // Manual dispatch avoids React's uncontrolled-form reset on a failed save.
    startTransition(() => submit(data));
  }}>
    {draft.pendingDraft ? <DraftRecoveryBanner onDiscard={draft.discardDraft} onRestore={draft.restoreDraft} updatedAt={draft.pendingDraft.updatedAt} /> : null}
    <fieldset key={renderVersion} disabled={pending} className="grid min-w-0 gap-4">{children}</fieldset>
    {pending ? <p role="status" className="text-sm text-slate-500">Guardando actualizacion...</p> : null}
    {!pending && result ? <p role={result.success ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${result.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{result.message}</p> : null}
    {dirty && draft.lastSavedAt ? <p className="text-xs text-slate-500">Borrador guardado en este dispositivo. Aun no se envio al taller.</p> : null}
  </form>;
}
