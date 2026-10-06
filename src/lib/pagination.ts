export const DEFAULT_PAGE_SIZE = 25;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export function parsePage(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1;

  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

export function getPaginationRange(page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const from = (safePage - 1) * safePageSize;

  return { from, to: from + safePageSize - 1 };
}

export function createPaginationMeta(total: number, page: number, pageSize = DEFAULT_PAGE_SIZE): PaginationMeta {
  const safeTotal = Math.max(0, total);
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return {
    page: safePage,
    pageSize,
    total: safeTotal,
    totalPages,
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage < totalPages
  };
}

export function buildPaginationHref(pathname: string, currentParams: URLSearchParams, page: number) {
  const params = new URLSearchParams(currentParams.toString());

  if (page <= 1) {
    params.delete("page");
  } else {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
