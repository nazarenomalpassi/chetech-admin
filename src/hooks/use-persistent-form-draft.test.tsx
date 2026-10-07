// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePersistentFormDraft } from "@/hooks/use-persistent-form-draft";
import { createFormDraftEnvelope, getFormDraftStorageKey } from "@/lib/form-draft";

Object.assign(globalThis, { React });

type DraftValue = { notes: string };
type DraftOptions = Parameters<typeof usePersistentFormDraft<DraftValue>>[0];
type StorageFailure = "getItem" | "setItem" | "removeItem" | "getter";

const draftKey = "persistent-form-draft-test";
const storageKey = getFormDraftStorageKey(draftKey);
const now = new Date("2026-10-07T12:00:00.000Z");

function renderDraft(initialProps: Partial<DraftOptions> = {}) {
  const value = { notes: "Unsaved notes" };
  const onRestore = vi.fn();
  return renderHook((props: Partial<DraftOptions>) => usePersistentFormDraft<DraftValue>({
    draftKey,
    isDirty: true,
    onRestore,
    value,
    ...props
  }), { initialProps });
}

function blockStorage(access: StorageFailure) {
  const fail = () => {
    throw new DOMException("Draft storage unavailable", access === "setItem" ? "QuotaExceededError" : "SecurityError");
  };
  return access === "getter"
    ? vi.spyOn(window, "localStorage", "get").mockImplementation(fail)
    : vi.spyOn(Storage.prototype, access).mockImplementation(fail);
}

function DraftForm({ onSubmit }: { onSubmit: (value: DraftValue) => void }) {
  const [value, setValue] = useState({ notes: "" });
  const draft = usePersistentFormDraft({
    draftKey,
    isDirty: value.notes.length > 0,
    onRestore: setValue,
    value
  });

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      draft.clearDraft();
      onSubmit(value);
      setValue({ notes: "" });
    }}>
      <input aria-label="Notes" onChange={(event) => setValue({ notes: event.target.value })} value={value.notes} />
      <button type="submit">Save</button>
    </form>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  window.localStorage.clear();
});

afterEach(() => {
  // Restore storage before cleanup so RED failures do not also fail teardown.
  vi.restoreAllMocks();
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("usePersistentFormDraft storage failures", () => {
  it.each(["setItem", "getter"] as const)("contains a debounce failure from %s without reporting a save", (access) => {
    const { result } = renderDraft();
    blockStorage(access);

    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();

    expect(result.current.lastSavedAt).toBeNull();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });

  it("does not advance the last successful save time after a quota failure", () => {
    const { result, rerender } = renderDraft();
    act(() => vi.advanceTimersByTime(500));
    const savedAt = result.current.lastSavedAt;
    const saved = window.localStorage.getItem(storageKey);
    expect(savedAt).toBe(new Date().toISOString());
    blockStorage("setItem");

    rerender({ value: { notes: "New unsaved notes" } });
    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();

    expect(result.current.lastSavedAt).toBe(savedAt);
    expect(window.localStorage.getItem(storageKey)).toBe(saved);
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
  });

  it.each(["setItem", "getter"] as const)("contains an unmount failure from %s and clears global dirty state", (access) => {
    const { unmount } = renderDraft();
    const dispatch = vi.spyOn(window, "dispatchEvent");
    blockStorage(access);

    expect(unmount).not.toThrow();

    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "chetech:draft-state",
      detail: { hasUnsavedChanges: false }
    }));
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(false);
  });

  it.each(["getItem", "getter"] as const)("starts without a recovery prompt when %s is unavailable", (access) => {
    const failure = blockStorage(access);
    const { result } = renderDraft();

    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
    failure.mockRestore();
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.lastSavedAt).toBe(new Date().toISOString());
  });

  it.each(["removeItem", "getter"] as const)("continues after a clearOnMount failure from %s", (access) => {
    window.localStorage.setItem(storageKey, JSON.stringify(createFormDraftEnvelope({ notes: "Old draft" })));
    const failure = blockStorage(access);
    const { result } = renderDraft({ clearOnMount: true });

    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
    failure.mockRestore();
    act(() => vi.advanceTimersByTime(500));
    expect(JSON.parse(window.localStorage.getItem(storageKey)!).data).toEqual({ notes: "Unsaved notes" });
    expect(result.current.lastSavedAt).toBe(new Date().toISOString());
  });

  it.each([
    "{",
    JSON.stringify(createFormDraftEnvelope({ notes: "  " }, now)),
    JSON.stringify(createFormDraftEnvelope({ notes: "Expired draft" }, new Date("2026-08-01T12:00:00.000Z")))
  ])("continues when removing an invalid or empty draft fails: %s", (raw) => {
    window.localStorage.setItem(storageKey, raw);
    blockStorage("removeItem");
    const { result } = renderDraft();

    expect(result.current.pendingDraft).toBeNull();
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.lastSavedAt).toBe(new Date().toISOString());
  });

  it("contains an unavailable storage getter while removing a malformed draft", () => {
    const storage = window.localStorage;
    storage.setItem(storageKey, "{");
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Draft storage unavailable", "SecurityError");
    }).mockReturnValueOnce(storage);
    const { result } = renderDraft();

    expect(result.current.pendingDraft).toBeNull();
    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it.each(["removeItem", "getter"] as const)("can become clean when removing storage via %s fails", (access) => {
    const { result, rerender } = renderDraft();
    act(() => vi.advanceTimersByTime(500));
    blockStorage(access);

    expect(() => rerender({ isDirty: false })).not.toThrow();

    expect(result.current.lastSavedAt).toBeNull();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(false);
  });

  describe.each(["discardDraft", "clearDraft"] as const)("%s", (action) => {
    it.each(["removeItem", "getter"] as const)("dismisses recovery when %s fails without clearing unsaved changes", (access) => {
      window.localStorage.setItem(storageKey, JSON.stringify(createFormDraftEnvelope({ notes: "Old draft" })));
      const { result } = renderDraft();
      expect(result.current.pendingDraft).not.toBeNull();
      const failure = blockStorage(access);

      expect(() => act(() => result.current[action]())).not.toThrow();

      expect(result.current.pendingDraft).toBeNull();
      expect(result.current.lastSavedAt).toBeNull();
      expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
      failure.mockRestore();
      act(() => vi.advanceTimersByTime(500));
      expect(result.current.lastSavedAt).toBe(new Date().toISOString());
    });
  });

  it("preserves other dirty drafts when an unmount write fails", () => {
    const first = renderDraft();
    const second = renderDraft({ draftKey: "other-dirty-draft" });
    const dispatch = vi.spyOn(window, "dispatchEvent");
    blockStorage("setItem");

    expect(first.unmount).not.toThrow();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ detail: { hasUnsavedChanges: true } }));
    expect(second.unmount).not.toThrow();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });

  it("retains click and history guards after a failed save and allows confirmed navigation", () => {
    const { unmount } = renderDraft();
    blockStorage("setItem");
    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const forward = vi.spyOn(window.history, "forward").mockImplementation(() => undefined);
    const navigate = vi.fn((event: React.MouseEvent) => event.preventDefault());
    render(<a href="/next-page" onClick={navigate}>Next page</a>);

    fireEvent.click(screen.getByRole("link", { name: "Next page" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(forward).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(confirm).toHaveBeenCalledTimes(2);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("link", { name: "Next page" }));
    expect(navigate).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(forward).toHaveBeenCalledOnce();
    expect(unmount).not.toThrow();
    fireEvent.click(screen.getByRole("link", { name: "Next page" }));
    expect(confirm).toHaveBeenCalledTimes(4);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it.each(["setItem", "getter"] as const)("keeps form submission operational when %s fails", (access) => {
    const onSubmit = vi.fn();
    render(<DraftForm onSubmit={onSubmit} />);
    blockStorage(access);
    blockStorage("removeItem");
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Submitted notes" } });

    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
    expect(() => fireEvent.click(screen.getByRole("button", { name: "Save" }))).not.toThrow();

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ notes: "Submitted notes" });
    expect((screen.getByRole("textbox", { name: "Notes" }) as HTMLInputElement).value).toBe("");
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });
});

describe("usePersistentFormDraft normal persistence", () => {
  it("debounces changes and saves only the latest value with an accurate timestamp", () => {
    const { result, rerender } = renderDraft();
    act(() => vi.advanceTimersByTime(300));
    rerender({ value: { notes: "Latest notes" } });
    act(() => vi.advanceTimersByTime(499));
    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();

    act(() => vi.advanceTimersByTime(1));

    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual(createFormDraftEnvelope({ notes: "Latest notes" }));
    expect(result.current.lastSavedAt).toBe(new Date().toISOString());
  });

  it("flushes the latest dirty value on unmount before the debounce fires", () => {
    const { rerender, unmount } = renderDraft();
    rerender({ value: { notes: "Latest notes" } });

    unmount();

    expect(JSON.parse(window.localStorage.getItem(storageKey)!)).toEqual(createFormDraftEnvelope({ notes: "Latest notes" }));
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });

  it("waits for recovery and restores the saved data and timestamp", () => {
    const envelope = createFormDraftEnvelope({ notes: "Recovered notes" });
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
    const onRestore = vi.fn();
    const { result, rerender } = renderDraft({ onRestore });
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.pendingDraft).toEqual(envelope);
    expect(window.localStorage.getItem(storageKey)).toBe(JSON.stringify(envelope));

    act(() => result.current.restoreDraft());

    expect(onRestore).toHaveBeenCalledExactlyOnceWith(envelope.data);
    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBe(envelope.updatedAt);
    rerender({ onRestore, value: envelope.data });
    act(() => vi.advanceTimersByTime(500));
    expect(JSON.parse(window.localStorage.getItem(storageKey)!).data).toEqual(envelope.data);
    expect(result.current.lastSavedAt).toBe(new Date().toISOString());
  });

  it.each(["discardDraft", "clearDraft"] as const)("%s removes stored data and dismisses recovery", (action) => {
    window.localStorage.setItem(storageKey, JSON.stringify(createFormDraftEnvelope({ notes: "Old draft" })));
    const { result, unmount } = renderDraft({ isDirty: false });

    act(() => result.current[action]());
    unmount();

    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(result.current.pendingDraft).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("removes stored data when a saved form becomes clean", () => {
    const { result, rerender, unmount } = renderDraft();
    act(() => vi.advanceTimersByTime(500));

    rerender({ isDirty: false });
    unmount();

    expect(window.localStorage.getItem(storageKey)).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
    expect(document.documentElement.hasAttribute("data-unsaved-changes")).toBe(false);
  });
});
