import { describe, expect, it } from "vitest";
import { buildProductSearchFilter, parseProductListState, updateProductListParams } from "./list-state";
describe("product list state", () => {
  it("bounds and validates URL state", () => {
    expect(parseProductListState({ page: "-4", pageSize: "9999", status: "bad", sort: "cost", category: "injection" })).toMatchObject({ page: 1, pageSize: 25, status: "all", sort: "name", category: "" });
  });
  it("matches all query tokens across SKU/name and supports Spanish accents without raw grammar injection", () => {
    const filter = buildProductSearchFilter('Batería CAB-1 ,is_active.eq.false');
    expect(filter).toContain("name.imatch.b[a");
    expect(filter).toContain("sku.imatch.");
    expect(filter).not.toContain("is_active.eq.false");
    expect(buildProductSearchFilter(" ,()_% ")).toBeNull();
  });
  it("resets pagination while retaining simultaneous pending search and unrelated params", () => {
    const params = updateProductListParams(new URLSearchParams("page=4&status=active&search=old&source=test"), { search: "new", category: "category" });
    expect(params.get("page")).toBeNull();
    expect(params.get("search")).toBe("new");
    expect(params.get("status")).toBe("active");
    expect(params.get("source")).toBe("test");
  });
});
