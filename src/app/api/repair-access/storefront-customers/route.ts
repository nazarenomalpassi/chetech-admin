import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function privateJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store"
    }
  });
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return privateJson(
      { customers: [], error: "Solo un administrador puede buscar cuentas de la tienda." },
      403
    );
  }

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return privateJson({ customers: [] });
  }
  if (query.length > 120) {
    return privateJson(
      { customers: [], error: "La búsqueda es demasiado larga." },
      400
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await (supabase as any).rpc(
    "search_storefront_customers_for_repair",
    {
      p_query: query,
      p_limit: 20
    }
  );

  if (error) {
    return privateJson(
      { customers: [], error: "No se pudieron buscar las cuentas de clientes." },
      500
    );
  }

  const customers = (data ?? []).map(
    (customer: {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
    }) => ({
      id: customer.id,
      fullName: customer.full_name ?? "Cliente sin nombre",
      email: customer.email ?? "",
      phone: customer.phone ?? ""
    })
  );

  return privateJson({ customers });
}
