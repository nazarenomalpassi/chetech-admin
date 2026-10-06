// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OperationsPagination } from "./operations-pagination";
import { createPaginationMeta } from "@/lib/pagination";
Object.assign(globalThis, { React }); afterEach(cleanup);
describe("filter-preserving history links", () => {
  it.each(["/visitas?visitStatus=confirmada&technicianId=tech", "/terciarizaciones?outsourceStatus=vencidas&search=Juan"])("preserves dates and week in %s", (path) => {
    render(<OperationsPagination baseHref={`${path}&date=2026-10-05&view=week`} pagination={createPaginationMeta(601, 13)} />);
    const href = new URL(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")!, "http://localhost");
    expect(href.searchParams.get("date")).toBe("2026-10-05"); expect(href.searchParams.get("view")).toBe("week"); expect(href.searchParams.get("page")).toBe("14");
  });
});
