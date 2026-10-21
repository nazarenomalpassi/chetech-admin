// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ confirmSalaryLiquidationAction: vi.fn() }));

import { SalaryDecisionPanel } from "./salary-decision-panel";

describe("salary simulation detail", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("always shows member allocations and accessible progress without a collapse control", () => {
    const members = ["Santi", "Nazar", "Ana", "Luis"].map((name, index) => ({
      id: String(index), name, targetAmount: 100, sortOrder: index, paidAmount: 0, profitSharePaid: 0
    }));
    const { container, getByLabelText, getByRole } = render(
      <SalaryDecisionPanel accounts={[]} members={members} monthKey="2026-10" monthLabel="Octubre 2026" suggestedAmount={200} />
    );
    expect(container.querySelector("details")).toBeNull();
    const allocations = getByRole("region", { name: "Reparto por integrante" });
    expect(within(allocations).getAllByRole("heading", { level: 3 })).toHaveLength(4);
    const amount = getByLabelText("Dinero a retirar en esta operacion") as HTMLInputElement;
    fireEvent.change(amount, { target: { value: "200" } });
    expect(allocations.textContent).toContain("Santi");
    const progress = within(allocations).getByRole("progressbar", { name: "Cobertura de sueldo de Santi" });
    expect(progress.getAttribute("aria-valuenow")).toBe("50");
    expect(progress.querySelector("div")?.className).toContain("motion-reduce:transition-none");
    expect(amount.value).toBe("200");
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
