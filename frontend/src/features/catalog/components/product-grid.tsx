import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/features/catalog/components/product-card";
import type { ProductSummary } from "@/features/catalog/types";

const GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <ul className={GRID}>
      {products.map((product) => (
        <li key={product.slug}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className={GRID}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="grid gap-3 rounded-xl border p-3">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/3" />
        </li>
      ))}
    </ul>
  );
}
