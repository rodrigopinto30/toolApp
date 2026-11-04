import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/features/catalog/components/product-card";
import type { ProductSummary } from "@/features/catalog/types";

const GRID = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4";

export function ProductGrid({ products, heading }: { products: ProductSummary[]; heading?: string }) {
  return (
    <>
      {heading && <h2 className="sr-only">{heading}</h2>}
      <ul className={GRID}>
        {products.map((product) => (
          <li key={product.slug}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function ProductGridSkeleton({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className={GRID}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="grid gap-2">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-6 w-1/2" />
          </div>
          <Skeleton className="h-9 w-full" />
        </li>
      ))}
    </ul>
  );
}
