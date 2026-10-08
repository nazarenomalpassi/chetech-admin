// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

Object.assign(globalThis, { React });
vi.mock("./board-filters", () => ({ BoardFilters: () => null }));
vi.mock("./board-table", () => ({ BoardTable: ({ onEdit, onSell }: { onEdit: (id: string) => void; onSell: (id: string) => void }) => <><button onClick={() => onEdit("1")}>Editar seleccionada</button><button onClick={() => onSell("1")}>Vender seleccionada</button></> }));
vi.mock("./board-form-dialog", () => ({ BoardFormDialog: ({ open, board }: { open: boolean; board?: { model: string } | null }) => open ? <p>Ficha {board?.model ?? "nueva"}</p> : null }));
vi.mock("./board-sale-dialog", () => ({ BoardSaleDialog: ({ open, board }: { open: boolean; board?: { model: string } | null }) => open ? <p>Venta {board?.model ?? "perdida"}</p> : null }));
import { BoardsView } from "./boards-view";

afterEach(cleanup);
const board = { id: "1", brand: "BGH", model: "Main 123", boardType: "main" as const, price: 100, acquisitionCost: null, releaseEvidence: "unsold" as const, isActive: true, isSold: false, soldAt: null, netAmount: null, releaseDate: null, releasedAt: null, saleNotes: null, saleStatus: "unsold" as const, createdAt: "2026-10-01" };

it.each(["edit", "sale"])("retains the open %s snapshot when results revalidate", (kind) => {
  const { rerender } = render(<BoardsView canManage boards={[board]} />);
  fireEvent.click(screen.getByRole("button", { name: kind === "edit" ? "Editar seleccionada" : "Vender seleccionada" }));
  rerender(<BoardsView canManage boards={[]} />);
  expect(screen.getByText(kind === "edit" ? "Ficha Main 123" : "Venta Main 123")).toBeTruthy();
});
