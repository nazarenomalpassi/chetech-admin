// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "./searchable-select";

describe("searchable long selectors", () => {
  beforeEach(() => vi.stubGlobal("React", React));
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("matches accents and keeps the current order selected when searching another", () => {
    render(<SearchableSelect aria-label="Orden" searchLabel="Buscar orden" name="order" value="2" onChange={() => {}} options={[
      { value: "", label: "Seleccionar orden" }, { value: "1", label: "REP-000513 Belén" }, { value: "2", label: "REP-000514 Martín" }
    ]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "belen" } });
    expect(screen.getByRole("option", { name: "REP-000513 Belén" })).toBeTruthy();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("2");
    expect(screen.getByRole("status").textContent).toBe("1 coincidencias");
  });
});
