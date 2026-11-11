import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPrivateRepairPath, repairQrId } from "./repair-qr-links";

const branding =
  '<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CHETECH</title><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/brand/qr-landing.css"></head><body><main aria-label="CHETECH"><img src="/brand/document-logo-white.png" width="1500" height="256" alt="CHETECH"></main></body></html>';

export const repairQrHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function getRepairQrBranding() {
  return new Response(branding, { headers: repairQrHeaders });
}
export async function getRepairQrResponse(input: unknown): Promise<Response> {
  const parsed = repairQrId.safeParse(input);
  if (!parsed.success) return getRepairQrBranding();
  const id = parsed.data;
  try {
    const supabase = await createServerSupabaseClient();
    // Validate with Auth, not a cookie payload, getSession or editable metadata.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return getRepairQrBranding();
    const profile = await (supabase as any)
      .from("profiles")
      .select("role,account_status")
      .eq("id", data.user.id)
      .maybeSingle();
    if (
      profile.error ||
      profile.data?.account_status !== "active" ||
      !["admin", "tecnico"].includes(profile.data?.role)
    )
      return getRepairQrBranding();
    const order = await (supabase as any).rpc("workshop_order_payload", {
      p_order_id: id,
    });
    if (order.error || order.data?.id !== id) return getRepairQrBranding();
    return new Response(null, {
      status: 303,
      headers: { ...repairQrHeaders, Location: getPrivateRepairPath(id) },
    });
  } catch {
    // Anonymous, unavailable and unknown records have the same public response.
    return getRepairQrBranding();
  }
}
