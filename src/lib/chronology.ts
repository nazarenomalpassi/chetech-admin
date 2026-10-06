type OrderableQuery = {
  order(column: string, options: { ascending: boolean }): OrderableQuery;
};

export function applyStableCreationOrder<T extends OrderableQuery>(query: T): T {
  return query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) as T;
}

export function getRepairWriteDates(entryDate: string) {
  return {
    entry_date: entryDate.slice(0, 10)
  };
}
