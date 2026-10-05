"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createFormDraftEnvelope,
  getFormDraftStorageKey,
  hasMeaningfulDraftValue,
  parseFormDraftEnvelope,
  type FormDraftEnvelope
} from "@/lib/form-draft";

const dirtyDraftKeys = new Set<string>();

function syncGlobalDirtyState(key: string, dirty: boolean) {
  if (dirty) dirtyDraftKeys.add(key);
  else dirtyDraftKeys.delete(key);

  document.documentElement.toggleAttribute("data-unsaved-changes", dirtyDraftKeys.size > 0);
  window.dispatchEvent(
    new CustomEvent("chetech:draft-state", {
      detail: { hasUnsavedChanges: dirtyDraftKeys.size > 0 }
    })
  );
}

export function usePersistentFormDraft<T>({
  clearOnMount = false,
  debounceMs = 500,
  draftKey,
  isDirty,
  onRestore,
  value
}: {
  clearOnMount?: boolean;
  debounceMs?: number;
  draftKey: string;
  isDirty: boolean;
  onRestore: (value: T) => void;
  value: T;
}) {
  const storageKey = getFormDraftStorageKey(draftKey);
  const [pendingDraft, setPendingDraft] = useState<FormDraftEnvelope<T> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const latestValueRef = useRef(value);
  const isDirtyRef = useRef(isDirty);
  const skipNextPopStateRef = useRef(false);
  latestValueRef.current = value;
  isDirtyRef.current = isDirty;

  useEffect(() => {
    if (clearOnMount) {
      window.localStorage.removeItem(storageKey);
      setPendingDraft(null);
      setReady(true);
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    const draft = parseFormDraftEnvelope<T>(raw);
    if (draft && hasMeaningfulDraftValue(draft.data)) {
      setPendingDraft(draft);
      setLastSavedAt(draft.updatedAt);
      setReady(false);
      return;
    }

    if (raw) window.localStorage.removeItem(storageKey);
    setReady(true);
  }, [clearOnMount, storageKey]);

  useEffect(() => {
    if (!ready || pendingDraft) return;

    if (!isDirty) {
      window.localStorage.removeItem(storageKey);
      setLastSavedAt(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const envelope = createFormDraftEnvelope(latestValueRef.current);
      window.localStorage.setItem(storageKey, JSON.stringify(envelope));
      setLastSavedAt(envelope.updatedAt);
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [debounceMs, isDirty, pendingDraft, ready, storageKey, value]);

  useEffect(() => {
    syncGlobalDirtyState(storageKey, isDirty);
    return () => syncGlobalDirtyState(storageKey, false);
  }, [isDirty, storageKey]);

  useEffect(() => {
    return () => {
      if (!isDirtyRef.current) return;
      const envelope = createFormDraftEnvelope(latestValueRef.current);
      window.localStorage.setItem(storageKey, JSON.stringify(envelope));
    };
  }, [storageKey]);

  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      if (nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) return;

      const shouldLeave = window.confirm(
        "Hay cambios sin guardar. Si salís ahora, el borrador queda guardado para recuperarlo después. ¿Querés continuar?"
      );
      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function handlePopState() {
      if (skipNextPopStateRef.current) {
        skipNextPopStateRef.current = false;
        return;
      }

      const shouldLeave = window.confirm(
        "Hay cambios sin guardar. El borrador queda guardado para recuperarlo despues. Queres continuar?"
      );
      if (!shouldLeave) {
        skipNextPopStateRef.current = true;
        window.history.forward();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isDirty]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    onRestore(pendingDraft.data);
    setLastSavedAt(pendingDraft.updatedAt);
    setPendingDraft(null);
    setReady(true);
  }, [onRestore, pendingDraft]);

  const discardDraft = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setPendingDraft(null);
    setLastSavedAt(null);
    setReady(true);
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setPendingDraft(null);
    setLastSavedAt(null);
    setReady(true);
  }, [storageKey]);

  return {
    clearDraft,
    discardDraft,
    lastSavedAt,
    pendingDraft,
    restoreDraft
  };
}
