import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import xlsx from "xlsx";

const workbookPath =
  process.argv[2] ?? "C:\\Users\\nazar\\Downloads\\Inventario Chetech (3).xlsx";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
}

const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const workbook = xlsx.readFile(workbookPath, { cellDates: true });

type Row = Record<string, unknown>;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeKey(value: unknown) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeNumber(value: unknown) {
  if (value == null || value === "") return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;

  const raw = String(value).trim();
  if (!raw) return 0;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = raw.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateOnly(value: unknown) {
  const parsed = normalizeDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

function dateTime(value: unknown) {
  const parsed = normalizeDate(value);
  return parsed ? parsed.toISOString() : new Date().toISOString();
}

function mapPaymentMethod(value: unknown) {
  const normalized = normalizeKey(value);

  if (!normalized) return "sin_especificar";
  if (normalized.includes("efectivo") || normalized === "cash") return "efectivo";
  if (normalized.includes("transfer")) return "transferencia";
  if (normalized.includes("deb")) return "debito";
  if (normalized.includes("cred")) return "credito";
  if (normalized.includes("mercado")) return "mercado_pago";
  return normalized;
}

function getSheet(name: string) {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`No se encontro la hoja "${name}" en el archivo.`);
  }

  return xlsx.utils.sheet_to_json<Row>(sheet, { defval: null });
}

function remapRow(row: Row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function ensureCategories() {
  const configRows = getSheet("CONFIG").map(remapRow);
  const productRows = getSheet("PRODUCTOS").map(remapRow);

  const names = new Set<string>();

  for (const row of configRows) {
    const value = normalizeText(row["a_categorias_de_productos"]);
    if (value) names.add(value);
  }

  for (const row of productRows) {
    const value = normalizeText(row["categoria"]);
    if (value) names.add(value);
  }

  const categories = Array.from(names).map((name) => ({
    name,
    slug: normalizeKey(name)
  }));

  if (!categories.length) return new Map<string, string>();

  const { error: upsertError } = await supabase.from("categories").upsert(categories, {
    onConflict: "slug"
  });

  if (upsertError) {
    throw upsertError;
  }

  const { data, error } = await supabase.from("categories").select("id, name");

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((category) => [category.name, category.id]));
}

async function importProducts(categoryMap: Map<string, string>) {
  const rows = getSheet("PRODUCTOS").map(remapRow);

  const payload = dedupeBy(
    rows
      .filter((row) => normalizeText(row["producto"]))
      .map((row) => ({
        sku: normalizeText(row["sku"]),
        name: normalizeText(row["producto"]),
        category_id: categoryMap.get(normalizeText(row["categoria"])) ?? null,
        cost: normalizeNumber(row["precio_costo"]),
        sale_price: normalizeNumber(row["precio_venta"]),
        stock: Math.max(0, normalizeNumber(row["stock_actual"] ?? row["stock_inicial"])),
        min_stock: 1,
        is_active: true,
        notes: null
      })),
    (item) => item.sku
  );

  if (!payload.length) {
    return { imported: 0 };
  }

  const { error } = await supabase.from("products").upsert(payload, { onConflict: "sku" });

  if (error) {
    throw error;
  }

  return { imported: payload.length };
}

async function fetchProductMap() {
  const { data, error } = await supabase.from("products").select("id, sku, cost, sale_price");

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? []).map((product) => [
      product.sku,
      {
        id: product.id,
        cost: Number(product.cost),
        sale_price: Number(product.sale_price)
      }
    ])
  );
}

async function importSales(productMap: Map<string, { id: string; cost: number; sale_price: number }>) {
  const rows = getSheet("REG. VENTAS").map(remapRow);
  const normalizedRows = rows
    .map((row) => {
      const saleNumber = normalizeText(row["id_venta"]);
      const sku = normalizeText(row["sku_vendido"]);
      const product = productMap.get(sku);
      return {
        saleNumber,
        soldAt: dateTime(row["fecha_venta"]),
        sku,
        product,
        quantity: Math.max(1, normalizeNumber(row["cantidad"])),
        subtotal: normalizeNumber(row["precio_venta_total"]),
        costTotal: normalizeNumber(row["costo_venta_total"]),
        profitTotal: normalizeNumber(row["ganancia_venta_total"]),
        paymentMethod: mapPaymentMethod(row["metodo_pago"])
      };
    })
    .filter((row) => row.saleNumber);

  const { data: existingSales, error: salesError } = await supabase.from("sales").select("id, sale_number");
  if (salesError) throw salesError;
  const saleMap = new Map((existingSales ?? []).map((sale) => [sale.sale_number, sale.id]));

  const salesToInsert = normalizedRows
    .filter((row) => !saleMap.has(row.saleNumber))
    .map((row) => ({
      sale_number: row.saleNumber,
      subtotal: row.subtotal,
      cost_total: row.costTotal,
      profit_total: row.profitTotal,
      sold_at: row.soldAt
    }));

  if (salesToInsert.length) {
    const { error } = await supabase.from("sales").insert(salesToInsert);
    if (error) throw error;
  }

  const { data: allSales, error: refetchSalesError } = await supabase.from("sales").select("id, sale_number");
  if (refetchSalesError) throw refetchSalesError;
  const fullSaleMap = new Map((allSales ?? []).map((sale) => [sale.sale_number, sale.id]));

  const { data: existingSaleItems, error: itemsError } = await supabase.from("sale_items").select("sale_id");
  if (itemsError) throw itemsError;
  const saleIdsWithItems = new Set((existingSaleItems ?? []).map((item) => item.sale_id));

  const { data: existingPayments, error: paymentsError } = await supabase.from("sale_payments").select("sale_id");
  if (paymentsError) throw paymentsError;
  const saleIdsWithPayments = new Set((existingPayments ?? []).map((payment) => payment.sale_id));

  const { data: existingMovements, error: movementsError } = await supabase
    .from("stock_movements")
    .select("reference_id")
    .eq("movement_type", "sale");
  if (movementsError) throw movementsError;
  const saleIdsWithMovements = new Set(
    (existingMovements ?? []).map((movement) => movement.reference_id).filter(Boolean)
  );

  const saleItemsToInsert = normalizedRows
    .filter((row) => row.product && !saleIdsWithItems.has(fullSaleMap.get(row.saleNumber)!))
    .map((row) => {
      const saleId = fullSaleMap.get(row.saleNumber)!;
      const unitPrice = row.quantity ? row.subtotal / row.quantity : row.subtotal;
      const unitCost = row.quantity ? row.costTotal / row.quantity : row.costTotal;

      return {
        sale_id: saleId,
        product_id: row.product!.id,
        quantity: row.quantity,
        unit_price: unitPrice,
        unit_cost: unitCost,
        total: row.subtotal
      };
    });

  if (saleItemsToInsert.length) {
    const { error } = await supabase.from("sale_items").insert(saleItemsToInsert);
    if (error) throw error;
  }

  const salePaymentsToInsert = normalizedRows
    .filter((row) => !saleIdsWithPayments.has(fullSaleMap.get(row.saleNumber)!))
    .map((row) => ({
      sale_id: fullSaleMap.get(row.saleNumber)!,
      method: row.paymentMethod,
      amount: row.subtotal
    }));

  if (salePaymentsToInsert.length) {
    const { error } = await supabase.from("sale_payments").insert(salePaymentsToInsert);
    if (error) throw error;
  }

  const stockMovementsToInsert = normalizedRows
    .filter((row) => row.product && !saleIdsWithMovements.has(fullSaleMap.get(row.saleNumber)!))
    .map((row) => ({
      product_id: row.product!.id,
      movement_type: "sale" as const,
      quantity: -row.quantity,
      reference_id: fullSaleMap.get(row.saleNumber)!,
      notes: `Importado desde Excel - ${row.saleNumber}`
    }));

  if (stockMovementsToInsert.length) {
    const { error } = await supabase.from("stock_movements").insert(stockMovementsToInsert);
    if (error) throw error;
  }

  return {
    importedSales: salesToInsert.length,
    importedItems: saleItemsToInsert.length,
    importedPayments: salePaymentsToInsert.length,
    importedMovements: stockMovementsToInsert.length
  };
}

async function importExpenses() {
  const rows = getSheet("REG. GASTOS").map(remapRow);
  const normalized = rows
    .map((row) => ({
      expense_date: dateOnly(row["fecha"]),
      type: normalizeText(row["tipo_gasto"]) || "general",
      description: normalizeText(row["descripcion"]),
      amount: normalizeNumber(row["monto"]),
      payment_method: mapPaymentMethod(row["metodo_pago"]),
      impacts_cash: true,
      observations: null
    }))
    .filter((row) => row.expense_date && row.description && row.amount > 0);

  const { data: existingExpenses, error } = await supabase
    .from("expenses")
    .select("expense_date, type, description, amount");
  if (error) throw error;

  const existingKeys = new Set(
    (existingExpenses ?? []).map(
      (item) => `${item.expense_date}|${item.type}|${item.description}|${Number(item.amount)}`
    )
  );

  const toInsert = normalized.filter(
    (item) => !existingKeys.has(`${item.expense_date}|${item.type}|${item.description}|${item.amount}`)
  );

  if (toInsert.length) {
    const { error: insertError } = await supabase.from("expenses").insert(toInsert);
    if (insertError) throw insertError;
  }

  return { imported: toInsert.length };
}

async function importRepairs() {
  const rows = getSheet("REG. REPARACIONES").map(remapRow);
  const normalized = rows
    .map((row, index) => {
      const paymentDate = dateOnly(row["fecha"]);
      const amount = normalizeNumber(row["monto_ingreso"]);
      const observation = normalizeText(row["observacion"]) || null;
      const signature = `${paymentDate}|${amount}|${observation ?? ""}`;
      const importObservation = observation ? `${observation} [import:${signature}]` : `[import:${signature}]`;

      return {
        paymentDate,
        amount,
        observation,
        method: mapPaymentMethod(row["metodo_pago"]),
        customer_name: `Cliente importado ${String(index + 1).padStart(3, "0")}`,
        importObservation
      };
    })
    .filter((row) => row.paymentDate && row.amount > 0);

  const { data: existingRepairs, error: repairsError } = await supabase
    .from("repairs")
    .select("id, observations");
  if (repairsError) throw repairsError;

  const repairByObservation = new Map(
    (existingRepairs ?? [])
      .filter((repair) => repair.observations)
      .map((repair) => [repair.observations as string, repair.id])
  );

  const repairsToInsert = normalized
    .filter((row) => !repairByObservation.has(row.importObservation))
    .map((row) => ({
      customer_name: row.customer_name,
      customer_phone: null,
      device: "Equipo no especificado",
      brand: null,
      model: null,
      issue_description: "Registro importado desde hoja REG. REPARACIONES",
      diagnosis: null,
      estimated_price: row.amount,
      final_price: row.amount,
      internal_cost: 0,
      observations: row.importObservation,
      status: "entregado" as const
    }));

  if (repairsToInsert.length) {
    const { error: insertRepairsError } = await supabase.from("repairs").insert(repairsToInsert);
    if (insertRepairsError) throw insertRepairsError;
  }

  const { data: allRepairs, error: refetchRepairsError } = await supabase
    .from("repairs")
    .select("id, observations");
  if (refetchRepairsError) throw refetchRepairsError;

  const fullRepairMap = new Map(
    (allRepairs ?? [])
      .filter((repair) => repair.observations)
      .map((repair) => [repair.observations as string, repair.id])
  );

  const { data: existingPayments, error: repairPaymentsError } = await supabase
    .from("repair_payments")
    .select("repair_id, payment_date, amount");
  if (repairPaymentsError) throw repairPaymentsError;

  const existingPaymentKeys = new Set(
    (existingPayments ?? []).map(
      (payment) => `${payment.repair_id}|${payment.payment_date}|${Number(payment.amount)}`
    )
  );

  const paymentsToInsert = normalized
    .map((row) => ({
      repair_id: fullRepairMap.get(row.importObservation)!,
      payment_date: row.paymentDate!,
      method: row.method,
      amount: row.amount,
      notes: row.observation
    }))
    .filter((row) => row.repair_id)
    .filter((row) => !existingPaymentKeys.has(`${row.repair_id}|${row.payment_date}|${row.amount}`));

  if (paymentsToInsert.length) {
    const { error: insertPaymentsError } = await supabase.from("repair_payments").insert(paymentsToInsert);
    if (insertPaymentsError) throw insertPaymentsError;
  }

  return { importedRepairs: repairsToInsert.length, importedPayments: paymentsToInsert.length };
}

async function main() {
  console.log(`Importando archivo: ${path.basename(workbookPath)}`);

  const categoryMap = await ensureCategories();
  const products = await importProducts(categoryMap);
  const productMap = await fetchProductMap();
  const sales = await importSales(productMap);
  const expenses = await importExpenses();
  const repairs = await importRepairs();

  console.log(
    JSON.stringify(
      {
        products,
        sales,
        expenses,
        repairs
      },
      null,
      2
    )
  );
  console.log("Importacion finalizada.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
