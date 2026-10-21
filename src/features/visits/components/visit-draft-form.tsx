"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { parseVisitDraft, serializeVisitDraft, visitDraftFieldNames, visitDraftStorageKey, type VisitDraft } from "../drafts";

export function VisitDraftForm({ ownerId, visitId, sourceVersion, savedDraftToken, savedDraftVisitId, action, className, children, footer }: {
  ownerId?: string; visitId: string; sourceVersion: string; savedDraftToken?: string; savedDraftVisitId?: string;
  action: (form: FormData) => void | Promise<void>; className?: string; children: ReactNode;
  footer?: (blocked: boolean) => ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const recoveryRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLButtonElement>(null);
  const hadPendingDraft = useRef(false);
  const tokenRef = useRef<string | null>(null);
  const [draftToken, setDraftToken] = useState("");
  const [pendingDraft, setPendingDraft] = useState<VisitDraft | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!ownerId) return;
    try {
      const previousOwner = sessionStorage.getItem("chetech:visits-draft-owner");
      if (previousOwner && previousOwner !== ownerId) {
        const oldKeys = Object.keys(sessionStorage).filter((key) => key.startsWith("chetech:visits-draft:v1:") && !key.startsWith(`chetech:visits-draft:v1:${encodeURIComponent(ownerId)}:`));
        oldKeys.forEach((key) => sessionStorage.removeItem(key));
      }
      sessionStorage.setItem("chetech:visits-draft-owner", ownerId);
      const key = visitDraftStorageKey(ownerId, visitId);
      const raw = sessionStorage.getItem(key);
      const draft = parseVisitDraft(raw, ownerId, visitId);
      if (!draft || (savedDraftVisitId === visitId && savedDraftToken === draft.token)) {
        if (raw) sessionStorage.removeItem(key);
        setPendingDraft(null); return;
      }
      setPendingDraft(draft);
    } catch { setNotice("No hay almacenamiento local disponible. Podes guardar en el servidor, pero el borrador no persistira."); }
  }, [ownerId, visitId, savedDraftToken, savedDraftVisitId]);

  useEffect(() => {
    if (pendingDraft) {
      const stale = pendingDraft.sourceVersion !== sourceVersion;
      (stale ? discardRef : recoveryRef).current?.focus();
    } else if (hadPendingDraft.current) {
      formRef.current?.querySelector<HTMLElement>('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
    }
    hadPendingDraft.current = Boolean(pendingDraft);
  }, [pendingDraft, sourceVersion]);

  function persist() {
    if (!ownerId || !formRef.current || pendingDraft) return;
    const fields: Record<string, string> = {};
    const data = new FormData(formRef.current);
    for (const name of visitDraftFieldNames) { const value = data.get(name); if (typeof value === "string") fields[name] = value; }
    tokenRef.current ??= crypto.randomUUID();
    setDraftToken(tokenRef.current);
    const tokenInput = formRef.current.elements.namedItem("draftToken") as HTMLInputElement;
    tokenInput.value = tokenRef.current;
    try {
      sessionStorage.setItem(visitDraftStorageKey(ownerId, visitId), serializeVisitDraft({ ownerId, visitId, sourceVersion, token: tokenRef.current, savedAt: Date.now(), fields }));
      setNotice("Borrador guardado en esta pestana, no enviado al servidor. Caduca en 24 horas o al cerrar la pestana.");
    } catch { setNotice("No se pudo persistir el borrador. El guardado en servidor sigue disponible."); }
  }
  const stale = pendingDraft && pendingDraft.sourceVersion !== sourceVersion;
  return <form ref={formRef} action={action} className={className} onChange={persist} onSubmit={persist}>
    <input type="hidden" name="draftToken" value={draftToken} readOnly />
    <input type="hidden" name="draftVisitId" value={visitId} />
    {pendingDraft ? <div className="col-span-full rounded-xl bg-amber-50 p-3 text-sm">
      <p>{stale ? "La visita cambio desde este borrador. No se puede restaurar sobre la version nueva; revisa el texto anterior." : "Hay un borrador local sin enviar. Recuperalo o descartalo antes de editar."}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button ref={recoveryRef} type="button" variant="secondary" disabled={Boolean(stale)} onClick={() => {
          if (!formRef.current || !pendingDraft) return;
          for (const [name, value] of Object.entries(pendingDraft.fields)) {
            const control = formRef.current.elements.namedItem(name);
            if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) control.value = value ?? "";
          }
          tokenRef.current = pendingDraft.token;
          setDraftToken(pendingDraft.token);
          const tokenInput = formRef.current.elements.namedItem("draftToken") as HTMLInputElement;
          tokenInput.value = pendingDraft.token;
          setPendingDraft(null); setNotice("Borrador recuperado para revisar; todavia no guardado en el servidor.");
        }}>Recuperar borrador</Button>
        <Button ref={discardRef} type="button" variant="secondary" onClick={() => {
          try { if (ownerId) sessionStorage.removeItem(visitDraftStorageKey(ownerId, visitId)); } catch { /* Storage can be disabled by the browser. */ }
          tokenRef.current = null; setDraftToken(""); setPendingDraft(null); setNotice("");
        }}>Descartar borrador</Button>
      </div>
      {stale ? <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3">Consultar texto del borrador anterior</summary><pre className="mt-2 whitespace-pre-wrap break-words">{Object.entries(pendingDraft.fields).map(([key, value]) => `${key}: ${value}`).join("\n")}</pre></details> : null}
    </div> : null}
    <fieldset disabled={Boolean(pendingDraft)} className="contents">{children}</fieldset>
    {notice ? <p role="status" aria-live="polite" className="col-span-full text-sm text-slate-500">{notice}</p> : null}
    {footer?.(Boolean(pendingDraft))}
  </form>;
}
