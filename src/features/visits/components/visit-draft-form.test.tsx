// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VisitDraftForm } from "./visit-draft-form";
import { serializeVisitDraft, visitDraftStorageKey } from "../drafts";
Object.assign(globalThis, { React });
beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
const saved = { ownerId: "admin", visitId: "new", sourceVersion: "", token: "saved-token", savedAt: Date.now(), fields: { customerName: "Juan" } };
function form(props = {}) { return <VisitDraftForm ownerId="admin" visitId="new" sourceVersion="" action={vi.fn()} {...props}><label>Cliente<input name="customerName" defaultValue="" /></label><button type="submit">Guardar</button></VisitDraftForm>; }
describe("explicit draft recovery", () => {
  it("persists only locally and does not auto-restore over the form", () => {
    sessionStorage.setItem(visitDraftStorageKey("admin", "new"), serializeVisitDraft(saved));
    render(form());
    expect((screen.getByLabelText("Cliente") as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Recuperar borrador" }));
    expect((screen.getByLabelText("Cliente") as HTMLInputElement).value).toBe("Juan");
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Juan Perez" } });
    expect(sessionStorage.getItem(visitDraftStorageKey("admin", "new"))).toContain("Juan Perez");
  });
  it("refuses stale edit recovery and leaves a readable copy", () => {
    sessionStorage.setItem(visitDraftStorageKey("admin", "new"), serializeVisitDraft({ ...saved, sourceVersion: "old" }));
    render(form({ sourceVersion: "current" }));
    expect((screen.getByRole("button", { name: "Recuperar borrador" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/La visita cambio/)).toBeTruthy();
  });
  it("clears only the acknowledged saved generation", () => {
    sessionStorage.setItem(visitDraftStorageKey("admin", "new"), serializeVisitDraft(saved));
    render(form({ savedDraftToken: "different-token", savedDraftVisitId: "new" }));
    expect(sessionStorage.getItem(visitDraftStorageKey("admin", "new"))).not.toBeNull();
    cleanup();
    render(form({ savedDraftToken: "saved-token", savedDraftVisitId: "new" }));
    expect(sessionStorage.getItem(visitDraftStorageKey("admin", "new"))).toBeNull();
  });
  it("clears another user's feature drafts rather than revealing them on a shared tab", () => {
    sessionStorage.setItem("chetech:visits-draft-owner", "other");
    sessionStorage.setItem(visitDraftStorageKey("other", "new"), serializeVisitDraft({ ...saved, ownerId: "other" }));
    render(form());
    expect(sessionStorage.getItem(visitDraftStorageKey("other", "new"))).toBeNull();
    expect((screen.getByLabelText("Cliente") as HTMLInputElement).value).toBe("");
  });
});
