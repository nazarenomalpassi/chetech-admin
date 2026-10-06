import { decryptTicket, encryptTicket, parseTicketEncryptionKey, type AccessTicket, type SealedTicket, type TicketKey } from "./ticket-crypto";

export type TicketClaim = ({ kind: "cached" } & SealedTicket) | { kind: "busy" } | { kind: "acquired"; token: string };
export type TicketCacheRepository = {
  claim(key: TicketKey): Promise<TicketClaim>;
  publish(key: TicketKey, token: string, sealed: SealedTicket): Promise<boolean>;
  release(key: TicketKey, token: string): Promise<void>;
};

export async function getSharedAccessTicket(options: {
  repository: TicketCacheRepository; key: TicketKey; encryptionKey: string; authenticate: () => Promise<AccessTicket>;
  now?: () => number; sleep?: (ms: number) => Promise<void>; maxWaitMs?: number;
}): Promise<AccessTicket> {
  parseTicketEncryptionKey(options.encryptionKey);
  const { repository, key, encryptionKey, authenticate } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.maxWaitMs ?? 55000);
  for (;;) {
    const claim = await repository.claim(key);
    if (claim.kind === "cached") return decryptTicket(claim, key, encryptionKey, now());
    if (claim.kind === "busy") {
      if (now() >= deadline) throw new Error("Ticket WSAA compartido ocupado o proximo a vencer. Reintenta sin cambiar el registro fiscal.");
      await sleep(Math.min(1000, deadline - now()));
      continue;
    }
    let sealed: SealedTicket;
    try { sealed = encryptTicket(await authenticate(), key, encryptionKey, now()); }
    catch {
      try { await repository.release(key, claim.token); } catch { /* Lease expiration remains the recovery fence. */ }
      throw new Error("WSAA no entrego un ticket valido. Revisa certificado/asociacion; si existe un TA vigente fuera del cache, espera su vencimiento.");
    }
    // A ticket must be durable before WSFE can use it. Retry publication, never authentication.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (await repository.publish(key, claim.token, sealed)) return decryptTicket(sealed, key, encryptionKey, now());
        break;
      } catch { /* A lost response may still have committed the ciphertext. */ }
    }
    try {
      const recovered = await repository.claim(key);
      if (recovered.kind === "cached") return decryptTicket(recovered, key, encryptionKey, now());
    } catch { /* Never return an unshared ticket or log remote responses. */ }
    throw new Error("No se pudo persistir el ticket WSAA compartido. Emision detenida; no se utilizara un ticket solo en memoria.");
  }
}
