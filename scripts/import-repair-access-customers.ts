import path from "node:path";
import process from "node:process";

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import xlsx from "xlsx";

import { normalizeRepairAccessLookup } from "@/features/repairs-access/customer-search";

const workbookPath =
  process.argv[2] ?? "C:\\Users\\nazar\\Downloads\\ClientesExportados_20260601_164216.xlsx";
const dryRun = process.argv.includes("--dry-run");

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

type Row = Record<string, unknown>;

type NormalizedCustomer = {
  rowNumber: number;
  raw: Row;
  fullName: string;
  phone: string | null;
  phoneNormalized: string | null;
  alternatePhone: string | null;
  alternatePhoneNormalized: string | null;
  dni: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type ImportRowLog = {
  row_number: number;
  raw_data: Row;
  normalized_phone: string | null;
  customer_id?: string | null;
  status: "imported" | "updated" | "duplicate_ignored" | "error";
  message?: string | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function nullableText(value: unknown) {
  const normalized = normalizeText(value);
  return normalized ? normalized : null;
}

function normalizePhone(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;

  const digits = raw.replace(/\D+/g, "");
  return digits.length >= 6 ? digits : null;
}

function buildAddress(row: Row) {
  const parts = [
    nullableText(row["Domicilio"]),
    nullableText(row["Numero"] ?? row["Número"]),
    nullableText(row["Piso"]),
    nullableText(row["Departamento"]),
    nullableText(row["Barrio"]),
    nullableText(row["Ciudad"]),
    nullableText(row["Provincia"])
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : null;
}

function normalizeCustomer(row: Row, index: number): NormalizedCustomer {
  const phone = nullableText(row["Teléfono celular"]);
  const alternatePhone = nullableText(row["Teléfono fijo"]);
  const iva = nullableText(row["IVA"]);
  const cuitParts = [
    nullableText(row["PrefijoCUIT"]),
    nullableText(row["CUIT"]),
    nullableText(row["DígitoVerificador"])
  ].filter(Boolean);
  const notes = [iva ? `IVA: ${iva}` : null, cuitParts.length ? `CUIT: ${cuitParts.join("-")}` : null]
    .filter(Boolean)
    .join(" | ");

  return {
    rowNumber: index + 2,
    raw: row,
    fullName: normalizeText(row["Nombre Cliente"]),
    phone,
    phoneNormalized: normalizePhone(phone),
    alternatePhone,
    alternatePhoneNormalized: normalizePhone(alternatePhone),
    dni: nullableText(row["DNI"]),
    email: nullableText(row["Email"]),
    address: buildAddress(row),
    notes: notes || null
  };
}

function mergeNotes(existingNotes: string | null | undefined, importedNotes: string | null) {
  if (!importedNotes) return existingNotes ?? null;
  if (!existingNotes) return importedNotes;
  if (existingNotes.includes(importedNotes)) return existingNotes;
  return `${existingNotes} | ${importedNotes}`;
}

async function main() {
  const workbook = xlsx.readFile(workbookPath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error("El Excel no tiene hojas para importar.");
  }

  const rows = xlsx.utils.sheet_to_json<Row>(sheet, { defval: "" });
  const normalizedRows = rows.map(normalizeCustomer);

  const summary = {
    totalRows: normalizedRows.length,
    imported: 0,
    updated: 0,
    duplicateIgnored: 0,
    errors: 0
  };

  const rowLogs: ImportRowLog[] = [];
  const seenPhones = new Set<string>();

  const { data: existingCustomers, error: existingError } = await supabase
    .from("repair_access_customers")
    .select("id, full_name, phone, phone_normalized, alternate_phone, alternate_phone_normalized, dni, email, address, notes");

  if (existingError) throw existingError;

  const existingByPhone = new Map(
    (existingCustomers ?? [])
      .filter((customer) => customer.phone_normalized)
      .map((customer) => [customer.phone_normalized as string, customer])
  );

  const validRows = normalizedRows.filter((customer) => {
    if (!customer.fullName) {
      summary.errors += 1;
      rowLogs.push({
        row_number: customer.rowNumber,
        raw_data: customer.raw,
        normalized_phone: customer.phoneNormalized,
        status: "error",
        message: "Fila sin nombre de cliente."
      });
      return false;
    }

    if (!customer.phoneNormalized && !customer.alternatePhoneNormalized) {
      summary.errors += 1;
      rowLogs.push({
        row_number: customer.rowNumber,
        raw_data: customer.raw,
        normalized_phone: null,
        status: "error",
        message: "Fila sin telefono valido."
      });
      return false;
    }

    const dedupePhone = customer.phoneNormalized ?? customer.alternatePhoneNormalized!;
    if (seenPhones.has(dedupePhone)) {
      summary.duplicateIgnored += 1;
      rowLogs.push({
        row_number: customer.rowNumber,
        raw_data: customer.raw,
        normalized_phone: dedupePhone,
        status: "duplicate_ignored",
        message: "Telefono duplicado dentro del Excel."
      });
      return false;
    }

    seenPhones.add(dedupePhone);
    return true;
  });

  if (dryRun) {
    for (const customer of validRows) {
      const dedupePhone = customer.phoneNormalized ?? customer.alternatePhoneNormalized!;
      if (existingByPhone.has(dedupePhone)) summary.updated += 1;
      else summary.imported += 1;
    }

    console.log(JSON.stringify({ dryRun: true, file: path.basename(workbookPath), summary }, null, 2));
    return;
  }

  const { data: batch, error: batchError } = await supabase
    .from("repair_access_import_batches")
    .insert({
      source: "access_excel",
      file_name: path.basename(workbookPath),
      total_rows: summary.totalRows,
      summary: {
        sheet: sheetName
      }
    })
    .select("id")
    .single();

  if (batchError || !batch) throw batchError ?? new Error("No se pudo crear el lote de importacion.");

  for (const customer of validRows) {
    const dedupePhone = customer.phoneNormalized ?? customer.alternatePhoneNormalized!;
    const existing = existingByPhone.get(dedupePhone);

    if (existing) {
      const payload = {
        full_name: customer.fullName || existing.full_name,
        full_name_normalized: normalizeRepairAccessLookup(customer.fullName || existing.full_name),
        phone: customer.phone ?? existing.phone,
        phone_normalized: customer.phoneNormalized ?? existing.phone_normalized,
        alternate_phone: customer.alternatePhone ?? existing.alternate_phone,
        alternate_phone_normalized: customer.alternatePhoneNormalized ?? existing.alternate_phone_normalized,
        dni: customer.dni ?? existing.dni,
        email: customer.email ?? existing.email,
        address: customer.address ?? existing.address,
        notes: mergeNotes(existing.notes, customer.notes),
        source: "access_excel",
        last_imported_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from("repair_access_customers")
        .update(payload)
        .eq("id", existing.id);

      if (error) {
        summary.errors += 1;
        rowLogs.push({
          row_number: customer.rowNumber,
          raw_data: customer.raw,
          normalized_phone: dedupePhone,
          customer_id: existing.id,
          status: "error",
          message: error.message
        });
        continue;
      }

      summary.updated += 1;
      rowLogs.push({
        row_number: customer.rowNumber,
        raw_data: customer.raw,
        normalized_phone: dedupePhone,
        customer_id: existing.id,
        status: "updated",
        message: "Cliente actualizado por telefono existente."
      });
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("repair_access_customers")
      .insert({
        full_name: customer.fullName,
        full_name_normalized: normalizeRepairAccessLookup(customer.fullName),
        phone: customer.phone,
        phone_normalized: customer.phoneNormalized,
        alternate_phone: customer.alternatePhone,
        alternate_phone_normalized: customer.alternatePhoneNormalized,
        dni: customer.dni,
        email: customer.email,
        address: customer.address,
        notes: customer.notes,
        source: "access_excel",
        last_imported_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (error || !inserted) {
      summary.errors += 1;
      rowLogs.push({
        row_number: customer.rowNumber,
        raw_data: customer.raw,
        normalized_phone: dedupePhone,
        status: "error",
        message: error?.message ?? "No se pudo insertar el cliente."
      });
      continue;
    }

    summary.imported += 1;
    rowLogs.push({
      row_number: customer.rowNumber,
      raw_data: customer.raw,
      normalized_phone: dedupePhone,
      customer_id: inserted.id,
      status: "imported",
      message: "Cliente importado."
    });
  }

  if (rowLogs.length) {
    const { error } = await supabase.from("repair_access_import_rows").insert(
      rowLogs.map((log) => ({
        ...log,
        batch_id: batch.id
      }))
    );
    if (error) throw error;
  }

  const { error: updateBatchError } = await supabase
    .from("repair_access_import_batches")
    .update({
      imported_count: summary.imported,
      updated_count: summary.updated,
      duplicate_count: summary.duplicateIgnored,
      error_count: summary.errors,
      summary: {
        sheet: sheetName,
        ...summary
      }
    })
    .eq("id", batch.id);

  if (updateBatchError) throw updateBatchError;

  console.log(JSON.stringify({ dryRun: false, file: path.basename(workbookPath), batchId: batch.id, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
