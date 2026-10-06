type OperationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const storageKey = (ownerId: string, scope: string) => `chetech:expense-operation:${ownerId}:${scope}`;

export async function getExpenseOperationId(form: FormData, ownerId: string, scope: string, storage: OperationStorage = sessionStorage) {
  const fields = [...form.entries()].filter(([key]) => key !== "operationId").sort(([a], [b]) => a.localeCompare(b));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(fields)));
  const fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const key = storageKey(ownerId, scope);
  let previous: { fingerprint?: string; id?: string } = {};
  try { previous = JSON.parse(storage.getItem(key) ?? "{}"); } catch { /* A damaged receipt cannot be reused. */ }
  if (previous?.fingerprint === fingerprint && previous.id) return previous.id;
  const id = crypto.randomUUID();
  storage.setItem(key, JSON.stringify({ fingerprint, id }));
  return id;
}

export function acknowledgeExpenseOperation(ownerId: string, scope: string, id: string, storage: OperationStorage = sessionStorage) {
  const key = storageKey(ownerId, scope);
  try {
    if (JSON.parse(storage.getItem(key) ?? "{}").id === id) storage.removeItem(key);
  } catch { /* Do not discard an unacknowledged operation. */ }
}
