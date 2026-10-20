type ReadPage<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

export async function readRecordPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<ReadPage<T>>,
  pageSize = 500,
  getIdentity?: (record: T) => string | number
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error("Invalid read page size");
  const records: T[] = [];
  const seen = new Set<string | number>();
  let expectedCount: number | undefined;
  for (let from = 0; ;) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    if (result.count != null) {
      if (!Number.isSafeInteger(result.count) || result.count < 0 || (expectedCount != null && expectedCount !== result.count)) throw new Error("The record count changed. Retry the read.");
      expectedCount = result.count;
    }
    for (const record of page) {
      if (getIdentity) {
        const identity = getIdentity(record);
        if (seen.has(identity)) continue;
        seen.add(identity);
      }
      records.push(record);
    }
    if (expectedCount != null) {
      if (records.length === expectedCount) return records;
      if (!page.length || records.length > expectedCount) throw new Error("Incomplete counted record read. Retry the read.");
      from += page.length;
    } else {
      if (page.length < pageSize) return records;
      from += pageSize;
    }
  }
}
