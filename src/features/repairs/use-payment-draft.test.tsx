// @vitest-environment jsdom
import React, { StrictMode, Suspense, useState } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePaymentDraft } from "./use-payment-draft";
import { usePersistentFormDraft } from "@/hooks/use-persistent-form-draft";
import { createFormDraftEnvelope, getFormDraftStorageKey } from "@/lib/form-draft";

type Value = { amount: number; requestId: string };
type Options = Parameters<typeof usePaymentDraft<Value>>[0];
const initialValue: Value = { amount: 250, requestId: "retry-token" };
const now = new Date("2026-11-11T12:00:00.000Z");

function key(ownerId = "owner-a", scope = "order-a") {
  return getFormDraftStorageKey(`repair-payment:${JSON.stringify([ownerId, scope])}`);
}

function renderDraft(initialProps: Partial<Options> = {}) {
  return renderHook((props: Partial<Options>) => usePaymentDraft<Value>({
    ownerId: "owner-a",
    scope: "order-a",
    value: initialValue,
    isDirty: true,
    onRestore: vi.fn(),
    ...props
  }), { initialProps });
}

function stored(ownerId = "owner-a", scope = "order-a") {
  const raw = window.localStorage.getItem(key(ownerId, scope));
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-unsaved-changes");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-unsaved-changes");
});

describe("payment draft persistence", () => {
  it("accepts a freshly constructed inline value on every clean render without looping", () => {
    const { result } = renderHook(() => usePaymentDraft({
      ownerId: "owner-a", scope: "order-a", value: { amount: 0 }, isDirty: false, onRestore: vi.fn()
    }));

    expect(result.current.lastSavedAt).toBeNull();
    expect(result.current.pendingDraft).toBeNull();
  });

  it("does not restart debounce or save repeatedly for equal inline dirty values", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    const { result, rerender } = renderHook(() => usePaymentDraft({
      ownerId: "owner-a", scope: "order-a", value: { amount: 250 }, isDirty: true, onRestore: vi.fn()
    }));
    act(() => vi.advanceTimersByTime(300));
    rerender();
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.lastSavedAt).toBe(new Date().toISOString());

    act(() => vi.advanceTimersByTime(2_000));

    expect(write).toHaveBeenCalledOnce();
  });

  it("debounces the latest value in a versioned envelope", () => {
    const { result, rerender } = renderDraft();
    act(() => vi.advanceTimersByTime(300));
    const value = { ...initialValue, amount: 400 };
    rerender({ value });
    act(() => vi.advanceTimersByTime(499));
    expect(stored()).toBeNull();

    act(() => vi.advanceTimersByTime(1));

    expect(stored()).toEqual(createFormDraftEnvelope(value));
    expect(result.current.lastSavedAt).toBe(new Date().toISOString());
  });

  it("flushes immediately for submit and retains the request token for retries", () => {
    const { result } = renderDraft();
    expect(stored()).toBeNull();

    act(() => expect(result.current.persistNow()).toBe(true));

    expect(stored()).toEqual(createFormDraftEnvelope(initialValue));
    expect(result.current.lastSavedAt).toBe(now.toISOString());
  });

  it("flushes the latest committed value on unmount before debounce", () => {
    const { rerender, unmount } = renderDraft();
    const value = { ...initialValue, amount: 500 };
    rerender({ value });

    unmount();
    act(() => vi.runAllTimers());

    expect(stored()).toEqual(createFormDraftEnvelope(value));
  });

  it("never accesses storage without an owner, even through public actions and unmount", () => {
    const getStorage = vi.spyOn(window, "localStorage", "get");
    const onRestore = vi.fn();
    const { result, unmount } = renderDraft({ ownerId: undefined, onRestore });
    act(() => vi.advanceTimersByTime(1_000));
    act(() => {
      expect(result.current.persistNow()).toBe(false);
      result.current.restoreDraft();
      result.current.discardDraft();
      result.current.clearDraft();
    });
    unmount();

    expect(getStorage).not.toHaveBeenCalled();
    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("isolates owners and scopes, including delimiter-containing identities", () => {
    const first = renderDraft({ ownerId: "a:b", scope: "c" });
    const second = renderDraft({ ownerId: "a", scope: "b:c", value: { ...initialValue, amount: 900 } });
    const third = renderDraft({ scope: "order-b", value: { ...initialValue, amount: 800 } });
    act(() => {
      first.result.current.persistNow();
      second.result.current.persistNow();
      third.result.current.persistNow();
    });

    expect(stored("a:b", "c").data.amount).toBe(250);
    expect(stored("a", "b:c").data.amount).toBe(900);
    expect(stored("owner-a", "order-b").data.amount).toBe(800);
    act(() => first.result.current.clearDraft());
    expect(stored("a:b", "c")).toBeNull();
    expect(stored("a", "b:c").data.amount).toBe(900);
  });

  it.each(["scope", "ownerId"] as const)("flushes only the outgoing snapshot on a dynamic %s switch", (field) => {
    const { result, rerender, unmount } = renderDraft();
    const next = field === "scope" ? { scope: "order-b" } : { ownerId: "owner-b" };
    const nextValue = { amount: 999, requestId: "next-token" };

    rerender({ ...next, value: nextValue });

    expect(stored().data).toEqual(initialValue);
    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
    const owner = next.ownerId ?? "owner-a";
    const scope = next.scope ?? "order-a";
    expect(stored(owner, scope)).toBeNull();
    unmount();
    expect(stored(owner, scope).data).toEqual(nextValue);
    expect(stored().data).toEqual(initialValue);
  });

  it("flushes the old owner before disabling persistence and never saves ownerless values", () => {
    const { rerender, unmount } = renderDraft();
    rerender({ ownerId: undefined, value: { amount: 999, requestId: "anonymous" } });
    const getStorage = vi.spyOn(window, "localStorage", "get");

    act(() => vi.advanceTimersByTime(1_000));
    unmount();

    expect(getStorage).not.toHaveBeenCalled();
    getStorage.mockRestore();
    expect(stored().data).toEqual(initialValue);
    expect(window.localStorage.length).toBe(1);
  });

  it("does not persist clean values", () => {
    const { result, unmount } = renderDraft({ isDirty: false });
    act(() => {
      vi.advanceTimersByTime(1_000);
      expect(result.current.persistNow()).toBe(false);
    });
    unmount();
    expect(stored()).toBeNull();
  });

  it("removes an active draft when the form becomes clean", () => {
    const { result, rerender, unmount } = renderDraft();
    act(() => result.current.persistNow());

    rerender({ isDirty: false });
    unmount();

    expect(stored()).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
  });
});

describe("explicit payment draft recovery", () => {
  it("does not auto-apply or overwrite unresolved recovery, including on unmount", () => {
    const envelope = createFormDraftEnvelope({ amount: 600, requestId: "saved-token" });
    window.localStorage.setItem(key(), JSON.stringify(envelope));
    const onRestore = vi.fn();
    const { result, unmount } = renderDraft({ onRestore });

    act(() => {
      vi.advanceTimersByTime(1_000);
      expect(result.current.persistNow()).toBe(false);
    });
    expect(result.current.pendingDraft).toEqual(envelope);
    expect(result.current.lastSavedAt).toBe(envelope.updatedAt);
    expect(onRestore).not.toHaveBeenCalled();
    unmount();
    expect(stored()).toEqual(envelope);
  });

  it("restores only on request and preserves recovered data through immediate unmount", () => {
    const envelope = createFormDraftEnvelope({ amount: 600, requestId: "saved-token" });
    window.localStorage.setItem(key(), JSON.stringify(envelope));
    const onRestore = vi.fn();
    const { result, unmount } = renderDraft({ onRestore, isDirty: false });

    act(() => result.current.restoreDraft());

    expect(onRestore).toHaveBeenCalledExactlyOnceWith(envelope.data);
    expect(result.current.pendingDraft).toBeNull();
    unmount();
    expect(stored().data).toEqual(envelope.data);
  });

  it("loads only the new scope's recovery and resets the previous timestamp", () => {
    const envelope = createFormDraftEnvelope({ amount: 700, requestId: "order-b-token" });
    window.localStorage.setItem(key("owner-a", "order-b"), JSON.stringify(envelope));
    const { result, rerender } = renderDraft();
    act(() => result.current.persistNow());

    rerender({ scope: "order-b", value: { amount: 0, requestId: "new" }, isDirty: false });

    expect(result.current.pendingDraft).toEqual(envelope);
    expect(result.current.lastSavedAt).toBe(envelope.updatedAt);
    rerender({ scope: "order-c", isDirty: false });
    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("discards recovery without applying it and allows current dirty input to save", () => {
    window.localStorage.setItem(key(), JSON.stringify(createFormDraftEnvelope({ amount: 600, requestId: "old" })));
    const onRestore = vi.fn();
    const { result } = renderDraft({ onRestore });

    act(() => result.current.discardDraft());

    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
    expect(stored()).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(stored().data).toEqual(initialValue);
  });

  it.each([
    "{",
    "null",
    JSON.stringify({ version: 99, updatedAt: now.toISOString(), data: initialValue }),
    JSON.stringify(createFormDraftEnvelope(initialValue, new Date("2026-09-01T00:00:00Z")))
  ])("ignores malformed, unsupported, or expired envelopes: %s", (raw) => {
    window.localStorage.setItem(key(), raw);
    const { result } = renderDraft();
    expect(result.current.pendingDraft).toBeNull();
    act(() => result.current.persistNow());
    expect(stored()).toEqual(createFormDraftEnvelope(initialValue));
  });
});

describe("successful payment cleanup", () => {
  it("suppresses unmount writes when a dirty state update has not committed", () => {
    const { result, unmount } = renderHook(() => {
      const [value, setValue] = useState(initialValue);
      const draft = usePaymentDraft({
        ownerId: "owner-a", scope: "order-a", value, isDirty: true, onRestore: setValue
      });
      return { draft, setValue };
    });

    act(() => {
      result.current.setValue({ amount: 999, requestId: "not-committed" });
      result.current.draft.clearDraft();
      unmount();
    });

    expect(stored()).toBeNull();
  });

  it("keeps an asynchronous success callback scoped to its original order", () => {
    const { result, rerender, unmount } = renderDraft();
    const clearOriginal = result.current.clearDraft;
    const persistOriginal = result.current.persistNow;
    rerender({ scope: "order-b", value: { amount: 900, requestId: "next" } });
    act(() => {
      result.current.persistNow();
      clearOriginal();
      expect(persistOriginal()).toBe(false);
    });
    unmount();
    expect(stored()).toBeNull();
    expect(stored("owner-a", "order-b").data.amount).toBe(900);
  });

  it.each([false, true])("clearDraft cannot be undone by timers, persistNow, or unmount (already saved: %s)", (saved) => {
    const { result, rerender, unmount } = renderDraft();
    if (saved) act(() => result.current.persistNow());

    act(() => result.current.clearDraft());
    rerender({ value: { ...initialValue } });
    act(() => {
      vi.advanceTimersByTime(1_000);
      expect(result.current.persistNow()).toBe(false);
    });
    unmount();

    expect(stored()).toBeNull();
    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("clears recovery without a stale dirty snapshot being saved on unmount", () => {
    window.localStorage.setItem(key(), JSON.stringify(createFormDraftEnvelope(initialValue)));
    const { result, unmount } = renderDraft();
    act(() => result.current.clearDraft());
    unmount();
    expect(stored()).toBeNull();
  });

  it("allows genuinely new edits after success", () => {
    const { result, rerender } = renderDraft();
    act(() => result.current.clearDraft());
    const value = { amount: 750, requestId: "new-payment-token" };

    rerender({ value });
    act(() => vi.advanceTimersByTime(500));

    expect(stored().data).toEqual(value);
  });

  it("does not recreate the previous scope after clear and a key switch", () => {
    const { result, rerender, unmount } = renderDraft();
    act(() => result.current.clearDraft());
    rerender({ scope: "order-b", value: { amount: 900, requestId: "next" } });
    unmount();
    expect(stored()).toBeNull();
    expect(stored("owner-a", "order-b").data.amount).toBe(900);
  });

  it("survives StrictMode effect replay without turning its own flush into recovery", () => {
    const { result, unmount } = renderHook(() => usePaymentDraft({
      ownerId: "owner-a", scope: "order-a", value: initialValue, isDirty: true, onRestore: vi.fn()
    }), { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> });

    expect(result.current.pendingDraft).toBeNull();
    act(() => result.current.clearDraft());
    unmount();
    expect(stored()).toBeNull();
  });
});

describe("committed payment snapshots", () => {
  it.each(["order-a", "order-b"])("ignores an interrupted render for scope %s", (scope) => {
    const suspended = new Promise<never>(() => undefined);
    const { rerender, unmount } = renderHook((props: { scope: string; value: Value; suspend: boolean }) => {
      const draft = usePaymentDraft({
        ownerId: "owner-a", scope: props.scope, value: props.value, isDirty: true, onRestore: vi.fn()
      });
      if (props.suspend) throw suspended;
      return draft;
    }, {
      initialProps: { scope: "order-a", value: initialValue, suspend: false },
      wrapper: ({ children }) => <Suspense fallback={null}>{children}</Suspense>
    });

    rerender({ scope, value: { amount: 999, requestId: "not-committed" }, suspend: true });
    unmount();

    expect(stored().data).toEqual(initialValue);
    expect(stored("owner-a", "order-b")).toBeNull();
  });
});

describe("payment draft storage failures", () => {
  function blockStorage(access: "getItem" | "setItem" | "removeItem" | "getter") {
    const fail = () => { throw new DOMException("Unavailable storage", "SecurityError"); };
    return access === "getter"
      ? vi.spyOn(window, "localStorage", "get").mockImplementation(fail)
      : vi.spyOn(Storage.prototype, access).mockImplementation(fail);
  }

  it.each(["setItem", "getter"] as const)("contains %s failures during debounce and permits an explicit retry", (access) => {
    const { result } = renderDraft();
    const failure = blockStorage(access);
    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
    act(() => expect(result.current.persistNow()).toBe(false));
    expect(result.current.lastSavedAt).toBeNull();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);

    failure.mockRestore();
    act(() => expect(result.current.persistNow()).toBe(true));
    expect(stored().data).toEqual(initialValue);
  });

  it("does not advance the last successful timestamp or stored value on quota failure", () => {
    const { result, rerender } = renderDraft();
    act(() => result.current.persistNow());
    const savedAt = result.current.lastSavedAt;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full storage", "QuotaExceededError");
    });
    rerender({ value: { amount: 999, requestId: "retry" } });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.lastSavedAt).toBe(savedAt);
    expect(stored().data).toEqual(initialValue);
  });

  it.each(["getItem", "getter"] as const)("contains %s failures while loading and remains usable", (access) => {
    const failure = blockStorage(access);
    const { result } = renderDraft();
    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
    failure.mockRestore();
    act(() => expect(result.current.persistNow()).toBe(true));
  });

  it.each(["setItem", "getter"] as const)("contains %s failures on unmount and removes dirty guards", (access) => {
    const { unmount } = renderDraft();
    blockStorage(access);
    expect(unmount).not.toThrow();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });

  it.each(["removeItem", "getter"] as const)("suppresses a cleared snapshot even when %s fails", (access) => {
    const { result, unmount } = renderDraft();
    const failure = blockStorage(access);
    expect(() => act(() => result.current.clearDraft())).not.toThrow();
    failure.mockRestore();
    act(() => {
      vi.advanceTimersByTime(1_000);
      expect(result.current.persistNow()).toBe(false);
    });
    unmount();
    expect(stored()).toBeNull();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });

  it("allows retrying failed removal without reviving the cleared snapshot", () => {
    const { result } = renderDraft();
    act(() => result.current.persistNow());
    const failure = blockStorage("removeItem");
    act(() => result.current.clearDraft());
    expect(stored()).not.toBeNull();
    failure.mockRestore();
    act(() => result.current.clearDraft());
    expect(stored()).toBeNull();
  });

  it("dismisses recovery even if storage removal fails", () => {
    window.localStorage.setItem(key(), JSON.stringify(createFormDraftEnvelope(initialValue)));
    const { result } = renderDraft();
    blockStorage("removeItem");
    expect(() => act(() => result.current.discardDraft())).not.toThrow();
    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("contains serialization errors without losing dirty guards", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const { result, unmount } = renderHook(() => usePaymentDraft({
      ownerId: "owner-a", scope: "order-a", value: circular, isDirty: true, onRestore: vi.fn()
    }));
    act(() => expect(result.current.persistNow()).toBe(false));
    expect(result.current.lastSavedAt).toBeNull();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
    expect(unmount).not.toThrow();
  });
});

describe("payment draft navigation guards", () => {
  it("guards history once across three forms without looping on a declined back navigation", () => {
    const first = renderDraft();
    const second = renderDraft({ scope: "order-b" });
    const third = renderDraft({ scope: "order-c" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => undefined);

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(confirm).toHaveBeenCalledOnce();
    expect(forward).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(confirm).toHaveBeenCalledOnce();
    expect(forward).toHaveBeenCalledOnce();

    confirm.mockReturnValue(true);
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(forward).toHaveBeenCalledOnce();
    expect(stored().data).toEqual(initialValue);
    expect(stored("owner-a", "order-b").data).toEqual(initialValue);
    expect(stored("owner-a", "order-c").data).toEqual(initialValue);

    first.unmount();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
    second.unmount();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
    third.unmount();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("does not guard history after clearDraft while stale dirty props remain", () => {
    const { result } = renderDraft();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => result.current.clearDraft());
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("warns and synchronously flushes before unload, then removes the guard on unmount", () => {
    const { unmount } = renderDraft();
    const beforeUnload = new Event("beforeunload", { cancelable: true });

    act(() => window.dispatchEvent(beforeUnload));

    expect(beforeUnload.defaultPrevented).toBe(true);
    expect(stored().data).toEqual(initialValue);
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
    unmount();
    const afterUnmount = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });

  it("guards dirty ownerless forms without accessing storage", () => {
    const getStorage = vi.spyOn(window, "localStorage", "get");
    const { unmount } = renderDraft({ ownerId: undefined });
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    unmount();
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("blocks declined same-origin navigation and flushes before confirmed navigation", () => {
    renderDraft();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const navigate = vi.fn((event: React.MouseEvent) => event.preventDefault());
    render(<a href="/next-order" onClick={navigate}><span>Next</span></a>);

    fireEvent.click(screen.getByText("Next"));
    expect(confirm).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByText("Next"));
    expect(navigate).toHaveBeenCalledOnce();
    expect(stored().data).toEqual(initialValue);
  });

  it.each([
    { href: "/next-order", ctrlKey: true },
    { href: "/next-order", metaKey: true },
    { href: "/next-order", shiftKey: true },
    { href: "/next-order", altKey: true },
    { href: "/next-order", button: 1 },
    { href: "/next-order", target: "_blank" },
    { href: "/next-order", download: "receipt.pdf" },
    { href: "https://example.com/elsewhere" },
    { href: "#details" }
  ])("does not intercept unrelated anchor behavior: %j", ({ href, target, download, ...event }) => {
    renderDraft();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<a href={href} target={target} download={download} onClick={(click) => click.preventDefault()}>Next</a>);
    fireEvent.click(screen.getByRole("link"), event);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("confirms once for multiple payment hooks but flushes every dirty scope", () => {
    renderDraft();
    renderDraft({ scope: "order-b", value: { amount: 900, requestId: "other" } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<a href="/next-order" onClick={(event) => event.preventDefault()}>Next</a>);

    fireEvent.click(screen.getByRole("link"));

    expect(confirm).toHaveBeenCalledOnce();
    expect(stored().data).toEqual(initialValue);
    expect(stored("owner-a", "order-b").data.amount).toBe(900);
  });

  it("clearDraft immediately removes stale dirty warnings without a clean render", () => {
    const { result } = renderDraft();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    act(() => result.current.clearDraft());
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    render(<a href="/next-order" onClick={(event) => event.preventDefault()}>Next</a>);
    fireEvent.click(screen.getByRole("link"));

    expect(beforeUnload.defaultPrevented).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });

  it("does not steal another payment hook's dirty marker, even for the same key", () => {
    const first = renderDraft();
    const second = renderDraft();
    act(() => first.result.current.clearDraft());
    first.unmount();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);

    second.rerender({ isDirty: false });
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });

  it("preserves an existing unrelated form's unsaved marker", () => {
    document.documentElement.setAttribute("data-unsaved-changes", "");
    const { result, unmount } = renderDraft();
    act(() => result.current.clearDraft());
    unmount();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
  });

  it.each([true, false])("cooperates with the generic hook regardless of which unmounts first: %s", (genericFirst) => {
    const generic = renderHook(() => usePersistentFormDraft({
      draftKey: "unrelated-generic", value: initialValue, isDirty: true, onRestore: vi.fn()
    }));
    const payment = renderDraft();
    const dispatch = vi.spyOn(window, "dispatchEvent");

    if (genericFirst) {
      generic.unmount();
      expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
      payment.unmount();
    } else {
      payment.unmount();
      expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
      generic.unmount();
    }

    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "chetech:draft-state", detail: { hasUnsavedChanges: false }
    }));
  });
});
