import { createClient } from "@supabase/supabase-js";
import type { TicketCacheRepository, TicketClaim } from "./ticket-cache";

export function createTicketCacheRepository(): TicketCacheRepository {
  if (typeof window !== "undefined") throw new Error("El cache fiscal es exclusivo del servidor.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Cache WSAA compartido del servidor no configurado.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }) }
  });
  const rpc = async (name: string, input: unknown): Promise<unknown> => {
    try {
      const { data, error } = await client.rpc(name, { p_input: input });
      if (error || data === null) throw new Error("Cache unavailable");
      return data;
    } catch { throw new Error("Cache WSAA compartido no disponible. Revisa la migracion y la credencial de servicio del servidor."); }
  };
  return {
    async claim(scope) {
      const data = await rpc("wsaa_ticket_claim", scope) as TicketClaim;
      if (data?.kind === "busy") return { kind: "busy" };
      if (data?.kind === "acquired" && typeof data.token === "string" && /^[0-9a-f-]{36}$/.test(data.token)) return data;
      if (data?.kind === "cached" && typeof data.ciphertext === "string" && Number.isSafeInteger(data.expires)) return data;
      throw new Error("Respuesta del cache WSAA compartido invalida.");
    },
    async publish(scope, token, sealed) { return await rpc("wsaa_ticket_publish", { ...scope, token, ...sealed }) === true; },
    async release(scope, token) { await rpc("wsaa_ticket_release", { ...scope, token }); }
  };
}
