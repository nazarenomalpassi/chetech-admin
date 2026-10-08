// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ confirmSalaryLiquidationAction: vi.fn() }));

import { SalaryDecisionPanel } from "./salary-decision-panel";

describe("salary simulation detail", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("keeps the simulation amount and member allocations when details are folded", () => {
    const members = ["Santi", "Nazar", "Ana", "Luis"].map((name, index) => ({
      id: String(index), name, targetAmount: 100, sortOrder: index, paidAmount: 0, profitSharePaid: 0
    }));
    const { container, getByLabelText, getByRole } = render(
      <SalaryDecisionPanel accounts={[]} members={members} monthKey="2026-10" monthLabel="Octubre 2026" suggestedAmount={200} />
    );
    const details = container.querySelector("details")!;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    const amount = getByLabelText("Dinero a retirar en esta operacion") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "200" } });
    fireEvent.click(details.querySelector("summary")!);
    expect(details.open).toBe(true);
    const allocations = details.textContent;
    expect(allocations).toContain("Santi");
    fireEvent.click(details.querySelector("summary")!);
    fireEvent.click(details.querySelector("summary")!);
    expect(amount.value).toBe("200");
    expect(details.textContent).toBe(allocations);
    expect(getByRole("button", { name: "Revisar y confirmar retiro" }).hasAttribute("disabled")).toBe(false);
  });

  it.each(["Cancelar", "Cerrar", "Escape"])("protects changed withdrawal fields when closing with %s", (close) => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const members = ["Santi", "Nazar", "Ana", "Luis"].map((name, index) => ({
      id: String(index), name, targetAmount: 100, sortOrder: index, paidAmount: 0, profitSharePaid: 0
    }));
    const { getByLabelText, getByRole, queryByRole } = render(
      <SalaryDecisionPanel accounts={[]} members={members} monthKey="2026-10" monthLabel="Octubre 2026" suggestedAmount={200} />
    );
    fireEvent.change(getByLabelText("Dinero a retirar en esta operacion"), { target: { value: "200" } });
    fireEvent.click(getByRole("button", { name: "Revisar y confirmar retiro" }));
    const dialog = getByRole("dialog");
    const closeDialog = () => close === "Escape"
      ? fireEvent.keyDown(document, { key: "Escape" })
      : fireEvent.click(within(dialog).getByRole("button", { name: close }));
    fireEvent.change(within(dialog).getByLabelText("Observaciones"), { target: { value: "Retiro revisado" } });
    closeDialog();
    expect(confirm).toHaveBeenCalledOnce();
    expect(queryByRole("dialog")).not.toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Observaciones"), { target: { value: "" } });
    closeDialog();
    expect(confirm).toHaveBeenCalledOnce();
    expect(queryByRole("dialog")).toBeNull();
  });
});
