// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../actions", () => ({ getExpenseLinkOptionsAction: load }));
import { ExpenseLinkSelector } from "./expense-link-selector";
Object.assign(globalThis, { React });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("loads bounded pages and submits the actual selected purchase", async () => {
  load.mockResolvedValue({ error: null, data: { items: [{ id: "part", orderId: "rep", repairNumber: "REP-1", description: "Mainboard", expectedCost: null, outstanding: null, paidAmount: 20 }], page: 1, pageSize: 25, total: 30, totalPages: 2 } });
  const { container } = render(<ExpenseLinkSelector prefix="test" />);
  fireEvent.change(screen.getByLabelText("Destino del gasto"), { target: { value: "part" } });
  await screen.findByText(/Costo desconocido/);
  fireEvent.click(screen.getByRole("radio", { name: /REP-1.*Mainboard/ }));
  expect((container.querySelector('[name="partRequestId"]') as HTMLInputElement).value).toBe("part");
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await waitFor(() => expect(load).toHaveBeenCalledWith("part", "", 2));
});
it("keeps a known existing link until explicitly replaced or removed", () => {
  const { container } = render(<ExpenseLinkSelector prefix="test" initial={{ orderId: "rep", partRequestId: "part", label: "REP-1 / Existing" }} />);
  expect((container.querySelector('[name="partRequestId"]') as HTMLInputElement).value).toBe("part");
  fireEvent.change(screen.getByLabelText("Destino del gasto"), { target: { value: "repair" } });
  expect((container.querySelector('[name="repairOrderId"]') as HTMLInputElement).value).toBe("rep");
  expect((container.querySelector('[name="partRequestId"]') as HTMLInputElement).value).toBe("");
});
it("shows RPC failures instead of pretending there are no purchases", async () => {
  load.mockResolvedValue({ error: "Missing migration", data: null });
  render(<ExpenseLinkSelector prefix="test" />);
  fireEvent.change(screen.getByLabelText("Destino del gasto"), { target: { value: "part" } });
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Missing migration");
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});
