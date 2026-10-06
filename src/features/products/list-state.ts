import { normalizeSearchText } from "@/lib/search";
import { parsePage } from "@/lib/pagination";

export type ProductListParams = { search?: string; category?: string; status?: string; sort?: string; page?: string; pageSize?: string };
export type ProductListState = { search: string; category: string; status: "all" | "active" | "inactive"; sort: "name" | "sku" | "stock" | "price"; page: number; pageSize: number };

export function parseProductListState(params: ProductListParams = {}): ProductListState {
  return {
    search: (params.search ?? "").trim().slice(0, 120),
    category: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.category ?? "") ? params.category! : "",
    status: params.status === "active" || params.status === "inactive" ? params.status : "all",
    sort: params.sort === "sku" || params.sort === "stock" || params.sort === "price" ? params.sort : "name",
    page: Math.min(parsePage(params.page), 1000000),
    pageSize: params.pageSize === "50" || params.pageSize === "100" ? Number(params.pageSize) : 25
  };
}

export function buildProductSearchFilter(search: string) {
  // Only normalized alphanumerics enter PostgREST grammar. Spanish accents remain searchable.
  const accents: Record<string, string> = { a: "[a\u00e1\u00e0\u00e4\u00e2\u00e3]", e: "[e\u00e9\u00e8\u00eb\u00ea]", i: "[i\u00ed\u00ec\u00ef\u00ee]", o: "[o\u00f3\u00f2\u00f6\u00f4\u00f5]", u: "[u\u00fa\u00f9\u00fc\u00fb]", n: "[n\u00f1]", c: "[c\u00e7]" };
  const tokens = [...new Set(normalizeSearchText(search).split(" ").filter(Boolean))];
  if (!tokens.length) return null;
  return `and(${tokens.map(token => {
    const pattern = [...token].map(char => accents[char] ?? char).join("");
    return `or(name.imatch.${pattern},sku.imatch.${pattern})`;
  }).join(",")})`;
}

export function updateProductListParams(current: URLSearchParams, updates: Record<string, string>) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) {
    if (!value || value === "all" || (key === "sort" && value === "name") || (key === "pageSize" && value === "25")) params.delete(key);
    else params.set(key, value);
  }
  params.delete("page");
  return params;
}
