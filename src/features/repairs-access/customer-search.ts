export function normalizeRepairAccessLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\d a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getDigits(value: string) {
  return value.replace(/\D+/g, "");
}

export function buildRepairAccessCustomerSearchFilters(value: string) {
  const query = normalizeRepairAccessLookup(value);
  if (query.length < 2) return [];

  const filters = [`full_name.ilike.%${query}%`];
  const digits = getDigits(value);

  if (digits.length >= 2) {
    filters.push(
      `phone.ilike.%${digits}%`,
      `alternate_phone.ilike.%${digits}%`,
      `dni.ilike.%${digits}%`,
      `phone_normalized.ilike.%${digits}%`,
      `alternate_phone_normalized.ilike.%${digits}%`
    );
  }

  return Array.from(new Set(filters));
}
