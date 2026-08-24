export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): {
  page: number;
  pages: number;
  items: T[];
  from: number;
  to: number;
  total: number;
} {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('pageSize must be a positive integer');
  }
  if (!Number.isInteger(page)) {
    throw new Error('page must be an integer');
  }
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = (safePage - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    page: safePage,
    pages,
    items: slice,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
    total,
  };
}
