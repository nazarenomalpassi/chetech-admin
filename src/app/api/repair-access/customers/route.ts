import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function normalizeLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\d a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export async function GET(request: Request) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const query = normalizeLookup(searchParams.get("q") ?? "");
  if (query.length < 2) {
    return NextResponse.json({ customers: [] });
  }

  const queryTokens = query.split(" ").filter(Boolean);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any)
    .from("repair_access_customers")
    .select("id, full_name, phone, alternate_phone, dni, email, address, notes, source, created_at")
    .order("full_name", { ascending: true })
    .limit(1000);

  if (error) {
    return NextResponse.json({ customers: [], error: error.message }, { status: 500 });
  }

  const customers = (data ?? [])
    .filter((customer: any) => {
      const haystack = normalizeLookup([customer.full_name, customer.phone, customer.alternate_phone, customer.dni].join(" "));
      return queryTokens.every((token) => haystack.includes(token));
    })
    .slice(0, 12)
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
