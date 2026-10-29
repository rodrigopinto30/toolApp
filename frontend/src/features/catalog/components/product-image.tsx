import { cn } from "cn";
import { WrenchIcon } from "lucide-react";
import Image from "next/image";

import type { ProductImageData } from "@/features/catalog/types";

export function ProductImage({
  image,
  sizes,
  className,
}: {
  image: ProductImageData | null;
  sizes: string;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-lg bg-muted", className)}>
      {image ? (
        <Image src={image.url} alt={image.alt} fill sizes={sizes} className="object-cover" />
      ) : (
        <WrenchIcon aria-hidden="true" className="absolute inset-0 m-auto size-1/3 text-muted-foreground/40" />
      )}
    </div>
  );
}
