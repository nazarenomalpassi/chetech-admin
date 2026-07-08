import { normalizeSearchText } from "@/lib/search";

export type ProductCategoryIconKey =
  | "all"
  | "adaptadores"
  | "auriculares"
  | "cables"
  | "cargadores"
  | "iluminacion"
  | "parlantes"
  | "pendrives"
  | "pilas_baterias"
  | "reparacion"
  | "teclados_mouse"
  | "televisores"
  | "vapers"
  | "varios"
  | "generic";

export type ProductCategoryChip = {
  id: string;
  label: string;
  count: number | null;
  icon: ProductCategoryIconKey;
};

function getCategoryIconKey(name: string): ProductCategoryIconKey {
  const normalized = normalizeSearchText(name);

  if (normalized.includes("adapt")) return "adaptadores";
  if (normalized.includes("auricular")) return "auriculares";
  if (normalized.includes("cable")) return "cables";
  if (normalized.includes("cargador")) return "cargadores";
  if (normalized.includes("ilumin")) return "iluminacion";
  if (normalized.includes("parlante")) return "parlantes";
  if (normalized.includes("pendrive")) return "pendrives";
  if (normalized.includes("pilas") || normalized.includes("bateria")) return "pilas_baterias";
  if (normalized.includes("reparacion")) return "reparacion";
  if (normalized.includes("teclado") || normalized.includes("mouse")) return "teclados_mouse";
  if (normalized.includes("televisor")) return "televisores";
  if (normalized.includes("vaper")) return "vapers";
  if (normalized.includes("varios")) return "varios";

  return "generic";
}

export function buildProductCategoryChips(
  categories: Array<{ id: string; name: string; productCount?: number | null }>,
  countsByCategory?: Record<string, number>
) {
  const categoryChips = categories.map((category) => {
    const count = countsByCategory?.[category.id] ?? Number(category.productCount ?? 0);

    return {
      id: category.id,
      label: category.name,
      count,
      icon: getCategoryIconKey(category.name)
    } satisfies ProductCategoryChip;
  });

  const totalCount = categoryChips.reduce((acc, chip) => acc + (chip.count ?? 0), 0);

  return [
    {
      id: "all",
      label: "Todas",
      count: totalCount,
      icon: "all"
    } satisfies ProductCategoryChip,
    ...categoryChips
  ];
}
