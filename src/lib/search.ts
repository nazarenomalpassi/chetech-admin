export function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function matchesSearchText(value: string, query: string | null | undefined) {
  const tokens = normalizeSearchText(query).split(" ").filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  const normalizedValue = normalizeSearchText(value);
  return tokens.every((token) => normalizedValue.includes(token));
}
