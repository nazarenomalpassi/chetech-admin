// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PurchaseCommitmentsNotice } from "./purchase-commitments-notice";
Object.assign(globalThis, { React });
afterEach(cleanup);
it("warns that unknown costs are excluded and only suggestions change", () => {
  render(<PurchaseCommitmentsNotice commitments={{ ready: true, knownOutstanding: 140, unknownCostCount: 2, purchaseCount: 3 }} />);
  expect(screen.getByText(/2 compras sin costo conocido/)).toBeTruthy();
  expect(screen.getByText(/No modifica caja/)).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});
it("marks the suggestion incomplete when the migration or RPC is unavailable", () => {
  render(<PurchaseCommitmentsNotice commitments={{ ready: false, knownOutstanding: null, unknownCostCount: null, purchaseCount: null }} />);
  expect(screen.getByRole("alert").textContent).toContain("no incluye compromisos");
});
