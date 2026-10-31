import { imageProblem, MAX_IMAGE_BYTES, movedPositions, sortedImages } from "./images";
import { isEntityId } from "./paths";
import type { AdminImage } from "./types";

function image(id: number, position: number): AdminImage {
  return { id, product_id: 1, variant_id: null, url: `/media/${id}.webp`, alt: null, position, width: 1, height: 1 };
}

function file(type: string, size: number): File {
  return new File([new Uint8Array(size)], "foto", { type });
}

describe("imageProblem", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", (type) => {
    expect(imageProblem(file(type, 10))).toBeNull();
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", ""])("rejects the type %j", (type) => {
    expect(imageProblem(file(type, 10))).toBe("imageType");
  });

  it("allows exactly 5 MiB and nothing more", () => {
    expect(imageProblem(file("image/png", MAX_IMAGE_BYTES))).toBeNull();
    expect(imageProblem(file("image/png", MAX_IMAGE_BYTES + 1))).toBe("imageSize");
  });
});

it("sorts images by position, then by id", () => {
  expect(sortedImages([image(3, 1), image(2, 0), image(1, 0)]).map((item) => item.id)).toEqual([1, 2, 3]);
});

describe("movedPositions", () => {
  const images = [image(1, 0), image(2, 1), image(3, 2)];

  it("swaps a neighbor and sends only what changed", () => {
    expect(movedPositions(images, 1, -1)).toEqual([
      { id: 2, position: 0 },
      { id: 1, position: 1 },
    ]);
  });

  it("does nothing past either end", () => {
    expect(movedPositions(images, 0, -1)).toEqual([]);
    expect(movedPositions(images, 2, 1)).toEqual([]);
  });

  it("repairs positions that were tied or had gaps", () => {
    expect(movedPositions([image(1, 0), image(2, 0), image(3, 5)], 2, -1)).toEqual([
      { id: 3, position: 1 },
      { id: 2, position: 2 },
    ]);
  });
});

it.each([
  ["7", true],
  ["0", false],
  ["-1", false],
  ["1.5", false],
  ["abc", false],
  ["007", false],
])("isEntityId(%j) is %s", (value, expected) => {
  expect(isEntityId(value)).toBe(expected);
});
