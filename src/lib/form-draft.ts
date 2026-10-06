export const FORM_DRAFT_VERSION = 1;
export const FORM_DRAFT_STORAGE_PREFIX = "chetech:form-draft:";
export const DEFAULT_FORM_DRAFT_MAX_AGE_MS = 30 * 86_400_000;

export type FormDraftEnvelope<T> = {
  version: typeof FORM_DRAFT_VERSION;
  updatedAt: string;
  data: T;
};

export function createFormDraftEnvelope<T>(data: T, now = new Date()): FormDraftEnvelope<T> {
  return {
    version: FORM_DRAFT_VERSION,
    updatedAt: now.toISOString(),
    data
  };
}

export function parseFormDraftEnvelope<T>(
  raw: string | null | undefined,
  options?: { maxAgeMs?: number; now?: number }
): FormDraftEnvelope<T> | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<FormDraftEnvelope<T>>;
    if (parsed.version !== FORM_DRAFT_VERSION || typeof parsed.updatedAt !== "string" || !("data" in parsed)) {
      return null;
    }

    const updatedAt = Date.parse(parsed.updatedAt);
    const now = options?.now ?? Date.now();
    const maxAgeMs = options?.maxAgeMs ?? DEFAULT_FORM_DRAFT_MAX_AGE_MS;
    if (!Number.isFinite(updatedAt) || updatedAt > now + 60_000 || now - updatedAt > maxAgeMs) {
      return null;
    }

    return parsed as FormDraftEnvelope<T>;
  } catch {
    return null;
  }
}

export function hasMeaningfulDraftValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some(hasMeaningfulDraftValue);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasMeaningfulDraftValue);
  }

  return false;
}

export function getFormDraftStorageKey(key: string) {
  return `${FORM_DRAFT_STORAGE_PREFIX}${key}`;
}

export function clearFormDraftsByPrefix(prefix: string, storage: Pick<Storage, "key" | "length" | "removeItem">) {
  const fullPrefix = getFormDraftStorageKey(prefix);
  const keys: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(fullPrefix)) keys.push(key);
  }

  keys.forEach((key) => storage.removeItem(key));
}
