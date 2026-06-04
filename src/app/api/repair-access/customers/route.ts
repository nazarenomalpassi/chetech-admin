import { NextResponse } from "next/server";

import { buildRepairAccessCustomerSearchFilters } from "@/features/repairs-access/customer-search";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const filters = buildRepairAccessCustomerSearchFilters(searchParams.get("q") ?? "");
  if (!filters.length) {
    return NextResponse.json({ customers: [] });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("repair_access_customers")
    .select("id, full_name, phone, alternate_phone, dni, email, address, notes, source, created_at")
    .or(filters.join(","))
    .order("full_name", { ascending: true })
    .limit(12);

  if (error) {
    return NextResponse.json({ customers: [], error: error.message }, { status: 500 });
  }

  const customers = (data ?? [])
    .map((customer: any) => ({
      id: customer.id,
      fullName: customer.full_name,
      phone: customer.phone ?? "",
      alternatePhone: customer.alternate_phone ?? "",
      dni: customer.dni ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
      source: customer.source ?? "manual",
      createdAt: customer.created_at
    }));

  return NextResponse.json({ customers });
}
