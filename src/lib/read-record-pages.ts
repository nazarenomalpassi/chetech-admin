type ReadPage<T> = { data: T[] | null; error: { message: string } | null };

export async function readRecordPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<ReadPage<T>>,
  pageSize = 500,
  getIdentity?: (record: T) => string | number
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error("Invalid read page size");
  const records: T[] = [];
  const seen = new Set<string | number>();
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    for (const record of page) {
      if (getIdentity) {
        const identity = getIdentity(record);
        if (seen.has(identity)) continue;
        seen.add(identity);
      }
      records.push(record);
    }
    if (page.length < pageSize) return records;
  }
}
