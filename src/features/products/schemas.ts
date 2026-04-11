import { z } from "zod";

export const productSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().optional(),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  categoryId: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().uuid("Seleccioná una categoría").nullable().optional()
  ),
  cost: z.coerce.number().min(0, "El costo no puede ser negativo"),
  salePrice: z.coerce.number().min(0, "El precio no puede ser negativo"),
  stock: z.coerce.number().min(0, "El stock inicial no puede ser negativo"),
  minStock: z.coerce.number().min(0, "El stock mínimo no puede ser negativo"),
  isActive: z.boolean().default(true),
  notes: z.preprocess((value) => (value === "" ? null : value), z.string().nullable().optional())
});

export const productFiltersSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all")
});

export type ProductFormValues = z.infer<typeof productSchema>;
