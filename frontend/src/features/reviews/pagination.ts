export const REVIEWS_PAGE_SIZE = 10;

export function nextPage({ page, pages }: { page: number; pages: number }): number | undefined {
  return page < pages ? page + 1 : undefined;
}
