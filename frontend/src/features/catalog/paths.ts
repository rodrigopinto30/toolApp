export const SEARCH_PATH = "/search";

export function categoryPath(slug: string): string {
  return `/categories/${slug}`;
}

export function productPath(slug: string): string {
  return `/products/${slug}`;
}
