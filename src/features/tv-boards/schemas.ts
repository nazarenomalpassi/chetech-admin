import { z } from "zod";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const TV_BOARD_TYPES = [
  { label: "Fuente", value: "fuente" },
  { label: "Main", value: "main" },
  { label: "Tcom", value: "tcom" },
  { label: "Placa unica", value: "placa_unica" }
] as const;

export const tvBoardSchema = z.object({
  id: z.string().uuid().optional(),
  brand: z.string().min(2, "La marca debe tener al menos 2 caracteres"),
  model: z.string().min(2, "El modelo debe tener al menos 2 caracteres"),
  boardType: z.enum(["fuente", "main", "tcom", "placa_unica"], {
    message: "Selecciona un tipo de placa valido"
  }),
  price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  isActive: z.boolean().default(true)
});

export const tvBoardFiltersSchema = z.object({
  search: z.string().optional(),
  boardType: z.enum(["all", "fuente", "main", "tcom", "placa_unica"]).default("all"),
  status: z
    .enum(["all", "active", "inactive", "sold", "pending_release", "released"])
    .default("all")
});

export const tvBoardSaleSchema = z.object({
  id: z.string().uuid("La placa seleccionada no es valida"),
  netAmount: z.coerce.number().positive("Ingresa el dinero real final de la venta"),
  releaseDate: z.string().regex(DATE_ONLY_PATTERN, "Selecciona una fecha de liberacion valida"),
  notes: z.string().trim().max(500, "Las observaciones pueden tener hasta 500 caracteres").optional()
});

export type TvBoardFormValues = z.infer<typeof tvBoardSchema>;
export type TvBoardSaleFormValues = z.infer<typeof tvBoardSaleSchema>;
