// @vitest-environment jsdom
import React, { type Ref } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepairsAccessView } from "@/features/repairs-access/components/repairs-access-view";
import type { RepairAccessOrderRecord, RepairAccessSummary } from "@/features/repairs-access/queries";

Object.assign(globalThis, { React });
afterEach(cleanup);
vi.mock("@/features/repairs-access/actions", () => ({ saveRepairAccessOrderAction: vi.fn() }));
vi.mock("@/features/repairs-access/components/repair-access-command-center", () => ({
  RepairAccessCommandCenter: ({ onOpenStatus }: { onOpenStatus: (status: string) => void }) => <button onClick={() => onOpenStatus("presupuestado")}>Ver presupuestadas</button>
}));
vi.mock("@/features/repairs-access/components/repair-access-orders-section", () => ({
  RepairAccessOrdersSection: ({ headingRef, search, statusFilter }: { headingRef: Ref<HTMLHeadingElement>; search: string; statusFilter: string }) => <section><h2 ref={headingRef} tabIndex={-1}>Mesa de trabajo</h2><input aria-label="Orden buscada" readOnly value={search} /><p>{statusFilter}</p></section>
}));

const props = {
  orders: [], customers: [], latestImport: null, summary: {} as RepairAccessSummary,
  message: null, canManageIntake: true, defaultWarrantyDays: 90
};

describe("workshop section navigation", () => {
  it("moves keyboard focus to the order heading after a status drilldown", () => {
    render(<RepairsAccessView {...props} />);
    const shortcut = screen.getByRole("button", { name: "Ver presupuestadas" });
    shortcut.focus();
    fireEvent.click(shortcut);
    expect(screen.getByText("presupuestado")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Mesa de trabajo" }));
  });
  it("opens technician order deep links with the corresponding reference already searched", () => {
    const order = { id: "repair-1", repairNumber: "REP-000357" } as RepairAccessOrderRecord;
    render(<RepairsAccessView {...props} canManageIntake={false} initialOrderId={order.id} orders={[order]} />);
    expect((screen.getByRole("textbox", { name: "Orden buscada" }) as HTMLInputElement).value).toBe("REP-000357");
    expect(document.activeElement).not.toBe(screen.getByRole("heading", { name: "Mesa de trabajo" }));
  });
});
