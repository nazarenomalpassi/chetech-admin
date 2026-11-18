// Control de salud para Railway: responde sin tocar la base para que el chequeo no gaste consultas.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
