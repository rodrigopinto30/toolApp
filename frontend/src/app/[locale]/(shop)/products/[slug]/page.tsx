import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Fragment } from "react";

import { JsonLd } from "@/components/seo/json-ld";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddToCart } from "@/features/cart/components/add-to-cart";
import { getProduct, getProvinces } from "@/features/catalog/api";
import { Breadcrumbs } from "@/features/catalog/components/breadcrumbs";
import { ProductImage } from "@/features/catalog/components/product-image";
import { Rating } from "@/features/catalog/components/rating";
import { ProductShippingQuote } from "@/features/catalog/components/shipping-quote";
import { VariantSelector } from "@/features/catalog/components/variant-selector";
import { VariantSummary } from "@/features/catalog/components/variant-summary";
import { categoryPath, productPath } from "@/features/catalog/paths";
import { localizedAlternates, localizedUrl } from "@/features/catalog/seo";
import { isSlug } from "@/features/catalog/slug";
import { breadcrumbJsonLd, productJsonLd } from "@/features/catalog/structured-data";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";
import { getProductReviews } from "@/features/reviews/api";
import { ProductReviews } from "@/features/reviews/components/product-reviews";
import { clientMessages, PRODUCT_NAMESPACES } from "@/i18n/client-messages";
import type { Locale } from "@/i18n/routing";
import { getCurrency } from "@/lib/currency.server";
import { serverEnv } from "@/lib/env";

type Props = PageProps<"/[locale]/products/[slug]">;

const IMAGE_SIZES = "(min-width: 768px) 30rem, 100vw";

async function loadProduct(params: Props["params"]) {
  const { locale, slug } = await params;
  if (!isSlug(slug)) {
    return null;
  }
  const product = await getProduct(slug, locale as Locale, await getCurrency());
  return product && { product, locale: locale as Locale };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadProduct(params);
  if (!loaded) {
    return {};
  }
  const { product, locale } = loaded;
  const alternates = localizedAlternates(productPath(product.slug), locale);
  return {
    title: product.name,
    description: product.short_description,
    alternates,
    openGraph: {
      title: product.name,
      description: product.short_description,
      url: alternates.canonical,
      images: product.images.map((image) => image.url),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const loaded = await loadProduct(params);
  if (!loaded) {
    notFound();
  }
  const { product, locale } = loaded;
  setRequestLocale(locale);
  const [t, tBreadcrumbs, provinces, reviews] = await Promise.all([
    getTranslations("Product"),
    getTranslations("Breadcrumbs"),
    getProvinces(locale),
    getProductReviews(product.slug),
  ]);
  const origin = serverEnv().PUBLIC_URL;
  const path = productPath(product.slug);
  const trail = product.category_path.map((category) => ({ name: category.name, href: categoryPath(category.slug) }));
  const specs = Object.entries(product.specs).flatMap(([name, value]) => {
    if (typeof value === "string" || typeof value === "number") {
      return [{ name, value: String(value) }];
    }
    return typeof value === "boolean" ? [{ name, value: value ? t("yes") : t("no") }] : [];
  });

  return (
    <NextIntlClientProvider messages={await clientMessages(PRODUCT_NAMESPACES)}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
        <Breadcrumbs trail={trail} current={product.name} />
        <div className="grid gap-8 md:grid-cols-2">
          <ProductImage image={product.images[0] ?? product.image} sizes={IMAGE_SIZES} />
          <div className="flex flex-col gap-6">
            <header className="grid gap-2">
              {product.brand && <p className="text-sm text-muted-foreground">{product.brand.name}</p>}
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
                <FavoriteButton slug={product.slug} name={product.name} className="shrink-0" />
              </div>
              <Rating average={product.rating_avg} count={product.rating_count} />
              <p className="text-muted-foreground">{product.short_description}</p>
            </header>
            <VariantSummary variants={product.variants} />
            {product.variants.length > 1 && <VariantSelector variants={product.variants} />}
            <AddToCart variants={product.variants} />
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2 className="text-base font-semibold">{t("shipping.title")}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProductShippingQuote
                  variants={product.variants}
                  provinces={provinces.map(({ code, name }) => ({ code, name }))}
                />
              </CardContent>
            </Card>
          </div>
        </div>
        <section aria-labelledby="product-description" className="grid gap-3">
          <h2 id="product-description" className="text-lg font-semibold">
            {t("description")}
          </h2>
          <p className="max-w-3xl whitespace-pre-line text-muted-foreground">{product.description}</p>
        </section>
        {specs.length > 0 && (
          <section aria-labelledby="product-specs" className="grid gap-3">
            <h2 id="product-specs" className="text-lg font-semibold">
              {t("specs")}
            </h2>
            <dl className="grid max-w-3xl gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
              {specs.map((spec) => (
                <Fragment key={spec.name}>
                  <dt className="font-medium">{spec.name}</dt>
                  <dd className="text-muted-foreground">{spec.value}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        )}
        <ProductReviews slug={product.slug} initial={reviews} />
        <JsonLd data={productJsonLd(product, localizedUrl(origin, locale, path), origin)} />
        <JsonLd
          data={breadcrumbJsonLd(origin, locale, [
            { name: tBreadcrumbs("home"), href: "/" },
            ...trail,
            { name: product.name, href: path },
          ])}
        />
      </div>
    </NextIntlClientProvider>
  );
}
