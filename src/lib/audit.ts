import { createServerSupabaseClient } from "@/lib/supabase/server";

type AuditPayload = {
  entityType: string;
  entityId: string;
  action: "insert" | "update" | "delete";
  changes?: Record<string, unknown>;
  userId?: string | null;
};

export async function createAuditLog(payload: AuditPayload) {
  const supabase = await createServerSupabaseClient();

  await (supabase as any).from("audit_logs").insert({
    entity_type: payload.entityType,
    entity_id: payload.entityId,
    action: payload.action,
    changes: payload.changes ?? {},
    user_id: payload.userId ?? null
  });
}
