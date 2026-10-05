import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission("repairs.view");
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Foto no valida." }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const result = await (supabase as any).from("repair_order_attachments").select("object_path").eq("id", id.data).maybeSingle();
  if (result.error || !result.data) return NextResponse.json({ error: "Foto no encontrada." }, { status: 404 });
  const signed = await supabase.storage.from("chetech-repair-files").createSignedUrl(result.data.object_path, 60);
  if (signed.error || !signed.data) return NextResponse.json({ error: "No se pudo abrir la foto." }, { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
