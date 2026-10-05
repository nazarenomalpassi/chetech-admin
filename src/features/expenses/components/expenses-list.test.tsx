// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../actions", () => ({ deleteExpenseAction: vi.fn(), saveExpenseAction: vi.fn(), linkExpensePurchaseAction: vi.fn(), getExpenseLinkOptionsAction: vi.fn(async () => ({ data: { items: [], page: 1, total: 0, totalPages: 1 }, error: null })) }));
vi.mock("@/components/ui/pagination-nav", () => ({ PaginationNav: () => null }));
import { ExpensesList } from "./expenses-list";
Object.assign(globalThis, { React });
afterEach(cleanup);
it("offers a metadata-only existing expense form, separate from financial editing", () => {
  const expense = { id: "expense", expenseDate: "2026-10-05", type: "Parts", description: "Already paid", amount: 100, paymentMethod: "nx", impactsCash: true, isVoided: false, observations: "", repairOrderId: null, partRequestId: null, linkLabel: "" };
  render(<ExpensesList ownerId="admin" canDelete expenses={[expense]} pagination={{ page: 1, pageSize: 25, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false }} message={null} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Vincular pago" })[0]);
  const title = screen.getByRole("heading", { name: "Vincular gasto existente" });
  const form = title.closest("section")!.querySelector("form")!;
  expect(form.querySelector('[name="id"]')).not.toBeNull();
  expect(form.querySelector('[name="amount"]')).toBeNull();
  expect(form.querySelector('[name="expenseDate"]')).toBeNull();
  expect(screen.getByText(/sin volver a registrar dinero/)).toBeTruthy();
});
