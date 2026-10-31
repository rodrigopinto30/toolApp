import type { AdminImage } from "./types";

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5_242_880;

export type ImageProblem = "imageType" | "imageSize";

export function imageProblem(file: File): ImageProblem | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "imageType";
  }
  return file.size > MAX_IMAGE_BYTES ? "imageSize" : null;
}

export function sortedImages(images: AdminImage[]): AdminImage[] {
  return [...images].sort((first, second) => first.position - second.position || first.id - second.id);
}

export function movedPositions(
  images: AdminImage[],
  index: number,
  offset: number,
): { id: number; position: number }[] {
  const target = index + offset;
  if (target < 0 || target >= images.length) {
    return [];
  }
  const order = [...images];
  const [moved] = order.splice(index, 1);
  order.splice(target, 0, moved);
  return order.flatMap((image, position) => (image.position === position ? [] : [{ id: image.id, position }]));
}
