export type PageItem = number | "gap";

const NEIGHBOURS = 1;

export function pageItems(current: number, total: number): PageItem[] {
  const pages = new Set([1, total]);
  for (let page = current - NEIGHBOURS; page <= current + NEIGHBOURS; page++) {
    if (page >= 1 && page <= total) {
      pages.add(page);
    }
  }
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((page, index) => {
    const previous = sorted[index - 1];
    if (previous === undefined || page === previous + 1) {
      return [page];
    }
    return page === previous + 2 ? [previous + 1, page] : ["gap" as const, page];
  });
}
