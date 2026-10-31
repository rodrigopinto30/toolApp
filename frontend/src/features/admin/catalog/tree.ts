import type { AdminCategory } from "./types";

const MAX_DEPTH = 3;

export type CategoryRow = { category: AdminCategory; depth: number };

function childrenOf(categories: AdminCategory[], parentId: number | null): AdminCategory[] {
  return categories.filter((category) => category.parent_id === parentId);
}

function walk(categories: AdminCategory[], parentId: number | null, depth: number): CategoryRow[] {
  return childrenOf(categories, parentId).flatMap((category) => [
    { category, depth },
    ...walk(categories, category.id, depth + 1),
  ]);
}

export function flattenTree(categories: AdminCategory[]): CategoryRow[] {
  const known = new Set(categories.map((category) => category.id));
  const orphans = categories.filter((category) => category.parent_id !== null && !known.has(category.parent_id));
  return [
    ...walk(categories, null, 0),
    ...orphans.flatMap((category) => [{ category, depth: 0 }, ...walk(categories, category.id, 1)]),
  ];
}

function subtreeHeight(categories: AdminCategory[], id: number): number {
  return 1 + Math.max(0, ...childrenOf(categories, id).map((child) => subtreeHeight(categories, child.id)));
}

function descendantIds(categories: AdminCategory[], id: number): Set<number> {
  return new Set(
    childrenOf(categories, id).flatMap((child) => [child.id, ...descendantIds(categories, child.id)]),
  );
}

export function parentChoices(categories: AdminCategory[], category?: AdminCategory): CategoryRow[] {
  const excluded = category ? new Set([category.id, ...descendantIds(categories, category.id)]) : new Set<number>();
  const height = category ? subtreeHeight(categories, category.id) : 1;
  return flattenTree(categories).filter(
    (row) => !excluded.has(row.category.id) && row.depth + 1 + height <= MAX_DEPTH,
  );
}
