import { cn } from "cn";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { QuickAddToCart } from "@/features/cart/components/quick-add-to-cart";
import { DiscountBadge } from "@/features/catalog/components/discount-badge";
import { HoverPrefetchLink } from "@/features/catalog/components/hover-prefetch-link";
import { Price } from "@/features/catalog/components/price";
import { ProductImage } from "@/features/catalog/components/product-image";
import { Rating } from "@/features/catalog/components/rating";
import { StockBadge } from "@/features/catalog/components/stock-badge";
import { discountPercent } from "@/features/catalog/discount";
import { productPath } from "@/features/catalog/paths";
import type { ProductSummary } from "@/features/catalog/types";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";

const CARD_IMAGE_SIZES = "(min-width: 1024px) 15rem, (min-width: 640px) 33vw, 50vw";

export function ProductCard({ product }: { product: ProductSummary }) {
  const t = useTranslations("Catalog.card");
  const discount = discountPercent(product.price_from, product.compare_at);
  const variantId = product.single_variant_id ?? null;
  const canAdd = variantId !== null && product.stock_status !== "out_of_stock";

  return (
    <article className="group @container relative flex h-full flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs transition-shadow hover:shadow-md">
      <div className="relative">
        <ProductImage image={product.image} sizes={CARD_IMAGE_SIZES} />
        {discount !== null && <DiscountBadge percent={discount} className="absolute top-2 left-2" />}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {product.brand && (
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{product.brand.name}</p>
        )}
        <h3 className="text-sm leading-snug font-medium">
          <HoverPrefetchLink
            href={productPath(product.slug)}
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
          amountClassName="font-heading text-xl font-bold"
        />
        {product.stock_status !== "in_stock" && <StockBadge status={product.stock_status} />}
      </div>
      {canAdd ? (
        <QuickAddToCart variantId={variantId} name={product.name} />
      ) : (
        <span className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full border-input group-hover:bg-muted")}>
          {variantId === null ? t("options") : t("view")}
        </span>
      )}
      <FavoriteButton slug={product.slug} name={product.name} className="absolute top-5 right-5 z-10" />
    </article>
  );
}
