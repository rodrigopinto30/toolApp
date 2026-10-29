import { HoverPrefetchLink } from "@/features/catalog/components/hover-prefetch-link";
import { Price } from "@/features/catalog/components/price";
import { ProductImage } from "@/features/catalog/components/product-image";
import { Rating } from "@/features/catalog/components/rating";
import { StockBadge } from "@/features/catalog/components/stock-badge";
import type { ProductSummary } from "@/features/catalog/types";

const CARD_IMAGE_SIZES = "(min-width: 1024px) 15rem, (min-width: 640px) 33vw, 50vw";

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article className="relative flex h-full flex-col gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40">
      <ProductImage image={product.image} sizes={CARD_IMAGE_SIZES} />
      <div className="flex flex-1 flex-col gap-1">
        {product.brand && <p className="text-xs text-muted-foreground">{product.brand.name}</p>}
        <h3 className="text-sm leading-snug font-medium">
          <HoverPrefetchLink
            href={`/products/${product.slug}`}
            className="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-xl after:focus-visible:ring-2 after:focus-visible:ring-ring"
          >
            {product.name}
          </HoverPrefetchLink>
        </h3>
        <Rating average={product.rating_avg} count={product.rating_count} />
        <Price
          price={product.price_from}
          compareAt={product.compare_at}
          varies={product.price_varies}
          className="mt-auto pt-1"
        />
        {product.stock_status !== "in_stock" && <StockBadge status={product.stock_status} />}
      </div>
    </article>
  );
}
