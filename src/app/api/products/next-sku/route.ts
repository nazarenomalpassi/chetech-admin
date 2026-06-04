import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  await requireAdmin();
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("categoryId");

  if (!categoryId) {
    return NextResponse.json({ sku: null, error: "Falta categoryId" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc("next_product_sku", {
    p_category_id: categoryId
  });

  if (error) {
    return NextResponse.json({ sku: null, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ sku: data });
}
