// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mark: vi.fn(), refresh: vi.fn(), confirm: vi.fn() }));
vi.mock("@/features/repairs-access/pickup-actions", () => ({
  markPaidOrdersPickedUpAction: mocks.mark
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  confirmThen: (options: unknown, onConfirm: () => void) => {
    mocks.confirm(options);
    onConfirm();
  }
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
import { PaidAwaitingPickupPanel } from "./paid-awaiting-pickup-panel";

const orders = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    repairNumber: "REP-000001",
    customerName: "Ana Pérez",
    device: "TV Samsung",
    paidAt: "2026-11-10T15:00:00Z",
    intakeDate: "2026-11-01"
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    repairNumber: "REP-000002",
    customerName: "Luis Gómez",
    device: "Notebook",
    paidAt: null,
    intakeDate: "2026-11-02"
  }
];

describe("paid orders awaiting pickup", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("hides itself when nothing is pending", () => {
    const { container } = render(<PaidAwaitingPickupPanel orders={[]} />);
    expect(container.textContent).toBe("");
  });

  it("marks only the selected orders after confirming and refreshes the list", async () => {
    mocks.mark.mockResolvedValue({
      success: true,
      message: "1 orden marcada como retirada.",
      done: 1,
      failed: []
    });
    render(<PaidAwaitingPickupPanel orders={orders} />);
    expect(screen.getByText("2 órdenes ya cobradas siguen figurando para retirar.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Marcar como retiradas" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText("Marcar REP-000002 de Luis Gómez"));
    fireEvent.click(screen.getByRole("button", { name: "Marcar como retiradas (1)" }));
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledExactlyOnceWith([orders[1].id]));
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: "¿Marcar 1 orden como retirada?" })
    );
    expect(await screen.findByText("1 orden marcada como retirada.")).toBeTruthy();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("selects every order at once and lists the failures", async () => {
    mocks.mark.mockResolvedValue({
      success: false,
      message: "1 orden marcada como retirada. 1 no se pudo marcar.",
      done: 1,
      failed: [{ repairNumber: "REP-000001", message: "La orden cambió." }]
    });
    render(<PaidAwaitingPickupPanel orders={orders} />);
    fireEvent.click(screen.getByLabelText("Seleccionar todas"));
    fireEvent.click(screen.getByRole("button", { name: "Marcar como retiradas (2)" }));
    await waitFor(() => expect(mocks.mark).toHaveBeenCalledWith(orders.map((order) => order.id)));
    expect((await screen.findByRole("alert")).textContent).toContain("La orden cambió.");
  });
});
