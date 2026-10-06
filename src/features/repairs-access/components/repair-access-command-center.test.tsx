// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepairAccessCommandCenter } from "@/features/repairs-access/components/repair-access-command-center";
import type { RepairAccessOrderRecord, RepairAccessSummary } from "@/features/repairs-access/queries";

Object.assign(globalThis, { React });
afterEach(cleanup);

const summary: RepairAccessSummary = {
  totalOrders: 1, totalCustomers: 1, activeOrders: 1, paidOrders: 0, pendingBudget: 0,
  totalProjected: 0, totalCollected: 0, intakeToday: 0, deliveredToday: 0, collectedToday: 0,
  readyToPickup: 1, waitingCustomer: 0, delayedOrders: 0, activeWarranties: 0,
  statusCounts: { listo_para_retirar: 1 }
};
const order = {
  id: "test-order", repairNumber: "REP-000511", status: "listo_para_retirar", intakeDate: "2026-10-01",
  customer: { fullName: "Cliente de prueba" }, device: { deviceType: "Televisor", brand: "LG", model: "42" }
} as RepairAccessOrderRecord;

describe("workshop command center", () => {
  it("drills down to the exact status rather than opening all orders", () => {
    const onOpenStatus = vi.fn();
    render(<RepairAccessCommandCenter onNavigate={vi.fn()} onOpenStatus={onOpenStatus} onOpenDetail={vi.fn()} orders={[]} summary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: /^0 presupuestado$/i }));
    expect(onOpenStatus).toHaveBeenCalledWith("presupuestado");
  });

  it("shows the full order reference and opens the corresponding detail", () => {
    const onOpenDetail = vi.fn();
    render(<RepairAccessCommandCenter onNavigate={vi.fn()} onOpenStatus={vi.fn()} onOpenDetail={onOpenDetail} orders={[order]} summary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: /REP-000511/ }));
    expect(onOpenDetail).toHaveBeenCalledWith(order);
  });
});
