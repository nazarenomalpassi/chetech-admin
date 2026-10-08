// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ save: vi.fn(), void: vi.fn() }));
vi.mock("../actions", () => ({ saveBalanceTransferAction: actions.save, voidBalanceTransferAction: actions.void }));

import { BalanceTransfersView } from "./balance-transfers-view";

describe("transfer row actions", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("keeps the native reversal form and confirmation in the secondary menu", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const transfer = { id: "transfer-id", fromPaymentMethod: "efectivo", toPaymentMethod: "nx_local", amount: 100, description: "Cambio", transferDate: "2026-10-05", isVoided: false, voidedAt: "", voidReason: "", reversalTransferId: "", reversalOfTransferId: "", createdAt: "2026-10-05", createdBy: null };
    const { getAllByRole, getByRole, queryAllByRole } = render(
      <BalanceTransfersView message={null} summary={{ totalActive: 100, totalVoided: 0, totalMoved: 100, activeCount: 1 }} transfers={[transfer]} />
    );
    expect(queryAllByRole("button", { name: "Anular" })).toHaveLength(0);
    fireEvent.click(getAllByRole("button", { name: "Más acciones" })[0]);
    const form = getByRole("button", { name: "Anular" }).closest("form")!;
    expect(new FormData(form).get("id")).toBe(transfer.id);
    fireEvent.submit(form);
    expect(confirm).toHaveBeenCalledOnce();
    expect(actions.void).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.submit(form);
    await waitFor(() => expect(actions.void).toHaveBeenCalledOnce());
    expect((actions.void.mock.calls[0][0] as FormData).get("id")).toBe(transfer.id);
  });
});
