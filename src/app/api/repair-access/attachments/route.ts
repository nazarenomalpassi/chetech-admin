import { z } from "zod";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MAX_REPAIR_IMAGE_BYTES, validateRepairImage } from "@/features/repairs-access/attachments";
import { isSameOriginUpload } from "@/features/repairs-access/attachment-request";

export async function GET(request: Request) {
  await requirePermission("repairs.view");
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("orderId"));
  if (!id.success) return NextResponse.json({ error: "Orden no valida." }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const result = await (supabase as any).from("repair_order_attachments").select("id,file_name,mime_type,file_size,created_at").eq("order_id", id.data).order("created_at", { ascending: false }).limit(100);
  if (result.error) return NextResponse.json({ error: "No se pudieron consultar las fotos." }, { status: 503 });
  return NextResponse.json({ files: result.data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOriginUpload(request)) return NextResponse.json({ error: "Subi la foto desde la ficha de CHETECH." }, { status: 403 });
  const profile = await requirePermission("repairs.update");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REPAIR_IMAGE_BYTES + 128 * 1024) return NextResponse.json({ error: "La foto debe pesar hasta 4 MB." }, { status: 413 });
  const data = await request.formData();
  const id = z.string().uuid().safeParse(data.get("orderId"));
  const file = data.get("file");
  if (!id.success || !(file instanceof File)) return NextResponse.json({ error: "Selecciona una foto y una orden valida." }, { status: 400 });
  let bytes: Uint8Array, extension: string;
  try { bytes = new Uint8Array(await file.arrayBuffer()); extension = validateRepairImage(bytes, file.type); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Foto no valida." }, { status: 400 }); }
  const supabase = await createServerSupabaseClient();
  const order = await (supabase as any).rpc("workshop_order_payload", { p_order_id: id.data });
  if (order.error || !order.data) return NextResponse.json({ error: "No se encontro la orden." }, { status: 404 });
  const objectPath = `${id.data}/${profile.id}/${crypto.randomUUID()}.${extension}`;
  const upload = await supabase.storage.from("chetech-repair-files").upload(objectPath, bytes, { contentType: file.type, upsert: false });
  if (upload.error) return NextResponse.json({ error: "No se pudo subir la foto. Reintenta con conexion disponible." }, { status: 503 });
  const result = await (supabase as any).from("repair_order_attachments").insert({ order_id: id.data, object_path: objectPath, file_name: file.name.replace(/[\u0000-\u001f]/g, "").slice(0,200), mime_type: file.type, file_size: bytes.length, created_by: profile.id }).select("id").single();
  if (result.error) { await supabase.storage.from("chetech-repair-files").remove([objectPath]); return NextResponse.json({ error: "No se pudo vincular la foto a la orden. Reintenta." }, { status: 503 }); }
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}
