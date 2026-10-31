import { createElement } from "react";

export function TestImage({ src, alt }: { src: string; alt: string }) {
  return createElement("img", { src, alt });
}
