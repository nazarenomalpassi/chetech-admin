"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useState } from "react";

import {
  createFormDraftEnvelope,
  getFormDraftStorageKey,
  parseFormDraftEnvelope,
  type FormDraftEnvelope
} from "@/lib/form-draft";

export type PaymentDraftOptions<T> = {
  ownerId: string | undefined;
  scope: string;
  value: T;
  isDirty: boolean;
  onRestore: (value: T) => void;
};

export type PaymentDraft<T> = {
  pendingDraft: FormDraftEnvelope<T> | null;
  lastSavedAt: string | null;
  restoreDraft: () => void;
  discardDraft: () => void;
  /** Removes the draft and suppresses this snapshot until the next edit. */
  clearDraft: () => void;
  /** Synchronous; false when disabled, clean, cleared, awaiting recovery, or storage fails. */
  persistNow: () => boolean;
};

type Session<T> = {
  key: string | null;
  value: T;
  serialized: string | undefined;
  isDirty: boolean;
  onRestore: (value: T) => void;
  pendingDraft: FormDraftEnvelope<T> | null;
  lastSavedAt: string | null;
  cleared: { value: T; serialized: string | undefined } | null;
  initialized: boolean;
  active: boolean;
  timer: number | null;
  notify: () => void;
  syncDirty?: () => void;
};

function createSession<T>(key: string | null, options: PaymentDraftOptions<T>): Session<T> {
  return {
    key,
    value: options.value,
    serialized: serialize(options.value),
    isDirty: options.isDirty,
    onRestore: options.onRestore,
    pendingDraft: null,
    lastSavedAt: null,
    cleared: null,
    initialized: false,
    active: false,
    timer: null,
    notify: () => undefined
  };
}

function serialize(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function removeStorage(key: string | null) {
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is best effort; a successful payment must still finish cleanup.
  }
}

function cancelSave<T>(session: Session<T>) {
  if (session.timer !== null) window.clearTimeout(session.timer);
  session.timer = null;
}

function canPersist<T>(session: Session<T>) {
  return session.active && session.key !== null && session.isDirty && !session.cleared && !session.pendingDraft;
}

function persist<T>(session: Session<T>, notify = true): boolean {
  cancelSave(session);
  if (!canPersist(session)) return false;
  try {
    const envelope = createFormDraftEnvelope(session.value);
    window.localStorage.setItem(session.key!, JSON.stringify(envelope));
    session.lastSavedAt = envelope.updatedAt;
    if (notify) session.notify();
    return true;
  } catch {
    return false;
  }
}

function scheduleSave<T>(session: Session<T>) {
  cancelSave(session);
  if (canPersist(session)) session.timer = window.setTimeout(() => persist(session), 500);
}

const PAYMENT_STATE_EVENT = Symbol("payment-draft-state");
const GUARDED_NAVIGATION = Symbol("payment-draft-navigation");
const GUARDED_HISTORY = Symbol("payment-draft-history");
const DIRTY_QUERY_EVENT = "chetech:payment-draft-query";
type DirtyQuery = { dirty: boolean; externalDirty: boolean };
type DraftStateEvent = CustomEvent<{ hasUnsavedChanges: boolean }> & { [PAYMENT_STATE_EVENT]?: boolean };

function queryDirtyState(): DirtyQuery {
  const detail = { dirty: false, externalDirty: false };
  window.dispatchEvent(new CustomEvent(DIRTY_QUERY_EVENT, { detail }));
  return detail;
}

function registerDirtyGuard(isDirty: () => boolean, flush: () => void) {
  const root = document.documentElement;
  const existing = queryDirtyState();
  let externalDirty = existing.externalDirty || (root.hasAttribute("data-unsaved-changes") && !existing.dirty);
  let skipNextPopState = false;

  function handleQuery(event: Event) {
    const { detail } = event as CustomEvent<DirtyQuery>;
    detail.dirty ||= isDirty();
    detail.externalDirty ||= externalDirty;
  }

  function sync() {
    const state = queryDirtyState();
    const hasUnsavedChanges = state.dirty || state.externalDirty || externalDirty;
    root.toggleAttribute("data-unsaved-changes", hasUnsavedChanges);
    const event: DraftStateEvent = new CustomEvent("chetech:draft-state", { detail: { hasUnsavedChanges } });
    event[PAYMENT_STATE_EVENT] = true;
    window.dispatchEvent(event);
  }

  function handleDraftState(event: Event) {
    const stateEvent = event as DraftStateEvent;
    if (stateEvent[PAYMENT_STATE_EVENT]) return;
    externalDirty = Boolean(stateEvent.detail?.hasUnsavedChanges);
    sync();
  }

  function handleBeforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty()) return;
    flush();
    event.preventDefault();
    event.returnValue = "";
  }

  function handleClick(event: MouseEvent & { [GUARDED_NAVIGATION]?: boolean }) {
    if (!isDirty() || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
    const next = new URL(anchor.href, window.location.href);
    if (next.origin !== window.location.origin ||
        (next.pathname === window.location.pathname && next.search === window.location.search)) return;
    if (!event[GUARDED_NAVIGATION] && !window.confirm("Hay cambios sin guardar. Queres continuar?")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event[GUARDED_NAVIGATION] = true;
    flush();
  }

  function handlePopState(event: PopStateEvent & { [GUARDED_HISTORY]?: "accepted" | "cancelled" | "correction" }) {
    if (skipNextPopState) {
      skipNextPopState = false;
      event[GUARDED_HISTORY] = "correction";
      return;
    }
    if (event[GUARDED_HISTORY] === "correction") return;
    if (event[GUARDED_HISTORY] === "cancelled") {
      skipNextPopState = true;
      return;
    }
    if (!isDirty()) return;
    if (event[GUARDED_HISTORY] === "accepted" || window.confirm("Hay cambios sin guardar. Queres continuar?")) {
      event[GUARDED_HISTORY] = "accepted";
      flush();
      return;
    }
    event[GUARDED_HISTORY] = "cancelled";
    skipNextPopState = true;
    // All instances skip the resulting correction; only one calls history.forward.
    window.history.forward();
  }

  // Query live instances instead of sharing key-indexed state across hook owners.
  window.addEventListener(DIRTY_QUERY_EVENT, handleQuery);
  window.addEventListener("chetech:draft-state", handleDraftState);
  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("popstate", handlePopState);
  document.addEventListener("click", handleClick, true);
  sync();
  return {
    sync,
    dispose() {
      window.removeEventListener(DIRTY_QUERY_EVENT, handleQuery);
      window.removeEventListener("chetech:draft-state", handleDraftState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleClick, true);
      sync();
    }
  };
}

/** Call persistNow before submitting; call clearDraft only after confirmed success. */
export function usePaymentDraft<T>(options: PaymentDraftOptions<T>): PaymentDraft<T> {
  const { ownerId, scope, value, isDirty, onRestore } = options;
  const storageKey = ownerId ? getFormDraftStorageKey(`repair-payment:${JSON.stringify([ownerId, scope])}`) : null;
  const [session, setSession] = useState(() => createSession(storageKey, options));
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);

  // Each key owns its snapshot. The outgoing cleanup never reads incoming props.
  if (session.key !== storageKey) setSession(createSession(storageKey, options));

  useLayoutEffect(() => {
    session.onRestore = onRestore;
  }, [onRestore, session]);

  useLayoutEffect(() => {
    const serialized = serialize(value);
    const changed = session.isDirty !== isDirty ||
      (!Object.is(session.value, value) && (serialized === undefined || serialized !== session.serialized));
    session.value = value;
    session.serialized = serialized;
    session.isDirty = isDirty;
    if (session.cleared) {
      const sameValue = Object.is(value, session.cleared.value) ||
        (session.cleared.serialized !== undefined && serialized === session.cleared.serialized);
      if (!isDirty || !sameValue) session.cleared = null;
    }
    if (!session.active) return;
    if (!isDirty && !session.pendingDraft) {
      removeStorage(session.key);
      if (session.lastSavedAt !== null) {
        session.lastSavedAt = null;
        session.notify();
      }
    }
    if (changed) scheduleSave(session);
    session.syncDirty?.();
  }, [isDirty, session, value]);

  useEffect(() => {
    session.active = true;
    session.notify = refresh;
    if (!session.initialized) {
      session.initialized = true;
      if (session.key) {
        try {
          const raw = window.localStorage.getItem(session.key);
          session.pendingDraft = parseFormDraftEnvelope<T>(raw);
          session.lastSavedAt = session.pendingDraft?.updatedAt ?? null;
          if (raw !== null && !session.pendingDraft) removeStorage(session.key);
        } catch {
          // Disabled storage must not block editing, submission, or a later retry.
        }
      }
    }
    const guard = registerDirtyGuard(
      () => session.active && session.isDirty && !session.cleared,
      () => { persist(session); }
    );
    session.syncDirty = guard.sync;
    scheduleSave(session);
    session.notify();
    return () => {
      persist(session, false);
      session.active = false;
      session.syncDirty = undefined;
      guard.dispose();
      session.notify = () => undefined;
    };
  }, [session]);

  const persistNow = useCallback(() => persist(session), [session]);

  const restoreDraft = useCallback(() => {
    const draft = session.pendingDraft;
    if (!session.active || !draft) return;
    session.value = draft.data;
    session.pendingDraft = null;
    session.lastSavedAt = draft.updatedAt;
    session.cleared = null;
    session.onRestore(draft.data);
    scheduleSave(session);
    session.notify();
  }, [session]);

  const discardDraft = useCallback(() => {
    cancelSave(session);
    removeStorage(session.key);
    session.pendingDraft = null;
    session.lastSavedAt = null;
    scheduleSave(session);
    session.notify();
  }, [session]);

  const clearDraft = useCallback(() => {
    cancelSave(session);
    // Suppress synchronously: success may unmount before isDirty=false commits.
    session.cleared = { value: session.value, serialized: serialize(session.value) };
    removeStorage(session.key);
    session.pendingDraft = null;
    session.lastSavedAt = null;
    session.syncDirty?.();
    session.notify();
  }, [session]);

  return {
    pendingDraft: session.pendingDraft,
    lastSavedAt: session.lastSavedAt,
    restoreDraft,
    discardDraft,
    clearDraft,
    persistNow
  };
}
