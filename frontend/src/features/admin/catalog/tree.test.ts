import { flattenTree, parentChoices } from "./tree";
import type { AdminCategory } from "./types";

function category(id: number, parent_id: number | null): AdminCategory {
  return {
    id,
    parent_id,
    slug: `c${id}`,
    name: { es: `C${id}`, en: `C${id}` },
    description: null,
    image_url: null,
    position: 0,
    is_active: true,
  };
}

const TREE = [category(1, null), category(4, null), category(2, 1), category(3, 2), category(5, 4)];

function ids(rows: { category: AdminCategory }[]) {
  return rows.map((row) => row.category.id);
}

it("puts each category under its parent with its depth", () => {
  expect(flattenTree(TREE).map((row) => [row.category.id, row.depth])).toEqual([
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 0],
    [5, 1],
  ]);
});

it("keeps a category whose parent is not in the list", () => {
  expect(ids(flattenTree([category(7, 99), category(8, 7)]))).toEqual([7, 8]);
});

it("offers a new category any parent with room below it", () => {
  expect(ids(parentChoices(TREE))).toEqual([1, 2, 4, 5]);
});

it("never offers a category itself or its descendants", () => {
  expect(ids(parentChoices(TREE, TREE[0]))).not.toContain(1);
  expect(ids(parentChoices(TREE, TREE[0]))).not.toContain(2);
  expect(ids(parentChoices(TREE, TREE[0]))).not.toContain(3);
});

it("keeps a subtree inside the three levels", () => {
  expect(ids(parentChoices(TREE, TREE[2]))).toEqual([1, 4]);
  expect(ids(parentChoices(TREE, category(1, null)))).toEqual([]);
});
